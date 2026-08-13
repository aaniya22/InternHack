/**
 * Colour and axis tokens for the open source analytics charts.
 *
 * Palette: lime + stone only (project design system). Both mark colours were
 * checked against the light (#ffffff) and dark (#1c1917) card surfaces: each
 * sits inside the OKLCH lightness band for its mode, clears 3:1 contrast, and
 * the pair separates at deutan ΔE 15.0 and normal-vision ΔE 19.7, well above
 * the ΔE 8 target. A stone series has no chroma, so it reads as gray by
 * construction: every chart with two or more series therefore also ships a
 * legend, and identity never rests on colour alone.
 *
 * Because colour only carries two slots here, bars whose length already encodes
 * the value stay on a single hue rather than being tinted by rank or category.
 */
export const MARK = "#65a30d"; // lime-600, slot 1: the subject series
export const MARK_MUTED = "#78716c"; // stone-500, slot 2: the context series
export const AXIS = "#78716c";
export const GRID = "rgba(120,113,108,0.18)";

/**
 * Up to four overlapping series (radar). Slots 3 and 4 repeat the two hues with
 * a dash pattern; recharts draws the dash into the legend swatch, so the extra
 * series stay identifiable without inventing a third colour.
 */
export const SERIES: { stroke: string; dash?: string }[] = [
  { stroke: MARK },
  { stroke: MARK_MUTED },
  { stroke: MARK, dash: "6 3" },
  { stroke: MARK_MUTED, dash: "6 3" },
];

/** What recharts accepts for a `ResponsiveContainer` height. */
export type ChartHeight = number | `${number}%`;

export interface AxisTick {
  fill: string;
  fontSize: number;
}

export const axisTick: AxisTick = { fill: AXIS, fontSize: 11 };
export const axisTickSm: AxisTick = { fill: AXIS, fontSize: 10 };

/** Largest punchcard dot diameter, in px, which has to fit the 20px matrix row. */
export const DOT_MAX_PX = 18;

/**
 * Punchcard dot diameter in px. Area-proportional, so the diameter scales with
 * the square root of the value. Sized in px rather than percent: a percentage of
 * the column would be clamped by the row height and every dot above a low
 * threshold would come out identical, which silently kills the encoding.
 */
export function dotDiameter(value: number, max: number): number {
  if (value <= 0 || max <= 0) return 0;
  return Math.max(5, Math.round(Math.sqrt(value / max) * DOT_MAX_PX));
}
