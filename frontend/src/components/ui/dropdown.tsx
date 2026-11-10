"use client";

import { createContext, useContext, useEffect, useId, useRef, useState, type ReactNode } from "react";

import { cn } from "@/lib/utils";

const CloseMenu = createContext<() => void>(() => {});

/** Accessible menu button: arrow keys move, Esc closes and returns focus, outside click closes. */
/**
 * `label` names the menu. Icon-only triggers (`iconOnly`) also use it as the button name; otherwise the button is named
 * by its visible content, so voice-control users can say what they see.
 */
export function Dropdown({ trigger, label, children, align = "right", className, iconOnly = false }: {
  trigger: ReactNode; label: string; children: ReactNode; align?: "left" | "right"; className?: string; iconOnly?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const items = () => Array.from(root.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])') ?? []);
    items()[0]?.focus();
    const onDown = (e: MouseEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => {
      const list = items();
      const i = list.indexOf(document.activeElement as HTMLElement);
      if (e.key === "Escape") { setOpen(false); btn.current?.focus(); }
      else if (e.key === "ArrowDown") { e.preventDefault(); list[(i + 1) % list.length]?.focus(); }
      else if (e.key === "ArrowUp") { e.preventDefault(); list[(i - 1 + list.length) % list.length]?.focus(); }
      else if (e.key === "Tab") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  return (
    <div ref={root} className="relative">
      <button ref={btn} type="button" aria-label={iconOnly ? label : undefined} aria-haspopup="menu" aria-expanded={open} aria-controls={id}
              onClick={() => setOpen((o) => !o)}
              className={cn("flex items-center gap-2 rounded-md transition-colors duration-fast hover:bg-line/50", className)}>
        {trigger}
      </button>
      {open && (
        <div id={id} role="menu" aria-label={label}
             className={cn("anim-pop absolute z-40 mt-2 min-w-52 rounded-lg border border-line bg-elevated p-1 shadow-lg", align === "right" ? "right-0" : "left-0")}>
          {/* Items close the menu themselves and return focus to the button (works for mouse and keyboard). */}
          <CloseMenu.Provider value={() => { setOpen(false); btn.current?.focus(); }}>{children}</CloseMenu.Provider>
        </div>
      )}
    </div>
  );
}

export const menuItem = "flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-line/50 focus:bg-line/50 focus:outline-none";

export function MenuItem({ children, onSelect, active }: { children: ReactNode; onSelect: () => void; active?: boolean }) {
  const close = useContext(CloseMenu);
  return (
    <button role="menuitem" type="button" onClick={() => { close(); onSelect(); }} className={cn(menuItem, active && "font-medium text-brand")}>
      {children}
    </button>
  );
}
