"use client";

import { Menu, Plus, Search } from "lucide-react";
import Link from "next/link";

import { Breadcrumbs } from "@/components/layout/Breadcrumbs";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { UserMenu } from "@/components/layout/UserMenu";

export function Topbar({ onMenu, onSearch }: { onMenu: () => void; onSearch: () => void }) {
  return (
    <header className="sticky top-0 z-30 flex h-header items-center gap-3 border-b border-line bg-panel/90 px-4 backdrop-blur md:px-6">
      <button onClick={onMenu} aria-label="Open navigation menu" className="-ml-1 flex h-10 w-10 items-center justify-center rounded-md hover:bg-line/50 md:hidden">
        <Menu aria-hidden className="h-5 w-5" />
      </button>
      <div className="min-w-0 flex-1"><Breadcrumbs /></div>
      <button onClick={onSearch} aria-keyshortcuts="Control+K Meta+K"
              className="flex h-9 items-center gap-2 rounded-md border border-line bg-paper px-3 text-sm text-muted transition-colors duration-fast hover:border-muted/50 sm:w-56">
        <Search aria-hidden className="h-4 w-4" /><span className="sr-only sm:hidden">Search</span><span className="hidden flex-1 text-left sm:block">Search…</span>
        <kbd className="hidden rounded border border-line px-1.5 text-xs sm:block">Ctrl K</kbd>
      </button>
      <Link href="/tickets/new" className="inline-flex h-9 items-center gap-1.5 rounded-md bg-brand px-3 text-sm font-medium text-on-brand shadow-sm transition-opacity duration-fast hover:opacity-90">
        <Plus aria-hidden className="h-4 w-4" /><span className="hidden sm:inline">Create ticket</span><span className="sr-only sm:hidden">Create ticket</span>
      </Link>
      <ThemeToggle />
      <UserMenu />
    </header>
  );
}
