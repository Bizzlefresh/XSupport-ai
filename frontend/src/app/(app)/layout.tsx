"use client";

import type { ReactNode } from "react";

import { AppShell } from "@/components/layout/AppShell";
import { Skeleton } from "@/components/ui/primitives";
import { useRequireAuth } from "@/lib/auth";

export default function AppLayout({ children }: { children: ReactNode }) {
  const { user, loading } = useRequireAuth();
  if (loading || !user) {
    return (
      <div role="status" aria-label="Loading" className="mx-auto max-w-container space-y-4 p-8">
        <Skeleton className="h-8 w-48" /><Skeleton className="h-32" /><Skeleton className="h-64" />
      </div>
    );
  }
  return <AppShell>{children}</AppShell>;
}
