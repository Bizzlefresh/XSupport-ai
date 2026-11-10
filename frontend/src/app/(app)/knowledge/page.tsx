"use client";

import { useQuery } from "@tanstack/react-query";
import { BookOpen, ListOrdered, Plus, Search, SearchX } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { ArticleStatusBadge } from "@/components/badges";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState, ErrorState, PageHeader, Skeleton } from "@/components/ui/primitives";
import { Select } from "@/components/ui/select";
import { MatchChip } from "@/features/ai/ui";
import { useCategories } from "@/features/tickets/hooks";
import { api } from "@/lib/api";
import { fmtDate, fmtRelative, METHOD_LABEL, SOURCE_LABEL } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ArticleHitsOut, ArticlePage, Method } from "@/types/api";

type Mode = "ranked" | "filter";

function ListSkeleton() {
  return <div className="grid gap-3 md:grid-cols-2">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-28" />)}</div>;
}

export default function KnowledgePage() {
  const cats = useCategories();
  const [q, setQ] = useState("");
  const [submitted, setSubmitted] = useState("");
  const [mode, setMode] = useState<Mode>("ranked");
  const [method, setMethod] = useState<Method>("hybrid");
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState("");

  const showRanked = mode === "ranked" && submitted.length >= 2;
  const list = useQuery({
    queryKey: ["articles", mode === "filter" ? submitted : "", category, status],
    queryFn: () => {
      const p = new URLSearchParams({ page_size: "50" });
      if (mode === "filter" && submitted) p.set("q", submitted);
      if (category) p.set("category_id", category);
      if (status) p.set("status", status);
      return api<ArticlePage>(`/knowledge?${p}`);
    },
    enabled: !showRanked,
  });
  const ranked = useQuery({
    queryKey: ["article-search", submitted, method],
    queryFn: () => api<ArticleHitsOut>(`/knowledge/search?${new URLSearchParams({ q: submitted, method, limit: "10" })}`),
    enabled: showRanked,
  });

  const modeBtn = (m: Mode, text: string) => (
    <button type="button" role="radio" aria-checked={mode === m} onClick={() => { if (m !== mode) { setMode(m); setSubmitted(""); } }}
      className={cn("rounded px-3 py-1.5 text-sm font-medium transition-colors", mode === m ? "bg-panel text-ink shadow-sm" : "text-muted hover:text-ink")}>
      {text}
    </button>
  );

  return (
    <div>
      <PageHeader title="Knowledge base"
        description="Troubleshooting articles (original sample content). Only approved articles feed AI suggestions."
        actions={
          <Link href="/knowledge/new" className="inline-flex h-10 items-center gap-2 rounded-md bg-brand px-4 text-sm font-medium text-on-brand shadow-sm hover:opacity-90">
            <Plus aria-hidden className="h-4 w-4" />New article
          </Link>
        } />

      <form role="search" aria-label="Article search" className="rounded-lg border border-line bg-panel p-4 shadow-sm"
        onSubmit={(e) => { e.preventDefault(); setSubmitted(q.trim()); }}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div role="radiogroup" aria-label="Search mode" className="inline-flex rounded-md bg-paper p-1">
            {modeBtn("ranked", "Ranked by similarity")}{modeBtn("filter", "Browse and filter")}
          </div>
          <p className="text-xs text-muted">
            {mode === "ranked" ? "Describe the problem in your own words; results are ranked by how similar they read." : "Matches words in the title or text, with filters."}
          </p>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto] lg:grid-cols-[minmax(0,1fr)_repeat(2,12rem)_auto]">
          <div className="sm:col-span-2 lg:col-span-1">
            <label htmlFor="kq" className="mb-1 block text-xs font-medium text-muted">Search articles</label>
            <div className="relative">
              <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
              <Input id="kq" type="search" className="pl-9" value={q} onChange={(e) => setQ(e.target.value)}
                placeholder={mode === "ranked" ? "e.g. laptop will not connect to Wi-Fi" : "e.g. printer"} />
            </div>
          </div>
          {mode === "ranked" ? (
            <div className="lg:col-span-2"><label htmlFor="km" className="mb-1 block text-xs font-medium text-muted">Ranking method</label>
              <Select id="km" className="w-full" value={method} onChange={(e) => setMethod(e.target.value as Method)}>
                {(Object.keys(METHOD_LABEL) as Method[]).map((m) => <option key={m} value={m}>{METHOD_LABEL[m]}</option>)}
              </Select></div>
          ) : (
            <>
              <div><label htmlFor="kc" className="mb-1 block text-xs font-medium text-muted">Category</label>
                <Select id="kc" className="w-full" value={category} onChange={(e) => setCategory(e.target.value)}>
                  <option value="">All categories</option>{cats.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></div>
              <div><label htmlFor="ks" className="mb-1 block text-xs font-medium text-muted">Status</label>
                <Select id="ks" className="w-full" value={status} onChange={(e) => setStatus(e.target.value)}>
                  <option value="">Active (not archived)</option><option value="approved">Approved</option><option value="draft">Draft</option><option value="archived">Archived</option>
                </Select></div>
            </>
          )}
          <div className="flex items-end"><Button type="submit" className="w-full">Search</Button></div>
        </div>
      </form>

      <div className="mt-5" aria-live="polite">
        {showRanked ? (
          ranked.isLoading ? <ListSkeleton /> : ranked.isError ? (
            <div className="rounded-lg border border-line bg-panel"><ErrorState message={(ranked.error as Error).message} onRetry={() => ranked.refetch()} /></div>
          ) : ranked.data && ranked.data.results.length === 0 ? (
            <div className="rounded-lg border border-line bg-panel"><EmptyState icon={SearchX} title="No approved articles to rank" /></div>
          ) : (
            <>
              <p className="mb-2 text-sm text-muted">Top {ranked.data?.results.length} for “{submitted}” · {METHOD_LABEL[method]}</p>
              <ol className="space-y-2">
                {ranked.data?.results.map((a, i) => (
                  <li key={a.article_id}>
                    <Link href={`/knowledge/${a.article_id}`} className="flex gap-3 rounded-lg border border-line bg-panel p-4 shadow-sm transition-colors hover:border-brand/40">
                      <span aria-hidden className="tabular grid h-7 w-7 shrink-0 place-items-center rounded-full bg-paper text-xs font-semibold text-muted">{i + 1}</span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <p className="font-medium">{a.title}</p><MatchChip confidence={a.confidence} />
                        </div>
                        <p className="mt-0.5 text-xs text-muted">{a.category ?? "Uncategorised"} · similarity {a.score.toFixed(2)}</p>
                        <p className="mt-1.5 line-clamp-2 text-sm text-ink/80">{a.snippet}</p>
                      </div>
                    </Link>
                  </li>
                ))}
              </ol>
              {ranked.data && (
                <p className="mt-3 text-xs text-muted">Embedding {ranked.data.meta.embedder}. Ranking always returns the closest articles, even when none truly fits; check the match labels.</p>
              )}
            </>
          )
        ) : list.isLoading ? <ListSkeleton /> : list.isError ? (
          <div className="rounded-lg border border-line bg-panel"><ErrorState message={(list.error as Error).message} onRetry={() => list.refetch()} /></div>
        ) : list.data && list.data.items.length === 0 ? (
          <div className="rounded-lg border border-line bg-panel">
            <EmptyState icon={BookOpen} title="No articles match" description="Try other words or clear the filters." />
          </div>
        ) : (
          <>
            <p className="mb-2 text-sm text-muted">{list.data?.total} article{list.data?.total === 1 ? "" : "s"}</p>
            <ul className="grid gap-3 md:grid-cols-2">
              {list.data?.items.map((a) => (
                <li key={a.id}>
                  <Link href={`/knowledge/${a.id}`} className="flex h-full flex-col rounded-lg border border-line bg-panel p-4 shadow-sm transition-colors hover:border-brand/40">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-medium leading-snug">{a.title}</p><ArticleStatusBadge value={a.status} />
                    </div>
                    <p className="mt-1 line-clamp-2 text-sm text-muted">{a.problem_description}</p>
                    <p className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 pt-3 text-xs text-muted">
                      <span>{a.category?.name ?? "Uncategorised"}</span>
                      <span className="inline-flex items-center gap-1"><ListOrdered aria-hidden className="h-3 w-3" />{a.steps.length} steps</span>
                      <span>{SOURCE_LABEL[a.source_type] ?? a.source_type}</span>
                      <span title={fmtDate(a.updated_at)}>Updated {fmtRelative(a.updated_at)}</span>
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
