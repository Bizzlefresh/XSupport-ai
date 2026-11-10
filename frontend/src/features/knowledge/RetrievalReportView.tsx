import { Search } from "lucide-react";

import { ScrollBox, SectionCard, tbl } from "@/components/ui/primitives";
import { METHOD_LABEL } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Method, RankMetrics, RetrievalReport } from "@/types/api";

const METHODS: Method[] = ["lexical", "semantic", "hybrid"];
const f = (n: number) => n.toFixed(3);
const pct = (n: number | null) => (n === null ? "n/a" : `${(n * 100).toFixed(1)}%`);

function Table({ caption, data }: { caption: string; data: Record<Method, RankMetrics> }) {
  const cols: [string, (m: RankMetrics) => string][] = [
    ["Precision@1", (m) => f(m.precision_at_1)], ["Precision@3", (m) => f(m.precision_at_3)], ["Recall@3", (m) => f(m.recall_at_3)],
    ["Recall@5", (m) => f(m.recall_at_5)], ["MRR", (m) => f(m.mrr)], ["MRR 95% CI", (m) => `${m.mrr_ci95[0]} to ${m.mrr_ci95[1]}`], ["nDCG@5", (m) => f(m.ndcg_at_5)],
  ];
  return (
    <div>
      <p className="mb-2 text-xs text-muted">{caption}</p>
      <ScrollBox label={caption}>
        <table className={tbl.table}>
          <caption className="sr-only">{caption}</caption>
          <thead className={tbl.thead}><tr><th scope="col" className={tbl.th}>Method</th>
            {cols.map(([h]) => <th key={h} scope="col" className={tbl.thNum}>{h}</th>)}</tr></thead>
          <tbody>{METHODS.map((m) => (
            <tr key={m} className={tbl.tr}><td className={cn(tbl.td, "whitespace-nowrap font-medium")}>{METHOD_LABEL[m]}</td>
              {cols.map(([h, fn]) => <td key={h} className={cn(tbl.tdNum, h === "MRR 95% CI" && "whitespace-nowrap text-muted")}>{fn(data[m])}</td>)}</tr>))}</tbody>
        </table>
      </ScrollBox>
    </div>
  );
}

export function RetrievalReportView({ r }: { r: RetrievalReport }) {
  const g = r.article_threshold_on_test;
  return (
    <SectionCard id="retr" title="Retrieval: similar incidents and articles" icon={Search}
      note={<ul className="list-disc space-y-1 pl-4">{r.caveats.map((c) => <li key={c}>{c}</li>)}</ul>}>
      <p className="text-sm text-muted">
        Semantic method uses <b className="text-ink">{r.embedding.used}</b>.
        {r.embedding.fallback_reason && <> The pretrained sentence-embedding model could not be loaded when this report was made, so a local latent-semantic model was used instead.</>}
        {" "}Keyword search (TF-IDF) is the baseline.
      </p>
      <div className="mt-5 space-y-6">
        <Table caption={`Similar incidents: ${r.protocol.ticket_queries} against ${r.protocol.ticket_corpus}. A result counts only if it comes from the same scenario.`} data={r.similar_incidents} />
        <p className="text-xs text-muted">
          Top result in the correct <i>category</i>: {METHODS.map((m) => `${METHOD_LABEL[m]} ${pct(r.similar_incident_top1_same_category[m])}`).join(" · ")}.
          The differences between methods are within the confidence intervals, so no method is shown to be better.
        </p>
        <Table caption={`Articles: ${r.protocol.article_queries} against ${r.protocol.article_corpus}. Labels were assigned by the project author.`} data={r.articles} />
        <div>
          <h3 className="text-sm font-semibold">Weak-match threshold for articles</h3>
          <p className="mt-1 text-xs text-muted">Chosen on validation data so that at least 80% of shown articles are right, counting articles shown for tickets with no matching article as wrong. Applied once to test data:</p>
          <ul className="mt-3 grid gap-3 md:grid-cols-3">
            {METHODS.map((m) => g[m] && (
              <li key={m} className="rounded-md border border-line bg-paper p-3 text-sm">
                <p className="font-medium">{METHOD_LABEL[m]}</p>
                <p className="mt-1 text-xs text-muted">Threshold {g[m]!.threshold}</p>
                <p className="mt-2 text-xs">Answers <b>{pct(g[m]!.labelled_coverage)}</b> of tickets that have an article; correct <b>{pct(g[m]!.labelled_answer_precision)}</b> of the time.</p>
                <p className="mt-1 text-xs">Wrongly suggests an article for <b>{g[m]!.unlabelled_queries_wrongly_answered}</b> of {g[m]!.unlabelled_queries} tickets that have none.</p>
              </li>))}
          </ul>
        </div>
      </div>
    </SectionCard>
  );
}
