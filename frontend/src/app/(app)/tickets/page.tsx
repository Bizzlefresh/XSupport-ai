"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useState } from "react";

import { PriorityBadge, StatusBadge } from "@/components/badges";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useCategories } from "@/features/tickets/hooks";
import { api } from "@/lib/api";
import { PRIORITIES, STATUSES, fmtDate, label } from "@/lib/format";
import type { TicketPage } from "@/types/api";

const PAGE_SIZE = 25;
// Dashboard cards link here with ?status= / ?priority=. This page only renders after the
// client-side auth check, so reading the URL during initial state is safe (no SSR mismatch).
const initial = (k: string) => (typeof window === "undefined" ? "" : new URLSearchParams(window.location.search).get(k) ?? "");

export default function TicketsPage() {
  const [q, setQ] = useState(() => initial("q"));
  const [debounced, setDebounced] = useState(() => initial("q"));
  const [status, setStatus] = useState(() => initial("status"));
  const [priority, setPriority] = useState(() => initial("priority"));
  const [category, setCategory] = useState(() => initial("category_id"));
  const [unassigned, setUnassigned] = useState(false);
  const [sort, setSort] = useState("created_at");
  const [page, setPage] = useState(1);
  const cats = useCategories();

  useEffect(() => {
    const t = setTimeout(() => { setDebounced(q.trim()); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [q]);

  const params = new URLSearchParams({ page: String(page), page_size: String(PAGE_SIZE), sort });
  if (debounced) params.set("q", debounced);
  if (status) params.set("status", status);
  if (priority) params.set("priority", priority);
  if (category) params.set("category_id", category);
  if (unassigned) params.set("unassigned", "true");

  const tickets = useQuery({
    queryKey: ["tickets", params.toString()],
    queryFn: () => api<TicketPage>(`/tickets?${params}`),
    placeholderData: (prev) => prev,
  });
  const pages = tickets.data ? Math.max(1, Math.ceil(tickets.data.total / PAGE_SIZE)) : 1;
  const reset = (fn: (v: string) => void) => (e: { target: { value: string } }) => { fn(e.target.value); setPage(1); };

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Tickets</h1>
        <Link href="/tickets/new"><Button>New ticket</Button></Link>
      </div>

      <div className="mt-6 flex flex-wrap items-end gap-3" role="search">
        <div className="min-w-56 flex-1">
          <label htmlFor="q" className="mb-1 block text-xs text-muted">Search subject, description or ID</label>
          <Input id="q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. projector" />
        </div>
        <div><label htmlFor="st" className="mb-1 block text-xs text-muted">Status</label>
          <Select id="st" value={status} onChange={reset(setStatus)}><option value="">All</option>
            {STATUSES.map((s) => <option key={s} value={s}>{label(s)}</option>)}</Select></div>
        <div><label htmlFor="pr" className="mb-1 block text-xs text-muted">Priority</label>
          <Select id="pr" value={priority} onChange={reset(setPriority)}><option value="">All</option>
            {PRIORITIES.map((s) => <option key={s} value={s}>{label(s)}</option>)}</Select></div>
        <div><label htmlFor="ct" className="mb-1 block text-xs text-muted">Category</label>
          <Select id="ct" value={category} onChange={reset(setCategory)}><option value="">All</option>
            {cats.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></div>
        <div><label htmlFor="so" className="mb-1 block text-xs text-muted">Sort by</label>
          <Select id="so" value={sort} onChange={reset(setSort)}>
            <option value="created_at">Newest</option><option value="updated_at">Recently updated</option>
            <option value="priority">Priority</option><option value="status">Status</option></Select></div>
        <label className="flex h-10 items-center gap-2 text-sm">
          <input type="checkbox" checked={unassigned} onChange={(e) => { setUnassigned(e.target.checked); setPage(1); }} />
          Unassigned only
        </label>
      </div>

      <div className="mt-6 overflow-x-auto rounded-lg border border-line bg-panel">
        {tickets.isError ? (
          <p role="alert" className="p-5 text-sm text-danger">{(tickets.error as Error).message}</p>
        ) : tickets.isLoading ? (
          <p className="p-5 text-sm text-muted">Loading tickets…</p>
        ) : tickets.data?.items.length === 0 ? (
          <p className="p-5 text-sm text-muted">No tickets match these filters. Clear a filter or search for different words.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="border-b border-line text-muted">
              <tr>{["ID", "Subject", "Category", "Priority", "Status", "Assignee", "Created"].map((h) =>
                <th key={h} className="whitespace-nowrap px-4 py-3 font-normal">{h}</th>)}</tr>
            </thead>
            <tbody>
              {tickets.data?.items.map((t) => (
                <tr key={t.id} className="border-b border-line last:border-0 hover:bg-paper">
                  <td className="whitespace-nowrap px-4 py-3 text-muted">{t.ticket_number}</td>
                  <td className="px-4 py-3"><Link className="font-medium text-brand hover:underline" href={`/tickets/${t.id}`}>{t.subject}</Link></td>
                  <td className="px-4 py-3">{t.category?.name ?? <span className="text-muted">Uncategorized</span>}</td>
                  <td className="px-4 py-3"><PriorityBadge value={t.priority} /></td>
                  <td className="px-4 py-3"><StatusBadge value={t.status} /></td>
                  <td className="whitespace-nowrap px-4 py-3">{t.assignee?.full_name ?? <span className="text-muted">Unassigned</span>}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-muted">{fmtDate(t.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {tickets.data && tickets.data.total > 0 && (
        <div className="mt-4 flex items-center justify-between text-sm text-muted">
          <span>{tickets.data.total} tickets · page {page} of {pages}</span>
          <div className="flex gap-2">
            <Button variant="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button>
            <Button variant="secondary" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</Button>
          </div>
        </div>
      )}
    </div>
  );
}
