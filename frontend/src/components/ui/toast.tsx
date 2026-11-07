"use client";

import { CheckCircle2, Info, X, XCircle } from "lucide-react";
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";

import { cn } from "@/lib/utils";

type Kind = "success" | "error" | "info";
interface Toast { id: number; kind: Kind; title: string; detail?: string }
const ToastContext = createContext<((t: Omit<Toast, "id">) => void) | null>(null);

const ICON = { success: CheckCircle2, error: XCircle, info: Info } as const;
const TONE = { success: "text-ok", error: "text-danger", info: "text-info" } as const;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const next = useRef(0);
  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const push = useCallback((t: Omit<Toast, "id">) => {
    const id = ++next.current;
    setToasts((cur) => [...cur.slice(-3), { ...t, id }]);
    setTimeout(() => dismiss(id), t.kind === "error" ? 8000 : 4500);
  }, [dismiss]);

  return (
    <ToastContext.Provider value={push}>
      {children}
      {/* aria-live so screen readers announce results of actions */}
      <div aria-live="polite" role="status" className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[min(22rem,calc(100vw-2rem))] flex-col gap-2">
        {toasts.map((t) => {
          const Icon = ICON[t.kind];
          return (
            <div key={t.id} className="anim-pop pointer-events-auto flex gap-3 rounded-lg border border-line bg-elevated p-3 shadow-lg">
              <Icon aria-hidden className={cn("mt-0.5 h-5 w-5 shrink-0", TONE[t.kind])} />
              <div className="min-w-0 flex-1 text-sm">
                <p className="font-medium">{t.title}</p>
                {t.detail && <p className="mt-0.5 break-words text-muted">{t.detail}</p>}
              </div>
              <button aria-label="Dismiss notification" onClick={() => dismiss(t.id)} className="h-6 w-6 shrink-0 rounded text-muted hover:text-ink">
                <X aria-hidden className="mx-auto h-4 w-4" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside ToastProvider");
  return ctx;
}
