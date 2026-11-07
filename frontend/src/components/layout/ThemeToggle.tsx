"use client";

import { Check, Monitor, Moon, Sun } from "lucide-react";

import { Dropdown, MenuItem } from "@/components/ui/dropdown";
import { useTheme, type Theme } from "@/lib/theme";

const OPTIONS: { value: Theme; label: string; icon: typeof Sun }[] = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
];

export function ThemeToggle() {
  const { theme, resolved, setTheme } = useTheme();
  const Icon = resolved === "dark" ? Moon : Sun;
  return (
    <Dropdown label="Change theme" className="h-9 w-9 justify-center" trigger={<Icon aria-hidden className="h-[18px] w-[18px]" />}>
      {OPTIONS.map((o) => (
        <MenuItem key={o.value} active={theme === o.value} onSelect={() => setTheme(o.value)}>
          <o.icon aria-hidden className="h-4 w-4" /><span className="flex-1">{o.label}</span>
          {theme === o.value && <Check aria-hidden className="h-4 w-4" />}
        </MenuItem>
      ))}
    </Dropdown>
  );
}
