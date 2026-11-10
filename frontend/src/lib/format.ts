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

/** "3 h ago", "2 days ago"; falls back to the date for anything older than 30 days. */
export function fmtRelative(iso: string, now: number = Date.now()) {
  const s = Math.round((now - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} h ago`;
  const d = Math.round(h / 24);
  if (d <= 30) return `${d} days ago`;
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join("");
