import type { ButtonHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "ghost" | "danger";

const styles: Record<Variant, string> = {
  primary: "bg-brand text-on-brand shadow-sm hover:opacity-90",
  secondary: "border border-line bg-panel hover:bg-paper",
  ghost: "hover:bg-line/50",
  danger: "bg-danger text-on-brand hover:opacity-90",
};

export function Button({
  variant = "primary",
  className,
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex h-10 items-center justify-center gap-2 rounded-md px-4 text-sm font-medium transition-[background-color,opacity,transform] duration-fast ease-app active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100",
        styles[variant],
        className,
      )}
      {...props}
    />
  );
}
