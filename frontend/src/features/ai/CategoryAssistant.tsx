"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useCategories } from "@/features/tickets/hooks";
import { api } from "@/lib/api";
import { fmtDate, label } from "@/lib/format";
import type { Prediction, TicketDetail } from "@/types/api";

const pct = (p: number) => `${Math.round(p * 100)}%`;

export function CategoryAssistant({ ticketId, onTicketChanged }: { ticketId: number; onTicketChanged: () => void }) {
  const qc = useQueryClient();
  const cats = useCategories();
  const [reason, setReason] = useState("");
  const [override, setOverride] = useState("");

  const key = ["predictions", ticketId];
  const list = useQuery({ queryKey: key, queryFn: () => api<Prediction[]>(`/ai/tickets/${ticketId}/predictions`) });
  const done = () => {
    qc.invalidateQueries({ queryKey: key });
    qc.invalidateQueries({ queryKey: ["evaluation"] });
    onTicketChanged();
  };
  const suggest = useMutation({
    mutationFn: () => api<Prediction>("/ai/classify", { method: "POST", body: JSON.stringify({ ticket_id: ticketId }) }),
    onSuccess: () => { setReason(""); setOverride(""); done(); },
  });
  const review = useMutation({
    mutationFn: (v: { id: number; decision: string; final_category_id?: number }) =>
      api<Prediction>(`/ai/predictions/${v.id}/review`, {
        method: "POST",
        body: JSON.stringify({ decision: v.decision, final_category_id: v.final_category_id, reason: reason.trim() || null }),
      }),
    onSuccess: () => { setReason(""); setOverride(""); done(); },
  });

  const latest = list.data?.[0];
  const earlier = list.data?.slice(1) ?? [];
  const busy = suggest.isPending || review.isPending;
  const err = (suggest.error ?? review.error ?? list.error) as Error | null;

  return (
    <section className="rounded-lg border border-dashed border-ai p-5" aria-labelledby="ai-cat">
      <h2 id="ai-cat" className="text-sm font-medium text-ai">AI category suggestion</h2>
      <p className="mt-1 text-xs text-muted">A suggestion only. The ticket&apos;s category changes when you accept or choose one.</p>

      {list.isLoading && <p className="mt-3 text-sm text-muted">Loading…</p>}

      {latest && (
        <div className="mt-4 space-y-3 text-sm">
          <div>
            <p className="text-xs text-muted">Suggested category</p>
            <p className="text-base font-semibold">{latest.predicted.label}</p>
            <p className="tabular-nums text-muted">Model confidence {pct(latest.confidence)}</p>
          </div>

          {latest.needs_manual_review && (
            <p role="status" className="rounded-md border border-ai px-3 py-2 text-ai">
              Low confidence (below {pct(latest.threshold)}). Classify this ticket manually rather than relying on the suggestion.
            </p>
          )}

          {latest.alternatives.length > 0 && (
            <div>
              <p className="text-xs text-muted">Other possibilities</p>
              <ul className="mt-1 space-y-0.5">
                {latest.alternatives.map((a) => (
                  <li key={a.label} className="flex justify-between"><span>{a.label}</span>
                    <span className="tabular-nums text-muted">{pct(a.probability)}</span></li>
                ))}
              </ul>
            </div>
          )}
          <p className="text-xs text-muted">{latest.model_name} {latest.model_version} · {latest.latency_ms} ms · {fmtDate(latest.created_at!)}</p>

          {latest.review ? (
            <div className="rounded-md border border-line px-3 py-2">
              <p><span className="font-medium">{label(latest.review.decision)}</span>
                {latest.review.final_category && <> as {latest.review.final_category.name}</>} by {latest.review.user.full_name}</p>
              {latest.review.reason && <p className="mt-1 whitespace-pre-wrap text-muted">{latest.review.reason}</p>}
              <p className="text-xs text-muted">{fmtDate(latest.review.created_at)}</p>
            </div>
          ) : (
            <div className="space-y-3 border-t border-line pt-3">
              <div>
                <label htmlFor="why" className="mb-1 block text-xs text-muted">Feedback (optional)</label>
                <Textarea id="why" rows={2} value={reason} maxLength={2000} onChange={(e) => setReason(e.target.value)} />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button disabled={busy || latest.predicted.category_id === null}
                        onClick={() => review.mutate({ id: latest.id!, decision: "accepted" })}>
                  Accept suggestion</Button>
                <Button variant="secondary" disabled={busy} onClick={() => review.mutate({ id: latest.id!, decision: "rejected" })}>
                  Reject</Button>
              </div>
              <div className="flex gap-2">
                <div className="flex-1">
                  <label htmlFor="ov" className="sr-only">Choose a different category</label>
                  <Select id="ov" className="w-full" value={override} onChange={(e) => setOverride(e.target.value)}>
                    <option value="">Choose a different category…</option>
                    {cats.data?.filter((c) => c.id !== latest.predicted.category_id)
                      .map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </Select>
                </div>
                <Button variant="secondary" disabled={busy || !override}
                        onClick={() => review.mutate({ id: latest.id!, decision: "edited", final_category_id: Number(override) })}>
                  Apply</Button>
              </div>
            </div>
          )}
        </div>
      )}

      {list.data && list.data.length === 0 && (
        <p className="mt-3 text-sm text-muted">No suggestion yet. Request one to see the model&apos;s category, confidence and alternatives.</p>
      )}

      {err && <p role="alert" className="mt-3 text-sm text-danger">{err.message}</p>}
      <Button className="mt-4 w-full" variant={latest ? "secondary" : "primary"} disabled={busy} onClick={() => suggest.mutate()}>
        {suggest.isPending ? "Analysing…" : latest ? "Request a new suggestion" : "Suggest category"}
      </Button>

      {earlier.length > 0 && (
        <details className="mt-4 text-sm">
          <summary className="cursor-pointer text-muted">Earlier suggestions ({earlier.length})</summary>
          <ul className="mt-2 space-y-1.5">
            {earlier.map((p) => (
              <li key={p.id} className="text-xs text-muted">
                {fmtDate(p.created_at!)}: {p.predicted.label} ({pct(p.confidence)}), {p.review ? label(p.review.decision) : "not reviewed"}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

export type { TicketDetail };
