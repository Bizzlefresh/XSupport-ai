"use client";

import type { ReactNode } from "react";

import { Sidebar } from "@/components/sidebar";
import { Button } from "@/components/ui/button";
import { useRequireAuth } from "@/lib/auth";

export default function AppLayout({ children }: { children: ReactNode }) {
  const { user, loading, logout } = useRequireAuth();
  if (loading || !user) return <p className="p-8 text-sm text-muted">Loading…</p>;
  return (
    <div className="min-h-screen md:grid md:grid-cols-[15rem_1fr]">
      <aside className="border-b border-line bg-panel p-4 md:flex md:flex-col md:border-b-0 md:border-r">
        <p className="mb-4 text-lg font-semibold md:mb-6">XSupport AI</p>
        <Sidebar />
        <div className="mt-4 hidden border-t border-line pt-4 md:mt-auto md:block">
          <p className="truncate text-sm font-medium">{user.full_name}</p>
          <p className="mb-3 text-xs text-muted">{user.role}</p>
          <Button variant="secondary" className="w-full" onClick={logout}>Sign out</Button>
        </div>
        <Button variant="secondary" className="mt-3 w-full md:hidden" onClick={logout}>Sign out</Button>
      </aside>
      <main className="p-6 md:p-10">{children}</main>
    </div>
  );
}
