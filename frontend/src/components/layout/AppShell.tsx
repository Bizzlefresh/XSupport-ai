"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

import { CommandPalette } from "@/components/layout/CommandPalette";
import { Sidebar } from "@/components/layout/Sidebar";
import { Topbar } from "@/components/layout/Topbar";
import { cn } from "@/lib/utils";

const KEY = "xsupport.sidebar";

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [palette, setPalette] = useState(false);

  useEffect(() => { try { setCollapsed(localStorage.getItem(KEY) === "1"); } catch { /* default expanded */ } }, []);
  useEffect(() => setDrawer(false), [pathname]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setPalette((p) => !p); }
      if (e.key === "Escape") setDrawer(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const toggle = () => setCollapsed((c) => {
    try { localStorage.setItem(KEY, c ? "0" : "1"); } catch { /* not persisted */ }
    return !c;
  });

  return (
    <div className="min-h-screen">
      <a href="#main" className="sr-only z-50 rounded-md bg-brand px-3 py-2 text-on-brand focus:not-sr-only focus:fixed focus:left-3 focus:top-3">Skip to content</a>

      <aside aria-label="Sidebar" style={{ width: collapsed ? "var(--sidebar-w-collapsed)" : "var(--sidebar-w)" }}
             className="fixed inset-y-0 left-0 z-40 hidden border-r border-line bg-panel transition-[width] duration-200 ease-app md:block">
        <Sidebar collapsed={collapsed} onToggle={toggle} />
      </aside>

      {drawer && (
        <div className="md:hidden">
          <div className="anim-fade fixed inset-0 z-40 bg-slate-950/50" onClick={() => setDrawer(false)} aria-hidden />
          <aside role="dialog" aria-modal="true" aria-label="Navigation menu" className="anim-fade fixed inset-y-0 left-0 z-50 w-[min(18rem,85vw)] border-r border-line bg-panel shadow-lg">
            <Sidebar collapsed={false} onNavigate={() => setDrawer(false)} />
          </aside>
        </div>
      )}

      <div className={cn("transition-[padding] duration-200 ease-app", collapsed ? "md:pl-[var(--sidebar-w-collapsed)]" : "md:pl-[var(--sidebar-w)]")}>
        <Topbar onMenu={() => setDrawer(true)} onSearch={() => setPalette(true)} />
        <main id="main" tabIndex={-1} className="mx-auto w-full max-w-container px-4 py-6 md:px-8 md:py-8">
          <div key={pathname} className="anim-fade">{children}</div>
        </main>
      </div>

      <CommandPalette open={palette} onClose={() => setPalette(false)} />
    </div>
  );
}
