export const STATUSES = ["new", "open", "pending", "resolved", "closed"] as const;
export const PRIORITIES = ["critical", "high", "medium", "low"] as const;

export const fmtDate = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

export function fmtHours(h: number | null) {
  if (h === null) return "No data";
  return h < 48 ? `${h.toFixed(1)} h` : `${(h / 24).toFixed(1)} days`;
}
export const label = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export const METHOD_LABEL = { lexical: "Keyword (TF-IDF)", semantic: "Semantic (embeddings)", hybrid: "Hybrid" } as const;
export const SOURCE_LABEL: Record<string, string> = { original_sample: "Original sample content", public_link: "Public link", internal: "Internal" };
