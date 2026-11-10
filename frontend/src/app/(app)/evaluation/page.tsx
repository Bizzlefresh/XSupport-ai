"use client";

import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Bot, Gauge, Grid3x3, ListChecks, ScrollText, Tags, Users, XCircle } from "lucide-react";

import { EmptyState, ErrorState, InlineBar, PageHeader, SectionCard, Skeleton, tbl } from "@/components/ui/primitives";
import { AssistantReportView } from "@/features/ai/AssistantReportView";
import { IncidentReportView } from "@/features/ai/IncidentReportView";
import { RetrievalReportView } from "@/features/knowledge/RetrievalReportView";
import { api } from "@/lib/api";
import { heat } from "@/lib/chart";
import { cn } from "@/lib/utils";
import type { ClassificationReport, EvaluationSummary, ModelReport } from "@/types/api";

const f3 = (n: number) => n.toFixed(3);
const pct = (n: number | null) => (n === null ? "No data" : `${(n * 100).toFixed(1)}%`);
const NAMES: Record<string, string> = {
  majority_baseline: "Majority class (floor)",
  tfidf_logreg: "TF-IDF + logistic regression",
  tfidf_svm: "TF-IDF + linear SVM",
};
const SECTIONS = [["rev", "Live review"], ["classifier", "Category classifier"], ["retr", "Retrieval"], ["asst", "Troubleshooting"], ["incd", "Incident bursts"]] as const;

function Metric({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-md border border-line bg-paper px-4 py-3">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="tabular mt-1 text-2xl font-semibold tracking-tight">{value}</dd>
      {sub && <dd className="mt-0.5 text-xs text-muted">{sub}</dd>}
    </div>
  );
}

