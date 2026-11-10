"use client";

import { useQuery } from "@tanstack/react-query";
import { BookOpen, History } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { StatusBadge } from "@/components/badges";
import { Select } from "@/components/ui/select";
import { AboutResult, AiPanel, MatchChip, PanelSkeleton } from "@/features/ai/ui";
import { api } from "@/lib/api";
import { METHOD_LABEL, ticketNo } from "@/lib/format";
import type { ArticleHitsOut, Method, SimilarTicketsOut } from "@/types/api";

const score = (n: number) => n.toFixed(2);

function MethodPicker({ id, value, onChange }: { id: string; value: Method; onChange: (m: Method) => void }) {
  return (
    <div className="flex items-center gap-1.5">
      <label htmlFor={id} className="text-xs text-muted">Ranking</label>
      <Select id={id} value={value} onChange={(e) => onChange(e.target.value as Method)} className="h-8 w-auto py-0 text-xs">
        {(Object.keys(METHOD_LABEL) as Method[]).map((m) => <option key={m} value={m}>{METHOD_LABEL[m]}</option>)}
      </Select>
    </div>
  );
}

/** Suggested knowledge articles. Display only: nothing here changes the ticket. */
export function RelatedArticles({ ticketId }: { ticketId: number }) {
  const [method, setMethod] = useState<Method>("hybrid");
  const q = useQuery({
    queryKey: ["related-articles", ticketId, method],
    queryFn: () => api<ArticleHitsOut>("/ai/related-articles", { method: "POST", body: JSON.stringify({ ticket_id: ticketId, method, limit: 3 }) }),
  });
  return (
    <AiPanel id="rel-art" title="Related articles" icon={BookOpen}
      actions={<MethodPicker id="rel-art-method" value={method} onChange={setMethod} />}
      footer={q.data ? (
        <AboutResult>
          <p>Approved articles ranked by text similarity. A high score means similar wording, not a confirmed fix.</p>
          <p>Embedding: {q.data.meta.embedder} · {q.data.meta.latency_ms} ms{q.data.meta.note ? ` · ${q.data.meta.note}` : ""}</p>
        </AboutResult>
      ) : undefined}>
      {q.isLoading ? <PanelSkeleton /> : q.isError ? (
        <p role="alert" className="text-sm text-danger">{(q.error as Error).message}</p>
      ) : q.data && q.data.results.length === 0 ? (
        <p className="text-sm text-muted">No approved articles to search yet.</p>
      ) : (
        <ul className="-my-1 divide-y divide-line">
          {q.data?.results.map((a) => (
            <li key={a.article_id} className="py-3 text-sm first:pt-1 last:pb-1">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <Link href={`/knowledge/${a.article_id}`} className="min-w-0 font-medium text-brand hover:underline">{a.title}</Link>
                <MatchChip confidence={a.confidence} />
              </div>
              <p className="mt-0.5 text-xs text-muted">
                {a.category ?? "Uncategorised"} · similarity {score(a.score)}{a.confidence === "weak" && " · below the validated threshold"}
              </p>
              <p className="mt-1 line-clamp-2 text-xs text-ink/80">{a.snippet}</p>
            </li>
          ))}
        </ul>
      )}
    </AiPanel>
  );
}

/** Previous tickets that read like this one, with how they were resolved. */
export function SimilarIncidents({ ticketId }: { ticketId: number }) {
  const [method, setMethod] = useState<Method>("hybrid");
  const q = useQuery({
    queryKey: ["similar-incidents", ticketId, method],
    queryFn: () => api<SimilarTicketsOut>("/ai/similar-incidents", { method: "POST", body: JSON.stringify({ ticket_id: ticketId, method, limit: 5 }) }),
  });
  return (
    <AiPanel id="sim-inc" title="Similar past tickets" icon={History}
      actions={<MethodPicker id="sim-inc-method" value={method} onChange={setMethod} />}
      footer={q.data ? (
        <AboutResult>
          <p>Ranked by text similarity. A resolution that worked once may not fit this ticket.</p>
          <p>Embedding: {q.data.meta.embedder} · {q.data.meta.latency_ms} ms.{q.data.meta.note ? ` ${q.data.meta.note}` : ""}</p>
        </AboutResult>
      ) : undefined}>
      {q.isLoading ? <PanelSkeleton /> : q.isError ? (
        <p role="alert" className="text-sm text-danger">{(q.error as Error).message}</p>
      ) : q.data && q.data.results.length === 0 ? (
        <p className="text-sm text-muted">No other tickets to compare with.</p>
      ) : (
        <ul className="-my-1 divide-y divide-line">
          {q.data?.results.map((t) => (
            <li key={t.ticket_id} className="py-3 text-sm first:pt-1 last:pb-1">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <Link href={`/tickets/${t.ticket_id}`} className="min-w-0 font-medium text-brand hover:underline">{t.title}</Link>
                <StatusBadge value={t.status} />
              </div>
              <p className="mt-0.5 text-xs text-muted">{ticketNo(t.ticket_id)} · {t.category ?? "Uncategorised"} · similarity {score(t.score)}</p>
              <p className="mt-1 border-l-2 border-line pl-2.5 text-xs text-ink/80">
                {t.resolution_summary ? t.resolution_summary : <span className="text-muted">No resolution recorded.</span>}
              </p>
            </li>
          ))}
        </ul>
      )}
    </AiPanel>
  );
}
