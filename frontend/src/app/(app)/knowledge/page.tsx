"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useCategories } from "@/features/tickets/hooks";
import { api } from "@/lib/api";
import { fmtDate, label, METHOD_LABEL, SOURCE_LABEL } from "@/lib/format";
import type { ArticleHitsOut, ArticlePage, Method } from "@/types/api";

export default function KnowledgePage() {
  const cats = useCategories();
  const [q, setQ] = useState("");
  const [submitted, setSubmitted] = useState("");
  const [mode, setMode] = useState<"filter" | "ranked">("ranked");
  const [method, setMethod] = useState<Method>("hybrid");
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState("");

  const list = useQuery({
    queryKey: ["articles", submitted, category, status],
    queryFn: () => {
      const p = new URLSearchParams({ page_size: "50" });
      if (submitted) p.set("q", submitted);
      if (category) p.set("category_id", category);
      if (status) p.set("status", status);
      return api<ArticlePage>(`/knowledge?${p}`);
    },
    enabled: mode === "filter" || !submitted,
  });
  const ranked = useQuery({
    queryKey: ["article-search", submitted, method],
    queryFn: () => api<ArticleHitsOut>(`/knowledge/search?${new URLSearchParams({ q: submitted, method, limit: "10" })}`),
    enabled: mode === "ranked" && submitted.length >= 2,
  });

  return (
    <div className="max-w-5xl space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Knowledge base</h1>
          <p className="mt-1 text-sm text-muted">Sample troubleshooting articles. Only approved articles are used for suggestions.</p>
        </div>
        <Link href="/knowledge/new"><Button>New article</Button></Link>
      </div>

      <form className="flex flex-wrap items-end gap-3" role="search" onSubmit={(e) => { e.preventDefault(); setSubmitted(q.trim()); }}>
        <label className="min-w-56 flex-1 text-sm">Search<Input className="mt-1" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Describe the problem" /></label>
        <label className="text-sm">Mode
          <Select className="mt-1" value={mode} onChange={(e) => setMode(e.target.value as "filter" | "ranked")}>
            <option value="ranked">Ranked by similarity</option><option value="filter">Text filter</option>
          </Select></label>
        {mode === "ranked" ? (
          <label className="text-sm">Ranking
            <Select className="mt-1" value={method} onChange={(e) => setMethod(e.target.value as Method)}>
              {(Object.keys(METHOD_LABEL) as Method[]).map((m) => <option key={m} value={m}>{METHOD_LABEL[m]}</option>)}
            </Select></label>
        ) : (
          <>
            <label className="text-sm">Category
              <Select className="mt-1" value={category} onChange={(e) => setCategory(e.target.value)}>
                <option value="">All</option>{cats.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></label>
            <label className="text-sm">Status
              <Select className="mt-1" value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="">Active</option><option value="approved">Approved</option><option value="draft">Draft</option><option value="archived">Archived</option></Select></label>
          </>
        )}
        <Button type="submit">Search</Button>
      </form>

      {mode === "ranked" && submitted ? (
        <section aria-live="polite">
          {ranked.isLoading && <p className="text-sm text-muted">Searching…</p>}
          {ranked.isError && <p role="alert" className="text-sm text-danger">{(ranked.error as Error).message}</p>}
          <ul className="divide-y divide-line rounded-lg border border-line bg-panel">
            {ranked.data?.results.map((a) => (
              <li key={a.article_id} className="p-4 text-sm">
                <Link href={`/knowledge/${a.article_id}`} className="font-medium text-brand hover:underline">{a.title}</Link>
                <p className="text-xs text-muted">{a.category ?? "Uncategorised"} · similarity {a.score.toFixed(2)} ·{" "}
                  {a.confidence === "unvalidated" ? "relevance not validated" : a.confidence === "strong" ? "strong match" : "weak match"}</p>
                <p className="mt-1 text-muted">{a.snippet}</p>
              </li>
            ))}
          </ul>
          {ranked.data && <p className="mt-2 text-xs text-muted">{METHOD_LABEL[ranked.data.meta.method]} · embedding {ranked.data.meta.embedder}. Ranking always returns the closest articles, even when none truly fits; check the scores.</p>}
        </section>
      ) : (
        <section>
          {list.isLoading && <p className="text-sm text-muted">Loading…</p>}
          {list.isError && <p role="alert" className="text-sm text-danger">{(list.error as Error).message}</p>}
          {list.data && list.data.items.length === 0 && <p className="text-sm text-muted">No articles match.</p>}
          <ul className="divide-y divide-line rounded-lg border border-line bg-panel">
            {list.data?.items.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 p-4 text-sm">
                <div>
                  <Link href={`/knowledge/${a.id}`} className="font-medium text-brand hover:underline">{a.title}</Link>
                  <p className="text-xs text-muted">{a.category?.name ?? "Uncategorised"} · {SOURCE_LABEL[a.source_type] ?? a.source_type} · updated {fmtDate(a.updated_at)}</p>
                </div>
                <span className={a.status === "approved" ? "text-xs text-ok" : "text-xs text-muted"}>{label(a.status)}</span>
              </li>
            ))}
          </ul>
          {list.data && <p className="mt-2 text-xs text-muted">{list.data.total} article{list.data.total === 1 ? "" : "s"}</p>}
        </section>
      )}
    </div>
  );
}
