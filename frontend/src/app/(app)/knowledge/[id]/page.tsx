"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Archive, ArrowLeft, CircleCheck, FileQuestion, FileText, Info, Pencil, ShieldCheck, Undo2 } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";

import { ArticleStatusBadge } from "@/components/badges";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { EmptyState, ErrorState, SectionCard, Skeleton } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { ArticleForm, type ArticleDraft } from "@/features/knowledge/ArticleForm";
import { ApiError, api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { fmtDate, fmtRelative, SOURCE_LABEL } from "@/lib/format";
import type { Article, ArticleStatus } from "@/types/api";

const STATUS_DONE: Record<ArticleStatus, string> = { approved: "Article approved", draft: "Returned to draft", archived: "Article archived" };

export default function ArticlePageView() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const q = useQuery({ queryKey: ["article", id], queryFn: () => api<Article>(`/knowledge/${id}`) });
  const save = useMutation({
    mutationFn: (v: Partial<ArticleDraft> & { status?: ArticleStatus }) => api<Article>(`/knowledge/${id}`, { method: "PATCH", body: JSON.stringify(v) }),
    onSuccess: (a, v) => {
      setEditing(false); setConfirmArchive(false);
      qc.setQueryData(["article", id], a);
      for (const k of ["articles", "article-search", "related-articles"]) qc.invalidateQueries({ queryKey: [k] });
      toast({ kind: "success", title: v.status ? STATUS_DONE[v.status] : "Article saved",
        detail: !v.status && a.status === "draft" ? "Saved as a draft; an administrator approves it before it is used for suggestions." : undefined });
    },
    onError: (e) => toast({ kind: "error", title: "Not saved", detail: (e as Error).message }),
  });
  const a = q.data;
  const isAdmin = user?.role === "admin";

  if (q.isLoading) return (
    <div className="space-y-4" aria-busy="true"><Skeleton className="h-4 w-32" /><Skeleton className="h-8 w-2/3" />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]"><Skeleton className="h-96" /><Skeleton className="h-64" /></div></div>
  );
  if (q.isError || !a) {
    const notFound = q.error instanceof ApiError && q.error.status === 404;
    return (
      <div className="rounded-lg border border-line bg-panel">
        {notFound
          ? <EmptyState icon={FileQuestion} title="Article not found" action={<Link href="/knowledge" className="text-sm font-medium text-brand hover:underline">Back to the knowledge base</Link>} />
          : <ErrorState message={(q.error as Error)?.message ?? "Could not load the article"} onRetry={() => q.refetch()} />}
      </div>
    );
  }

  const back = (
    <Link href="/knowledge" className="inline-flex items-center gap-1 rounded text-sm text-muted hover:text-ink">
      <ArrowLeft aria-hidden className="h-4 w-4" />Knowledge base
    </Link>
  );

  if (editing) return (
    <div className="max-w-3xl">
      {back}
      <h1 className="mt-3 text-2xl font-semibold tracking-tight">Edit article</h1>
      {a.status === "approved" && (
        <p className="mt-2 flex items-start gap-2 text-sm text-muted"><Info aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
          Saving changes returns this article to draft until an administrator approves it again.</p>
      )}
      <div className="mt-5"><ArticleForm initial={a} busy={save.isPending} error={save.error ? (save.error as Error).message : null}
        submitLabel="Save changes" onCancel={() => setEditing(false)} onSubmit={(v) => save.mutate(v)} /></div>
    </div>
  );

  return (
    <div>
      {back}
      <header className="mt-3">
        <div className="flex flex-wrap items-center gap-2"><ArticleStatusBadge value={a.status} />
          <span className="text-xs text-muted">{a.category?.name ?? "Uncategorised"}</span></div>
        <h1 className="mt-2 break-words text-2xl font-semibold tracking-tight">{a.title}</h1>
        <p className="mt-1 text-sm text-muted">
          Updated <time dateTime={a.updated_at} title={fmtDate(a.updated_at)}>{fmtRelative(a.updated_at)}</time>{a.updater ? ` by ${a.updater.full_name}` : ""}
        </p>
      </header>

      {a.status !== "approved" && (
        <p role="note" className="mt-4 flex items-start gap-2 rounded-md border border-warn/40 bg-warn/5 px-3 py-2.5 text-sm">
          <AlertTriangle aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-warn" />
          This article is {a.status === "draft" ? "a draft" : "archived"}, so it is not used for AI suggestions.
        </p>
      )}

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <article className="min-w-0 space-y-6">
          <SectionCard id="problem" title="Problem" icon={FileText}>
            <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{a.problem_description}</p>
          </SectionCard>
          <SectionCard id="steps" title={`Troubleshooting steps (${a.steps.length})`} icon={CircleCheck}>
            <ol className="space-y-3">
              {a.steps.map((s, i) => (
                <li key={i} className="flex gap-3 text-sm">
                  <span aria-hidden className="tabular grid h-6 w-6 shrink-0 place-items-center rounded-full bg-brand/10 text-xs font-semibold text-brand">{i + 1}</span>
                  <span className="whitespace-pre-wrap break-words pt-0.5">{s}</span>
                </li>
              ))}
            </ol>
            {a.escalation && (
              <div className="mt-5 flex gap-2 rounded-md border-l-2 border-warn bg-warn/5 px-3 py-2.5 text-sm">
                <AlertTriangle aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-warn" />
                <div><p className="font-medium">When to escalate</p><p className="mt-0.5 whitespace-pre-wrap">{a.escalation}</p></div>
              </div>
            )}
          </SectionCard>
          {a.tags.length > 0 && (
            <ul aria-label="Tags" className="flex flex-wrap gap-1.5">
              {a.tags.map((t) => <li key={t} className="rounded-full border border-line bg-panel px-2.5 py-0.5 text-xs text-muted">{t}</li>)}
            </ul>
          )}
        </article>

        <aside className="min-w-0 space-y-6">
          <SectionCard id="manage" title="Manage" icon={ShieldCheck}>
            <div className="grid gap-2">
              <Button variant="secondary" onClick={() => setEditing(true)}><Pencil aria-hidden className="h-4 w-4" />Edit</Button>
              {isAdmin && a.status !== "approved" && (
                <Button disabled={save.isPending} onClick={() => save.mutate({ status: "approved" })}><CircleCheck aria-hidden className="h-4 w-4" />Approve for suggestions</Button>
              )}
              {isAdmin && a.status === "approved" && (
                <Button variant="secondary" disabled={save.isPending} onClick={() => save.mutate({ status: "draft" })}><Undo2 aria-hidden className="h-4 w-4" />Return to draft</Button>
              )}
              {isAdmin && a.status !== "archived" && (
                <Button variant="ghost" disabled={save.isPending} onClick={() => setConfirmArchive(true)}><Archive aria-hidden className="h-4 w-4" />Archive</Button>
              )}
            </div>
            <p className="mt-3 text-xs text-muted">
              {isAdmin ? "Approved articles are used by the troubleshooting assistant and article search." : "Only administrators can approve or archive. Editing an approved article returns it to draft."}
            </p>
          </SectionCard>
          <SectionCard id="source" title="Source" icon={Info}>
            <p className="text-sm font-medium">{SOURCE_LABEL[a.source_type] ?? a.source_type}</p>
            <p className="mt-1 whitespace-pre-wrap break-words text-sm text-muted">{a.source_note}</p>
            {a.source_url && (
              <a href={a.source_url} rel="noopener noreferrer nofollow" target="_blank" className="mt-2 block break-all text-sm text-brand underline">{a.source_url}</a>
            )}
          </SectionCard>
        </aside>
      </div>

      <ConfirmDialog open={confirmArchive} title="Archive this article?"
        message="Archived articles are hidden from the default list and never used for suggestions. An administrator can restore it later by approving it."
        confirmLabel="Archive" destructive busy={save.isPending}
        onCancel={() => setConfirmArchive(false)} onConfirm={() => save.mutate({ status: "archived" })} />
    </div>
  );
}
