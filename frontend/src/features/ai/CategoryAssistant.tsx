"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Check, Pencil, RefreshCw, Tags, X } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { AboutResult, AiBadge, AiPanel, Callout, ConfidenceMeter, PanelSkeleton, pct } from "@/features/ai/ui";
import { useCategories } from "@/features/tickets/hooks";
import { api } from "@/lib/api";
import { fmtDate, fmtRelative, label } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Category, Prediction } from "@/types/api";

const DECISION = {
  accepted: { icon: Check, cls: "text-ok", text: "Accepted" },
  edited: { icon: Pencil, cls: "text-info", text: "Changed to a different category" },
  rejected: { icon: X, cls: "text-muted", text: "Rejected" },
} as const;

export function CategoryAssistant({ ticketId, currentCategory, onTicketChanged }: {
  ticketId: number; currentCategory: Category | null; onTicketChanged: () => void;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const cats = useCategories();
  const [reason, setReason] = useState("");
  const [override, setOverride] = useState("");

  const key = ["predictions", ticketId];
  const list = useQuery({ queryKey: key, queryFn: () => api<Prediction[]>(`/ai/tickets/${ticketId}/predictions`) });
  const done = () => {
    setReason(""); setOverride("");
    qc.invalidateQueries({ queryKey: key });
    qc.invalidateQueries({ queryKey: ["evaluation"] });
    qc.invalidateQueries({ queryKey: ["insights"] });
    onTicketChanged();
  };
  const suggest = useMutation({
    mutationFn: () => api<Prediction>("/ai/classify", { method: "POST", body: JSON.stringify({ ticket_id: ticketId }) }),
    onSuccess: done,
  });
  const review = useMutation({
    mutationFn: (v: { id: number; decision: "accepted" | "edited" | "rejected"; final_category_id?: number }) =>
      api<Prediction>(`/ai/predictions/${v.id}/review`, {
        method: "POST",
        body: JSON.stringify({ decision: v.decision, final_category_id: v.final_category_id, reason: reason.trim() || null }),
      }),
    onSuccess: (p) => {
      const d = p.review?.decision;
      toast({
        kind: "success",
        title: d === "rejected" ? "Suggestion rejected" : `Category set to ${p.review?.final_category?.name ?? p.predicted.label}`,
        detail: d === "rejected" ? "The ticket's category was not changed." : "Recorded in the activity history.",
      });
      done();
    },
    onError: (e) => toast({ kind: "error", title: "Review not saved", detail: (e as Error).message }),
  });

  const latest = list.data?.[0];
  const earlier = list.data?.slice(1) ?? [];
  const busy = suggest.isPending || review.isPending;
  const err = (suggest.error ?? list.error) as Error | null;
  const sameAsCurrent = latest && currentCategory?.id === latest.predicted.category_id;

  return (
    <AiPanel id="ai-cat" title="Category suggestion" icon={Tags}
      actions={latest && !suggest.isPending ? (
        <Button variant="ghost" className="h-8 px-2 text-xs" disabled={busy} onClick={() => suggest.mutate()}>
          <RefreshCw aria-hidden className="h-3.5 w-3.5" />New suggestion
        </Button>
      ) : undefined}
      footer={latest ? (
        <AboutResult>
          <p>Model: {latest.model_name} {latest.model_version} · {latest.latency_ms} ms</p>
          <p>Created {fmtDate(latest.created_at!)}</p>
          <p>Trained and evaluated on synthetic tickets only; real tickets would likely score lower.</p>
        </AboutResult>
      ) : undefined}>
      {list.isLoading ? <PanelSkeleton /> : suggest.isPending ? (
        <div role="status"><p className="mb-3 text-sm text-muted">Analysing the ticket text…</p><PanelSkeleton rows={2} /></div>
      ) : !latest ? (
        <div className="text-sm">
          <p className="text-muted">Ask the classifier for a category, its confidence estimate and the next most likely alternatives. Nothing changes until you accept.</p>
          <Button className="mt-3 w-full" onClick={() => suggest.mutate()}>Suggest category</Button>
        </div>
      ) : (
        <div className="space-y-4 text-sm">
          <div className="rounded-md border border-ai/30 bg-ai/5 p-3">
            <div className="flex items-center justify-between gap-2"><span className="text-xs text-muted">Suggested</span><AiBadge /></div>
            <p className="mt-1 text-base font-semibold">{latest.predicted.label}</p>
            <div className="mt-3"><ConfidenceMeter value={latest.confidence} threshold={latest.threshold} /></div>
          </div>

          <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
            <span>Approved now:</span>
            <span className="font-medium text-ink">{currentCategory?.name ?? "Not set"}</span>
            {!latest.review && !sameAsCurrent && <><ArrowRight aria-hidden className="h-3 w-3" /><span>accepting sets <b className="text-ink">{latest.predicted.label}</b></span></>}
            {!latest.review && sameAsCurrent && <span>(same as the suggestion)</span>}
          </p>

          {latest.needs_manual_review && (
            <Callout role="status" title="Low confidence: classify manually">
              The estimate is below the {pct(latest.threshold)} review threshold. Treat the suggestion as a hint at most.
            </Callout>
          )}

          {latest.alternatives.length > 0 && (
            <div>
              <h4 className="text-xs font-medium text-muted">Other possibilities</h4>
              <ul className="mt-1.5 space-y-1.5">
                {latest.alternatives.map((a) => (
                  <li key={a.label}>
                    <div className="flex justify-between gap-2 text-xs"><span className="truncate">{a.label}</span><span className="tabular text-muted">{pct(a.probability)}</span></div>
                    <div aria-hidden className="mt-1 h-1 rounded-full bg-line/70"><div className="h-full rounded-full bg-ai/40" style={{ width: `${a.probability * 100}%` }} /></div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {latest.review ? (
            <ReviewSummary p={latest} />
          ) : (
            <div className="space-y-3 border-t border-line pt-4">
              <h4 className="text-xs font-medium text-muted">Your decision</h4>
              <div className="grid grid-cols-2 gap-2">
                <Button disabled={busy || latest.predicted.category_id === null}
                  onClick={() => review.mutate({ id: latest.id!, decision: "accepted" })}>
                  <Check aria-hidden className="h-4 w-4" />Accept
                </Button>
                <Button variant="secondary" disabled={busy} onClick={() => review.mutate({ id: latest.id!, decision: "rejected" })}>
                  <X aria-hidden className="h-4 w-4" />Reject
                </Button>
              </div>
              <div>
                <label htmlFor="ov" className="mb-1 block text-xs text-muted">Or choose the right category</label>
                <div className="flex gap-2">
                  <Select id="ov" className="min-w-0 flex-1" value={override} onChange={(e) => setOverride(e.target.value)}>
                    <option value="">Choose…</option>
                    {cats.data?.filter((c) => c.id !== latest.predicted.category_id).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </Select>
                  <Button variant="secondary" disabled={busy || !override}
                    onClick={() => review.mutate({ id: latest.id!, decision: "edited", final_category_id: Number(override) })}>Apply</Button>
                </div>
              </div>
              <details className="text-xs">
                <summary className="cursor-pointer text-muted hover:text-ink">Add feedback for the evaluation (optional)</summary>
                <label htmlFor="why" className="sr-only">Feedback</label>
                <Textarea id="why" className="mt-2" rows={2} value={reason} maxLength={2000} onChange={(e) => setReason(e.target.value)}
                  placeholder="Why was the suggestion right or wrong?" />
              </details>
            </div>
          )}

          {earlier.length > 0 && (
            <details className="text-xs">
              <summary className="cursor-pointer text-muted hover:text-ink">Earlier suggestions ({earlier.length})</summary>
              <ul className="mt-2 space-y-1.5 text-muted">
                {earlier.map((p) => (
                  <li key={p.id}>
                    <time dateTime={p.created_at!} title={fmtDate(p.created_at!)}>{fmtRelative(p.created_at!)}</time>: {p.predicted.label} ({pct(p.confidence)}) · {p.review ? label(p.review.decision) : "not reviewed"}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
      {err && <p role="alert" className="mt-3 text-sm text-danger">{err.message}</p>}
    </AiPanel>
  );
}

function ReviewSummary({ p }: { p: Prediction }) {
  const r = p.review!;
  const d = DECISION[r.decision];
  return (
    <div className="rounded-md border border-line bg-paper p-3">
      <p className={cn("flex items-center gap-1.5 font-medium", d.cls)}><d.icon aria-hidden className="h-4 w-4" />{d.text}
        {r.decision !== "rejected" && r.final_category && <span className="text-ink">: {r.final_category.name}</span>}
      </p>
      <p className="mt-0.5 text-xs text-muted">
        by {r.user.full_name} · <time dateTime={r.created_at} title={fmtDate(r.created_at)}>{fmtRelative(r.created_at)}</time>
      </p>
      {r.reason && <p className="mt-2 whitespace-pre-wrap break-words text-xs">{r.reason}</p>}
    </div>
  );
}
