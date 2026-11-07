"use client";

import { useQuery } from "@tanstack/react-query";

import { AssistantReportView } from "@/features/ai/AssistantReportView";
import { IncidentReportView } from "@/features/ai/IncidentReportView";
import { RetrievalReportView } from "@/features/knowledge/RetrievalReportView";
import { api } from "@/lib/api";
import type { ClassificationReport, EvaluationSummary, ModelReport } from "@/types/api";

const f3 = (n: number) => n.toFixed(3);
const pct = (n: number | null) => (n === null ? "No data" : `${(n * 100).toFixed(1)}%`);
const NAMES: Record<string, string> = {
  majority_baseline: "Majority class (floor)",
  tfidf_logreg: "TF-IDF + logistic regression",
  tfidf_svm: "TF-IDF + linear SVM",
};

function Card({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="rounded-lg border border-line bg-panel p-5">
      <h2 id={id} className="mb-3 text-sm font-medium">{title}</h2>
      {children}
    </section>
  );
}

function Confusion({ m }: { m: ModelReport["test"]["confusion_matrix"] }) {
  const short = (s: string) => s.split(" ")[0];
  return (
    <div className="overflow-x-auto">
      <table className="text-xs">
        <caption className="sr-only">Confusion matrix on the test set: rows are true categories, columns are predicted categories.</caption>
        <thead>
          <tr><th className="p-1 text-left font-normal text-muted">True ↓ / Predicted →</th>
            {m.labels.map((l) => <th key={l} scope="col" className="p-1 font-normal text-muted" title={l}>{short(l)}</th>)}</tr>
        </thead>
        <tbody>
          {m.matrix.map((row, i) => {
            const total = row.reduce((a, b) => a + b, 0) || 1;
            return (
              <tr key={m.labels[i]}>
                <th scope="row" className="whitespace-nowrap p-1 text-left font-normal" title={m.labels[i]}>{m.labels[i]}</th>
                {row.map((v, j) => (
                  <td key={j} className="h-9 w-12 border border-line text-center tabular-nums"
                      style={{ backgroundColor: `rgb(var(--brand) / ${v === 0 ? 0 : 0.12 + 0.6 * (v / total)})` }}>
                    {v || ""}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="mt-2 text-xs text-muted">Correct predictions are on the diagonal. Shading shows each row&apos;s share.</p>
    </div>
  );
}

function ReportView({ r }: { r: ClassificationReport }) {
  const deployed = r.models[r.deployed.name];
  const boot = r.test_uncertainty_bootstrap;
  const diff = boot.paired_accuracy_difference as { models: string; mean: number; "95ci": [number, number]; interpretation: string } | undefined;
  const ci = (k: string) => (boot[k] as { accuracy_95ci: [number, number] } | undefined)?.accuracy_95ci;
  const t = deployed.threshold_test;
  return (
    <div className="space-y-6">
      <p role="note" className="rounded-lg border border-ai p-4 text-sm text-ai">{r.disclaimer} The data is invented, so these figures
        describe this experiment, not how the system would perform on real StFX tickets.</p>

      <Card id="setup" title="Experiment setup">
        <dl className="grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
          <div><dt className="text-xs text-muted">Primary split (new wording of known problems)</dt>
            <dd>{r.dataset.sizes.train} train / {r.dataset.sizes.validation} validation / {r.dataset.sizes.test} test</dd></div>
          <div><dt className="text-xs text-muted">Stress split (unseen problem types)</dt>
            <dd>{r.dataset.sizes_stress.train} / {r.dataset.sizes_stress.validation} / {r.dataset.sizes_stress.test}</dd></div>
          <div><dt className="text-xs text-muted">Deployed model</dt><dd>{NAMES[r.deployed.name]} · {r.deployed.version}</dd></div>
          <div><dt className="text-xs text-muted">Dataset checksum</dt><dd className="font-mono text-xs">{r.dataset.sha256.slice(0, 16)}…</dd></div>
        </dl>
        <p className="mt-3 text-xs text-muted">{r.protocol}</p>
      </Card>

      <Card id="cmp" title="Model comparison (test set)">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-line text-muted"><tr>
              {["Model", "Val. macro-F1", "Accuracy", "Accuracy 95% CI", "Macro precision", "Macro recall", "Macro F1", "Unseen problems: acc. / F1"].map((h) =>
                <th key={h} className="whitespace-nowrap px-3 py-2 font-normal">{h}</th>)}</tr></thead>
            <tbody>
              {Object.entries(r.models).map(([k, m]) => {
                const c = ci(k);
                return (
                  <tr key={k} className="border-b border-line last:border-0">
                    <td className="whitespace-nowrap px-3 py-2 font-medium">{NAMES[k]}{k === r.deployed.name && " (deployed)"}</td>
                    <td className="px-3 py-2 tabular-nums">{f3(m.validation.macro_f1)}</td>
                    <td className="px-3 py-2 tabular-nums">{f3(m.test.accuracy)}</td>
                    <td className="whitespace-nowrap px-3 py-2 tabular-nums text-muted">{c ? `${f3(c[0])} to ${f3(c[1])}` : ""}</td>
                    <td className="px-3 py-2 tabular-nums">{f3(m.test.macro_precision)}</td>
                    <td className="px-3 py-2 tabular-nums">{f3(m.test.macro_recall)}</td>
                    <td className="px-3 py-2 tabular-nums">{f3(m.test.macro_f1)}</td>
                    <td className="whitespace-nowrap px-3 py-2 tabular-nums">{f3(m.stress_novel_problem_types_test.accuracy)} / {f3(m.stress_novel_problem_types_test.macro_f1)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {diff && (
          <p className="mt-3 text-sm text-muted">Logistic regression vs SVM accuracy difference: {diff.mean >= 0 ? "+" : ""}{f3(diff.mean)}
            {" "}(95% interval {f3(diff["95ci"][0])} to {f3(diff["95ci"][1])}). {diff.interpretation}.</p>
        )}
        <p className="mt-2 text-xs text-muted">The deployed model was chosen on validation macro-F1 only. The test set was scored once afterwards. Test sets are small, so read the intervals, not just the point values.</p>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card id="cat" title="Per-category results (deployed model, test)">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-line text-muted"><tr>
              {["Category", "Prec.", "Recall", "F1", "n"].map((h) => <th key={h} className="px-2 py-2 font-normal">{h}</th>)}</tr></thead>
            <tbody>
              {Object.entries(deployed.test.per_category).map(([k, v]) => (
                <tr key={k} className="border-b border-line last:border-0">
                  <td className="px-2 py-2">{k}</td><td className="px-2 tabular-nums">{f3(v.precision)}</td>
                  <td className="px-2 tabular-nums">{f3(v.recall)}</td><td className="px-2 tabular-nums">{f3(v.f1)}</td>
                  <td className="px-2 tabular-nums text-muted">{v.support}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        <Card id="cm" title="Confusion matrix (deployed model, test)"><Confusion m={deployed.test.confusion_matrix} /></Card>
      </div>

      <Card id="conf" title="Confidence and manual-review threshold">
        <p className="text-sm">With the threshold at <b>{pct(t.threshold)}</b>, {pct(t.coverage)} of test tickets get a confident suggestion, and those
          are right {pct(t.accuracy_when_confident)} of the time. The other {t.sent_to_manual_review} tickets are flagged for manual
          classification, which catches {t.errors_caught_by_threshold} of the model&apos;s {t.total_errors} errors.</p>
        <p className="mt-1 text-xs text-muted">{r.deployed.threshold_rule}. Chosen on validation data.</p>
        <p className="mt-4 text-sm">Calibration error (ECE): <b className="tabular-nums">{f3(deployed.calibration_test.ece)}</b>. Lower is better; 0 means confidence matches accuracy.</p>
        <table className="mt-2 w-full max-w-lg text-left text-sm">
          <thead className="border-b border-line text-muted"><tr>{["Confidence range", "Tickets", "Mean confidence", "Actual accuracy"].map((h) =>
            <th key={h} className="px-2 py-2 font-normal">{h}</th>)}</tr></thead>
          <tbody>{deployed.calibration_test.bins.map((b) => (
            <tr key={b.range} className="border-b border-line last:border-0"><td className="px-2 py-1.5">{b.range}</td>
              <td className="px-2 tabular-nums">{b.n}</td><td className="px-2 tabular-nums">{pct(b.mean_confidence)}</td>
              <td className="px-2 tabular-nums">{pct(b.accuracy)}</td></tr>))}</tbody>
        </table>
      </Card>

      <Card id="err" title={`Errors on the test set (${r.deployed_test_errors.length})`}>
        <ul className="divide-y divide-line text-sm">
          {r.deployed_test_errors.slice(0, 12).map((e) => (
            <li key={e.id} className="py-2">
              <p><span className="text-muted">True:</span> {e.true} <span className="text-muted">Predicted:</span> {e.predicted}
                {" "}<span className="tabular-nums text-muted">({pct(e.confidence)})</span></p>
              <p className="text-xs text-muted">{e.text}</p>
            </li>
          ))}
        </ul>
        {r.deployed_test_errors.length > 12 && <p className="mt-2 text-xs text-muted">First 12 shown. The full list is in the report file.</p>}
      </Card>

      <Card id="lim" title="Limitations">
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted">{r.limitations.map((l) => <li key={l}>{l}</li>)}</ul>
        <p className="mt-3 text-xs text-muted">Prediction latency on the build machine: mean {r.latency.mean_ms} ms, 95th percentile {r.latency.p95_ms} ms (varies by machine).</p>
      </Card>
    </div>
  );
}

export default function EvaluationPage() {
  const q = useQuery({ queryKey: ["evaluation"], queryFn: () => api<EvaluationSummary>("/evaluation/summary") });
  const s = q.data?.review_stats;
  return (
    <div className="max-w-6xl space-y-6">
      <div><h1 className="text-2xl font-semibold">AI evaluation</h1>
        <p className="mt-1 text-sm text-muted">Offline benchmarks of the category classifier and knowledge retrieval, and what technicians actually did with its suggestions.</p></div>

      {q.isLoading && <p className="text-sm text-muted">Loading…</p>}
      {q.isError && <p role="alert" className="text-sm text-danger">{(q.error as Error).message}</p>}

      {s && (
        <Card id="rev" title="Technician review (live)">
          {s.predictions === 0 ? (
            <p className="text-sm text-muted">No suggestions have been requested yet. Open a ticket and choose Suggest category.</p>
          ) : (
            <>
              <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-6">
                {[["Suggestions", s.predictions], ["Reviewed", s.reviewed], ["Pending", s.pending_review], ["Flagged low confidence", s.flagged_for_manual_review],
                  ["Accepted", s.accepted], ["Edited", s.edited], ["Rejected", s.rejected]].map(([k, v]) => (
                  <div key={k as string}><dt className="text-xs text-muted">{k}</dt><dd className="text-xl font-semibold tabular-nums">{v}</dd></div>
                ))}
              </dl>
              <p className="mt-4 text-sm">Acceptance {pct(s.acceptance_rate)} · correction {pct(s.correction_rate)} · rejection {pct(s.rejection_rate)}
                {" "}(of {s.reviewed} reviewed). Mean prediction time {s.mean_latency_ms ?? "n/a"} ms.</p>
              <p className="mt-1 text-xs text-muted">Rates count reviewed suggestions only. Small counts are not evidence of real-world usefulness.</p>
            </>
          )}
        </Card>
      )}

      {q.data?.retrieval_report && <RetrievalReportView r={q.data.retrieval_report} />}
      {q.data?.incident_report && <IncidentReportView r={q.data.incident_report} />}
      {q.data && <AssistantReportView r={q.data.assistant_report} live={q.data.assistant_stats} />}

      {q.data && (q.data.classification_report ? <ReportView r={q.data.classification_report} /> :
        <p className="text-sm text-muted">No evaluation report found. Run <code>python ../scripts/train_classifier.py</code> from the backend folder.</p>)}
    </div>
  );
}
