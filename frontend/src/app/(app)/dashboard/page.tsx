"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { Select } from "@/components/ui/select";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { fmtDate, fmtHours, label } from "@/lib/format";
import type { Health, Overview } from "@/types/api";

function Stat({ title, value, href, note }: { title: string; value: string | number; href?: string; note?: string }) {
  const body = (
    <div className="rounded-lg border border-line bg-panel p-4 hover:border-brand">
      <p className="text-xs text-muted">{title}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      {note && <p className="mt-1 text-xs text-muted">{note}</p>}
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

export default function DashboardPage() {
  const { user } = useAuth();
  const [days, setDays] = useState("30");
  const o = useQuery({ queryKey: ["overview", days], queryFn: () => api<Overview>(`/analytics/overview?days=${days}`) });
  const health = useQuery({ queryKey: ["health"], queryFn: () => api<Health>("/health"), refetchInterval: 30_000 });

  const grid = "rgb(var(--line))";
  const tick = { fill: "rgb(var(--muted))", fontSize: 12 };
  const tip = { background: "rgb(var(--panel))", border: "1px solid rgb(var(--line))", borderRadius: 6, color: "rgb(var(--ink))" };

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Dashboard</h1>
          <p className="mt-1 text-sm text-muted">Signed in as {user?.full_name}. All figures come from the ticket database.</p>
        </div>
        <div>
          <label htmlFor="days" className="mb-1 block text-xs text-muted">Trend window</label>
          <Select id="days" value={days} onChange={(e) => setDays(e.target.value)}>
            <option value="7">Last 7 days</option><option value="30">Last 30 days</option>
            <option value="90">Last 90 days</option><option value="180">Last 180 days</option></Select>
        </div>
      </div>

      {o.isError && <p role="alert" className="text-sm text-danger">{(o.error as Error).message}</p>}
      {o.isLoading && <p className="text-sm text-muted">Loading metrics…</p>}

      {o.data && (
        <>
          {o.data.totals.total === 0 ? (
            <p className="rounded-lg border border-line bg-panel p-5 text-sm text-muted">
              No tickets yet. <Link className="text-brand hover:underline" href="/tickets/new">Create one</Link> or run the seed script to load the synthetic dataset.
            </p>
          ) : null}
          <section aria-label="Summary" className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <Stat title="Total tickets" value={o.data.totals.total} href="/tickets" />
            <Stat title="Open" value={o.data.totals.open} href="/tickets?status=open" note="New and open" />
            <Stat title="Pending" value={o.data.totals.pending} href="/tickets?status=pending" />
            <Stat title="Resolved" value={o.data.totals.resolved} note="Resolved and closed" />
            <Stat title="High priority, unresolved" value={o.data.totals.high_priority_open} href="/tickets?priority=high" note="Critical and high" />
            <Stat title="Avg. resolution time" value={fmtHours(o.data.resolution.average_hours)}
                  note={`${o.data.resolution.tickets_counted} tickets with valid dates`} />
          </section>

          <section className="rounded-lg border border-line bg-panel p-5" aria-labelledby="tr">
            <h2 id="tr" className="mb-4 text-sm font-medium">Tickets created and resolved per day</h2>
            <div className="h-64" role="img" aria-label="Line chart of tickets created and resolved per day">
              <ResponsiveContainer>
                <LineChart data={o.data.trend}>
                  <CartesianGrid stroke={grid} vertical={false} />
                  <XAxis dataKey="date" tick={tick} tickFormatter={(d: string) => d.slice(5)} minTickGap={24} />
                  <YAxis tick={tick} allowDecimals={false} width={32} />
                  <Tooltip contentStyle={tip} />
                  <Legend />
                  <Line type="monotone" dataKey="created" name="Created" stroke="rgb(var(--brand))" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="resolved" name="Resolved" stroke="rgb(var(--ok))" strokeWidth={2} strokeDasharray="5 3" dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </section>

          <div className="grid gap-6 lg:grid-cols-2">
            <section className="rounded-lg border border-line bg-panel p-5" aria-labelledby="cat">
              <h2 id="cat" className="mb-4 text-sm font-medium">Tickets by category</h2>
              <div className="h-72" role="img" aria-label="Bar chart of ticket counts by category">
                <ResponsiveContainer>
                  <BarChart data={o.data.by_category} layout="vertical" margin={{ left: 16 }}>
                    <CartesianGrid stroke={grid} horizontal={false} />
                    <XAxis type="number" tick={tick} allowDecimals={false} />
                    <YAxis type="category" dataKey="name" tick={tick} width={150} />
                    <Tooltip contentStyle={tip} cursor={{ fill: "rgb(var(--paper))" }} />
                    <Bar dataKey="count" name="Tickets" fill="rgb(var(--brand))" radius={[0, 3, 3, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </section>

            <section className="rounded-lg border border-line bg-panel p-5" aria-labelledby="act">
              <h2 id="act" className="mb-3 text-sm font-medium">Recent activity</h2>
              {o.data.recent_activity.length === 0 ? <p className="text-sm text-muted">No activity yet.</p> : (
                <ul className="divide-y divide-line">
                  {o.data.recent_activity.map((a, i) => (
                    <li key={i} className="py-2.5 text-sm">
                      <Link href={`/tickets/${a.ticket_id}`} className="font-medium text-brand hover:underline">{a.ticket_number}</Link>{" "}
                      <span className="text-muted">{a.subject}</span>
                      <p className="text-xs text-muted">{label(a.kind)}: {a.detail} · {a.user ?? "System"} · {fmtDate(a.created_at)}</p>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          <section className="rounded-lg border border-line bg-panel p-5" aria-labelledby="pri">
            <h2 id="pri" className="mb-3 text-sm font-medium">Priority distribution (all tickets)</h2>
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {["critical", "high", "medium", "low"].map((p) => (
                <div key={p}><dt className="text-xs text-muted">{label(p)}</dt>
                  <dd className="text-lg font-semibold tabular-nums">{o.data.by_priority[p] ?? 0}</dd></div>
              ))}
            </dl>
          </section>
        </>
      )}

      <p className="text-xs text-muted">
        System: API {health.data ? (health.data.status === "ok" ? "healthy" : "degraded") : health.isError ? "unreachable" : "checking"}
        {health.data && ` · database ${health.data.database === "ok" ? "connected" : "unavailable"}`}.
        Recurring-incident indicators and the AI review queue arrive in Phases 3 to 6.
      </p>
    </div>
  );
}
