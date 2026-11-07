"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";

import { StatusBadge } from "@/components/badges";
import { Select } from "@/components/ui/select";
import { api } from "@/lib/api";
import { METHOD_LABEL } from "@/lib/format";
import type { ArticleHitsOut, Method, SimilarTicketsOut } from "@/types/api";

const score = (n: number) => n.toFixed(2);

function MethodPicker({ value, onChange }: { value: Method; onChange: (m: Method) => void }) {
  return (
    <label className="flex items-center gap-2 text-xs text-muted">
      Ranking
      <Select value={value} onChange={(e) => onChange(e.target.value as Method)} className="h-8 w-auto text-xs">
        {(Object.keys(METHOD_LABEL) as Method[]).map((m) => <option key={m} value={m}>{METHOD_LABEL[m]}</option>)}
      </Select>
    </label>
  );
}

const CONF: Record<string, string> = {
  strong: "Strong match", weak: "Weak match", unvalidated: "Relevance not validated",
};

/** Suggested troubleshooting articles. Display only: nothing here changes the ticket. */
export function RelatedArticles({ ticketId }: { ticketId: number }) {
  const [method, setMethod] = useState<Method>("hybrid");
  const q = useQuery({
    queryKey: ["related-articles", ticketId, method],
    queryFn: () => api<ArticleHitsOut>("/ai/related-articles", { method: "POST", body: JSON.stringify({ ticket_id: ticketId, method, limit: 3 }) }),
  });
  return (
    <section className="rounded-lg border border-dashed border-ai p-5" aria-labelledby="rel-art">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="rel-art" className="text-sm font-medium text-ai">Related knowledge articles</h2>
        <MethodPicker value={method} onChange={setMethod} />
      </div>
      <p className="mt-1 text-xs text-muted">Suggestions only. Approved articles ranked by text similarity; check they fit the ticket.</p>
      {q.isLoading && <p className="mt-3 text-sm text-muted">Searching…</p>}
      {q.isError && <p role="alert" className="mt-3 text-sm text-danger">{(q.error as Error).message}</p>}
      {q.data && q.data.results.length === 0 && <p className="mt-3 text-sm text-muted">No approved articles to search yet.</p>}
      <ul className="mt-3 space-y-3">
        {q.data?.results.map((a) => (
          <li key={a.article_id} className="text-sm">
            <Link href={`/knowledge/${a.article_id}`} className="font-medium text-brand hover:underline">{a.title}</Link>
            <p className="text-xs text-muted">
              {a.category ?? "Uncategorised"} · similarity {score(a.score)} · {CONF[a.confidence]}
              {a.confidence === "weak" && " (below the validated threshold)"}
            </p>
            <p className="mt-0.5 text-muted">{a.snippet}</p>
          </li>
        ))}
      </ul>
      {q.data && <p className="mt-3 text-xs text-muted">Embedding: {q.data.meta.embedder} · {q.data.meta.latency_ms} ms{q.data.meta.note ? ` · ${q.data.meta.note}` : ""}</p>}
    </section>
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
    <section className="rounded-lg border border-dashed border-ai p-5" aria-labelledby="sim-inc">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="sim-inc" className="text-sm font-medium text-ai">Similar previous incidents</h2>
        <MethodPicker value={method} onChange={setMethod} />
      </div>
      <p className="mt-1 text-xs text-muted">Ranked by text similarity. A resolution that worked once may not fit this ticket.</p>
      {q.isLoading && <p className="mt-3 text-sm text-muted">Searching…</p>}
      {q.isError && <p role="alert" className="mt-3 text-sm text-danger">{(q.error as Error).message}</p>}
      {q.data && q.data.results.length === 0 && <p className="mt-3 text-sm text-muted">No other tickets to compare with.</p>}
      <ul className="mt-3 divide-y divide-line">
        {q.data?.results.map((t) => (
          <li key={t.ticket_id} className="py-2 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <Link href={`/tickets/${t.ticket_id}`} className="font-medium text-brand hover:underline">{t.title}</Link>
              <StatusBadge value={t.status} />
              <span className="text-xs tabular-nums text-muted">similarity {score(t.score)}</span>
            </div>
            <p className="text-xs text-muted">{t.external_id ?? `#${t.ticket_id}`} · {t.category ?? "Uncategorised"}</p>
            <p className="mt-0.5 text-muted">{t.resolution_summary ? `Resolution: ${t.resolution_summary}` : "No resolution recorded."}</p>
          </li>
        ))}
      </ul>
      {q.data && <p className="mt-3 text-xs text-muted">Embedding: {q.data.meta.embedder} · {q.data.meta.latency_ms} ms. {q.data.meta.note}</p>}
    </section>
  );
}
