import type { IncidentReport } from "@/types/api";

export function IncidentReportView({ r }: { r: IncidentReport }) {
  const m = r.main_dataset, o = r.other_seeds;
  return (
    <section aria-labelledby="incd" className="space-y-2 rounded-lg border border-line bg-panel p-5">
      <h2 id="incd" className="text-sm font-medium">Incident-burst detection</h2>
      <p className="text-sm">Rule: {r.rule}. It found {m.truth_found} of {m.truth_bursts} planted bursts with {m.false_alarms} false alarms, and
        {" "}{o.bursts_found} of {o.bursts_present} across {o.datasets} other generated datasets with {o.false_alarms} false alarms.</p>
      <ul className="list-disc space-y-1 pl-5 text-xs text-muted">{r.caveats.map((c) => <li key={c}>{c}</li>)}</ul>
      <p className="text-xs text-muted">Full tables for the thesis are in <code>docs/results.md</code>, generated from the saved reports.</p>
    </section>
  );
}
