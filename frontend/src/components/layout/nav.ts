import { BarChart3, BookOpen, FlaskConical, LayoutDashboard, Plug, Radar, Settings, Ticket, type LucideIcon } from "lucide-react";

export interface NavItem { href: string; label: string; icon: LucideIcon; match?: string }
export interface NavGroup { title: string; items: NavItem[] }

// Only routes that exist. "AI Assistant" lives inside each ticket page, so it has no
// route of its own; Incident Patterns and Integration Status deep-link to sections.
export const NAV: NavGroup[] = [
  { title: "Workspace", items: [
    { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { href: "/tickets", label: "Tickets", icon: Ticket },
    { href: "/knowledge", label: "Knowledge Base", icon: BookOpen },
  ] },
  { title: "Insights", items: [
    { href: "/analytics", label: "Analytics", icon: BarChart3 },
    { href: "/analytics#inc", label: "Incident Patterns", icon: Radar, match: "never" },
    { href: "/evaluation", label: "AI Evaluation", icon: FlaskConical },
  ] },
  { title: "Administration", items: [
    { href: "/settings", label: "Settings", icon: Settings },
    { href: "/settings#int", label: "Integration Status", icon: Plug, match: "never" },
  ] },
];

export const ALL_NAV = NAV.flatMap((g) => g.items);

export const SEGMENT_LABEL: Record<string, string> = {
  dashboard: "Dashboard", tickets: "Tickets", knowledge: "Knowledge Base", analytics: "Analytics",
  evaluation: "AI Evaluation", settings: "Settings", new: "New",
};
