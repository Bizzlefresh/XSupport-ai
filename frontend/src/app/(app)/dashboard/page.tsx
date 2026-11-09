"use client";

import { useQuery } from "@tanstack/react-query";
import {
  Activity as ActivityIcon, AlertTriangle, ArrowRight, CheckCircle2, Clock, Inbox, ListTodo, Plus, Repeat,
  Sparkles, Ticket as TicketIcon, Timer,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { useState } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { PriorityBadge, StatusBadge } from "@/components/badges";
import { EmptyState, ErrorState, PageHeader, Skeleton, StatCard } from "@/components/ui/primitives";
import { Select } from "@/components/ui/select";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { fmtDate, fmtHours, label, PRIORITIES, STATUSES } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Health, Insights, Overview, TicketPage } from "@/types/api";

const grid = "rgb(var(--line))";
const tick = { fill: "rgb(var(--muted))", fontSize: 12 };
const tip = { background: "rgb(var(--elevated))", border: "1px solid rgb(var(--line))", borderRadius: 8, color: "rgb(var(--ink))", fontSize: 12 };

const STATUS_BAR: Record<string, string> = { new: "bg-brand", open: "bg-info", pending: "bg-warn", resolved: "bg-ok", closed: "bg-muted" };
const PRIORITY_BAR: Record<string, string> = { critical: "bg-danger", high: "bg-warn", medium: "bg-info", low: "bg-muted" };

function Panel({ title, icon: Icon, action, children, className, id, note }: {
  title: string; icon: typeof Inbox; action?: ReactNode; children: ReactNode; className?: string; id: string; note?: string;
}) {
  return (
    <section aria-labelledby={id} className={cn("flex min-w-0 flex-col rounded-lg border border-line bg-panel shadow-sm", className)}>
      <header className="flex items-center justify-between gap-3 border-b border-line px-5 py-3">
        <h2 id={id} className="flex items-center gap-2 text-sm font-semibold">
          <Icon aria-hidden className="h-4 w-4 text-muted" />{title}
        </h2>
        {action}
      </header>
      <div className="flex-1 p-5">{children}</div>
      {note && <p className="border-t border-line px-5 py-2.5 text-xs text-muted">{note}</p>}
    </section>
  );
}

function ViewAll({ href, children = "View all" }: { href: string; children?: ReactNode }) {
  return (
    <Link href={href} className="inline-flex shrink-0 items-center gap-1 rounded text-xs font-medium text-brand hover:underline">
      {children}<ArrowRight aria-hidden className="h-3 w-3" />
    </Link>
  );
}

function ListSkeleton({ rows = 4 }: { rows?: number }) {
  return <div className="space-y-3">{Array.from({ length: rows }, (_, i) => <Skeleton key={i} className="h-9" />)}</div>;
}

