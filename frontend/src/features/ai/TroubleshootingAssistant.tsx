"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import { fmtDate, SOURCE_LABEL } from "@/lib/format";
import type { Rating, Suggestion } from "@/types/api";

const BANNER: Record<Suggestion["status"], { text: string; cls: string }> = {
  grounded: { text: "Matched to approved articles", cls: "text-ok" },
  unvalidated: { text: "Matched, but relevance could not be validated for this setup. Use extra caution.", cls: "text-muted" },
  insufficient_evidence: { text: "Not enough evidence. No article matched well enough to suggest steps.", cls: "text-danger" },
  no_evidence: { text: "No approved articles available to draw on.", cls: "text-danger" },
};
const RATINGS: [Rating, string][] = [["helpful", "Helpful"], ["partly", "Partly helpful"], ["not_helpful", "Not helpful"]];

/** Cited, extractive troubleshooting help. Steps are copied from approved articles; nothing is generated or applied automatically. */
export function TroubleshootingAssistant({ ticketId, onCommented }: { ticketId: number; onCommented: () => void }) {
  const qc = useQueryClient();
  const [comment, setComment] = useState("");
  const key = ["assistant", ticketId];
  const list = useQuery({ queryKey: key, queryFn: () => api<Suggestion[]>(`/ai/tickets/${ticketId}/assistant`) });
  const ask = useMutation({
    mutationFn: () => api<Suggestion>("/ai/assist", { method: "POST", body: JSON.stringify({ ticket_id: ticketId }) }),
    onSuccess: () => { setComment(""); qc.invalidateQueries({ queryKey: key }); qc.invalidateQueries({ queryKey: ["evaluation"] }); onCommented(); },
  });
  const rate = useMutation({
    mutationFn: (v: { id: number; rating: Rating }) =>
      api<Suggestion>(`/ai/assistant/${v.id}/feedback`, { method: "POST", body: JSON.stringify({ rating: v.rating, comment: comment.trim() || null }) }),
    onSuccess: () => { setComment(""); qc.invalidateQueries({ queryKey: key }); qc.invalidateQueries({ queryKey: ["evaluation"] }); onCommented(); },
  });
  const addNote = useMutation({
    mutationFn: (body: string) => api(`/tickets/${ticketId}/comments`, { method: "POST", body: JSON.stringify({ body }) }),
    onSuccess: onCommented,
  });

  const latest = list.data?.[0];
  const err = (ask.error ?? rate.error ?? addNote.error ?? list.error) as Error | null;
  const busy = ask.isPending || rate.isPending || addNote.isPending;

  return (
    <section className="rounded-lg border border-dashed border-ai p-5" aria-labelledby="ai-ts">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="ai-ts" className="text-sm font-medium text-ai">Troubleshooting assistant</h2>
        <Button variant="secondary" disabled={busy} onClick={() => ask.mutate()}>{latest ? "Refresh suggestion" : "Suggest troubleshooting"}</Button>
      </div>
      <p className="mt-1 text-xs text-muted">Steps are copied from approved knowledge articles, with the source shown. Nothing is changed on the ticket unless you choose to.</p>
      {list.isLoading && <p className="mt-3 text-sm text-muted">Loading…</p>}
      {err && <p role="alert" className="mt-3 text-sm text-danger">{err.message}</p>}

      {latest && (
        <div className="mt-4 space-y-4 text-sm">
          <p className={`font-medium ${BANNER[latest.status].cls}`}>{BANNER[latest.status].text}</p>

          {latest.articles.map((a) => (
            <div key={a.article_id} className="rounded-md border border-line bg-paper p-3">
              <p className="font-medium">Source: <Link className="text-brand hover:underline" href={`/knowledge/${a.article_id}`}>{a.title}</Link></p>
              <p className="text-xs text-muted">{SOURCE_LABEL[a.source_type] ?? a.source_type} · similarity {a.score.toFixed(2)} · {a.confidence === "unvalidated" ? "relevance not validated" : a.confidence === "strong" ? "strong match" : "weak match"}</p>
              {a.steps.length > 0 ? (
                <>
                  <ol className="mt-2 list-decimal space-y-1 pl-5">{a.steps.map((s, i) => <li key={i} className="whitespace-pre-wrap">{s}</li>)}</ol>
                  {a.escalation && <p className="mt-2 text-xs"><b>Escalate when:</b> {a.escalation}</p>}
                  <Button variant="ghost" className="mt-2 h-8 px-2 text-xs" disabled={busy}
                    onClick={() => addNote.mutate(`Suggested steps from "${a.title}" (knowledge article #${a.article_id}):\n${a.steps.map((s, i) => `${i + 1}. ${s}`).join("\n")}`)}>
                    Add these steps to the ticket as a note
                  </Button>
                </>
              ) : <p className="mt-1 text-xs text-muted">Closest article, shown without steps because it may not apply.</p>}
            </div>
          ))}

          {latest.questions.length > 0 && (
            <div><p className="font-medium">Information to gather</p>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-muted">{latest.questions.map((q) => <li key={q}>{q}</li>)}</ul>
              <p className="mt-1 text-xs text-muted">Generic prompts, not specific to this ticket.</p></div>
          )}

          {latest.past_resolutions.length > 0 && (
            <div><p className="font-medium">How similar tickets were resolved</p>
              <ul className="mt-1 space-y-2">{latest.past_resolutions.map((p) => (
                <li key={p.ticket_id}><Link className="text-brand hover:underline" href={`/tickets/${p.ticket_id}`}>{p.title}</Link>
                  <span className="text-xs text-muted"> · {p.external_id ?? `#${p.ticket_id}`} · similarity {p.score.toFixed(2)}</span>
                  <p className="text-muted">{p.resolution_summary}</p></li>))}</ul></div>
          )}

          <ul className="list-disc space-y-1 pl-5 text-xs text-muted">{latest.notes.map((n) => <li key={n}>{n}</li>)}</ul>
          <p className="text-xs text-muted">{latest.assistant_version} · {latest.meta.embedder} · {latest.created_at ? fmtDate(latest.created_at) : ""}</p>

          {latest.rating ? (
            <p className="text-xs text-muted">You rated this suggestion: <b>{RATINGS.find(([r]) => r === latest.rating)?.[1]}</b>{latest.rating_comment ? ` · ${latest.rating_comment}` : ""}</p>
          ) : (
            <div className="space-y-2 border-t border-line pt-3">
              <p className="text-xs text-muted">Was this useful? Your rating helps measure the assistant.</p>
              <Textarea rows={2} maxLength={1000} placeholder="Optional comment" value={comment} onChange={(e) => setComment(e.target.value)} aria-label="Rating comment" />
              <div className="flex flex-wrap gap-2">
                {RATINGS.map(([r, t]) => <Button key={r} variant="secondary" disabled={busy || latest.id === null} onClick={() => latest.id && rate.mutate({ id: latest.id, rating: r })}>{t}</Button>)}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