function Confusion({ m }: { m: ModelReport["test"]["confusion_matrix"] }) {
  const short = (s: string) => s.split(" ")[0];
  return (
    <div className="relative -mx-5 overflow-x-auto px-5">
      <table className="border-separate border-spacing-0.5 text-xs">
        <caption className="sr-only">Confusion matrix on the test set: rows are true categories, columns are predicted categories.</caption>
        <thead>
          <tr><th className="p-1 text-left font-normal text-muted">True ↓ / Predicted →</th>
            {m.labels.map((l) => <th key={l} scope="col" className="w-11 p-1 font-normal text-muted" title={l}>{short(l)}</th>)}</tr>
        </thead>
        <tbody>
          {m.matrix.map((row, i) => {
            const total = row.reduce((a, b) => a + b, 0) || 1;
            return (
              <tr key={m.labels[i]}>
                <th scope="row" className="whitespace-nowrap p-1 pr-2 text-left font-normal" title={m.labels[i]}>{m.labels[i]}</th>
                {row.map((v, j) => {
                  const h = heat(v, total);
                  return (
                    <td key={j} title={`True ${m.labels[i]}, predicted ${m.labels[j]}: ${v}`}
                      className={cn("tabular h-9 w-11 rounded text-center", i === j && "ring-1 ring-inset ring-ink/30", h.strong ? "font-medium text-on-brand" : "text-ink")}
                      style={{ background: h.background }}>
                      {v || ""}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="mt-3 text-xs text-muted">Correct predictions are on the outlined diagonal. Shading shows each row&apos;s share; every count is printed.</p>
    </div>
  );
}

function ClassifierReport({ r }: { r: ClassificationReport }) {
  const deployed = r.models[r.deployed.name];
  const boot = r.test_uncertainty_bootstrap;
  const diff = boot.paired_accuracy_difference as { models: string; mean: number; "95ci": [number, number]; interpretation: string } | undefined;
  const ci = (k: string) => (boot[k] as { accuracy_95ci: [number, number] } | undefined)?.accuracy_95ci;
  const t = deployed.threshold_test;
  const dci = ci(r.deployed.name);
  const perCat = Object.entries(deployed.test.per_category);

  return (
    <div id="classifier" className="scroll-mt-20 space-y-6">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight"><Tags aria-hidden className="h-5 w-5 text-muted" />Category classifier</h2>
        <p className="mt-1 text-sm text-muted">Deployed: {NAMES[r.deployed.name] ?? r.deployed.name} · {r.deployed.version}. Test set scored once, after the model was chosen on validation data.</p>
      </div>

      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric label="Test accuracy (deployed)" value={f3(deployed.test.accuracy)} sub={dci ? `95% CI ${f3(dci[0])} to ${f3(dci[1])} · n=${deployed.test.n}` : `n=${deployed.test.n}`} />
        <Metric label="Macro-F1 (deployed)" value={f3(deployed.test.macro_f1)} sub="Averages all categories equally" />
        <Metric label="Unseen problem types" value={f3(deployed.stress_novel_problem_types_test.accuracy)} sub={`Accuracy on the stress split · n=${deployed.stress_novel_problem_types_test.n}`} />
        <Metric label="Calibration error (ECE)" value={f3(deployed.calibration_test.ece)} sub="0 = confidence matches accuracy" />
      </dl>

      <SectionCard id="setup" title="Experiment setup" icon={ScrollText}>
        <dl className="grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
          <div><dt className="text-xs text-muted">Primary split (new wording of known problems)</dt>
            <dd className="tabular">{r.dataset.sizes.train} train / {r.dataset.sizes.validation} validation / {r.dataset.sizes.test} test</dd></div>
          <div><dt className="text-xs text-muted">Stress split (unseen problem types)</dt>
            <dd className="tabular">{r.dataset.sizes_stress.train} / {r.dataset.sizes_stress.validation} / {r.dataset.sizes_stress.test}</dd></div>
          <div><dt className="text-xs text-muted">Generator seed</dt><dd className="tabular">{r.dataset.generator_seed}</dd></div>
          <div><dt className="text-xs text-muted">Dataset checksum (SHA-256)</dt><dd className="font-mono text-xs">{r.dataset.sha256.slice(0, 16)}…</dd></div>
        </dl>
        <p className="mt-4 text-xs text-muted">{r.protocol}</p>
      </SectionCard>

      <SectionCard id="cmp" title="Model comparison (test set)" icon={ListChecks}
        note="The deployed model was chosen on validation macro-F1 only. Test sets are small, so read the intervals, not just the point values.">
        <div className={tbl.wrap}>
          <table className={tbl.table}>
            <caption className="sr-only">Model comparison on the test set</caption>
            <thead className={tbl.thead}><tr>
              <th scope="col" className={tbl.th}>Model</th>
              {["Val. macro-F1", "Accuracy", "Accuracy 95% CI", "Macro precision", "Macro recall", "Macro F1", "Unseen: acc. / F1"].map((h) =>
                <th key={h} scope="col" className={tbl.thNum}>{h}</th>)}
            </tr></thead>
            <tbody>
              {Object.entries(r.models).map(([k, m]) => {
                const c = ci(k);
                const isDeployed = k === r.deployed.name;
                return (
                  <tr key={k} className={cn(tbl.tr, isDeployed && "bg-brand/5")}>
                    <td className={cn(tbl.td, "whitespace-nowrap font-medium")}>
                      {NAMES[k] ?? k}{isDeployed && <span className="ml-2 rounded-full border border-brand/40 px-1.5 py-0.5 text-[10px] font-medium text-brand">deployed</span>}
                    </td>
                    <td className={tbl.tdNum}>{f3(m.validation.macro_f1)}</td>
                    <td className={tbl.tdNum}>{f3(m.test.accuracy)}</td>
                    <td className={cn(tbl.tdNum, "whitespace-nowrap text-muted")}>{c ? `${f3(c[0])} to ${f3(c[1])}` : "–"}</td>
                    <td className={tbl.tdNum}>{f3(m.test.macro_precision)}</td>
                    <td className={tbl.tdNum}>{f3(m.test.macro_recall)}</td>
                    <td className={tbl.tdNum}>{f3(m.test.macro_f1)}</td>
                    <td className={cn(tbl.tdNum, "whitespace-nowrap")}>{f3(m.stress_novel_problem_types_test.accuracy)} / {f3(m.stress_novel_problem_types_test.macro_f1)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {diff && (
          <p className="mt-4 text-sm">
            Logistic regression vs SVM accuracy difference: <b className="tabular">{diff.mean >= 0 ? "+" : ""}{f3(diff.mean)}</b>{" "}
            <span className="text-muted">(95% interval {f3(diff["95ci"][0])} to {f3(diff["95ci"][1])}). {diff.interpretation}.</span>
          </p>
        )}
      </SectionCard>

      <div className="grid items-start gap-6 2xl:grid-cols-2">
        <SectionCard id="percat" title="Per-category results (deployed, test)" icon={Tags}>
          <div className={tbl.wrap}>
            <table className={tbl.table}>
              <caption className="sr-only">Per-category precision, recall and F1</caption>
              <thead className={tbl.thead}><tr>
                <th scope="col" className={tbl.th}>Category</th><th scope="col" className={tbl.thNum}>Prec.</th><th scope="col" className={tbl.thNum}>Recall</th>
                <th scope="col" className={tbl.thNum}>F1</th><th scope="col" className={cn(tbl.th, "hidden w-24 sm:table-cell")}><span className="sr-only">F1 as a bar</span></th>
                <th scope="col" className={tbl.thNum}>n</th>
              </tr></thead>
              <tbody>
                {perCat.map(([k, v]) => (
                  <tr key={k} className={tbl.tr}>
                    <td className={tbl.td}>{k}</td><td className={tbl.tdNum}>{f3(v.precision)}</td><td className={tbl.tdNum}>{f3(v.recall)}</td>
                    <td className={cn(tbl.tdNum, "font-medium")}>{f3(v.f1)}</td>
                    <td className={cn(tbl.td, "hidden sm:table-cell")}><InlineBar value={v.f1} max={1} /></td>
                    <td className={cn(tbl.tdNum, "text-muted")}>{v.support}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
        <SectionCard id="cm" title="Confusion matrix (deployed, test)" icon={Grid3x3}><Confusion m={deployed.test.confusion_matrix} /></SectionCard>
      </div>

      <SectionCard id="conf" title="Confidence and the manual-review threshold" icon={Gauge}
        note={`${r.deployed.threshold_rule}. Chosen on validation data.`}>
        <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Metric label="Threshold" value={pct(t.threshold)} />
          <Metric label="Get a confident suggestion" value={pct(t.coverage)} sub="Share of test tickets" />
          <Metric label="Right when confident" value={pct(t.accuracy_when_confident)} />
          <Metric label="Errors caught by the threshold" value={`${t.errors_caught_by_threshold} / ${t.total_errors}`} sub={`${t.sent_to_manual_review} sent to manual review`} />
        </dl>
        <h3 className="mt-6 text-xs font-medium uppercase tracking-wide text-muted">Calibration by confidence range</h3>
        <div className={cn(tbl.wrap, "mt-2")}>
          <table className={tbl.table}>
            <caption className="sr-only">Calibration: mean confidence versus actual accuracy per confidence range</caption>
            <thead className={tbl.thead}><tr>
              <th scope="col" className={tbl.th}>Confidence range</th><th scope="col" className={tbl.thNum}>Tickets</th>
              <th scope="col" className={tbl.thNum}>Mean confidence</th><th scope="col" className={tbl.thNum}>Actual accuracy</th>
              <th scope="col" className={cn(tbl.th, "hidden w-40 md:table-cell")}><span className="sr-only">Accuracy as a bar, confidence marked</span></th>
            </tr></thead>
            <tbody>{deployed.calibration_test.bins.map((b) => (
              <tr key={b.range} className={tbl.tr}>
                <td className={tbl.td}>{b.range}</td><td className={tbl.tdNum}>{b.n}</td>
                <td className={tbl.tdNum}>{pct(b.mean_confidence)}</td><td className={cn(tbl.tdNum, "font-medium")}>{pct(b.accuracy)}</td>
                <td className={cn(tbl.td, "hidden md:table-cell")}>
                  <span aria-hidden className="relative block h-1.5 rounded-full bg-line/60">
                    <span className="block h-full rounded-full bg-brand" style={{ width: `${b.accuracy * 100}%` }} />
                    <span className="absolute -top-1 h-3.5 w-0.5 rounded bg-ink/70" style={{ left: `${b.mean_confidence * 100}%` }} />
                  </span>
                </td>
              </tr>))}</tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-muted">Bar: actual accuracy. Marker: mean confidence. A marker right of the bar end means the model was over-confident in that range.</p>
      </SectionCard>

      <SectionCard id="err" title={`Errors on the test set (${r.deployed_test_errors.length})`} icon={XCircle}
        note={r.deployed_test_errors.length > 12 ? "First 12 shown. The full list is in the report file." : undefined}>
        <ul className="grid gap-3 md:grid-cols-2">
          {r.deployed_test_errors.slice(0, 12).map((e) => (
            <li key={e.id} className="rounded-md border border-line bg-paper p-3 text-sm">
              <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                <span><span className="text-muted">True</span> <b>{e.true}</b></span>
                <span className="text-muted">→</span>
                <span><span className="text-muted">Predicted</span> <b className="text-danger">{e.predicted}</b></span>
                <span className="tabular ml-auto text-muted">{pct(e.confidence)}</span>
              </p>
              <p className="mt-1.5 line-clamp-3 text-xs text-ink/80">{e.text}</p>
            </li>
          ))}
        </ul>
      </SectionCard>

      <SectionCard id="lim" title="Limitations" icon={AlertTriangle}
        note={`Prediction latency on the build machine: mean ${r.latency.mean_ms} ms, 95th percentile ${r.latency.p95_ms} ms (varies by machine).`}>
        <ul className="list-disc space-y-1.5 pl-5 text-sm">{r.limitations.map((l) => <li key={l}>{l}</li>)}</ul>
      </SectionCard>
    </div>
  );
}

export default function EvaluationPage() {
  const q = useQuery({ queryKey: ["evaluation"], queryFn: () => api<EvaluationSummary>("/evaluation/summary") });
  const s = q.data?.review_stats;
  const disclaimer = q.data?.classification_report?.disclaimer;

  return (
    <div>
      <PageHeader title="AI evaluation"
        description="Offline benchmarks of the classifier, retrieval and troubleshooting assistant, plus what technicians actually did with suggestions." />

      <div role="note" className="mb-6 flex gap-3 rounded-lg border border-ai/40 bg-ai/5 p-4 text-sm">
        <AlertTriangle aria-hidden className="mt-0.5 h-5 w-5 shrink-0 text-ai" />
        <p>{disclaimer ? `${disclaimer} ` : ""}All figures come from <b>synthetic data</b>. They describe this experiment, not how the system would perform on real StFX tickets.</p>
      </div>

      <nav aria-label="On this page" className="mb-6 flex flex-wrap gap-2">
        {SECTIONS.map(([id, text]) => (
          <a key={id} href={`#${id}`} className="rounded-full border border-line bg-panel px-3 py-1 text-xs font-medium text-muted hover:border-brand/40 hover:text-ink">{text}</a>
        ))}
      </nav>

      {q.isLoading ? (
        <div className="space-y-6" aria-busy="true"><Skeleton className="h-36" /><Skeleton className="h-64" /><Skeleton className="h-96" /></div>
      ) : q.isError ? (
        <div className="rounded-lg border border-line bg-panel"><ErrorState message={(q.error as Error).message} onRetry={() => q.refetch()} /></div>
      ) : q.data && (
        <div className="space-y-10">
          {s && (
            <SectionCard id="rev" title="Technician review of category suggestions (live)" icon={Users}
              note="Rates count reviewed suggestions only. Small counts are not evidence of real-world usefulness.">
              {s.predictions === 0 ? (
                <EmptyState icon={Bot} title="No suggestions yet" description="Open a ticket and choose Suggest category." />
              ) : (
                <>
                  <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <Metric label="Suggestions" value={String(s.predictions)} sub={`${s.flagged_for_manual_review} flagged low confidence`} />
                    <Metric label="Reviewed" value={String(s.reviewed)} sub={`${s.pending_review} pending`} />
                    <Metric label="Accepted" value={pct(s.acceptance_rate)} sub={`${s.accepted} of ${s.reviewed}`} />
                    <Metric label="Edited / rejected" value={`${pct(s.correction_rate)} / ${pct(s.rejection_rate)}`} sub={`${s.edited} / ${s.rejected}`} />
                  </dl>
                  <p className="mt-3 text-xs text-muted">Mean prediction time {s.mean_latency_ms ?? "n/a"} ms.</p>
                </>
              )}
            </SectionCard>
          )}

          {q.data.classification_report ? <ClassifierReport r={q.data.classification_report} /> : (
            <div id="classifier" className="rounded-lg border border-line bg-panel">
              <EmptyState icon={Tags} title="No classifier report found" description="Run python ../scripts/train_classifier.py from the backend folder." />
            </div>
          )}
          {q.data.retrieval_report && <RetrievalReportView r={q.data.retrieval_report} />}
          <AssistantReportView r={q.data.assistant_report} live={q.data.assistant_stats} />
          {q.data.incident_report && <IncidentReportView r={q.data.incident_report} />}
        </div>
      )}
    </div>
  );
}
