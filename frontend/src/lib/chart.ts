/** Recharts theme read from design tokens, so charts follow light/dark mode. Grid and axes stay recessive. */
export const chartGrid = "rgb(var(--line))";
export const chartTick = { fill: "rgb(var(--muted))", fontSize: 12 };
export const chartTooltip = {
  background: "rgb(var(--elevated))", border: "1px solid rgb(var(--line))", borderRadius: 8, color: "rgb(var(--ink))", fontSize: 12,
};
export const chartCursor = { fill: "rgb(var(--line) / 0.4)" };

/** Sequential single-hue fill for heatmap cells: brand hue, alpha rising with magnitude (0 stays empty). */
export function heat(value: number, max: number) {
  if (value <= 0 || max <= 0) return { background: "transparent", strong: false };
  const a = 0.12 + 0.68 * (value / max);
  return { background: `rgb(var(--brand) / ${a.toFixed(3)})`, strong: a > 0.5 };
}
