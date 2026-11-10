"use client";

import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CalendarRange, Clock, Hourglass, Repeat, Siren, Sparkles, Timer } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { EmptyState, ErrorState, InlineBar, PageHeader, ScrollBox, SectionCard, Skeleton, StatCard, tbl } from "@/components/ui/primitives";
import { Select } from "@/components/ui/select";
import { api } from "@/lib/api";
import { chartCursor, chartGrid, chartTick, chartTooltip, heat, heatText } from "@/lib/chart";
import { fmtDate, fmtHours, label, ticketNo } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Insights } from "@/types/api";

const pct = (n: number | null) => (n === null ? "n/a" : `${(n * 100).toFixed(0)}%`);

function useReducedMotion() {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduce(mq.matches);
    const on = (e: MediaQueryListEvent) => setReduce(e.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return reduce;
}

function ResTable({ rows, caption }: { rows: Insights["resolution_by_category"]; caption: string }) {
  const max = Math.max(0, ...rows.map((r) => r.median_hours ?? 0));
  return (
    <ScrollBox label={caption}>
      <table className={tbl.table}>
        <caption className="sr-only">{caption}</caption>
        <thead className={tbl.thead}><tr>
          <th scope="col" className={tbl.th}>Group</th><th scope="col" className={tbl.thNum}>Tickets</th>
          <th scope="col" className={tbl.thNum}>Median</th><th scope="col" className={cn(tbl.th, "hidden w-32 sm:table-cell")}><span className="sr-only">Median, as a bar</span></th>
          <th scope="col" className={tbl.thNum}>Mean</th>
        </tr></thead>
        <tbody>{rows.map((r) => (
          <tr key={r.name} className={tbl.tr}>
            <td className={tbl.td}>{label(r.name)}</td><td className={tbl.tdNum}>{r.n}</td>
            <td className={cn(tbl.tdNum, "font-medium")}>{fmtHours(r.median_hours)}</td>
            <td className={cn(tbl.td, "hidden sm:table-cell")}>{r.median_hours !== null && <InlineBar value={r.median_hours} max={max} />}</td>
            <td className={cn(tbl.tdNum, "text-muted")}>{fmtHours(r.mean_hours)}</td>
          </tr>))}</tbody>
      </table>
    </ScrollBox>
  );
}

/** Category × week heatmap: one hue, darker = more tickets, count printed in every non-empty cell. */
function VolumeHeatmap({ d }: { d: Insights }) {
  const max = Math.max(1, ...d.volume_by_week.flatMap((w) => d.categories.map((c) => Number(w[c] ?? 0))));
  const totals = d.volume_by_week.map((w) => d.categories.reduce((n, c) => n + Number(w[c] ?? 0), 0));
  return (
    <ScrollBox label="Weekly volume by category" className="px-5">
      <table className="w-full border-separate border-spacing-0.5 text-xs">
        <caption className="sr-only">Tickets created per week (columns, by week start) and category (rows)</caption>
        <thead>
          <tr>
            <th scope="col" className="sticky left-0 z-10 bg-panel pr-2 text-left font-medium text-muted">Category</th>
            {d.volume_by_week.map((w) => (
              <th key={w.week as string} scope="col" className="min-w-9 px-0.5 pb-1 text-center font-normal text-muted" title={`Week starting ${w.week}`}>
                {(w.week as string).slice(5).replace("-", "/")}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {d.categories.map((c) => (
            <tr key={c}>
              <th scope="row" className="sticky left-0 z-10 max-w-40 truncate bg-panel py-0.5 pr-2 text-left font-normal" title={c}>{c}</th>
              {d.volume_by_week.map((w) => {
                const v = Number(w[c] ?? 0);
                const h = heat(v, max);
                return (
                  <td key={w.week as string} title={`${c}, week of ${w.week}: ${v}`}
                    className={cn("tabular h-8 rounded text-center", heatText(h.strong), v === 0 && "text-muted/50")}
                    style={{ background: h.background }}>
                    {v === 0 ? "·" : v}
                  </td>
                );
              })}
            </tr>
          ))}
          <tr>
            <th scope="row" className="sticky left-0 z-10 bg-panel pt-1.5 pr-2 text-left font-medium text-muted">Total</th>
            {totals.map((t, i) => <td key={i} className="tabular pt-1.5 text-center font-medium">{t}</td>)}
          </tr>
        </tbody>
      </table>
    </ScrollBox>
  );
}

function PageSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-28" />)}</div>
      <Skeleton className="h-48" /><Skeleton className="h-72" />
    </div>
  );
}

export default function AnalyticsPage() {
  const [weeks, setWeeks] = useState("12");
  const reduceMotion = useReducedMotion();
  const q = useQuery({ queryKey: ["insights", weeks], queryFn: () => api<Insights>(`/analytics/insights?weeks=${weeks}`), placeholderData: (p) => p });
  const d = q.data;

  // Deep links (e.g. /analytics#inc from the sidebar) land after the data renders.
  useEffect(() => {
    if (d && window.location.hash) document.getElementById(window.location.hash.slice(1))?.scrollIntoView();
  }, [d]);

  const unresolved = d?.backlog_aging.reduce((n, b) => n + b.count, 0) ?? 0;
  const olderThanWeek = d?.backlog_aging.filter((b) => b.bucket === "7 to 14 days" || b.bucket === "over 14 days").reduce((n, b) => n + b.count, 0) ?? 0;
  const cr = d?.ai_use.category_review;
  const as = d?.ai_use.assistant;

  return (
    <div>
      <PageHeader title="Analytics"
        description="Computed from the ticket database (synthetic data). Medians sit beside means because resolution times are skewed."
        actions={
          <div className="flex items-center gap-2">
            <label htmlFor="w" className="text-xs text-muted">Volume window</label>
            <Select id="w" value={weeks} onChange={(e) => setWeeks(e.target.value)}>
              <option value="8">8 weeks</option><option value="12">12 weeks</option><option value="26">26 weeks</option>
            </Select>
          </div>
        } />

      {q.isLoading ? <PageSkeleton /> : q.isError ? (
        <div className="rounded-lg border border-line bg-panel"><ErrorState message={(q.error as Error).message} onRetry={() => q.refetch()} /></div>
      ) : d && (
        <div className="space-y-6">
          <section aria-label="Summary" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Unresolved tickets" icon={Hourglass} tone="info" value={unresolved} hint="New, open and pending; any age" />
            <StatCard label="Unresolved over 7 days" icon={Clock} tone="warn" value={olderThanWeek} hint="Oldest part of the backlog" />
            <StatCard label="Possible incidents" icon={Siren} tone="danger" value={d.incident_bursts.found.length} href="#inc" hint="Ticket bursts, all dates" />
            <StatCard label="Recurring subjects" icon={Repeat} value={d.recurring_issues.length} href="#rec" hint="Seen 3+ times (top 10)" />
          </section>

          <SectionCard id="inc" title="Possible incidents" icon={Siren}
            note={<>Rule: {d.incident_bursts.rule}. A flag means &ldquo;look at this&rdquo;, not a confirmed incident; a person decides.</>}>
            {d.incident_bursts.found.length === 0 ? <EmptyState icon={Siren} title="No bursts found" /> : (
              <ul className="grid gap-3 md:grid-cols-2">
                {d.incident_bursts.found.slice().reverse().map((b) => (
                  <li key={b.start + b.category} className="rounded-md border border-warn/30 bg-warn/5 p-4 text-sm">
                    <div className="flex items-start justify-between gap-2">
                      <p className="flex items-center gap-1.5 font-medium"><AlertTriangle aria-hidden className="h-4 w-4 text-warn" />{b.category}</p>
                      <span className="tabular shrink-0 text-xs text-muted">{b.tickets} tickets</span>
                    </div>
                    <p className="mt-1 text-xs text-muted">{fmtDate(b.start)} to {fmtDate(b.end)} · {b.still_open} still unresolved</p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {b.ticket_ids.slice(0, 8).map((id) => (
                        <Link key={id} href={`/tickets/${id}`} className="tabular rounded border border-line bg-panel px-1.5 py-0.5 text-xs text-brand hover:border-brand/40">{ticketNo(id)}</Link>
                      ))}
                      {b.ticket_ids.length > 8 && <span className="px-1 py-0.5 text-xs text-muted">+{b.ticket_ids.length - 8} more</span>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>

          <SectionCard id="vol" title={`Tickets created per week, by category (last ${d.weeks} weeks)`} icon={CalendarRange}
            note="Darker cells mean more tickets; each cell shows its count. Weeks start on Monday.">
            <VolumeHeatmap d={d} />
          </SectionCard>

          <div className="grid items-start gap-6 xl:grid-cols-2">
            <SectionCard id="rp" title="Resolution time by priority" icon={Timer} note="Resolved tickets with valid dates only.">
              <ResTable rows={d.resolution_by_priority} caption="Resolution time by priority" />
            </SectionCard>
            <SectionCard id="rc" title="Resolution time by category" icon={Timer} note="Resolved tickets with valid dates only.">
              <ResTable rows={d.resolution_by_category} caption="Resolution time by category" />
            </SectionCard>
          </div>

          <div className="grid items-start gap-6 xl:grid-cols-2">
            <SectionCard id="age" title="Unresolved tickets by age" icon={Hourglass}>
              <div className="h-60" role="img" aria-label={`Bar chart of unresolved tickets by age: ${d.backlog_aging.map((b) => `${b.bucket} ${b.count}`).join(", ")}`}>
                <ResponsiveContainer>
                  <BarChart data={d.backlog_aging} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                    <CartesianGrid stroke={chartGrid} vertical={false} />
                    <XAxis dataKey="bucket" tick={chartTick} tickLine={false} axisLine={false} interval={0} />
                    <YAxis tick={chartTick} allowDecimals={false} width={36} tickLine={false} axisLine={false} />
                    <Tooltip contentStyle={chartTooltip} cursor={chartCursor} />
                    <Bar dataKey="count" name="Tickets" fill="rgb(var(--brand))" radius={[4, 4, 0, 0]} maxBarSize={48} isAnimationActive={!reduceMotion} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <ul className="mt-3 grid grid-cols-5 gap-1 text-center text-xs">
                {d.backlog_aging.map((b) => <li key={b.bucket}><span className="tabular block font-semibold">{b.count}</span><span className="text-muted">{b.bucket}</span></li>)}
              </ul>
            </SectionCard>

            <SectionCard id="rec" title="Recurring issues" icon={Repeat} note="Identical subject lines seen three or more times (top 10). Near-duplicate wording is not merged.">
              {d.recurring_issues.length === 0 ? <EmptyState icon={Repeat} title="Nothing recurs three times yet" /> : (
                <ScrollBox label="Recurring issues">
                  <table className={tbl.table}>
                    <caption className="sr-only">Recurring issues</caption>
                    <thead className={tbl.thead}><tr>
                      <th scope="col" className={tbl.th}>Subject</th><th scope="col" className={tbl.thNum}>Count</th>
                      <th scope="col" className={tbl.thNum}>Open</th><th scope="col" className={tbl.thNum}>Median fix</th>
                    </tr></thead>
                    <tbody>{d.recurring_issues.map((r) => (
                      <tr key={r.subject} className={tbl.tr}>
                        <td className={tbl.td}>
                          <Link href={`/tickets?q=${encodeURIComponent(r.subject)}`} className="hover:text-brand hover:underline">{r.subject}</Link>
                          <span className="block text-xs text-muted">{r.category}</span>
                        </td>
                        <td className={cn(tbl.tdNum, "font-medium")}>{r.count}</td>
                        <td className={tbl.tdNum}>{r.open}</td>
                        <td className={cn(tbl.tdNum, "text-muted")}>{fmtHours(r.median_hours)}</td>
                      </tr>))}</tbody>
                  </table>
                </ScrollBox>
              )}
            </SectionCard>
          </div>

          {cr && as && (
            <SectionCard id="ai" title="How AI suggestions are being used" icon={Sparkles}
              note="Live counts from technician reviews and ratings. Small counts say little; offline benchmarks are on the AI evaluation page. Time saved is not measured.">
              <div className="grid gap-6 md:grid-cols-2">
                <div>
                  <h3 className="text-xs font-medium uppercase tracking-wide text-muted">Category suggestions</h3>
                  <dl className="mt-2 grid grid-cols-3 gap-2 text-sm">
                    {([["Made", cr.predictions], ["Reviewed", cr.reviewed], ["Pending", cr.pending_review],
                      ["Accepted", pct(cr.acceptance_rate)], ["Edited", pct(cr.correction_rate)], ["Rejected", pct(cr.rejection_rate)]] as const).map(([k, v]) => (
                      <div key={k} className="rounded-md bg-paper px-3 py-2"><dt className="text-xs text-muted">{k}</dt><dd className="tabular font-semibold">{v}</dd></div>
                    ))}
                  </dl>
                  {cr.reviewed > 0 && <p className="mt-1.5 text-xs text-muted">Rates are shares of the {cr.reviewed} reviewed suggestions.</p>}
                </div>
                <div>
                  <h3 className="text-xs font-medium uppercase tracking-wide text-muted">Troubleshooting suggestions</h3>
                  <dl className="mt-2 grid grid-cols-3 gap-2 text-sm">
                    {([["Made", as.suggestions], ["Rated", as.rated], ["Helpful", pct(as.helpful_rate)]] as const).map(([k, v]) => (
                      <div key={k} className="rounded-md bg-paper px-3 py-2"><dt className="text-xs text-muted">{k}</dt><dd className="tabular font-semibold">{v}</dd></div>
                    ))}
                  </dl>
                </div>
              </div>
            </SectionCard>
          )}

          {(d.data_quality.resolved_without_timestamp > 0 || d.data_quality.resolved_before_created > 0) && (
            <p role="note" className="flex gap-2 rounded-lg border border-line bg-panel p-4 text-xs text-muted">
              <AlertTriangle aria-hidden className="h-4 w-4 shrink-0 text-warn" />
              Data quality: {d.data_quality.resolved_without_timestamp} resolved ticket(s) have no resolution time and {d.data_quality.resolved_before_created} resolve before they were created. {d.data_quality.note}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
