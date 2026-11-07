import { cn } from "@/lib/utils";
import type { TextareaHTMLAttributes } from "react";

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn("w-full rounded-md border border-line bg-panel transition-colors duration-fast hover:border-muted/50 px-3 py-2 text-sm", className)} {...props} />;
}
