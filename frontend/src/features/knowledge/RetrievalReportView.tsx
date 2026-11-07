import { METHOD_LABEL } from "@/lib/format";
import type { Method, RankMetrics, RetrievalReport } from "@/types/api";

const METHODS: Method[] = ["lexical", "semantic", "hybrid"];
const f = (n: number) => n.toFixed(3);
const pct = (n: number | null) => (n === null ? "n/a" : `${(n * 100).toFixed(1)}%`);

function Table({ caption, data }: { caption: string; data: Record<Method, RankMetrics> }) {
  const cols: [string, (m: RankMetrics) => string][] = [
    ["Precision@1", (m) => f(m.precision_at_1)], ["Precision@3", (m) => f(m.precision_at_3)], ["Recall@3", (m) => f(m.recall_at_3)],
    ["Recall@5", (m) => f(m.recall_at_5)], ["MRR (95% CI)", (m) => `${f(m.mrr)} (${m.mrr_ci95[0]}–${m.mrr_ci95[1]})`], ["nDCG@5", (m) => f(m.ndcg_at_5)],
  ];
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <caption className="mb-2 text-left text-xs text-muted">{caption}</caption>
        <thead className="border-b border-line text-muted"><tr><th className="px-2 py-2 font-normal">Method</th>
          {cols.map(([h]) => <th key={h} className="px-2 py-2 font-normal">{h}</th>)}</tr></thead>
        <tbody>{METHODS.map((m) => (
          <tr key={m} className="border-b border-line last:border-0"><td className="px-2 py-2">{METHOD_LABEL[m]}</td>
            {cols.map(([h, fn]) => <td key={h} className="px-2 tabular-nums">{fn(data[m])}</td>)}</tr>))}</tbody>
      </table>
    </div>
  );
}

export function RetrievalReportView({ r }: { r: RetrievalReport }) {
  const g = r.article_threshold_on_test;
  return (
    <section aria-labelledby="retr" className="space-y-4 rounded-lg border border-line bg-panel p-5">
      <div>
        <h2 id="retr" className="text-sm font-medium">Retrieval evaluation (similar incidents and articles)</h2>
        <p className="mt-1 text-xs text-muted">
          Semantic method uses <b>{r.embedding.used}</b>.
          {r.embedding.fallback_reason && <> The pretrained sentence-embedding model could not be loaded when this report was made, so a local latent-semantic model was used instead.</>}
          {" "}Keyword search (TF-IDF) is the baseline.
        </p>
      </div>
      <Table caption={`Similar incidents: ${r.protocol.ticket_queries} against ${r.protocol.ticket_corpus}. A result counts only if it comes from the same scenario.`} data={r.similar_incidents} />
      <p className="text-xs text-muted">Top result is in the correct <i>category</i>: {METHODS.map((m) => `${METHOD_LABEL[m]} ${pct(r.similar_incident_top1_same_category[m])}`).join(" · ")}. The differences between methods are within the confidence intervals, so no method is shown to be better.</p>
      <Table caption={`Articles: ${r.protocol.article_queries} against ${r.protocol.article_corpus}. Labels were assigned by the project author.`} data={r.articles} />
      <div>
        <h3 className="text-sm font-medium">Weak-match threshold for articles</h3>
        <p className="mt-1 text-xs text-muted">Chosen on validation data so that at least 80% of shown articles are right, counting articles shown for tickets with no matching article as wrong. Applied once to test data:</p>
        <ul className="mt-2 space-y-1 text-sm">
          {METHODS.map((m) => g[m] && (
            <li key={m}>{METHOD_LABEL[m]}: threshold {g[m]!.threshold}; answers {pct(g[m]!.labelled_coverage)} of tickets that have an article, correct {pct(g[m]!.labelled_answer_precision)} of the time;
              wrongly suggests an article for {g[m]!.unlabelled_queries_wrongly_answered} of {g[m]!.unlabelled_queries} tickets that have none.</li>))}
        </ul>
      </div>
      <ul className="list-disc space-y-1 pl-5 text-xs text-muted">{r.caveats.map((c) => <li key={c}>{c}</li>)}</ul>
    </section>
  );
}
