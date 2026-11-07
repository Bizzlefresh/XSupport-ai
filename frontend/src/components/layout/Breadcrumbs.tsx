"use client";

import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { SEGMENT_LABEL } from "@/components/layout/nav";

export function Breadcrumbs() {
  const segs = usePathname().split("/").filter(Boolean);
  const crumbs = segs.map((s, i) => ({
    href: "/" + segs.slice(0, i + 1).join("/"),
    label: SEGMENT_LABEL[s] ?? (/^\d+$/.test(s) ? `#${s}` : s),
  }));
  return (
    <nav aria-label="Breadcrumb" className="min-w-0">
      <ol className="flex items-center gap-1 text-sm">
        {crumbs.map((c, i) => (
          <li key={c.href} className={i < crumbs.length - 1 ? "hidden items-center gap-1 sm:flex" : "flex min-w-0 items-center gap-1"}>
            {i < crumbs.length - 1
              ? <><Link href={c.href} className="text-muted hover:text-ink">{c.label}</Link><ChevronRight aria-hidden className="h-3.5 w-3.5 text-muted" /></>
              : <span aria-current="page" className="truncate font-medium">{c.label}</span>}
          </li>
        ))}
      </ol>
    </nav>
  );
}
