"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { useAuth } from "@/lib/auth";

export default function Home() {
  const { user, loading } = useAuth();
  const router = useRouter();
  useEffect(() => {
    if (!loading) router.replace(user ? "/dashboard" : "/login");
  }, [loading, user, router]);
  return (
    <main className="flex min-h-screen items-center justify-center bg-paper" aria-busy="true">
      <p role="status" className="flex items-center gap-2 text-sm text-muted"><Loader2 aria-hidden className="h-4 w-4 animate-spin" />Loading XSupport AI…</p>
    </main>
  );
}
