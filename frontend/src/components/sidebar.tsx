"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

// `phase` marks pages that are not built yet. They are shown disabled, not as dead links.
const NAV = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/tickets", label: "Tickets", phase: 2 },
  { href: "/knowledge", label: "Knowledge base", phase: 4 },
  { href: "/analytics", label: "Analytics", phase: 6 },
  { href: "/evaluation", label: "AI evaluation", phase: 6 },
  { href: "/settings", label: "Settings" },
];

export function Sidebar() {
  const pathname = usePathname();
  return (
    <nav aria-label="Main" className="flex gap-1 overflow-x-auto md:flex-col md:overflow-visible">
      {NAV.map((item) =>
        item.phase ? (
          <span key={item.href} aria-disabled="true"
                className="flex items-center justify-between whitespace-nowrap rounded-md px-3 py-2 text-sm text-muted/70">
            {item.label}
            <span className="ml-3 text-xs">Phase {item.phase}</span>
          </span>
        ) : (
          <Link key={item.href} href={item.href}
                aria-current={pathname.startsWith(item.href) ? "page" : undefined}
                className={cn("whitespace-nowrap rounded-md px-3 py-2 text-sm hover:bg-paper",
                  pathname.startsWith(item.href) && "bg-paper font-medium text-brand")}>
            {item.label}
          </Link>
        ),
      )}
    </nav>
  );
}
