"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, ChevronsUpDown, Plus, Search, SearchX, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { PriorityBadge, StatusBadge } from "@/components/badges";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState, ErrorState, PageHeader, Skeleton } from "@/components/ui/primitives";
import { Select } from "@/components/ui/select";
import { useAssignees, useCategories } from "@/features/tickets/hooks";
import { api } from "@/lib/api";
import { PRIORITIES, STATUSES, fmtDate, fmtRelative, initials, label } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Person, Ticket, TicketPage } from "@/types/api";

const PAGE_SIZE = 25;
type SortKey = "created_at" | "updated_at" | "priority" | "status";
// Labels follow the backend's rank order: priority descending = most urgent first, status ascending = workflow order.
const SORT_OPTIONS: [string, string][] = [
  ["created_at:true", "Newest first"], ["created_at:false", "Oldest first"],
  ["updated_at:true", "Recently updated"], ["updated_at:false", "Least recently updated"],
  ["priority:true", "Most urgent first"], ["priority:false", "Least urgent first"],
  ["status:false", "Status: new to closed"], ["status:true", "Status: closed to new"],
];
const SORTS: { value: SortKey; label: string }[] = [
  { value: "created_at", label: "Created" }, { value: "updated_at", label: "Updated" },
  { value: "priority", label: "Priority" }, { value: "status", label: "Status" },
];

// The dashboard and other pages link here with filters in the URL. This page only renders after the
// client-side auth check, so reading the URL during initial state is safe (no SSR mismatch).
const initial = (k: string) => (typeof window === "undefined" ? "" : new URLSearchParams(window.location.search).get(k) ?? "");

function Assignee({ person }: { person: Person | null }) {
  if (!person) return <span className="text-muted">Unassigned</span>;
  return (
    <span className="inline-flex min-w-0 items-center gap-2">
      <span aria-hidden className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-brand/10 text-[10px] font-semibold text-brand">
        {initials(person.full_name)}
      </span>
      <span className="truncate">{person.full_name}</span>
    </span>
  );
}

function SortHeader({ k, sort, desc, onSort, children, className }: {
  k: SortKey; sort: SortKey; desc: boolean; onSort: (k: SortKey) => void; children: string; className?: string;
}) {
  const active = sort === k;
  const Icon = !active ? ChevronsUpDown : desc ? ArrowDown : ArrowUp;
  return (
    <th scope="col" aria-sort={active ? (desc ? "descending" : "ascending") : "none"} className={cn("px-4 py-2.5 font-medium", className)}>
      <button type="button" onClick={() => onSort(k)}
        className={cn("-mx-1 inline-flex items-center gap-1 rounded px-1 hover:text-ink", active && "text-ink")}>
        {children}<Icon aria-hidden className="h-3.5 w-3.5" />
      </button>
    </th>
  );
}

function TicketCard({ t }: { t: Ticket }) {
  return (
    <li>
      <Link href={`/tickets/${t.id}`} className="block rounded-lg border border-line bg-panel p-4 shadow-sm transition-colors hover:border-brand/40">
        <div className="flex items-center justify-between gap-2 text-xs text-muted">
          <span className="tabular">{t.ticket_number}</span>
          <span title={fmtDate(t.created_at)}>{fmtRelative(t.created_at)}</span>
        </div>
        <p className="mt-1 font-medium leading-snug">{t.subject}</p>
        <p className="mt-1 truncate text-xs text-muted">{t.category?.name ?? "Uncategorized"}</p>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex gap-1.5"><PriorityBadge value={t.priority} /><StatusBadge value={t.status} /></div>
          <span className="text-xs"><Assignee person={t.assignee} /></span>
        </div>
      </Link>
    </li>
  );
}

