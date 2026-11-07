"use client";

import { ChevronsLeft, ChevronsRight, LifeBuoy } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { NAV } from "@/components/layout/nav";
import { cn } from "@/lib/utils";

export function Sidebar({ collapsed, onToggle, onNavigate }: { collapsed: boolean; onToggle?: () => void; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <div className="flex h-full flex-col">
      <div className={cn("flex h-header shrink-0 items-center gap-2 border-b border-line px-4", collapsed && "justify-center px-0")}>
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-brand text-on-brand"><LifeBuoy aria-hidden className="h-5 w-5" /></span>
        {!collapsed && <span className="truncate text-base font-semibold tracking-tight">XSupport AI</span>}
      </div>

      <nav aria-label="Main" className="flex-1 space-y-5 overflow-y-auto overflow-x-hidden p-3">
        {NAV.map((group) => (
          <div key={group.title}>
            {collapsed
              ? <div aria-hidden className="mx-2 mb-2 border-t border-line first:hidden" />
              : <p className="mb-1 px-3 text-xs font-medium uppercase tracking-wider text-muted">{group.title}</p>}
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const path = item.href.split("#")[0];
                const active = item.match !== "never" && (pathname === path || pathname.startsWith(path + "/"));
                return (
                  <li key={item.href} className="group relative">
                    <Link href={item.href} onClick={onNavigate} aria-current={active ? "page" : undefined}
                          aria-label={collapsed ? item.label : undefined}
                          className={cn("relative flex h-10 items-center gap-3 rounded-md px-3 text-sm text-muted transition-colors duration-fast hover:bg-line/50 hover:text-ink",
                            collapsed && "justify-center px-0", active && "bg-brand/10 font-medium text-brand hover:bg-brand/10 hover:text-brand")}>
                      <span aria-hidden className={cn("absolute left-0 top-2 h-6 w-0.5 rounded-full bg-brand transition-opacity duration-fast", active ? "opacity-100" : "opacity-0")} />
                      <item.icon aria-hidden className="h-[18px] w-[18px] shrink-0" />
                      {!collapsed && <span className="truncate">{item.label}</span>}
                    </Link>
                    {collapsed && (
                      <span role="tooltip" className="pointer-events-none absolute left-full top-1/2 z-50 ml-2 -translate-y-1/2 whitespace-nowrap rounded-md border border-line bg-elevated px-2 py-1 text-xs opacity-0 shadow-md transition-opacity duration-fast group-focus-within:opacity-100 group-hover:opacity-100">
                        {item.label}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {onToggle && (
        <div className="hidden border-t border-line p-3 md:block">
          <button onClick={onToggle} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} aria-expanded={!collapsed}
                  className={cn("flex h-9 w-full items-center gap-3 rounded-md px-3 text-sm text-muted transition-colors duration-fast hover:bg-line/50 hover:text-ink", collapsed && "justify-center px-0")}>
            {collapsed ? <ChevronsRight aria-hidden className="h-[18px] w-[18px]" /> : <><ChevronsLeft aria-hidden className="h-[18px] w-[18px]" /><span>Collapse</span></>}
          </button>
        </div>
      )}
    </div>
  );
}
