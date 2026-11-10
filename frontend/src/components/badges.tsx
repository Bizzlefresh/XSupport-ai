import { AlertOctagon, Archive, ArrowDown, ArrowUp, Circle, CircleCheck, CircleDot, Clock, FilePen, Minus, type LucideIcon } from "lucide-react";

import { label } from "@/lib/format";
import { cn } from "@/lib/utils";

// Colour is never the only signal: each badge carries an icon and its text label.
const PRIORITY: Record<string, [string, LucideIcon]> = {
  critical: ["border-danger/40 bg-danger/10 text-danger", AlertOctagon],
  high: ["border-warn/40 bg-warn/10 text-warn", ArrowUp],
  medium: ["border-info/40 bg-info/10 text-info", Minus],
  low: ["border-line bg-line/40 text-muted", ArrowDown],
};
const STATUS: Record<string, [string, LucideIcon]> = {
  new: ["border-brand/40 bg-brand/10 text-brand", Circle],
  open: ["border-info/40 bg-info/10 text-info", CircleDot],
  pending: ["border-warn/40 bg-warn/10 text-warn", Clock],
  resolved: ["border-ok/40 bg-ok/10 text-ok", CircleCheck],
  closed: ["border-line bg-line/40 text-muted", CircleCheck],
};

const base = "inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium";
function Badge({ value, map }: { value: string; map: Record<string, [string, LucideIcon]> }) {
  const [cls, Icon] = map[value] ?? ["border-line text-muted", Circle];
  return <span className={cn(base, cls)}><Icon aria-hidden className="h-3 w-3" />{label(value)}</span>;
}
export const PriorityBadge = ({ value }: { value: string }) => <Badge value={value} map={PRIORITY} />;
export const StatusBadge = ({ value }: { value: string }) => <Badge value={value} map={STATUS} />;
const ARTICLE: Record<string, [string, LucideIcon]> = {
  approved: ["border-ok/40 bg-ok/10 text-ok", CircleCheck],
  draft: ["border-warn/40 bg-warn/10 text-warn", FilePen],
  archived: ["border-line bg-line/40 text-muted", Archive],
};
export const ArticleStatusBadge = ({ value }: { value: string }) => <Badge value={value} map={ARTICLE} />;
