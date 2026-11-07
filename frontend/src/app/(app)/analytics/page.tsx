"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { Select } from "@/components/ui/select";
import { api } from "@/lib/api";
import { fmtDate, fmtHours, label } from "@/lib/format";
import type { Insights } from "@/types/api";

const COLORS = ["#6ea8fe", "#5fd0a5", "#f2b84b", "#f07b7b", "#b794f4", "#4fd1d9", "#f6a56b", "#9aa5b1", "#e58fbf"];
const pct = (n: number | null) => (n === null ? "n/a" : `${(n * 100).toFixed(0)}%`);

function Card({ id, title, note, children }: { id: string; title: string; note?: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="rounded-lg border border-line bg-panel p-5">
      <h2 id={id} className="text-sm font-medium">{title}</h2>
      {note && <p className="mb-3 mt-1 text-xs text-muted">{note}</p>}
      <div className={note ? "" : "mt-3"}>{children}</div>
    </section>
  );
}

function ResTable({ rows }: { rows: Insights["resolution_by_category"] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-line text-muted"><tr><th className="py-2 font-normal">Group</th><th className="font-normal">Tickets</th><th className="font-normal">Median</th><th className="font-normal">Mean</th></tr></thead>
        <tbody>{rows.map((r) => (
          <tr key={r.name} className="border-b border-line last:border-0"><td className="py-2">{label(r.name)}</td><td className="tabular-nums">{r.n}</td>
            <td className="tabular-nums">{fmtHours(r.median_hours)}</td><td className="tabular-nums">{fmtHours(r.mean_hours)}</td></tr>))}</tbody>
      </table>
    </div>
  );
}

