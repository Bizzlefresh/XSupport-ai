"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { PriorityBadge, StatusBadge } from "@/components/badges";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { CategoryAssistant } from "@/features/ai/CategoryAssistant";
import { TroubleshootingAssistant } from "@/features/ai/TroubleshootingAssistant";
import { RelatedArticles, SimilarIncidents } from "@/features/knowledge/RetrievalPanels";
import { useAssignees, useCategories } from "@/features/tickets/hooks";
import { api } from "@/lib/api";
import { PRIORITIES, STATUSES, fmtDate, label } from "@/lib/format";
import type { TicketDetail } from "@/types/api";

export default function TicketDetailPage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const cats = useCategories();
  const people = useAssignees();
  const [comment, setComment] = useState("");
  const [resolution, setResolution] = useState("");

  const ticket = useQuery({ queryKey: ["ticket", id], queryFn: () => api<TicketDetail>(`/tickets/${id}`) });
  useEffect(() => { if (ticket.data) setResolution(ticket.data.resolution_summary ?? ""); }, [ticket.data]);

  const onDone = (t: TicketDetail) => {
    qc.setQueryData(["ticket", id], t);
    qc.invalidateQueries({ queryKey: ["tickets"] });
    qc.invalidateQueries({ queryKey: ["overview"] });
  };
  const patch = useMutation({
    mutationFn: (body: Record<string, unknown>) => api<TicketDetail>(`/tickets/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: onDone,
  });
  const addComment = useMutation({
    mutationFn: () => api<TicketDetail>(`/tickets/${id}/comments`, { method: "POST", body: JSON.stringify({ body: comment }) }),
    onSuccess: (t) => { setComment(""); onDone(t); },
  });

  if (ticket.isLoading) return <p className="text-sm text-muted">Loading ticket…</p>;
  if (ticket.isError) return (
    <div><p role="alert" className="text-sm text-danger">{(ticket.error as Error).message}</p>
      <Link href="/tickets" className="mt-3 inline-block text-sm text-brand hover:underline">Back to tickets</Link></div>
  );
  const t = ticket.data!;
  const num = (v: string) => (v ? Number(v) : null);

  return (
    <div>
      <Link href="/tickets" className="text-sm text-brand hover:underline">All tickets</Link>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold">{t.subject}</h1>
        <PriorityBadge value={t.priority} /><StatusBadge value={t.status} />
      </div>
      <p className="mt-1 text-sm text-muted">{t.ticket_number} · {t.external_id} · opened {fmtDate(t.created_at)} · updated {fmtDate(t.updated_at)}
        {t.resolved_at && ` · resolved ${fmtDate(t.resolved_at)}`}</p>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-6">
          <section className="rounded-lg border border-line bg-panel p-5" aria-labelledby="d">
            <h2 id="d" className="text-sm font-medium">Description</h2>
            {/* Rendered as plain text: ticket content is untrusted and never interpreted as HTML. */}
            <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">{t.description}</p>
          </section>

          <section className="rounded-lg border border-line bg-panel p-5" aria-labelledby="r">
            <h2 id="r" className="text-sm font-medium">Resolution summary</h2>
            <Textarea className="mt-2" rows={3} value={resolution} onChange={(e) => setResolution(e.target.value)}
                      aria-label="Resolution summary" placeholder="What fixed it?" />
            <Button className="mt-2" variant="secondary" disabled={patch.isPending || resolution === (t.resolution_summary ?? "")}
                    onClick={() => patch.mutate({ resolution_summary: resolution })}>Save resolution</Button>
          </section>

          <section className="rounded-lg border border-line bg-panel p-5" aria-labelledby="h">
            <h2 id="h" className="text-sm font-medium">Activity</h2>
            <ol className="mt-3 space-y-3">
              {t.activities.map((a) => (
                <li key={a.id} className="border-l-2 border-line pl-3 text-sm">
                  <p className="whitespace-pre-wrap">{a.kind === "comment" ? a.detail : <span className="text-muted">{a.detail}</span>}</p>
                  <p className="text-xs text-muted">{label(a.kind)} · {a.user?.full_name ?? "System"} · {fmtDate(a.created_at)}</p>
                </li>
              ))}
            </ol>
            <div className="mt-4">
              <label htmlFor="c" className="mb-1 block text-sm font-medium">Add a note</label>
              <Textarea id="c" rows={3} value={comment} onChange={(e) => setComment(e.target.value)} maxLength={5000} />
              {addComment.isError && <p role="alert" className="mt-1 text-sm text-danger">{(addComment.error as Error).message}</p>}
              <Button className="mt-2" disabled={!comment.trim() || addComment.isPending} onClick={() => addComment.mutate()}>Add note</Button>
            </div>
          </section>
        </div>

        <aside className="space-y-6">
          <section className="rounded-lg border border-line bg-panel p-5" aria-labelledby="m">
            <h2 id="m" className="text-sm font-medium">Manage ticket</h2>
            <div className="mt-3 space-y-3">
              <div><label htmlFor="s" className="mb-1 block text-xs text-muted">Status</label>
                <Select id="s" className="w-full" value={t.status} disabled={patch.isPending}
                        onChange={(e) => patch.mutate({ status: e.target.value })}>
                  {STATUSES.map((s) => <option key={s} value={s}>{label(s)}</option>)}</Select></div>
              <div><label htmlFor="p" className="mb-1 block text-xs text-muted">Priority (approved)</label>
                <Select id="p" className="w-full" value={t.priority} disabled={patch.isPending}
                        onChange={(e) => patch.mutate({ priority: e.target.value })}>
                  {PRIORITIES.map((s) => <option key={s} value={s}>{label(s)}</option>)}</Select></div>
              <div><label htmlFor="k" className="mb-1 block text-xs text-muted">Category (approved)</label>
                <Select id="k" className="w-full" value={t.category?.id ?? ""} disabled={patch.isPending}
                        onChange={(e) => patch.mutate({ category_id: num(e.target.value) })}>
                  <option value="">Not set</option>{cats.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></div>
              <div><label htmlFor="a" className="mb-1 block text-xs text-muted">Assignee</label>
                <Select id="a" className="w-full" value={t.assignee?.id ?? ""} disabled={patch.isPending}
                        onChange={(e) => patch.mutate({ assignee_id: num(e.target.value) })}>
                  <option value="">Unassigned</option>{people.data?.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}</Select></div>
              {patch.isError && <p role="alert" className="text-sm text-danger">{(patch.error as Error).message}</p>}
            </div>
          </section>

          <CategoryAssistant ticketId={t.id} onTicketChanged={() => {
            qc.invalidateQueries({ queryKey: ["ticket", id] });
            qc.invalidateQueries({ queryKey: ["tickets"] });
          }} />

          <TroubleshootingAssistant ticketId={t.id} onCommented={() => {
            qc.invalidateQueries({ queryKey: ["ticket", id] });
            qc.invalidateQueries({ queryKey: ["tickets"] });
          }} />

          <RelatedArticles ticketId={t.id} />
          <SimilarIncidents ticketId={t.id} />
          <p className="rounded-lg border border-line p-4 text-xs text-muted">
            Priority recommendations are not built yet (planned). AI suggestions never change the ticket on their own.
          </p>
        </aside>
      </div>
    </div>
  );
}
