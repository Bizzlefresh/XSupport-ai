"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft, CheckCircle2, CircleDot, Clock, FileQuestion, Flag, Loader2, MessageSquare, Pencil, Plus, ShieldCheck,
  Sparkles, Tag, UserRound, type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { PriorityBadge, StatusBadge } from "@/components/badges";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/primitives";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { CategoryAssistant } from "@/features/ai/CategoryAssistant";
import { TroubleshootingAssistant } from "@/features/ai/TroubleshootingAssistant";
import { RelatedArticles, SimilarIncidents } from "@/features/knowledge/RetrievalPanels";
import { useAssignees, useCategories } from "@/features/tickets/hooks";
import { ApiError, api } from "@/lib/api";
import { PRIORITIES, STATUSES, activityLabel, fmtDate, fmtRelative, label } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Activity, TicketDetail } from "@/types/api";

type Field = "status" | "priority" | "category_id" | "assignee_id" | "resolution_summary";
const FIELD_LABEL: Record<Field, string> = {
  status: "Status", priority: "Priority", category_id: "Category", assignee_id: "Assignee", resolution_summary: "Resolution summary",
};
const KIND_ICON: Record<string, LucideIcon> = {
  created: Plus, status: CircleDot, priority: Flag, category: Tag, assignee: UserRound, comment: MessageSquare,
  resolution: CheckCircle2, ai: Sparkles, edited: Pencil,
};
const DONE = new Set(["resolved", "closed"]);

function Card({ id, title, icon: Icon, children, aside, className }: {
  id: string; title: string; icon: LucideIcon; children: React.ReactNode; aside?: React.ReactNode; className?: string;
}) {
  return (
    <section aria-labelledby={id} className={cn("rounded-lg border border-line bg-panel shadow-sm", className)}>
      <header className="flex items-center justify-between gap-3 border-b border-line px-5 py-3">
        <h2 id={id} className="flex items-center gap-2 text-sm font-semibold"><Icon aria-hidden className="h-4 w-4 text-muted" />{title}</h2>
        {aside}
      </header>
      <div className="p-5">{children}</div>
    </section>
  );
}

function ActivityItem({ a }: { a: Activity }) {
  const Icon = KIND_ICON[a.kind] ?? CircleDot;
  const isAi = a.kind === "ai";
  const isComment = a.kind === "comment";
  return (
    <li className="relative flex gap-3 pb-5 last:pb-0">
      <span aria-hidden className="absolute bottom-0 left-[15px] top-8 w-px bg-line" />
      <span aria-hidden className={cn("relative z-10 grid h-8 w-8 shrink-0 place-items-center rounded-full border",
        isAi ? "border-ai/40 bg-ai/10 text-ai" : isComment ? "border-brand/30 bg-brand/10 text-brand" : "border-line bg-paper text-muted")}>
        <Icon className="h-3.5 w-3.5" />
      </span>
      <div className="min-w-0 flex-1 pt-1">
        <p className="text-xs text-muted">
          <span className="font-medium text-ink">{a.user?.full_name ?? "System"}</span>
          {" · "}{activityLabel(a.kind)}{" · "}
          <time dateTime={a.created_at} title={fmtDate(a.created_at)}>{fmtRelative(a.created_at)}</time>
        </p>
        {/* Plain text: ticket content is untrusted and never interpreted as HTML. */}
        {isComment
          ? <p className="mt-1.5 whitespace-pre-wrap break-words rounded-md border border-line bg-paper px-3 py-2 text-sm">{a.detail}</p>
          : <p className="mt-0.5 whitespace-pre-wrap break-words text-sm">{a.detail}</p>}
      </div>
    </li>
  );
}

function DetailSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading ticket">
      <Skeleton className="h-4 w-24" />
      <Skeleton className="h-8 w-2/3" />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="space-y-6"><Skeleton className="h-40" /><Skeleton className="h-32" /><Skeleton className="h-64" /></div>
        <div className="space-y-6"><Skeleton className="h-48" /><Skeleton className="h-48" /></div>
      </div>
    </div>
  );
}

