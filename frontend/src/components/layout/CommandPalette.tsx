"use client";

import { useQuery } from "@tanstack/react-query";
import { CornerDownLeft, Search, Ticket as TicketIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { ALL_NAV } from "@/components/layout/nav";
import { Dialog } from "@/components/ui/dialog";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { TicketPage } from "@/types/api";

interface Entry { key: string; label: string; hint: string; href: string; icon: typeof Search }

/** Ctrl/Cmd+K. Pages are static; tickets come from the real API, so the server decides what this user may see. */
export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [index, setIndex] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => { if (open) { setQ(""); setDebounced(""); setIndex(0); setTimeout(() => input.current?.focus(), 0); } }, [open]);
  useEffect(() => { const t = setTimeout(() => setDebounced(q.trim()), 250); return () => clearTimeout(t); }, [q]);

  const tickets = useQuery({
    queryKey: ["palette-tickets", debounced],
    queryFn: () => api<TicketPage>(`/tickets?page_size=6&q=${encodeURIComponent(debounced)}`),
    enabled: open && debounced.length >= 2,
  });

  const entries: Entry[] = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const pages = ALL_NAV.filter((n) => !needle || n.label.toLowerCase().includes(needle))
      .map((n) => ({ key: n.href, label: n.label, hint: "Page", href: n.href, icon: n.icon }));
    const found = (tickets.data?.items ?? []).map((t) => ({ key: `t${t.id}`, label: t.subject, hint: t.ticket_number, href: `/tickets/${t.id}`, icon: TicketIcon }));
    return [...found, ...pages];
  }, [q, tickets.data]);

  useEffect(() => setIndex(0), [entries.length]);
  const go = (e: Entry | undefined) => { if (e) { onClose(); router.push(e.href); } };

  return (
    <Dialog open={open} onClose={onClose} label="Command palette" className="mt-[10vh] w-[min(36rem,calc(100vw-2rem))]">
      <div className="-m-5">
        <div className="flex items-center gap-3 border-b border-line px-4">
          <Search aria-hidden className="h-4 w-4 text-muted" />
          <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} role="combobox" aria-expanded aria-controls="palette-list"
                 aria-activedescendant={entries[index] ? `pal-${entries[index].key}` : undefined} aria-label="Search pages and tickets"
                 placeholder="Search pages and tickets…" className="h-12 flex-1 bg-transparent text-sm outline-none placeholder:text-muted"
                 onKeyDown={(e) => {
                   if (e.key === "ArrowDown") { e.preventDefault(); setIndex((i) => Math.min(i + 1, entries.length - 1)); }
                   else if (e.key === "ArrowUp") { e.preventDefault(); setIndex((i) => Math.max(i - 1, 0)); }
                   else if (e.key === "Enter") go(entries[index]);
                 }} />
        </div>
        <ul id="palette-list" role="listbox" aria-label="Results" className="max-h-80 overflow-y-auto p-2">
          {entries.map((e, i) => (
            <li key={e.key} id={`pal-${e.key}`} role="option" aria-selected={i === index} onMouseEnter={() => setIndex(i)} onClick={() => go(e)}
                className={cn("flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-sm", i === index && "bg-brand/10 text-brand")}>
              <e.icon aria-hidden className="h-4 w-4 shrink-0" />
              <span className="min-w-0 flex-1 truncate">{e.label}</span>
              <span className="shrink-0 text-xs text-muted">{e.hint}</span>
              {i === index && <CornerDownLeft aria-hidden className="h-3.5 w-3.5 shrink-0" />}
            </li>
          ))}
          {entries.length === 0 && <li className="px-3 py-6 text-center text-sm text-muted">{tickets.isFetching ? "Searching…" : "No matches"}</li>}
        </ul>
        <p className="border-t border-line px-4 py-2 text-xs text-muted">↑↓ to move · Enter to open · Esc to close</p>
      </div>
    </Dialog>
  );
}
