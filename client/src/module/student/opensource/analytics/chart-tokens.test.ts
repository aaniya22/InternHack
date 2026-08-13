import { describe, expect, it } from "vitest";
import { dotDiameter, DOT_MAX_PX, MARK, MARK_MUTED, SERIES } from "./chart-tokens";

describe("dotDiameter", () => {
  it("gives the largest value the full diameter", () => {
    expect(dotDiameter(40, 40)).toBe(DOT_MAX_PX);
  });

  it("scales by area, so half the diameter is a quarter of the value", () => {
    expect(dotDiameter(10, 40)).toBe(Math.round(DOT_MAX_PX / 2));
  });

  it("keeps distinct values visually distinct rather than clamping them together", () => {
    const sizes = [4, 10, 20, 30, 40].map((v) => dotDiameter(v, 40));
    expect(new Set(sizes).size).toBe(sizes.length);
    expect(sizes).toEqual([...sizes].sort((a, b) => a - b));
  });

  it("keeps small non-zero values above the visibility floor", () => {
    expect(dotDiameter(1, 400)).toBe(5);
  });

  it("returns zero for empty cells and guards a zero maximum", () => {
    expect(dotDiameter(0, 40)).toBe(0);
    expect(dotDiameter(5, 0)).toBe(0);
  });
});

describe("series palette", () => {
  it("has four overlay slots built from two hues plus dash patterns", () => {
    expect(SERIES).toHaveLength(4);
    expect(new Set(SERIES.map((s) => s.stroke))).toEqual(new Set([MARK, MARK_MUTED]));
    expect(SERIES.filter((s) => s.dash)).toHaveLength(2);
  });

  it("never repeats the same stroke and dash combination", () => {
    const keys = SERIES.map((s) => `${s.stroke}|${s.dash ?? "solid"}`);
    expect(new Set(keys).size).toBe(SERIES.length);
  });
});