export default function TicketDetailPage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const toast = useToast();
  const cats = useCategories();
  const people = useAssignees();
  const [comment, setComment] = useState("");
  const [resolution, setResolution] = useState("");
  const [pendingStatus, setPendingStatus] = useState<string | null>(null);

  const ticket = useQuery({ queryKey: ["ticket", id], queryFn: () => api<TicketDetail>(`/tickets/${id}`) });
  useEffect(() => { if (ticket.data) setResolution(ticket.data.resolution_summary ?? ""); }, [ticket.data]);

  const onDone = (t: TicketDetail) => {
    qc.setQueryData(["ticket", id], t);
    // Each response is a full snapshot. If a note and a field change are in flight together, the slower
    // response can carry the older state, so always refetch: the last word comes from the server.
    qc.invalidateQueries({ queryKey: ["ticket", id] });
    qc.invalidateQueries({ queryKey: ["tickets"] });
    qc.invalidateQueries({ queryKey: ["overview"] });
  };
  const patch = useMutation({
    mutationFn: (body: Partial<Record<Field, unknown>>) =>
      api<TicketDetail>(`/tickets/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: (t, body) => {
      onDone(t);
      const f = Object.keys(body)[0] as Field;
      toast({ kind: "success", title: `${FIELD_LABEL[f]} saved`, detail: "Recorded in the activity history." });
    },
    onError: (e, body) => {
      const f = Object.keys(body)[0] as Field;
      toast({ kind: "error", title: `${FIELD_LABEL[f]} not saved`, detail: (e as Error).message });
    },
  });
  const addComment = useMutation({
    mutationFn: () => api<TicketDetail>(`/tickets/${id}/comments`, { method: "POST", body: JSON.stringify({ body: comment }) }),
    onSuccess: (t) => { setComment(""); onDone(t); toast({ kind: "success", title: "Note added" }); },
  });
  const refreshAfterAi = () => {
    qc.invalidateQueries({ queryKey: ["ticket", id] });
    qc.invalidateQueries({ queryKey: ["tickets"] });
  };

  if (ticket.isLoading) return <DetailSkeleton />;
  if (ticket.isError) {
    const msg = (ticket.error as Error).message;
    const notFound = ticket.error instanceof ApiError && ticket.error.status === 404;
    return (
      <div className="rounded-lg border border-line bg-panel">
        {notFound
          ? <EmptyState icon={FileQuestion} title="Ticket not found" description="It may have been removed, or the link is wrong."
              action={<Link href="/tickets" className="text-sm font-medium text-brand hover:underline">Back to tickets</Link>} />
          : <ErrorState message={msg} onRetry={() => ticket.refetch()} />}
      </div>
    );
  }
  const t = ticket.data!;
  const num = (v: string) => (v ? Number(v) : null);
  const saving = (f: Field) => patch.isPending && patch.variables && f in patch.variables;
  const changeStatus = (s: string) => {
    // Closing a ticket without saying what fixed it loses knowledge for the next technician: ask first.
    if (DONE.has(s) && !DONE.has(t.status) && !(t.resolution_summary ?? "").trim()) setPendingStatus(s);
    else patch.mutate({ status: s });
  };
  const fieldCls = "mb-1 flex items-center gap-1.5 text-xs font-medium text-muted";
  const Spinner = ({ on }: { on: boolean | undefined }) =>
    on ? <Loader2 aria-label="Saving" className="h-3 w-3 animate-spin" /> : null;

  return (
    <div>
      <Link href="/tickets" className="inline-flex items-center gap-1 rounded text-sm text-muted hover:text-ink">
        <ArrowLeft aria-hidden className="h-4 w-4" />Tickets
      </Link>

      <header className="mt-3">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
          <span className="tabular rounded-md border border-line bg-panel px-2 py-0.5 font-medium text-ink">{t.ticket_number}</span>
          <span>Source: {t.source} · {t.external_id}</span>
        </div>
        <h1 className="mt-2 break-words text-2xl font-semibold tracking-tight">{t.subject}</h1>
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted">
          <span className="flex gap-1.5"><PriorityBadge value={t.priority} /><StatusBadge value={t.status} /></span>
          <span className="inline-flex items-center gap-1"><Clock aria-hidden className="h-3.5 w-3.5" />
            Opened <time dateTime={t.created_at} title={fmtDate(t.created_at)}>{fmtRelative(t.created_at)}</time></span>
          <span>Updated <time dateTime={t.updated_at} title={fmtDate(t.updated_at)}>{fmtRelative(t.updated_at)}</time></span>
          {t.resolved_at && <span>Resolved <time dateTime={t.resolved_at} title={fmtDate(t.resolved_at)}>{fmtRelative(t.resolved_at)}</time></span>}
          <a href="#ai-assistance" className="inline-flex items-center gap-1 text-ai hover:underline xl:hidden">
            <Sparkles aria-hidden className="h-3.5 w-3.5" />AI suggestions
          </a>
        </div>
      </header>

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="min-w-0 space-y-6">
          <Card id="fields" title="Ticket details" icon={ShieldCheck}
            aside={<span className="text-xs text-muted">Technician-approved values</span>}>
            <div className="grid gap-4 sm:grid-cols-2">
              <div><label htmlFor="s" className={fieldCls}>Status <Spinner on={saving("status")} /></label>
                <Select id="s" className="w-full" value={t.status} disabled={patch.isPending} onChange={(e) => changeStatus(e.target.value)}>
                  {STATUSES.map((s) => <option key={s} value={s}>{label(s)}</option>)}</Select></div>
              <div><label htmlFor="p" className={fieldCls}>Priority <Spinner on={saving("priority")} /></label>
                <Select id="p" className="w-full" value={t.priority} disabled={patch.isPending} onChange={(e) => patch.mutate({ priority: e.target.value })}>
                  {PRIORITIES.map((s) => <option key={s} value={s}>{label(s)}</option>)}</Select></div>
              <div><label htmlFor="k" className={fieldCls}>Category <Spinner on={saving("category_id")} /></label>
                <Select id="k" className="w-full" value={t.category?.id ?? ""} disabled={patch.isPending}
                  onChange={(e) => patch.mutate({ category_id: num(e.target.value) })}>
                  <option value="">Not set</option>{cats.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></div>
              <div><label htmlFor="a" className={fieldCls}>Assignee <Spinner on={saving("assignee_id")} /></label>
                <Select id="a" className="w-full" value={t.assignee?.id ?? ""} disabled={patch.isPending}
                  onChange={(e) => patch.mutate({ assignee_id: num(e.target.value) })}>
                  <option value="">Unassigned</option>{people.data?.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}</Select></div>
            </div>
            <p className="mt-4 text-xs text-muted">
              Changes save immediately and are recorded in the activity history. AI suggestions (amber) never change these values unless you accept them.
            </p>
          </Card>

          <Card id="desc" title="Description" icon={MessageSquare}>
            {/* Rendered as plain text: ticket content is untrusted and never interpreted as HTML. */}
            <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{t.description}</p>
          </Card>

          <Card id="res" title="Resolution summary" icon={CheckCircle2}
            aside={t.resolution_summary ? <span className="text-xs text-muted">Saved</span> : <span className="text-xs text-muted">Not written yet</span>}>
            <label htmlFor="resolution" className="sr-only">Resolution summary</label>
            <Textarea id="resolution" rows={3} value={resolution} maxLength={5000} onChange={(e) => setResolution(e.target.value)}
              placeholder="What fixed it? Future technicians and the AI search read this." />
            <div className="mt-2 flex items-center justify-end gap-2">
              {resolution !== (t.resolution_summary ?? "") && (
                <Button variant="ghost" onClick={() => setResolution(t.resolution_summary ?? "")}>Discard</Button>
              )}
              <Button variant="secondary" disabled={patch.isPending || resolution === (t.resolution_summary ?? "")}
                onClick={() => patch.mutate({ resolution_summary: resolution })}>
                {saving("resolution_summary") ? "Saving…" : "Save resolution"}
              </Button>
            </div>
          </Card>

          <Card id="act" title="Activity" icon={Clock} aside={<span className="text-xs text-muted">{t.activities.length} events, oldest first</span>}>
            {t.activities.length === 0
              ? <p className="text-sm text-muted">No activity yet.</p>
              : <ol className="[&>li:last-child>span:first-child]:hidden">{t.activities.map((a) => <ActivityItem key={a.id} a={a} />)}</ol>}
            <form className="mt-6 border-t border-line pt-4"
              onSubmit={(e) => { e.preventDefault(); if (comment.trim() && !addComment.isPending) addComment.mutate(); }}>
              <label htmlFor="c" className="mb-1 block text-sm font-medium">Add a note</label>
              <Textarea id="c" rows={3} value={comment} onChange={(e) => setComment(e.target.value)} maxLength={5000}
                placeholder="Internal note for technicians"
                onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) e.currentTarget.form?.requestSubmit(); }} />
              {addComment.isError && <p role="alert" className="mt-1 text-sm text-danger">{(addComment.error as Error).message}</p>}
              <div className="mt-2 flex items-center justify-between gap-2">
                <span className="hidden text-xs text-muted sm:inline">Ctrl/⌘ + Enter to add</span>
                <Button type="submit" disabled={!comment.trim() || addComment.isPending}>{addComment.isPending ? "Adding…" : "Add note"}</Button>
              </div>
            </form>
          </Card>
        </div>

        <aside id="ai-assistance" aria-labelledby="ai-h" className="min-w-0 scroll-mt-20 space-y-4">
          <div className="rounded-lg border border-ai/30 bg-ai/5 px-4 py-3">
            <h2 id="ai-h" className="flex items-center gap-2 text-sm font-semibold text-ai"><Sparkles aria-hidden className="h-4 w-4" />AI assistance</h2>
            <p className="mt-1 text-xs text-muted">
              Suggestions only. Confidence scores are estimates from synthetic-data training, not guarantees. Nothing here changes the ticket until a technician accepts it.
            </p>
          </div>
          <CategoryAssistant ticketId={t.id} currentCategory={t.category} onTicketChanged={refreshAfterAi} />
          <TroubleshootingAssistant ticketId={t.id} onCommented={refreshAfterAi} />
          <RelatedArticles ticketId={t.id} />
          <SimilarIncidents ticketId={t.id} />
          <p className="px-1 text-xs text-muted">Priority recommendations are not built.</p>
        </aside>
      </div>

      <ConfirmDialog
        open={pendingStatus !== null}
        title={`Mark as ${label(pendingStatus ?? "")} without a resolution summary?`}
        message="The resolution summary tells the next technician, and the similar-incident search, what fixed this. You can still add one later."
        confirmLabel={`Mark ${label(pendingStatus ?? "")}`}
        busy={patch.isPending}
        onCancel={() => setPendingStatus(null)}
        onConfirm={() => { const s = pendingStatus!; setPendingStatus(null); patch.mutate({ status: s }); }}
      />
    </div>
  );
}