export default function TicketsPage() {
  const router = useRouter();
  const [q, setQ] = useState(() => initial("q"));
  const [debounced, setDebounced] = useState(() => initial("q"));
  const [status, setStatus] = useState(() => initial("status"));
  const [priority, setPriority] = useState(() => initial("priority"));
  const [category, setCategory] = useState(() => initial("category_id"));
  const [assignee, setAssignee] = useState(() => initial("assignee_id") || (initial("unassigned") === "true" ? "none" : ""));
  const [sort, setSort] = useState<SortKey>(() => (SORTS.some((s) => s.value === initial("sort")) ? initial("sort") as SortKey : "created_at"));
  const [desc, setDesc] = useState(() => initial("desc") !== "false");
  const [page, setPage] = useState(() => Math.max(1, Number(initial("page")) || 1));
  const cats = useCategories();
  const people = useAssignees();

  useEffect(() => {
    const next = q.trim();
    if (next === debounced) return;
    const t = setTimeout(() => { setDebounced(next); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [q, debounced]);

  const params = new URLSearchParams({ page: String(page), page_size: String(PAGE_SIZE), sort, desc: String(desc) });
  if (debounced) params.set("q", debounced);
  if (status) params.set("status", status);
  if (priority) params.set("priority", priority);
  if (category) params.set("category_id", category);
  if (assignee === "none") params.set("unassigned", "true");
  else if (assignee) params.set("assignee_id", assignee);

  // Keep the address bar in step with the filters so the view can be bookmarked, shared or restored with Back.
  const urlParams = new URLSearchParams(params);
  urlParams.delete("page_size");
  if (page === 1) urlParams.delete("page");
  if (sort === "created_at") urlParams.delete("sort");
  if (desc) urlParams.delete("desc");
  const qs = urlParams.toString();
  useEffect(() => {
    if (qs !== window.location.search.replace(/^\?/, "")) router.replace(qs ? `/tickets?${qs}` : "/tickets", { scroll: false });
  }, [qs, router]);

  const tickets = useQuery({
    queryKey: ["tickets", params.toString()],
    queryFn: () => api<TicketPage>(`/tickets?${params}`),
    placeholderData: (prev) => prev,
  });

  const total = tickets.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const from = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const to = Math.min(page * PAGE_SIZE, total);
  const change = (fn: (v: string) => void) => (e: { target: { value: string } }) => { fn(e.target.value); setPage(1); };
  const onSort = (k: SortKey) => { if (k === sort) setDesc(!desc); else { setSort(k); setDesc(k !== "status"); } setPage(1); };

  const chips = [
    debounced && { key: "q", text: `“${debounced}”`, clear: () => { setQ(""); setDebounced(""); } },
    status && { key: "status", text: `Status: ${label(status)}`, clear: () => setStatus("") },
    priority && { key: "priority", text: `Priority: ${label(priority)}`, clear: () => setPriority("") },
    category && { key: "category", text: cats.data?.find((c) => String(c.id) === category)?.name ?? "Category", clear: () => setCategory("") },
    assignee && { key: "assignee", text: assignee === "none" ? "Unassigned" : people.data?.find((p) => String(p.id) === assignee)?.full_name ?? "Assignee", clear: () => setAssignee("") },
  ].filter(Boolean) as { key: string; text: string; clear: () => void }[];
  const clearAll = () => { setQ(""); setDebounced(""); setStatus(""); setPriority(""); setCategory(""); setAssignee(""); setPage(1); };

  return (
    <div>
      <PageHeader
        title="Tickets"
        description="Search, filter and sort every ticket. Categories and priorities shown here are the technician-approved values."
        actions={
          <Link href="/tickets/new" className="inline-flex h-10 items-center gap-2 rounded-md bg-brand px-4 text-sm font-medium text-on-brand shadow-sm hover:opacity-90">
            <Plus aria-hidden className="h-4 w-4" />New ticket
          </Link>
        }
      />

      <section role="search" aria-label="Filter tickets" className="rounded-lg border border-line bg-panel p-4 shadow-sm">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6 xl:grid-cols-[minmax(14rem,2fr)_repeat(5,minmax(0,1fr))_auto]">
          <div className="sm:col-span-2 lg:col-span-6 xl:col-span-1">
            <label htmlFor="q" className="mb-1 block text-xs font-medium text-muted">Search tickets</label>
            <div className="relative">
              <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
              <Input id="q" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Subject, description or ID" className="pl-9" />
            </div>
          </div>
          <div><label htmlFor="st" className="mb-1 block text-xs font-medium text-muted">Status</label>
            <Select id="st" className="w-full" value={status} onChange={change(setStatus)}><option value="">All statuses</option>
              {STATUSES.map((s) => <option key={s} value={s}>{label(s)}</option>)}</Select></div>
          <div><label htmlFor="pr" className="mb-1 block text-xs font-medium text-muted">Priority</label>
            <Select id="pr" className="w-full" value={priority} onChange={change(setPriority)}><option value="">All priorities</option>
              {PRIORITIES.map((s) => <option key={s} value={s}>{label(s)}</option>)}</Select></div>
          <div><label htmlFor="ct" className="mb-1 block text-xs font-medium text-muted">Category</label>
            <Select id="ct" className="w-full" value={category} onChange={change(setCategory)}><option value="">All categories</option>
              {cats.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></div>
          <div><label htmlFor="as" className="mb-1 block text-xs font-medium text-muted">Assignee</label>
            <Select id="as" className="w-full" value={assignee} onChange={change(setAssignee)}><option value="">Anyone</option>
              <option value="none">Unassigned</option>
              {people.data?.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}</Select></div>
          <div><label htmlFor="so" className="mb-1 block text-xs font-medium text-muted">Sort</label>
            <Select id="so" className="w-full" value={`${sort}:${desc}`} onChange={(e) => {
              const [k, d] = e.target.value.split(":"); setSort(k as SortKey); setDesc(d === "true"); setPage(1);
            }}>
              {SORT_OPTIONS.map(([v, text]) => <option key={v} value={v}>{text}</option>)}
            </Select></div>
          <div className="flex items-end">
            <Button variant="ghost" className="w-full lg:w-auto" disabled={chips.length === 0} onClick={clearAll}>Clear</Button>
          </div>
        </div>
        {chips.length > 0 && (
          <ul aria-label="Active filters" className="mt-3 flex flex-wrap gap-2 border-t border-line pt-3">
            {chips.map((c) => (
              <li key={c.key}>
                <button type="button" onClick={() => { c.clear(); setPage(1); }} aria-label={`Remove filter ${c.text}`}
                  className="inline-flex items-center gap-1 rounded-full border border-line bg-paper px-2.5 py-1 text-xs hover:border-muted/50">
                  {c.text}<X aria-hidden className="h-3 w-3" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="mt-4 flex items-center justify-between gap-3 text-sm text-muted" aria-live="polite">
        <span>
          {tickets.isLoading ? "Loading tickets…" : tickets.data ? (total === 0 ? "No matching tickets" : `Showing ${from}–${to} of ${total} ${total === 1 ? "ticket" : "tickets"}`) : ""}
        </span>
        {tickets.isFetching && !tickets.isLoading && <span className="text-xs">Updating…</span>}
      </div>

      <div className={cn("mt-2 transition-opacity", tickets.isFetching && !tickets.isLoading && "opacity-60")}>
        {tickets.isError ? (
          <div className="rounded-lg border border-line bg-panel"><ErrorState message={(tickets.error as Error).message} onRetry={() => tickets.refetch()} /></div>
        ) : tickets.isLoading ? (
          <div className="space-y-2 rounded-lg border border-line bg-panel p-4">
            {Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-10" />)}
          </div>
        ) : tickets.data && tickets.data.items.length === 0 ? (
          <div className="rounded-lg border border-line bg-panel">
            <EmptyState icon={SearchX} title="No tickets match these filters"
              description="Try different words, or remove a filter."
              action={chips.length > 0 ? <Button variant="secondary" onClick={clearAll}>Clear all filters</Button> : undefined} />
          </div>
        ) : (
          <>
            {/* Cards below 1024px (with the sidebar open there is no room for a table); table from 1024px. */}
            <ul className="space-y-2 lg:hidden">{tickets.data?.items.map((t) => <TicketCard key={t.id} t={t} />)}</ul>

            <div className="hidden overflow-hidden rounded-lg border border-line bg-panel shadow-sm lg:block">
              <table className="w-full table-fixed text-left text-sm">
                <caption className="sr-only">Tickets, sorted by {SORTS.find((s) => s.value === sort)?.label.toLowerCase()} {desc ? "descending" : "ascending"}</caption>
                <thead className="border-b border-line bg-paper/60 text-xs text-muted">
                  <tr>
                    <th scope="col" className="w-24 px-4 py-2.5 font-medium">ID</th>
                    <th scope="col" className="px-4 py-2.5 font-medium">Subject</th>
                    <SortHeader k="priority" sort={sort} desc={desc} onSort={onSort} className="w-28">Priority</SortHeader>
                    <SortHeader k="status" sort={sort} desc={desc} onSort={onSort} className="w-28">Status</SortHeader>
                    <th scope="col" className="hidden w-44 px-4 py-2.5 font-medium xl:table-cell">Assignee</th>
                    <SortHeader k={sort === "updated_at" ? "updated_at" : "created_at"} sort={sort} desc={desc} onSort={onSort} className="w-28">
                      {sort === "updated_at" ? "Updated" : "Created"}
                    </SortHeader>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {tickets.data?.items.map((t) => {
                    const when = sort === "updated_at" ? t.updated_at : t.created_at;
                    return (
                      <tr key={t.id} className="group relative hover:bg-paper">
                        <td className="tabular whitespace-nowrap px-4 py-3 text-muted">{t.ticket_number}</td>
                        <td className="px-4 py-3">
                          {/* The link's ::after covers the whole row, so the row is one click target with one tab stop. */}
                          <Link href={`/tickets/${t.id}`}
                            className="block truncate font-medium after:absolute after:inset-0 group-hover:text-brand focus-visible:outline-none">
                            {t.subject}
                          </Link>
                          <span className="block truncate text-xs text-muted">{t.category?.name ?? "Uncategorized"}</span>
                        </td>
                        <td className="px-4 py-3"><PriorityBadge value={t.priority} /></td>
                        <td className="px-4 py-3"><StatusBadge value={t.status} /></td>
                        <td className="hidden px-4 py-3 xl:table-cell"><Assignee person={t.assignee} /></td>
                        <td className="whitespace-nowrap px-4 py-3 text-muted" title={fmtDate(when)}>{fmtRelative(when)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {tickets.data && total > 0 && (
        <nav aria-label="Pagination" className="mt-4 flex items-center justify-between gap-3 text-sm">
          <span className="text-muted">Page {page} of {pages}</span>
          <div className="flex gap-2">
            <Button variant="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)} aria-label="Previous page">
              <ChevronLeft aria-hidden className="h-4 w-4" /><span className="hidden sm:inline">Previous</span>
            </Button>
            <Button variant="secondary" disabled={page >= pages} onClick={() => setPage(page + 1)} aria-label="Next page">
              <span className="hidden sm:inline">Next</span><ChevronRight aria-hidden className="h-4 w-4" />
            </Button>
          </div>
        </nav>
      )}
    </div>
  );
}
