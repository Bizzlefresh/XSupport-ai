"use client";

/**
 * Shared building blocks for AI panels. Everything AI-generated uses the amber `ai` token and carries an
 * explicit "AI suggestion" label, so it is never mistaken for technician-approved ticket data.
 * Confidence is always worded as a model estimate, never as a probability of being right.
 */
import { AlertTriangle, ChevronDown, CircleHelp, CircleCheck, Sparkles, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { Skeleton } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";

export const pct = (p: number) => `${Math.round(p * 100)}%`;

export function AiBadge({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border border-ai/40 bg-ai/10 px-2 py-0.5 text-[11px] font-medium text-ai", className)}>
      <Sparkles aria-hidden className="h-3 w-3" />AI suggestion
    </span>
  );
}

export function AiPanel({ id, title, icon: Icon = Sparkles, actions, children, footer }: {
  id: string; title: string; icon?: LucideIcon; actions?: ReactNode; children: ReactNode; footer?: ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="overflow-hidden rounded-lg border border-ai/30 bg-panel shadow-sm">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-ai/20 bg-ai/5 px-4 py-3">
        <h3 id={id} className="flex items-center gap-2 text-sm font-semibold">
          <Icon aria-hidden className="h-4 w-4 text-ai" />{title}
        </h3>
        {actions}
      </header>
      <div className="p-4">{children}</div>
      {footer && <div className="border-t border-line px-4 py-2.5">{footer}</div>}
    </section>
  );
}

/** Collapsible "about this result" block for model names, versions, latency and caveats. */
export function AboutResult({ children, label = "About this result" }: { children: ReactNode; label?: string }) {
  return (
    <details className="group text-xs text-muted">
      <summary className="flex cursor-pointer list-none items-center gap-1 hover:text-ink [&::-webkit-details-marker]:hidden">
        <ChevronDown aria-hidden className="h-3.5 w-3.5 transition-transform group-open:rotate-180" />{label}
      </summary>
      <div className="mt-2 space-y-1">{children}</div>
    </details>
  );
}

/**
 * Model confidence as a bar with the manual-review threshold marked. The value is printed and labelled
 * "estimate", and the low-confidence state is stated in words, so colour is never the only signal.
 */
export function ConfidenceMeter({ value, threshold, label = "Model confidence (estimate)" }: { value: number; threshold?: number; label?: string }) {
  const low = threshold !== undefined && value < threshold;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="text-muted">{label}</span>
        <span className="tabular font-semibold">{pct(value)}</span>
      </div>
      <div className="relative mt-1.5 h-2 rounded-full bg-line/70"
        role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value * 100)}
        aria-label={`${label}: ${pct(value)}${threshold !== undefined ? `, review threshold ${pct(threshold)}` : ""}`}>
        <div className={cn("h-full rounded-full", low ? "bg-ai/50" : "bg-ai")} style={{ width: `${Math.max(2, value * 100)}%` }} />
        {threshold !== undefined && (
          <span aria-hidden className="absolute -top-1 h-4 w-0.5 rounded bg-ink/70" style={{ left: `${threshold * 100}%` }} />
        )}
      </div>
      {threshold !== undefined && (
        <p className="mt-1 text-[11px] text-muted">Marker: review threshold {pct(threshold)}, chosen on validation data.</p>
      )}
    </div>
  );
}

const MATCH: Record<string, { text: string; icon: LucideIcon; cls: string }> = {
  strong: { text: "Strong match", icon: CircleCheck, cls: "border-ok/40 text-ok" },
  weak: { text: "Weak match", icon: AlertTriangle, cls: "border-warn/40 text-warn" },
  unvalidated: { text: "Relevance not validated", icon: CircleHelp, cls: "border-line text-muted" },
};
export function MatchChip({ confidence }: { confidence: string }) {
  const m = MATCH[confidence] ?? MATCH.unvalidated;
  return (
    <span className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-medium", m.cls)}>
      <m.icon aria-hidden className="h-3 w-3" />{m.text}
    </span>
  );
}

export function Callout({ tone = "ai", icon: Icon = AlertTriangle, title, children, role }: {
  tone?: "ai" | "warn" | "info" | "ok"; icon?: LucideIcon; title: string; children?: ReactNode; role?: "status" | "alert";
}) {
  const cls = { ai: "border-ai/40 bg-ai/5 text-ai", warn: "border-warn/40 bg-warn/5 text-warn", info: "border-info/30 bg-info/5 text-info", ok: "border-ok/30 bg-ok/5 text-ok" }[tone];
  return (
    <div role={role} className={cn("flex gap-2.5 rounded-md border px-3 py-2.5", cls)}>
      <Icon aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="min-w-0 text-sm">
        <p className="font-medium">{title}</p>
        {children && <div className="mt-0.5 text-ink/80">{children}</div>}
      </div>
    </div>
  );
}

export function PanelSkeleton({ rows = 3 }: { rows?: number }) {
  return <div className="space-y-2.5" aria-busy="true">{Array.from({ length: rows }, (_, i) => <Skeleton key={i} className="h-8" />)}</div>;
}
