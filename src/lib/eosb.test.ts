import { describe, it, expect } from "vitest";
import { calcEosb } from "./eosb";

// Helper: a join date exactly N years (365.25-day years, matching calcEosb's
// own conversion) before "now", so the expected EOSB figures are exact rather
// than off by the rounding calcEosb itself would apply to a slightly-off date.
function joinDateYearsAgo(years: number): string {
  return new Date(Date.now() - years * 365.25 * 86400000).toISOString();
}

describe("calcEosb — Labor Law Art. 84 tiered end-of-service benefit", () => {
  it("pays half a month's salary per year for tenure under 5 years", () => {
    expect(calcEosb(6000, joinDateYearsAgo(3))).toBe(9000); // 6000/2 * 3
  });

  it("pays half a month's salary per year for exactly 5 years", () => {
    expect(calcEosb(6000, joinDateYearsAgo(5))).toBe(15000); // 6000/2 * 5
  });

  it("switches to a full month's salary per year only for the years beyond the first 5 (tiered, not flat)", () => {
    // 8 years @ salary 5000 => (2500*5) + (5000*3) = 12500 + 15000 = 27500
    // A flat "years>=5 ? full rate : half rate" bug would instead give 5000*1*8 = 40000.
    expect(calcEosb(5000, joinDateYearsAgo(8))).toBe(27500);
  });

  it("never returns a flat full-salary rate applied across the entire tenure", () => {
    const result = calcEosb(5000, joinDateYearsAgo(12));
    const brokenFlatRate = Math.round(5000 * 1 * 12);
    expect(result).not.toBe(brokenFlatRate);
    expect(result).toBe(47500); // (2500*5) + (5000*7)
  });

  it("returns 0 for an empty join date", () => {
    expect(calcEosb(5000, "")).toBe(0);
  });
});
