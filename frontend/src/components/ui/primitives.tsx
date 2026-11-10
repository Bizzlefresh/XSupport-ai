import { AlertTriangle, Inbox, type LucideIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function Card({ className, children, ...rest }: React.HTMLAttributes<HTMLElement>) {
  return <section className={cn("rounded-lg border border-line bg-panel p-5 shadow-sm", className)} {...rest}>{children}</section>;
}

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("skeleton h-4 w-full", className)} />;
}

export function EmptyState({ title, description, icon: Icon = Inbox, action }: {
  title: string; description?: string; icon?: LucideIcon; action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center px-4 py-10 text-center">
      <span className="mb-3 rounded-full bg-line/50 p-3 text-muted"><Icon aria-hidden className="h-6 w-6" /></span>
      <p className="text-sm font-medium">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-muted">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center px-4 py-8 text-center">
      <span className="mb-3 rounded-full bg-danger/10 p-3 text-danger"><AlertTriangle aria-hidden className="h-6 w-6" /></span>
      <p className="text-sm font-medium">Something went wrong</p>
      <p className="mt-1 max-w-sm break-words text-sm text-muted">{message}</p>
      {onRetry && <Button variant="secondary" className="mt-4" onClick={onRetry}>Try again</Button>}
    </div>
  );
}

export function StatCard({ label, value, hint, icon: Icon, href, loading, tone = "brand" }: {
  label: string; value: ReactNode; hint?: string; icon: LucideIcon; href?: string; loading?: boolean;
  tone?: "brand" | "ok" | "warn" | "danger" | "info";
}) {
  const toneCls = { brand: "bg-brand/10 text-brand", ok: "bg-ok/10 text-ok", warn: "bg-warn/10 text-warn", danger: "bg-danger/10 text-danger", info: "bg-info/10 text-info" }[tone];
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm text-muted">{label}</p>
        <span className={cn("shrink-0 rounded-md p-2", toneCls)}><Icon aria-hidden className="h-4 w-4" /></span>
      </div>
      {loading ? <Skeleton className="mt-3 h-8 w-20" /> : <p className="tabular mt-2 text-3xl font-semibold tracking-tight">{value}</p>}
      {/* Hint row always reserves a line so every card in a grid row ends at the same height. */}
      <p className="mt-auto min-h-[1rem] pt-1 text-xs leading-4 text-muted">{!loading && hint ? hint : "\u00a0"}</p>
    </>
  );
  // h-full + flex-col: cards stretch to the tallest card in their grid row.
  const cls = "flex h-full flex-col rounded-lg border border-line bg-panel p-4 shadow-sm transition-[box-shadow,transform,border-color] duration-fast ease-app";
  return href
    ? <Link href={href} className={cn(cls, "hover:-translate-y-0.5 hover:border-brand/40 hover:shadow-md focus-visible:border-brand")}>{body}</Link>
    : <div className={cls}>{body}</div>;
}

/** Titled card with an optional icon, header actions and a footer note. */
export function SectionCard({ id, title, icon: Icon, actions, note, children, className, bodyClassName }: {
  id: string; title: string; icon?: LucideIcon; actions?: ReactNode; note?: ReactNode; children: ReactNode;
  className?: string; bodyClassName?: string;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className={cn("flex min-w-0 scroll-mt-20 flex-col rounded-lg border border-line bg-panel shadow-sm", className)}>
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3">
        <h2 id={`${id}-h`} className="flex items-center gap-2 text-sm font-semibold">
          {Icon && <Icon aria-hidden className="h-4 w-4 text-muted" />}{title}
        </h2>
        {actions}
      </header>
      <div className={cn("flex-1 p-5", bodyClassName)}>{children}</div>
      {note && <div className="border-t border-line px-5 py-2.5 text-xs text-muted">{note}</div>}
    </section>
  );
}

/** Shared table styles: recessive header, row dividers, numbers right-aligned with tabular figures. */
export const tbl = {
  // relative: keeps absolutely positioned descendants (e.g. sr-only labels) inside the scroll box, so they cannot widen the page.
  wrap: "relative -mx-5 overflow-x-auto",
  table: "w-full text-left text-sm",
  thead: "border-b border-line text-xs text-muted",
  th: "whitespace-nowrap px-5 py-2 font-medium first:pl-5",
  thNum: "whitespace-nowrap px-5 py-2 text-right font-medium",
  tr: "border-b border-line last:border-0",
  td: "px-5 py-2.5",
  tdNum: "tabular whitespace-nowrap px-5 py-2.5 text-right",
};

/** Inline proportional bar for a table cell (the number is always printed beside it). */
export function InlineBar({ value, max, className }: { value: number; max: number; className?: string }) {
  return (
    <span aria-hidden className="block h-1.5 w-full min-w-12 overflow-hidden rounded-full bg-line/60">
      <span className={cn("block h-full rounded-full bg-brand", className)} style={{ width: `${max > 0 ? Math.max(2, (value / max) * 100) : 0}%` }} />
    </span>
  );
}
