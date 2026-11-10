# UI/UX audit and redesign plan

Audited before the redesign (Next.js 15 App Router, React 19, Tailwind 3, TanStack Query, Recharts; no component library).

## Findings (before)
- Navigation: a plain text list; mobile showed the full list stacked above the page, pushing content down.
- No top bar, breadcrumbs, search, theme control or account menu; sign-out was a large sidebar button.
- Dark mode followed the OS only (no user control); one flat palette; system font; no tokens for spacing, radius, shadow or motion.
- Badges were colour-outlined text only. No shared empty, error or loading components (pages used ad hoc text).
- Dashboard KPI cards had uneven heights and no icons; tables were basic; no toasts or confirm dialogs.
- Bug found while testing: sign-out cleared the whole query cache, so the old user stayed on screen until a reload.

## Kept
Auth flow, API client, TanStack Query setup, hooks, all pages' data fetching, AI panels (restyled later), badge/Button/Input API.

## Added in phases 1-2
Design tokens (`styles/tokens.css`), light/dark/system theme with no first-paint flash, Inter font, Lucide icons,
Button (+danger), Card, PageHeader, StatCard, Skeleton, EmptyState, ErrorState, Toast, Dialog/ConfirmDialog (native `<dialog>`),
Dropdown, icon+label status/priority badges, AppShell (collapsible sidebar with tooltips, mobile drawer, skip link),
Topbar (breadcrumbs, Ctrl/Cmd+K palette searching pages and real tickets, theme menu, account menu, Create ticket).

## Decisions
- Not added yet: shadcn/Radix, Motion, TanStack Table, React Hook Form + Zod. Each will be added only in the phase that needs it.
- Nav shows only real routes. "AI Assistant" lives inside each ticket page (no route). "Incident Patterns" and "Integration Status" deep-link to sections of Analytics and Settings.
- Notifications bell omitted: the backend has no notification data, so it would be a dead control.

## Outcome (phases 3-7, Nov 2026)
All pages redesigned on the shared components: Dashboard, Tickets list/detail/new, AI panels, Knowledge list/article/editor,
Analytics, Evaluation, Settings, Login. Details, measurements and bugs found per phase are in `docs/progress.md`.

- Accessibility: ESLint with the full jsx-a11y recommended rules (0 warnings); axe-core scans every page, the confirm dialog,
  the account menu and the command palette in light and dark mode with no serious or critical violations. Fixes this needed:
  darker light-mode status tokens (all >= 5:1 on their tints), heatmap intensity capped so text stays >= 4.5:1, accessible
  names that contain the visible text, keyboard-focusable scroll regions, valid listbox and definition-list structure.
- Lighthouse (login page, the only page reachable without a session token): 100/100/100/100 desktop, 98/100/100/100 mobile.
- Not done: manual screen-reader testing (NVDA/VoiceOver), Lighthouse on signed-in pages, bulk actions and saved views.
