"use client";

import { LogOut, Settings } from "lucide-react";
import { useRouter } from "next/navigation";

import { Dropdown, MenuItem } from "@/components/ui/dropdown";
import { useAuth } from "@/lib/auth";

export function UserMenu() {
  const { user, logout } = useAuth();
  const router = useRouter();
  if (!user) return null;
  const initials = user.full_name.split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase();
  return (
    <Dropdown label="Account menu" className="h-9 gap-2 pl-1 pr-2"
              trigger={<>
                <span aria-hidden className="flex h-7 w-7 items-center justify-center rounded-full bg-brand text-xs font-semibold text-on-brand">{initials}</span>
                <span className="hidden text-sm font-medium lg:block">{user.full_name}</span>
              </>}>
      <div className="border-b border-line px-3 py-2">
        <p className="truncate text-sm font-medium">{user.full_name}</p>
        <p className="truncate text-xs text-muted">{user.email} · {user.role}</p>
      </div>
      <MenuItem onSelect={() => router.push("/settings")}><Settings aria-hidden className="h-4 w-4" />Settings</MenuItem>
      <MenuItem onSelect={logout}><LogOut aria-hidden className="h-4 w-4" />Sign out</MenuItem>
    </Dropdown>
  );
}
