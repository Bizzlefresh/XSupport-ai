export type Role = "technician" | "admin";

export interface User {
  id: number;
  email: string;
  full_name: string;
  role: Role;
  is_active: boolean;
}

export interface Health {
  status: "ok" | "degraded";
  database: "ok" | "unavailable";
  app: string;
  environment: string;
}

export interface IntegrationStatus {
  synthetic_data: { enabled: boolean; default: boolean };
  teamdynamix: {
    enabled: boolean; read_only: boolean; configured: boolean; note: string; app_id: string | null; include_people: boolean;
    state: "disabled" | "misconfigured" | "ready" | "degraded" | "paused"; reasons: string[]; requests: number; failures: number;
    consecutive_failures: number; last_success_at: string | null; last_failure_at: string | null; last_error_kind: string | null;
  };
  external_llm: { enabled: boolean };
}

export type Priority = "critical" | "high" | "medium" | "low";
export type TicketStatus = "new" | "open" | "pending" | "resolved" | "closed";

export interface Category { id: number; name: string }
export interface Person { id: number; full_name: string }
export interface Activity { id: number; kind: string; detail: string; created_at: string; user: Person | null }

export interface Ticket {
  id: number;
  ticket_number: string;
  source: string;
  external_id: string;
  subject: string;
  description: string;
  category: Category | null;
  priority: Priority;
  status: TicketStatus;
  assignee: Person | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
  resolution_summary: string | null;
}
export interface TicketDetail extends Ticket { activities: Activity[] }
export interface TicketPage { items: Ticket[]; total: number; page: number; page_size: number }

export interface Overview {
  totals: { total: number; open: number; pending: number; resolved: number; high_priority_open: number };
  by_status: Record<string, number>;
  by_priority: Record<string, number>;
  by_category: { name: string; count: number }[];
  trend: { date: string; created: number; resolved: number }[];
  resolution: { average_hours: number | null; tickets_counted: number };
  recent_activity: { ticket_id: number; ticket_number: string; subject: string; kind: string; detail: string; created_at: string; user: string | null }[];
}

export interface Candidate { label: string; category_id: number | null; probability: number }
export interface Review {
  decision: "accepted" | "edited" | "rejected";
  final_category: Category | null;
  reason: string | null;
  user: Person;
  created_at: string;
}
export interface Prediction {
  id: number | null;
  ticket_id: number | null;
  kind: string;
  model_name: string;
  model_version: string;
  predicted: Candidate;
  confidence: number;
  alternatives: Candidate[];
  needs_manual_review: boolean;
  threshold: number;
  latency_ms: number;
  created_at: string | null;
  review: Review | null;
  stored: boolean;
}

export interface Metrics { accuracy: number; macro_precision: number; macro_recall: number; macro_f1: number }
export interface ModelReport {
  params: Record<string, number>;
  validation: Metrics;
  test: Metrics & {
    n: number;
    per_category: Record<string, { precision: number; recall: number; f1: number; support: number }>;
    confusion_matrix: { labels: string[]; matrix: number[][] };
  };
  calibration_test: { ece: number; bins: { range: string; n: number; mean_confidence: number; accuracy: number }[] };
  threshold_test: {
    threshold: number; coverage: number; accuracy_when_confident: number | null;
    sent_to_manual_review: number; errors_caught_by_threshold: number; total_errors: number;
  };
  stress_novel_problem_types_test: Metrics & { n: number };
}
export interface ClassificationReport {
  disclaimer: string;
  protocol: string;
  dataset: { sha256: string; sizes: Record<string, number>; sizes_stress: Record<string, number>; generator_seed: number };
  environment: Record<string, string>;
  deployed: { name: string; version: string; params: Record<string, number>; confidence_threshold: number; threshold_rule: string };
  models: Record<string, ModelReport>;
  test_uncertainty_bootstrap: Record<string, { accuracy_95ci: [number, number]; macro_f1_95ci: [number, number] } | {
    models: string; mean: number; "95ci": [number, number]; interpretation: string }>;
  deployed_test_errors: { id: string; family: string; true: string; predicted: string; confidence: number; text: string }[];
  latency: { mean_ms: number; p95_ms: number; samples: number };
  limitations: string[];
}
export interface ReviewStats {
  predictions: number; flagged_for_manual_review: number; reviewed: number; pending_review: number;
  accepted: number; edited: number; rejected: number;
  acceptance_rate: number | null; correction_rate: number | null; rejection_rate: number | null;
  mean_latency_ms: number | null;
}
export interface EvaluationSummary { classification_report: ClassificationReport | null; retrieval_report: RetrievalReport | null; assistant_report: AssistantReport | null; incident_report: IncidentReport | null; review_stats: ReviewStats; assistant_stats: AssistantStats }