export default function AnalyticsPage() {
  const [weeks, setWeeks] = useState("12");
  const q = useQuery({ queryKey: ["insights", weeks], queryFn: () => api<Insights>(`/analytics/insights?weeks=${weeks}`) });
  const grid = "rgb(var(--line))";
  const tick = { fill: "rgb(var(--muted))", fontSize: 12 };
  const tip = { background: "rgb(var(--panel))", border: "1px solid rgb(var(--line))", borderRadius: 6, color: "rgb(var(--ink))" };
  const d = q.data;

  return (
    <div className="max-w-6xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Analytics</h1>
          <p className="mt-1 text-sm text-muted">Computed from the ticket database. Medians are shown next to means because resolution times are skewed.</p>
        </div>
        <div>
          <label htmlFor="w" className="mb-1 block text-xs text-muted">Volume window</label>
          <Select id="w" value={weeks} onChange={(e) => setWeeks(e.target.value)}>
            <option value="8">8 weeks</option><option value="12">12 weeks</option><option value="26">26 weeks</option></Select>
        </div>
      </div>
      {q.isLoading && <p className="text-sm text-muted">Loading…</p>}
      {q.isError && <p role="alert" className="text-sm text-danger">{(q.error as Error).message}</p>}

      {d && (
        <>
          <Card id="inc" title="Possible incidents" note={`Rule: ${d.incident_bursts.rule}. A flag means "look at this", not "this is an incident"; a person decides.`}>
            {d.incident_bursts.found.length === 0 ? <p className="text-sm text-muted">No bursts found.</p> : (
              <ul className="divide-y divide-line text-sm">
                {d.incident_bursts.found.slice().reverse().map((b) => (
                  <li key={b.start + b.category} className="py-2">
                    <b>{b.category}</b>: {b.tickets} tickets between {fmtDate(b.start)} and {fmtDate(b.end)}
                    <span className="text-muted"> · {b.still_open} still unresolved</span>
                    <div className="mt-1 flex flex-wrap gap-2 text-xs">
                      {b.ticket_ids.slice(0, 8).map((id) => <Link key={id} href={`/tickets/${id}`} className="text-brand hover:underline">#{id}</Link>)}
                      {b.ticket_ids.length > 8 && <span className="text-muted">and more</span>}
                    </div>
                  </li>))}
              </ul>)}
          </Card>

          <Card id="vol" title="Tickets created per week, by category">
            <div className="h-72" role="img" aria-label="Stacked bar chart of tickets created per week by category">
              <ResponsiveContainer>
                <BarChart data={d.volume_by_week}>
                  <CartesianGrid stroke={grid} vertical={false} />
                  <XAxis dataKey="week" tick={tick} tickFormatter={(x: string) => x.slice(5)} minTickGap={16} />
                  <YAxis tick={tick} allowDecimals={false} width={32} />
                  <Tooltip contentStyle={tip} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  {d.categories.map((c, i) => <Bar key={c} dataKey={c} stackId="v" fill={COLORS[i % COLORS.length]} />)}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card id="rp" title="Resolution time by priority" note="Resolved tickets with valid dates only."><ResTable rows={d.resolution_by_priority} /></Card>
            <Card id="rc" title="Resolution time by category" note="Resolved tickets with valid dates only."><ResTable rows={d.resolution_by_category} /></Card>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card id="age" title="Unresolved tickets by age">
              <div className="h-56" role="img" aria-label="Bar chart of unresolved tickets by age">
                <ResponsiveContainer>
                  <BarChart data={d.backlog_aging}>
                    <CartesianGrid stroke={grid} vertical={false} />
                    <XAxis dataKey="bucket" tick={tick} />
                    <YAxis tick={tick} allowDecimals={false} width={32} />
                    <Tooltip contentStyle={tip} />
                    <Bar dataKey="count" name="Tickets" fill="#6ea8fe" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
            <Card id="rec" title="Recurring issues" note="Identical subject lines seen three or more times.">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-line text-muted"><tr><th className="py-2 font-normal">Subject</th><th className="font-normal">Count</th><th className="font-normal">Open</th><th className="font-normal">Median fix</th></tr></thead>
                <tbody>{d.recurring_issues.map((r) => (
                  <tr key={r.subject} className="border-b border-line last:border-0"><td className="py-2">{r.subject}<div className="text-xs text-muted">{r.category}</div></td>
                    <td className="tabular-nums">{r.count}</td><td className="tabular-nums">{r.open}</td><td className="tabular-nums">{fmtHours(r.median_hours)}</td></tr>))}</tbody>
              </table>
              {d.recurring_issues.length === 0 && <p className="text-sm text-muted">Nothing recurs three times yet.</p>}
            </Card>
          </div>

          <Card id="ai" title="How AI suggestions are being used" note="Live counts from technician reviews and ratings. Small counts say little; offline benchmarks are on the AI evaluation page.">
            <ul className="space-y-1 text-sm">
              <li>Category suggestions: {d.ai_use.category_review.predictions} made, {d.ai_use.category_review.reviewed} reviewed
                {d.ai_use.category_review.reviewed > 0 && <> · accepted {pct(d.ai_use.category_review.acceptance_rate)}, edited {pct(d.ai_use.category_review.correction_rate)}, rejected {pct(d.ai_use.category_review.rejection_rate)}</>}.</li>
              <li>Troubleshooting suggestions: {d.ai_use.assistant.suggestions} made, {d.ai_use.assistant.rated} rated
                {d.ai_use.assistant.helpful_rate !== null && <> · {pct(d.ai_use.assistant.helpful_rate)} helpful</>}.</li>
            </ul>
            <p className="mt-2 text-xs text-muted">Time saved is not measured here. Any benefit claim stays a hypothesis until it is measured with real users.</p>
          </Card>

          {(d.data_quality.resolved_without_timestamp > 0 || d.data_quality.resolved_before_created > 0) && (
            <p className="rounded-lg border border-line p-4 text-xs text-muted">
              Data quality: {d.data_quality.resolved_without_timestamp} resolved ticket(s) have no resolution time and {d.data_quality.resolved_before_created} resolve before they were created. {d.data_quality.note}
            </p>)}
        </>
      )}
    </div>
  );
}
