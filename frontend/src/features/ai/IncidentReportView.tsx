import { Siren } from "lucide-react";

import { SectionCard } from "@/components/ui/primitives";
import type { IncidentReport } from "@/types/api";

export function IncidentReportView({ r }: { r: IncidentReport }) {
  const m = r.main_dataset, o = r.other_seeds;
  return (
    <SectionCard id="incd" title="Incident-burst detection" icon={Siren}
      note={<>Full tables for the thesis are in <code>docs/results.md</code>, generated from the saved reports.</>}>
      <p className="text-sm text-muted">Rule: {r.rule}.</p>
      <dl className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {([
          ["Planted bursts found", `${m.truth_found} / ${m.truth_bursts}`, "Main dataset"],
          ["False alarms", String(m.false_alarms), "Main dataset"],
          ["Bursts found, other datasets", `${o.bursts_found} / ${o.bursts_present}`, `${o.datasets} generated datasets`],
          ["False alarms, other datasets", String(o.false_alarms), `${o.datasets} generated datasets`],
        ] as const).map(([k, v, sub]) => (
          <div key={k} className="rounded-md border border-line bg-paper px-4 py-3">
            <dt className="text-xs text-muted">{k}</dt><dd className="tabular mt-1 text-xl font-semibold">{v}</dd><dd className="mt-0.5 text-xs text-muted">{sub}</dd>
          </div>
        ))}
      </dl>
      <ul className="mt-4 list-disc space-y-1 pl-5 text-xs text-muted">{r.caveats.map((c) => <li key={c}>{c}</li>)}</ul>
    </SectionCard>
  );
}
