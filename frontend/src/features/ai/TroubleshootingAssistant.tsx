"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle, BookOpen, Check, CircleCheck, CircleHelp, ClipboardPlus, History, Info, Meh, RefreshCw, ThumbsDown, ThumbsUp, Wrench,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { AboutResult, AiPanel, Callout, MatchChip, PanelSkeleton } from "@/features/ai/ui";
import { api } from "@/lib/api";
import { fmtDate, SOURCE_LABEL, ticketNo } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Rating, Suggestion } from "@/types/api";

const BANNER: Record<Suggestion["status"], { title: string; text: string; tone: "ok" | "warn" | "info"; icon: LucideIcon }> = {
  grounded: { title: "Matched to approved articles", text: "Steps below are copied word for word from the cited articles. Check they fit before acting.", tone: "ok", icon: CircleCheck },
  unvalidated: { title: "Matched, relevance not validated", text: "No relevance threshold is validated for this setup. Use extra caution.", tone: "warn", icon: CircleHelp },
  insufficient_evidence: { title: "Not enough evidence", text: "No article matched well enough to suggest steps. Gather more information first.", tone: "info", icon: Info },
  no_evidence: { title: "No approved articles available", text: "Add or approve knowledge articles to enable suggestions.", tone: "info", icon: Info },
};
const RATINGS: [Rating, string, LucideIcon][] = [["helpful", "Helpful", ThumbsUp], ["partly", "Partly", Meh], ["not_helpful", "Not helpful", ThumbsDown]];

