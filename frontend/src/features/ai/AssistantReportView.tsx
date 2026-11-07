import type { AssistantReport, AssistantStats } from "@/types/api";

const pct = (n: number | null) => (n === null ? "n/a" : `${(n * 100).toFixed(1)}%`);

export function AssistantReportView({ r, live }: { r: AssistantReport | null; live: AssistantStats }) {
  const x = r?.results;
  return (
    <section aria-labelledby="asst" className="space-y-3 rounded-lg border border-line bg-panel p-5">
      <h2 id="asst" className="text-sm font-medium">Troubleshooting assistant</h2>
      {r && x && (
        <>
          <p className="text-sm">On {r.protocol.queries} synthetic test tickets ({r.protocol.with_matching_article} with a matching article, {r.protocol.without_matching_article} without),
            the assistant made the right call (<i>{x.safe_outcome_definition}</i>) {pct(x.safe_outcome_rate)} of the time (95% interval {pct(x.safe_outcome_ci95[0])} to {pct(x.safe_outcome_ci95[1])}).</p>
          <ul className="list-disc space-y-1 pl-5 text-sm">
            <li>Offered steps for {pct(x.answered_when_article_exists)} of tickets that have a matching article; the top article was correct {pct(x.correct_when_answered)} of those times. It wrongly declined {x.wrongly_declined_when_article_exists}.</li>
            <li>Declined {x.declined_when_no_article} of {x.no_article_queries} tickets with no matching article; it wrongly offered steps for {x.wrongly_answered_when_no_article}.</li>
            <li>Past resolutions came from the same scenario in {pct(x.past_resolution_from_same_scenario)} of cases.</li>
          </ul>
          <ul className="list-disc space-y-1 pl-5 text-xs text-muted">{r.caveats.map((c) => <li key={c}>{c}</li>)}</ul>
        </>
      )}
      {!r && <p className="text-sm text-muted">No assistant report found. Run <code>python scripts/evaluate_assistant.py</code>.</p>}
      <div className="border-t border-line pt-3">
        <p className="text-xs font-medium">Technician ratings (live)</p>
        {live.suggestions === 0 ? <p className="text-sm text-muted">No suggestions requested yet.</p> : (
          <p className="text-sm">{live.suggestions} suggestions, {live.rated} rated{live.helpful_rate !== null ? `, ${pct(live.helpful_rate)} helpful` : ""}.
            {" "}<span className="text-xs text-muted">Small counts are not evidence of real-world usefulness.</span></p>
        )}
      </div>
    </section>
  );
}
