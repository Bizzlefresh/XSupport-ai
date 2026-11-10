/** Recharts theme read from design tokens, so charts follow light/dark mode. Grid and axes stay recessive. */
export const chartGrid = "rgb(var(--line))";
export const chartTick = { fill: "rgb(var(--muted))", fontSize: 12 };
export const chartTooltip = {
  background: "rgb(var(--elevated))", border: "1px solid rgb(var(--line))", borderRadius: 8, color: "rgb(var(--ink))", fontSize: 12,
};
export const chartCursor = { fill: "rgb(var(--line) / 0.4)" };

/**
 * Sequential single-hue fill for heatmap cells: brand hue, intensity rising with magnitude (0 stays empty).
 * The range comes from theme tokens (--heat-*), capped so normal ink text keeps >= 4.5:1 in both modes.
 */
export function heat(value: number, max: number) {
  if (value <= 0 || max <= 0) return { background: "transparent", strong: false };
  const t = Math.min(1, value / max);
  return { background: `rgb(var(--brand) / calc(var(--heat-min) + var(--heat-span) * ${t.toFixed(3)}))`, strong: t > 0.55 };
}

/** Text classes for a heat cell. */
export const heatText = (strong: boolean) => (strong ? "font-medium text-ink" : "text-ink");
