"use client";

import { useQuery } from "@tanstack/react-query";
import { CircleCheck, CircleMinus, CircleX, Database, Plug, ShieldCheck, UserRound, Users, type LucideIcon } from "lucide-react";

import { EmptyState, ErrorState, PageHeader, ScrollBox, SectionCard, Skeleton, tbl } from "@/components/ui/primitives";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { fmtDate, initials, label } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { IntegrationStatus, User } from "@/types/api";

type Tone = "ok" | "off" | "bad";
const TONE: Record<Tone, { icon: LucideIcon; cls: string }> = {
  ok: { icon: CircleCheck, cls: "text-ok" },
  off: { icon: CircleMinus, cls: "text-muted" },
  bad: { icon: CircleX, cls: "text-danger" },
};

/** One status line: icon + words, so state never depends on colour alone. */
function Row({ name, value, tone, detail }: { name: string; value: string; tone: Tone; detail?: string }) {
  const t = TONE[tone];
  return (
    <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 py-3 first:pt-0 last:pb-0">
      <dt className="text-sm">
        {name}
        {detail && <span className="block text-xs text-muted">{detail}</span>}
      </dt>
      <dd className={cn("inline-flex items-center gap-1.5 text-sm font-medium", t.cls)}><t.icon aria-hidden className="h-4 w-4" />{value}</dd>
    </div>
  );
}

export default function SettingsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const integrations = useQuery({ queryKey: ["integrations"], queryFn: () => api<IntegrationStatus>("/integrations/status") });
  const users = useQuery({ queryKey: ["users"], queryFn: () => api<User[]>("/users"), enabled: isAdmin });
  const i = integrations.data;
  const td = i?.teamdynamix;
  const tdTone: Tone = !td ? "off" : td.state === "ready" ? "ok" : td.state === "disabled" ? "off" : "bad";

  return (
    <div className="max-w-4xl">
      <PageHeader title="Settings" description="Your account, data sources and integrations. Integration settings come from the server's environment and are read-only here." />

      <div className="space-y-6">
        {user && (
          <SectionCard id="account" title="Your account" icon={UserRound}>
            <div className="flex items-center gap-4">
              <span aria-hidden className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-brand text-sm font-semibold text-on-brand">{initials(user.full_name)}</span>
              <dl className="grid min-w-0 flex-1 gap-x-8 gap-y-2 text-sm sm:grid-cols-3">
                <div className="min-w-0"><dt className="text-xs text-muted">Name</dt><dd className="truncate font-medium">{user.full_name}</dd></div>
                <div className="min-w-0"><dt className="text-xs text-muted">Email</dt><dd className="truncate">{user.email}</dd></div>
                <div><dt className="text-xs text-muted">Role</dt><dd>{label(user.role)}</dd></div>
              </dl>
            </div>
          </SectionCard>
        )}

        <SectionCard id="int" title="Integrations and data" icon={Plug}
          note={td?.note}>
          {integrations.isLoading ? <div className="space-y-3"><Skeleton className="h-6" /><Skeleton className="h-6" /><Skeleton className="h-6" /></div>
            : integrations.isError ? <ErrorState message={(integrations.error as Error).message} onRetry={() => integrations.refetch()} />
            : i && td && (
              <>
                <dl className="divide-y divide-line">
                  <Row name="Synthetic data" detail="All tickets in this system are generated, not real" value={i.synthetic_data.enabled ? "Enabled" : "Disabled"} tone={i.synthetic_data.enabled ? "ok" : "off"} />
                  <Row name="TeamDynamix" detail={td.read_only ? "Read-only adapter" : "Read-write is not supported"} value={label(td.state)} tone={tdTone} />
                  <Row name="External LLM" detail="No ticket text is sent to outside AI services" value={i.external_llm.enabled ? "Enabled" : "Disabled"} tone={i.external_llm.enabled ? "bad" : "off"} />
                </dl>
                {td.reasons.length > 0 && (
                  <div role="note" className="mt-4 rounded-md border border-danger/30 bg-danger/5 p-3 text-xs">
                    <p className="font-medium text-danger">TeamDynamix configuration problems</p>
                    <ul className="mt-1 list-disc pl-5">{td.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
                  </div>
                )}
                {td.enabled && (
                  <p className="mt-4 text-xs text-muted">
                    {td.requests} requests, {td.failures} failed
                    {td.last_success_at ? ` · last success ${fmtDate(td.last_success_at)}` : ""}
                    {td.last_error_kind ? ` · last error: ${td.last_error_kind}` : ""}
                  </p>
                )}
              </>
            )}
        </SectionCard>

        <SectionCard id="users" title="Users" icon={Users}>
          {!isAdmin ? (
            <EmptyState icon={ShieldCheck} title="Administrators only" description="Only administrators can view user accounts." />
          ) : users.isLoading ? <div className="space-y-3"><Skeleton className="h-8" /><Skeleton className="h-8" /></div>
            : users.isError ? <ErrorState message={(users.error as Error).message} onRetry={() => users.refetch()} />
            : users.data && users.data.length === 0 ? <EmptyState icon={Database} title="No users" />
            : (
              <ScrollBox label="User accounts">
                <table className={tbl.table}>
                  <caption className="sr-only">User accounts</caption>
                  <thead className={tbl.thead}><tr>
                    <th scope="col" className={tbl.th}>Name</th><th scope="col" className={tbl.th}>Email</th>
                    <th scope="col" className={tbl.th}>Role</th><th scope="col" className={tbl.th}>Status</th>
                  </tr></thead>
                  <tbody>
                    {users.data?.map((u) => (
                      <tr key={u.id} className={tbl.tr}>
                        <td className={cn(tbl.td, "font-medium")}>{u.full_name}</td>
                        <td className={cn(tbl.td, "text-muted")}>{u.email}</td>
                        <td className={tbl.td}>{label(u.role)}</td>
                        <td className={tbl.td}>{u.is_active ? "Active" : "Inactive"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </ScrollBox>
            )}
        </SectionCard>
      </div>
    </div>
  );
}
