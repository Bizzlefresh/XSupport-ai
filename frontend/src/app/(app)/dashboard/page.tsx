"use client";

import { useQuery } from "@tanstack/react-query";

import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { Health } from "@/types/api";

function Row({ label, value, good }: { label: string; value: string; good?: boolean }) {
  return (
    <div className="flex items-center justify-between border-b border-line py-3 last:border-0">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className={good === undefined ? "text-sm" : good ? "text-sm text-ok" : "text-sm text-danger"}>{value}</dd>
    </div>
  );
}

export default function DashboardPage() {
  const { user } = useAuth();
  const health = useQuery({ queryKey: ["health"], queryFn: () => api<Health>("/health"), refetchInterval: 15_000 });

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-semibold">Welcome, {user?.full_name}</h1>
      <p className="mt-1 text-sm text-muted">
        Ticket metrics, charts and the AI review queue arrive in Phase 2. Nothing below is placeholder data.
      </p>

      <section className="mt-8 rounded-lg border border-line bg-panel px-5" aria-labelledby="sys">
        <h2 id="sys" className="pt-4 text-sm font-medium">System status</h2>
        {health.isLoading && <p className="py-4 text-sm text-muted">Checking backend…</p>}
        {health.isError && (
          <p role="alert" className="py-4 text-sm text-danger">
            {(health.error as Error).message}
          </p>
        )}
        {health.data && (
          <dl>
            <Row label="API" value={health.data.status === "ok" ? "Healthy" : "Degraded"} good={health.data.status === "ok"} />
            <Row label="Database" value={health.data.database === "ok" ? "Connected" : "Unavailable"} good={health.data.database === "ok"} />
            <Row label="Environment" value={health.data.environment} />
          </dl>
        )}
      </section>
    </div>
  );
}
