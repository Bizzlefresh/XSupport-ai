"use client";

import { useEffect, useRef, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Native <dialog>: browser provides the focus trap, Esc to close and focus restore. */
export function Dialog({ open, onClose, title, children, className, label }: {
  open: boolean; onClose: () => void; title?: string; children: ReactNode; className?: string; label?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      aria-label={title ? undefined : label}
      aria-labelledby={title ? "dlg-title" : undefined}
      onClose={onClose}
      onClick={(e) => { if (e.target === ref.current) onClose(); }}
      className={cn("anim-pop m-auto w-[min(32rem,calc(100vw-2rem))] rounded-lg border border-line bg-elevated p-0 text-ink shadow-lg", className)}
    >
      {open && <div className="p-5">{title && <h2 id="dlg-title" className="mb-3 text-base font-semibold">{title}</h2>}{children}</div>}
    </dialog>
  );
}

export function ConfirmDialog({ open, title, message, confirmLabel = "Confirm", destructive, busy, onConfirm, onCancel }: {
  open: boolean; title: string; message: string; confirmLabel?: string; destructive?: boolean; busy?: boolean;
  onConfirm: () => void; onCancel: () => void;
}) {
  return (
    <Dialog open={open} onClose={onCancel} title={title}>
      <p className="text-sm text-muted">{message}</p>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" onClick={onCancel} disabled={busy}>Cancel</Button>
        <Button variant={destructive ? "danger" : "primary"} onClick={onConfirm} disabled={busy}>{busy ? "Working…" : confirmLabel}</Button>
      </div>
    </Dialog>
  );
}
