"use client";

import { useQuery } from "@tanstack/react-query";

import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { IntegrationStatus, User } from "@/types/api";

function Flag({ on }: { on: boolean }) {
  return <span className={on ? "text-ok" : "text-muted"}>{on ? "Enabled" : "Disabled"}</span>;
}

export default function SettingsPage() {
  const { user } = useAuth();
  const integrations = useQuery({ queryKey: ["integrations"], queryFn: () => api<IntegrationStatus>("/integrations/status") });
  const users = useQuery({
    queryKey: ["users"],
    queryFn: () => api<User[]>("/users"),
    enabled: user?.role === "admin",
  });

  return (
    <div className="max-w-2xl space-y-8">
      <h1 className="text-2xl font-semibold">Settings</h1>

      <section aria-labelledby="int" className="rounded-lg border border-line bg-panel p-5">
        <h2 id="int" className="text-sm font-medium">Integrations</h2>
        {integrations.isError && <p role="alert" className="mt-3 text-sm text-danger">{(integrations.error as Error).message}</p>}
        {integrations.data && (
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between"><dt>Synthetic data</dt><dd><Flag on={integrations.data.synthetic_data.enabled} /></dd></div>
            <div className="flex justify-between"><dt>TeamDynamix</dt><dd><Flag on={integrations.data.teamdynamix.enabled} /></dd></div>
            <div className="flex justify-between"><dt>TeamDynamix mode</dt><dd>{integrations.data.teamdynamix.read_only ? "Read-only" : "Read-write"}</dd></div>
            <div className="flex justify-between"><dt>External LLM</dt><dd><Flag on={integrations.data.external_llm.enabled} /></dd></div>
            <p className="pt-2 text-xs text-muted">{integrations.data.teamdynamix.note}</p>
          </dl>
        )}
      </section>

      <section aria-labelledby="usr" className="rounded-lg border border-line bg-panel p-5">
        <h2 id="usr" className="text-sm font-medium">Users</h2>
        {user?.role !== "admin" ? (
          <p className="mt-3 text-sm text-muted">Only administrators can view user accounts.</p>
        ) : users.isLoading ? (
          <p className="mt-3 text-sm text-muted">Loading…</p>
        ) : users.isError ? (
          <p role="alert" className="mt-3 text-sm text-danger">{(users.error as Error).message}</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-muted"><tr><th className="pb-2 font-normal">Name</th><th className="pb-2 font-normal">Email</th><th className="pb-2 font-normal">Role</th></tr></thead>
              <tbody>
                {users.data?.map((u) => (
                  <tr key={u.id} className="border-t border-line">
                    <td className="py-2 pr-4">{u.full_name}</td><td className="pr-4">{u.email}</td><td>{u.role}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