/** Cited, extractive troubleshooting help. Steps are copied from approved articles; nothing is generated or applied automatically. */
export function TroubleshootingAssistant({ ticketId, onCommented }: { ticketId: number; onCommented: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [comment, setComment] = useState("");
  const [added, setAdded] = useState<Set<number>>(new Set());
  const key = ["assistant", ticketId];
  const list = useQuery({ queryKey: key, queryFn: () => api<Suggestion[]>(`/ai/tickets/${ticketId}/assistant`) });
  const refresh = () => { qc.invalidateQueries({ queryKey: key }); qc.invalidateQueries({ queryKey: ["evaluation"] }); qc.invalidateQueries({ queryKey: ["insights"] }); };
  const ask = useMutation({
    mutationFn: () => api<Suggestion>("/ai/assist", { method: "POST", body: JSON.stringify({ ticket_id: ticketId }) }),
    onSuccess: () => { setComment(""); setAdded(new Set()); refresh(); onCommented(); },
  });
  const rate = useMutation({
    mutationFn: (v: { id: number; rating: Rating }) =>
      api<Suggestion>(`/ai/assistant/${v.id}/feedback`, { method: "POST", body: JSON.stringify({ rating: v.rating, comment: comment.trim() || null }) }),
    onSuccess: () => { setComment(""); refresh(); onCommented(); toast({ kind: "success", title: "Thanks, rating saved" }); },
    onError: (e) => toast({ kind: "error", title: "Rating not saved", detail: (e as Error).message }),
  });
  const addNote = useMutation({
    mutationFn: (v: { articleId: number; body: string }) => api(`/tickets/${ticketId}/comments`, { method: "POST", body: JSON.stringify({ body: v.body }) }),
    onSuccess: (_d, v) => {
      setAdded((s) => new Set(s).add(v.articleId));
      onCommented();
      toast({ kind: "success", title: "Steps added to the ticket as a note" });
    },
    onError: (e) => toast({ kind: "error", title: "Note not added", detail: (e as Error).message }),
  });

  const latest = list.data?.[0];
  const err = (ask.error ?? list.error) as Error | null;
  const busy = ask.isPending || rate.isPending || addNote.isPending;
  const banner = latest ? BANNER[latest.status] : null;

  return (
    <AiPanel id="ai-ts" title="Troubleshooting steps" icon={Wrench}
      actions={latest && !ask.isPending ? (
        <Button variant="ghost" className="h-8 px-2 text-xs" disabled={busy} onClick={() => ask.mutate()}>
          <RefreshCw aria-hidden className="h-3.5 w-3.5" />Refresh
        </Button>
      ) : undefined}
      footer={latest ? (
        <AboutResult>
          {latest.notes.map((n) => <p key={n}>{n}</p>)}
          <p>{latest.assistant_version} · {latest.meta.embedder} · {latest.meta.latency_ms} ms{latest.created_at ? ` · ${fmtDate(latest.created_at)}` : ""}</p>
        </AboutResult>
      ) : undefined}>
      {list.isLoading ? <PanelSkeleton /> : ask.isPending ? (
        <div role="status"><p className="mb-3 text-sm text-muted">Searching approved articles and past resolutions…</p><PanelSkeleton rows={3} /></div>
      ) : !latest ? (
        <div className="text-sm">
          <p className="text-muted">Finds approved knowledge articles that match this ticket and shows their steps with the source. It does not write new instructions.</p>
          <Button className="mt-3 w-full" variant="secondary" onClick={() => ask.mutate()}>Suggest troubleshooting</Button>
        </div>
      ) : (
        <div className="space-y-4 text-sm">
          {banner && <Callout role="status" tone={banner.tone} icon={banner.icon} title={banner.title}>{banner.text}</Callout>}

          {latest.articles.map((a) => (
            <article key={a.article_id} className="rounded-md border border-line bg-paper p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <Link className="flex min-w-0 items-start gap-1.5 font-medium text-brand hover:underline" href={`/knowledge/${a.article_id}`}>
                  <BookOpen aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0" /><span>{a.title}</span>
                </Link>
                <MatchChip confidence={a.confidence} />
              </div>
              <p className="mt-1 text-xs text-muted">Source: {SOURCE_LABEL[a.source_type] ?? a.source_type} · similarity {a.score.toFixed(2)}</p>
              {a.steps.length > 0 ? (
                <>
                  <ol className="mt-3 space-y-2">
                    {a.steps.map((s, i) => (
                      <li key={i} className="flex gap-2.5">
                        <span aria-hidden className="tabular grid h-5 w-5 shrink-0 place-items-center rounded-full bg-ai/15 text-[11px] font-semibold text-ai">{i + 1}</span>
                        <span className="whitespace-pre-wrap break-words">{s}</span>
                      </li>
                    ))}
                  </ol>
                  {a.escalation && (
                    <p className="mt-3 flex gap-2 rounded border-l-2 border-warn bg-warn/5 px-2.5 py-1.5 text-xs">
                      <AlertTriangle aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warn" /><span><b>Escalate when:</b> {a.escalation}</span>
                    </p>
                  )}
                  <Button variant="ghost" className="mt-2 h-8 px-2 text-xs" disabled={busy || added.has(a.article_id)}
                    onClick={() => addNote.mutate({
                      articleId: a.article_id,
                      body: `Suggested steps from "${a.title}" (knowledge article #${a.article_id}):\n${a.steps.map((s, i) => `${i + 1}. ${s}`).join("\n")}`,
                    })}>
                    {added.has(a.article_id)
                      ? <><Check aria-hidden className="h-3.5 w-3.5" />Added as a note</>
                      : <><ClipboardPlus aria-hidden className="h-3.5 w-3.5" />Add these steps as a ticket note</>}
                  </Button>
                </>
              ) : <p className="mt-2 text-xs text-muted">Closest article, shown without steps because it may not apply.</p>}
            </article>
          ))}

          {latest.questions.length > 0 && (
            <div>
              <h4 className="text-xs font-medium text-muted">Information to gather</h4>
              <ul className="mt-1.5 list-disc space-y-1 pl-5">{latest.questions.map((q) => <li key={q}>{q}</li>)}</ul>
              <p className="mt-1 text-[11px] text-muted">Generic prompts, not specific to this ticket.</p>
            </div>
          )}

          {latest.past_resolutions.length > 0 && (
            <div>
              <h4 className="flex items-center gap-1.5 text-xs font-medium text-muted"><History aria-hidden className="h-3.5 w-3.5" />How similar tickets were resolved</h4>
              <ul className="mt-1.5 space-y-2.5">
                {latest.past_resolutions.map((p) => (
                  <li key={p.ticket_id}>
                    <Link className="font-medium text-brand hover:underline" href={`/tickets/${p.ticket_id}`}>{p.title}</Link>
                    <span className="text-xs text-muted"> · {ticketNo(p.ticket_id)} · similarity {p.score.toFixed(2)}</span>
                    <p className="mt-0.5 border-l-2 border-line pl-2.5 text-xs text-ink/80">{p.resolution_summary}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="border-t border-line pt-3">
            {latest.rating ? (
              <p className="text-xs text-muted">
                You rated this: <b className="text-ink">{RATINGS.find(([r]) => r === latest.rating)?.[1]}</b>{latest.rating_comment ? ` · ${latest.rating_comment}` : ""}
              </p>
            ) : (
              <fieldset disabled={busy || latest.id === null}>
                <legend className="text-xs text-muted">Was this useful? Ratings feed the assistant&apos;s evaluation.</legend>
                <div className="mt-2 grid grid-cols-3 gap-1.5">
                  {RATINGS.map(([r, t, Icon]) => (
                    <Button key={r} variant="secondary" className={cn("h-9 px-2 text-xs")} onClick={() => latest.id && rate.mutate({ id: latest.id, rating: r })}>
                      <Icon aria-hidden className="h-3.5 w-3.5" />{t}
                    </Button>
                  ))}
                </div>
                <details className="mt-2 text-xs">
                  <summary className="cursor-pointer text-muted hover:text-ink">Add a comment (optional)</summary>
                  <Textarea className="mt-2" rows={2} maxLength={1000} placeholder="What was missing or wrong?" value={comment}
                    onChange={(e) => setComment(e.target.value)} aria-label="Rating comment" />
                </details>
              </fieldset>
            )}
          </div>
        </div>
      )}
      {err && <p role="alert" className="mt-3 text-sm text-danger">{err.message}</p>}
    </AiPanel>
  );
}