// ---- Phase 4: knowledge base and retrieval
export type ArticleStatus = "draft" | "approved" | "archived";
export interface Article {
  id: number; slug: string; title: string; category: Category | null; problem_description: string;
  steps: string[]; escalation: string | null; tags: string[]; source_type: string; source_note: string;
  source_url: string | null; status: ArticleStatus; updated_at: string; created_at: string; updater: Person | null;
}
export interface ArticlePage { items: Article[]; total: number; page: number; page_size: number }
export type Method = "lexical" | "semantic" | "hybrid";
export interface RetrievalMeta { method: Method; embedder: string; threshold: number | null; note: string | null; latency_ms: number }
export interface SimilarTicket {
  ticket_id: number; external_id: string | null; title: string; score: number; category: string | null;
  status: string; resolution_summary: string | null;
}
export interface ArticleHit {
  article_id: number; title: string; score: number; category: string | null; snippet: string;
  source_type: string; confidence: "strong" | "weak" | "unvalidated";
}
export interface SimilarTicketsOut { meta: RetrievalMeta; results: SimilarTicket[] }
export interface ArticleHitsOut { meta: RetrievalMeta; results: ArticleHit[] }
export interface RankMetrics {
  queries: number; mrr: number; mrr_ci95: [number, number]; hit_at_1_ci95: [number, number];
  precision_at_1: number; precision_at_3: number; precision_at_5: number;
  recall_at_1: number; recall_at_3: number; recall_at_5: number;
  hit_at_1: number; hit_at_3: number; hit_at_5: number; ndcg_at_5: number;
}
export interface GateReport {
  threshold: number; labelled_queries_answered: number; labelled_answer_precision: number | null; labelled_coverage: number;
  unlabelled_queries_wrongly_answered: number; unlabelled_queries: number;
}
export interface RetrievalReport {
  embedding: { used: string; requested: string; fallback_reason: string | null };
  protocol: Record<string, string | number>;
  similar_incidents: Record<Method, RankMetrics>;
  similar_incident_top1_same_category: Record<Method, number>;
  articles: Record<Method, RankMetrics>;
  article_threshold_on_test: Record<Method, GateReport | null>;
  latency_ms_median: { similar_incidents: Record<Method, number>; articles: Record<Method, number> };
  caveats: string[];
}

// ---- Phase 5: troubleshooting assistant
export type Rating = "helpful" | "partly" | "not_helpful";
export interface StepSource {
  article_id: number; title: string; score: number; confidence: "strong" | "weak" | "unvalidated";
  category: string | null; steps: string[]; escalation: string | null; source_type: string;
}
export interface PastResolution { ticket_id: number; external_id: string | null; title: string; score: number; resolution_summary: string }
export interface Suggestion {
  id: number | null; ticket_id: number | null; status: "grounded" | "unvalidated" | "insufficient_evidence" | "no_evidence";
  articles: StepSource[]; past_resolutions: PastResolution[]; questions: string[]; notes: string[];
  assistant_version: string; meta: RetrievalMeta; created_at: string | null; rating: Rating | null; rating_comment: string | null; stored: boolean;
}
export interface AssistantStats {
  suggestions: number; by_status: Record<string, number>; rated: number; by_rating: Record<string, number>; helpful_rate: number | null;
}
export interface AssistantReport {
  assistant_version: string; embedding: string; method: string; article_threshold: number | null;
  protocol: { queries: number; with_matching_article: number; without_matching_article: number; note: string };
  results: {
    safe_outcome_rate: number; safe_outcome_ci95: [number, number]; safe_outcome_definition: string; answered_when_article_exists: number;
    correct_when_answered: number | null; wrongly_declined_when_article_exists: number; declined_when_no_article: number;
    no_article_queries: number; wrongly_answered_when_no_article: number; step_citation_integrity: number;
    past_resolution_from_same_scenario: number | null; queries_with_past_resolutions: number;
  };
  caveats: string[];
}

// ---- Phase 6: analytics
export interface Insights {
  weeks: number; categories: string[]; volume_by_week: ({ week: string } & Record<string, number | string>)[];
  resolution_by_category: { name: string; n: number; median_hours: number | null; mean_hours: number | null }[];
  resolution_by_priority: { name: string; n: number; median_hours: number | null; mean_hours: number | null }[];
  backlog_aging: { bucket: string; count: number }[];
  recurring_issues: { subject: string; count: number; open: number; category: string; median_hours: number | null }[];
  incident_bursts: { rule: string; found: { category: string; start: string; end: string; tickets: number; still_open: number; ticket_ids: number[] }[] };
  data_quality: { resolved_without_timestamp: number; resolved_before_created: number; note: string };
  ai_use: { category_review: ReviewStats; assistant: AssistantStats };
}

export interface IncidentReport {
  rule: string;
  main_dataset: { truth_bursts: number; detected_bursts: number; truth_found: number; false_alarms: number; ticket_recall: number; ticket_precision: number };
  other_seeds: { seeds: string; datasets: number; bursts_present: number; bursts_found: number; false_alarms: number };
  caveats: string[];
}
