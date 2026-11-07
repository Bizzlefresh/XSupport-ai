"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { ArticleForm, type ArticleDraft } from "@/features/knowledge/ArticleForm";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { fmtDate, label, SOURCE_LABEL } from "@/lib/format";
import type { Article, ArticleStatus } from "@/types/api";

export default function ArticlePageView() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const q = useQuery({ queryKey: ["article", id], queryFn: () => api<Article>(`/knowledge/${id}`) });
  const save = useMutation({
    mutationFn: (v: Partial<ArticleDraft> & { status?: ArticleStatus }) => api<Article>(`/knowledge/${id}`, { method: "PATCH", body: JSON.stringify(v) }),
    onSuccess: () => { setEditing(false); qc.invalidateQueries({ queryKey: ["article", id] }); qc.invalidateQueries({ queryKey: ["articles"] }); qc.invalidateQueries({ queryKey: ["related-articles"] }); },
  });
  const a = q.data;
  const isAdmin = user?.role === "admin";
  const err = save.error ? (save.error as Error).message : null;

  if (q.isLoading) return <p className="text-sm text-muted">Loading…</p>;
  if (q.isError || !a) return <p role="alert" className="text-sm text-danger">{(q.error as Error)?.message ?? "Article not found"}</p>;

  return (
    <div className="max-w-3xl space-y-5">
      <Link href="/knowledge" className="text-sm text-brand hover:underline">← Knowledge base</Link>
      {editing ? (
        <ArticleForm initial={a} busy={save.isPending} error={err} submitLabel="Save changes" onCancel={() => setEditing(false)} onSubmit={(v) => save.mutate(v)} />
      ) : (
        <article className="space-y-5">
          <header>
            <h1 className="text-2xl font-semibold">{a.title}</h1>
            <p className="mt-1 text-sm text-muted">
              {a.category?.name ?? "Uncategorised"} · <b className={a.status === "approved" ? "text-ok" : ""}>{label(a.status)}</b> · updated {fmtDate(a.updated_at)}
              {a.updater ? ` by ${a.updater.full_name}` : ""}
            </p>
            {a.status !== "approved" && <p className="mt-2 text-sm text-muted">This article is not approved, so it is not used for suggestions.</p>}
          </header>
          <section><h2 className="text-sm font-medium">Problem</h2><p className="mt-1 whitespace-pre-wrap text-sm">{a.problem_description}</p></section>
          <section><h2 className="text-sm font-medium">Troubleshooting steps</h2>
            <ol className="mt-1 list-decimal space-y-1 pl-5 text-sm">{a.steps.map((s, i) => <li key={i} className="whitespace-pre-wrap">{s}</li>)}</ol></section>
          {a.escalation && <section><h2 className="text-sm font-medium">When to escalate</h2><p className="mt-1 whitespace-pre-wrap text-sm">{a.escalation}</p></section>}
          {a.tags.length > 0 && <p className="text-xs text-muted">Tags: {a.tags.join(", ")}</p>}
          <section className="rounded-md border border-line bg-paper p-3 text-xs text-muted">
            <p><b>Source:</b> {SOURCE_LABEL[a.source_type] ?? a.source_type}</p>
            <p className="mt-1 whitespace-pre-wrap">{a.source_note}</p>
            {a.source_url && <p className="mt-1">Link: <a href={a.source_url} rel="noopener noreferrer nofollow" target="_blank" className="text-brand underline">{a.source_url}</a></p>}
          </section>
          {err && <p role="alert" className="text-sm text-danger">{err}</p>}
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => setEditing(true)}>Edit</Button>
            {isAdmin && a.status !== "approved" && <Button disabled={save.isPending} onClick={() => save.mutate({ status: "approved" })}>Approve</Button>}
            {isAdmin && a.status === "approved" && <Button variant="secondary" disabled={save.isPending} onClick={() => save.mutate({ status: "draft" })}>Unapprove</Button>}
            {isAdmin && a.status !== "archived" && <Button variant="secondary" disabled={save.isPending} onClick={() => save.mutate({ status: "archived" })}>Archive</Button>}
          </div>
          {!isAdmin && <p className="text-xs text-muted">Only administrators can approve or archive articles. Editing an approved article returns it to draft.</p>}
        </article>
      )}
    </div>
  );
}
