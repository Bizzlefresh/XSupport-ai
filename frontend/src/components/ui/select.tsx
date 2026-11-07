import { cn } from "@/lib/utils";
import type { SelectHTMLAttributes } from "react";

export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn("h-10 rounded-md border border-line bg-panel transition-colors duration-fast hover:border-muted/50 px-2 text-sm", className)} {...props} />;
}
