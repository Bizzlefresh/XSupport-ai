import { Wrench } from "lucide-react";

import { SectionCard } from "@/components/ui/primitives";
import type { AssistantReport, AssistantStats } from "@/types/api";

const pct = (n: number | null) => (n === null ? "n/a" : `${(n * 100).toFixed(1)}%`);

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-md border border-line bg-paper px-4 py-3">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="tabular mt-1 text-xl font-semibold">{value}</dd>
      {sub && <dd className="mt-0.5 text-xs text-muted">{sub}</dd>}
    </div>
  );
}

export function AssistantReportView({ r, live }: { r: AssistantReport | null; live: AssistantStats }) {
  const x = r?.results;
  return (
    <SectionCard id="asst" title="Troubleshooting assistant" icon={Wrench}
      note={r ? <ul className="list-disc space-y-1 pl-4">{r.caveats.map((c) => <li key={c}>{c}</li>)}</ul> : undefined}>
      {r && x ? (
        <>
          <p className="text-sm">
            On {r.protocol.queries} synthetic test tickets ({r.protocol.with_matching_article} with a matching article, {r.protocol.without_matching_article} without),
            the assistant made the right call (<i>{x.safe_outcome_definition}</i>) {pct(x.safe_outcome_rate)} of the time.
          </p>
          <dl className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Tile label="Right call" value={pct(x.safe_outcome_rate)} sub={`95% interval ${pct(x.safe_outcome_ci95[0])} to ${pct(x.safe_outcome_ci95[1])}`} />
            <Tile label="Offered steps when an article exists" value={pct(x.answered_when_article_exists)} sub={`top article correct ${pct(x.correct_when_answered)}; wrongly declined ${x.wrongly_declined_when_article_exists}`} />
            <Tile label="Declined when no article exists" value={`${x.declined_when_no_article} / ${x.no_article_queries}`} sub={`wrongly offered steps ${x.wrongly_answered_when_no_article}`} />
            <Tile label="Past resolution from same scenario" value={pct(x.past_resolution_from_same_scenario)} />
          </dl>
        </>
      ) : (
        <p className="text-sm text-muted">No assistant report found. Run <code>python scripts/evaluate_assistant.py</code>.</p>
      )}
      <div className="mt-5 border-t border-line pt-4">
        <h3 className="text-xs font-medium uppercase tracking-wide text-muted">Technician ratings (live)</h3>
        {live.suggestions === 0 ? <p className="mt-1 text-sm text-muted">No suggestions requested yet.</p> : (
          <p className="mt-1 text-sm">
            <b className="tabular">{live.suggestions}</b> suggestions, <b className="tabular">{live.rated}</b> rated{live.helpful_rate !== null ? <>, <b className="tabular">{pct(live.helpful_rate)}</b> helpful</> : ""}.
            {" "}<span className="text-xs text-muted">Small counts are not evidence of real-world usefulness.</span>
          </p>
        )}
      </div>
    </SectionCard>
  );
}