/** Proportion bar plus counts. Counts are always printed, so colour is never the only signal. */
function Distribution({ items, total, colors, hrefFor }: {
  items: { key: string; count: number }[]; total: number; colors: Record<string, string>; hrefFor?: (k: string) => string;
}) {
  return (
    <div>
      <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-line/60" aria-hidden>
        {total > 0 && items.map((i) => i.count > 0 && (
          <div key={i.key} className={colors[i.key]} style={{ width: `${(i.count / total) * 100}%` }} />
        ))}
      </div>
      <ul className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        {items.map((i) => {
          const inner = (
            <>
              <span className="flex min-w-0 items-center gap-2">
                <span aria-hidden className={cn("h-2.5 w-2.5 shrink-0 rounded-sm", colors[i.key])} />
                <span className="truncate">{label(i.key)}</span>
              </span>
              <span className="tabular font-medium">{i.count}</span>
            </>
          );
          return (
            <li key={i.key}>
              {hrefFor
                ? <Link href={hrefFor(i.key)} className="flex items-center justify-between gap-2 rounded px-1 py-0.5 hover:bg-paper">{inner}</Link>
                : <div className="flex items-center justify-between gap-2 px-1 py-0.5">{inner}</div>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default function DashboardPage() {
  const { user } = useAuth();
  const [days, setDays] = useState("30");
  const o = useQuery({ queryKey: ["overview", days], queryFn: () => api<Overview>(`/analytics/overview?days=${days}`) });
  // Same key as the Analytics page default, so the two pages share the cached response.
  const ins = useQuery({ queryKey: ["insights", "12"], queryFn: () => api<Insights>("/analytics/insights?weeks=12") });
  const recent = useQuery({
    queryKey: ["tickets", "dashboard-recent"],
    queryFn: () => api<TicketPage>("/tickets?sort=created_at&desc=true&page=1&page_size=6"),
  });
  const health = useQuery({ queryKey: ["health"], queryFn: () => api<Health>("/health"), refetchInterval: 30_000 });

  const d = o.data;
  const loading = o.isLoading;
  const review = ins.data?.ai_use.category_review;
  const bursts = ins.data ? ins.data.incident_bursts.found.slice().reverse() : [];
  const recurring = ins.data?.recurring_issues ?? [];
  const statusTotal = d ? STATUSES.reduce((n, s) => n + (d.by_status[s] ?? 0), 0) : 0;
  const priorityTotal = d ? PRIORITIES.reduce((n, p) => n + (d.by_priority[p] ?? 0), 0) : 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        description={`Welcome back${user?.full_name ? `, ${user.full_name}` : ""}. Every figure on this page is computed from the ticket database (synthetic data).`}
        actions={
          <>
            <label htmlFor="days" className="sr-only">Trend window</label>
            <Select id="days" value={days} onChange={(e) => setDays(e.target.value)} className="w-40">
              <option value="7">Last 7 days</option><option value="30">Last 30 days</option>
              <option value="90">Last 90 days</option><option value="180">Last 180 days</option>
            </Select>
            <Link href="/tickets/new" className="inline-flex h-10 items-center gap-2 rounded-md bg-brand px-4 text-sm font-medium text-on-brand shadow-sm hover:opacity-90">
              <Plus aria-hidden className="h-4 w-4" />New ticket
            </Link>
          </>
        }
      />

      {o.isError && <div className="rounded-lg border border-line bg-panel"><ErrorState message={(o.error as Error).message} onRetry={() => o.refetch()} /></div>}

      {d && d.totals.total === 0 && (
        <div className="rounded-lg border border-line bg-panel">
          <EmptyState title="No tickets yet" description="Create a ticket, or run the seed script to load the synthetic dataset."
            action={<Link href="/tickets/new" className="text-sm font-medium text-brand hover:underline">Create a ticket</Link>} />
        </div>
      )}

      {/* KPI cards: grid rows stretch, StatCard is h-full, so every card in a row has the same height. */}
      {!o.isError && (
        <section aria-label="Summary" className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
          <StatCard label="Total tickets" icon={TicketIcon} loading={loading} value={d?.totals.total} href="/tickets" hint="All statuses" />
          <StatCard label="Open" icon={Inbox} tone="info" loading={loading} value={d?.totals.open} href="/tickets?status=open" hint="New and open" />
          <StatCard label="Pending" icon={Clock} tone="warn" loading={loading} value={d?.totals.pending} href="/tickets?status=pending" hint="Waiting on someone" />
          <StatCard label="Resolved" icon={CheckCircle2} tone="ok" loading={loading} value={d?.totals.resolved} hint="Resolved and closed" />
          <StatCard label="High priority open" icon={AlertTriangle} tone="danger" loading={loading} value={d?.totals.high_priority_open}
            href="/tickets?priority=high" hint="Critical and high, unresolved" />
          <StatCard label="Avg. resolution" icon={Timer} loading={loading} value={d ? fmtHours(d.resolution.average_hours) : undefined}
            hint={d ? `${d.resolution.tickets_counted} tickets with valid dates` : undefined} />
        </section>
      )}

      {!o.isError && (
        <div className="grid gap-6 lg:grid-cols-3">
          <Panel id="trend" title="Created vs resolved per day" icon={ActivityIcon} className="lg:col-span-2">
            {loading || !d ? <Skeleton className="h-64" /> : (
              <div className="h-64" role="img" aria-label={`Area chart of tickets created and resolved per day over the last ${days} days`}>
                <ResponsiveContainer>
                  <AreaChart data={d.trend} margin={{ top: 4, right: 8, left: -8, bottom: 0 }}>
                    <defs>
                      <linearGradient id="gCreated" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="rgb(var(--brand))" stopOpacity={0.25} />
                        <stop offset="100%" stopColor="rgb(var(--brand))" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke={grid} vertical={false} />
                    <XAxis dataKey="date" tick={tick} tickFormatter={(v: string) => v.slice(5)} minTickGap={24} tickLine={false} axisLine={false} />
                    <YAxis tick={tick} allowDecimals={false} width={36} tickLine={false} axisLine={false} />
                    <Tooltip contentStyle={tip} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Area type="monotone" dataKey="created" name="Created" stroke="rgb(var(--brand))" strokeWidth={2} fill="url(#gCreated)" />
                    <Area type="monotone" dataKey="resolved" name="Resolved" stroke="rgb(var(--ok))" strokeWidth={2} strokeDasharray="5 3" fill="none" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </Panel>

          <Panel id="mix" title="Status and priority" icon={ListTodo} note="All tickets, any date.">
            {loading || !d ? <ListSkeleton rows={5} /> : (
              <div className="space-y-6">
                <div>
                  <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">By status</h3>
                  <Distribution total={statusTotal} colors={STATUS_BAR} hrefFor={(s) => `/tickets?status=${s}`}
                    items={STATUSES.map((s) => ({ key: s, count: d.by_status[s] ?? 0 }))} />
                </div>
                <div>
                  <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">By priority</h3>
                  <Distribution total={priorityTotal} colors={PRIORITY_BAR} hrefFor={(p) => `/tickets?priority=${p}`}
                    items={PRIORITIES.map((p) => ({ key: p, count: d.by_priority[p] ?? 0 }))} />
                </div>
              </div>
            )}
          </Panel>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <Panel id="recent" title="Recent tickets" icon={TicketIcon} className="lg:col-span-2" action={<ViewAll href="/tickets" />}>
          {recent.isLoading ? <ListSkeleton rows={6} /> : recent.isError ? (
            <ErrorState message={(recent.error as Error).message} onRetry={() => recent.refetch()} />
          ) : recent.data && recent.data.items.length === 0 ? (
            <EmptyState title="No tickets yet" />
          ) : (
            <ul className="-my-2 divide-y divide-line">
              {recent.data?.items.map((t) => (
                <li key={t.id}>
                  <Link href={`/tickets/${t.id}`} className="-mx-2 flex flex-col gap-1.5 rounded-md px-2 py-2.5 hover:bg-paper sm:flex-row sm:items-center sm:gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        <span className="tabular mr-2 text-muted">{t.ticket_number}</span>{t.subject}
                      </p>
                      <p className="mt-0.5 truncate text-xs text-muted">
                        {t.category?.name ?? "Uncategorized"} · {t.assignee?.full_name ?? "Unassigned"} · {fmtDate(t.created_at)}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <PriorityBadge value={t.priority} /><StatusBadge value={t.status} />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel id="aiq" title="AI review queue" icon={Sparkles} action={<ViewAll href="/analytics#ai">Details</ViewAll>}
          note="Counts of stored category suggestions. AI suggestions never change a ticket until a technician accepts or edits them.">
          {ins.isLoading ? <ListSkeleton rows={4} /> : ins.isError ? (
            <ErrorState message={(ins.error as Error).message} onRetry={() => ins.refetch()} />
          ) : review && review.predictions === 0 ? (
            <EmptyState icon={Sparkles} title="No AI suggestions yet" description="Open a ticket and ask for a category suggestion to start the queue." />
          ) : review && (
            <div className="space-y-4">
              <div className="rounded-md border border-ai/30 bg-ai/5 p-4">
                <p className="flex items-center gap-1.5 text-xs font-medium text-ai"><Sparkles aria-hidden className="h-3.5 w-3.5" />Awaiting technician review</p>
                <p className="tabular mt-1 text-3xl font-semibold">{review.pending_review}</p>
                <p className="mt-0.5 text-xs text-muted">of {review.predictions} stored suggestions</p>
              </div>
              <dl className="grid grid-cols-2 gap-3 text-sm">
                {([
                  ["Flagged low confidence", review.flagged_for_manual_review],
                  ["Reviewed", review.reviewed],
                  ["Accepted", review.accepted],
                  ["Edited", review.edited],
                  ["Rejected", review.rejected],
                ] as const).map(([k, v]) => (
                  <div key={k} className="rounded-md bg-paper px-3 py-2">
                    <dt className="text-xs text-muted">{k}</dt>
                    <dd className="tabular font-semibold">{v}</dd>
                  </div>
                ))}
              </dl>
              <p className="text-xs text-muted">
                The backend reports queue counts only, not which tickets are waiting, so pending items are reviewed from each ticket page.
              </p>
            </div>
          )}
        </Panel>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Panel id="inc" title="Possible recurring incidents" icon={Repeat} action={<ViewAll href="/analytics#inc" />}
          note={ins.data ? `Rule: ${ins.data.incident_bursts.rule}. A flag means "look at this", not a confirmed incident; a person decides.` : undefined}>
          {ins.isLoading ? <ListSkeleton rows={4} /> : ins.isError ? (
            <ErrorState message={(ins.error as Error).message} onRetry={() => ins.refetch()} />
          ) : bursts.length === 0 && recurring.length === 0 ? (
            <EmptyState icon={Repeat} title="Nothing flagged" description="No ticket bursts or repeated subjects were found." />
          ) : (
            <div className="space-y-5">
              {bursts.length > 0 && (
                <div>
                  <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">Ticket bursts ({bursts.length})</h3>
                  <ul className="space-y-2">
                    {bursts.slice(0, 3).map((b) => (
                      <li key={b.start + b.category} className="rounded-md border border-warn/30 bg-warn/5 p-3 text-sm">
                        <p className="font-medium">{b.category}</p>
                        <p className="mt-0.5 text-xs text-muted">
                          {b.tickets} tickets, {fmtDate(b.start)} to {fmtDate(b.end)} · {b.still_open} unresolved
                        </p>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {recurring.length > 0 && (
                <div>
                  <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">Repeated subjects</h3>
                  <ul className="divide-y divide-line text-sm">
                    {recurring.slice(0, 4).map((r) => (
                      <li key={r.subject} className="flex items-center justify-between gap-3 py-2">
                        <Link href={`/tickets?q=${encodeURIComponent(r.subject)}`} className="min-w-0 truncate hover:underline" title={r.subject}>{r.subject}</Link>
                        <span className="tabular shrink-0 text-xs text-muted">{r.count}× · {r.open} open</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </Panel>

        <Panel id="cat" title="Tickets by category" icon={ListTodo} note="All tickets, any date.">
          {loading || !d ? <Skeleton className="h-72" /> : d.by_category.length === 0 ? <EmptyState title="No categories yet" /> : (
            <div style={{ height: Math.max(220, d.by_category.length * 30) }} role="img" aria-label="Bar chart of ticket counts by category">
              <ResponsiveContainer>
                <BarChart data={d.by_category} layout="vertical" margin={{ left: 0, right: 12, top: 0, bottom: 0 }}>
                  <CartesianGrid stroke={grid} horizontal={false} />
                  <XAxis type="number" tick={tick} allowDecimals={false} tickLine={false} axisLine={false} />
                  <YAxis type="category" dataKey="name" tick={tick} width={120} tickLine={false} axisLine={false} interval={0} />
                  <Tooltip contentStyle={tip} cursor={{ fill: "rgb(var(--line) / 0.4)" }} />
                  <Bar dataKey="count" name="Tickets" fill="rgb(var(--brand))" radius={[0, 4, 4, 0]} barSize={16} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Panel>

        <Panel id="act" title="Recent activity" icon={ActivityIcon}>
          {loading || !d ? <ListSkeleton rows={5} /> : d.recent_activity.length === 0 ? <EmptyState title="No activity yet" /> : (
            <ol className="relative space-y-4 border-l border-line pl-4">
              {d.recent_activity.map((a, i) => (
                <li key={i} className="relative text-sm">
                  <span aria-hidden className={cn("absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-panel",
                    a.kind === "ai" ? "bg-ai" : "bg-brand")} />
                  <p className="min-w-0">
                    <Link href={`/tickets/${a.ticket_id}`} className="font-medium text-brand hover:underline">{a.ticket_number}</Link>{" "}
                    <span className="text-muted">{label(a.kind)}</span>
                  </p>
                  <p className="mt-0.5 break-words text-xs">{a.detail}</p>
                  <p className="mt-0.5 text-xs text-muted">{a.user ?? "System"} · {fmtDate(a.created_at)}</p>
                </li>
              ))}
            </ol>
          )}
        </Panel>
      </div>

      <p className="flex items-center gap-2 text-xs text-muted">
        <span aria-hidden className={cn("h-2 w-2 rounded-full",
          health.data?.status === "ok" ? "bg-ok" : health.isError || health.data ? "bg-danger" : "bg-muted")} />
        API {health.data ? (health.data.status === "ok" ? "healthy" : "degraded") : health.isError ? "unreachable" : "checking"}
        {health.data && ` · database ${health.data.database === "ok" ? "connected" : "unavailable"}`}
      </p>
    </div>
  );
}
