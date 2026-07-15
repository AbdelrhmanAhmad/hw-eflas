import { describe, it, expect } from "vitest";
import { createNewCase, LIQUIDATION_COST_ESTIMATE, type Case, type Creditor, type Asset, type Employee } from "./case-types";
import { getRecommendation, getDeficiencies, buildDiagnosisSignature, isDiagnosisConsistent } from "./recommendation";

// ─── Test fixtures ───────────────────────────────────────────────────────────

function makeCreditor(amount: number): Creditor {
  return { id: crypto.randomUUID(), name: "دائن", amount, priority: "p3_unsecured", type: "تجاري", date: "2025-01-01" };
}

function makeAsset(value: number): Asset {
  return { id: crypto.randomUUID(), name: "أصل", value, location: "الرياض", description: "" };
}

function makeEmployee(): Employee {
  return { id: crypto.randomUUID(), name: "موظف", nationality: "سعودي", iqama: "1000000000", salary: 5000, joinDate: "2020-01-01", benefits: 0 };
}

// Builds a case with a given total debt and total asset value split across
// a single creditor/asset row, plus whatever overrides the test needs.
function makeCase(overrides: Partial<Case> & { totalDebts?: number; totalAssets?: number; employeeCount?: number } = {}): Case {
  const { totalDebts, totalAssets, employeeCount, ...rest } = overrides;
  const base = createNewCase();
  return {
    ...base,
    creditors: totalDebts !== undefined ? [makeCreditor(totalDebts)] : base.creditors,
    assets: totalAssets !== undefined ? [makeAsset(totalAssets)] : base.assets,
    employees: employeeCount !== undefined ? Array.from({ length: employeeCount }, makeEmployee) : base.employees,
    ...rest,
  };
}

// ─── getRecommendation: statutory branch coverage ───────────────────────────

describe("getRecommendation — Article 71 (preventive settlement) branch", () => {
  it("recommends preventive settlement when distress is anticipated and both conditions are met", () => {
    const c = makeCase({ insolvencyStatus: "upcoming", operatedTwelveMonths: "yes", previousSettlement: "no" });
    expect(getRecommendation(c).code).toBe("preventive");
  });

  it("flags 'needs_review' instead of a liquidation procedure when the 12-month operating condition isn't met", () => {
    const c = makeCase({ insolvencyStatus: "upcoming", operatedTwelveMonths: "no", previousSettlement: "no" });
    const rec = getRecommendation(c);
    expect(rec.code).toBe("needs_review");
    expect(rec.reason).toContain("12 شهراً");
  });

  it("flags 'needs_review' when a prior unexpired settlement exists", () => {
    const c = makeCase({ insolvencyStatus: "upcoming", operatedTwelveMonths: "yes", previousSettlement: "yes" });
    const rec = getRecommendation(c);
    expect(rec.code).toBe("needs_review");
    expect(rec.reason).toContain("سابقة تسوية");
  });

  it("never falls through to a liquidation procedure while insolvency is only anticipated", () => {
    const c = makeCase({ insolvencyStatus: "upcoming", operatedTwelveMonths: "no", hasAssets: "no", totalAssets: 0 });
    expect(getRecommendation(c).code).toBe("needs_review");
  });
});

describe("getRecommendation — Article 168 (administrative liquidation) branch", () => {
  it("recommends administrative liquidation when the debtor has no assets at all", () => {
    const c = makeCase({ insolvencyStatus: "actual", hasAssets: "no", totalAssets: 0, totalDebts: 500_000 });
    expect(getRecommendation(c).code).toBe("admin");
  });

  it("recommends administrative liquidation when assets are below the liquidation cost estimate", () => {
    const c = makeCase({ insolvencyStatus: "actual", hasAssets: "yes", totalAssets: LIQUIDATION_COST_ESTIMATE - 1, totalDebts: 500_000 });
    expect(getRecommendation(c).code).toBe("admin");
  });

  it("does NOT recommend administrative liquidation when assets exactly meet the threshold (boundary)", () => {
    const c = makeCase({ insolvencyStatus: "actual", hasAssets: "yes", totalAssets: LIQUIDATION_COST_ESTIMATE, totalDebts: 500_000, isActive: "no" });
    expect(getRecommendation(c).code).not.toBe("admin");
  });

  it("uses the small-debtor track when debts < 1M and employees <= 5", () => {
    const c = makeCase({ insolvencyStatus: "actual", totalAssets: 0, hasAssets: "no", totalDebts: 900_000, employeeCount: 5 });
    const rec = getRecommendation(c);
    expect(rec.code).toBe("admin");
    expect(rec.title).toContain("المدين الصغير");
  });

  it("does NOT use the small-debtor track at exactly 1,000,000 in debts (boundary — must be strictly less)", () => {
    const c = makeCase({ insolvencyStatus: "actual", totalAssets: 0, hasAssets: "no", totalDebts: 1_000_000, employeeCount: 5 });
    expect(getRecommendation(c).title).not.toContain("المدين الصغير");
  });

  it("does NOT use the small-debtor track with 6 employees (boundary — must not exceed 5)", () => {
    const c = makeCase({ insolvencyStatus: "actual", totalAssets: 0, hasAssets: "no", totalDebts: 500_000, employeeCount: 6 });
    expect(getRecommendation(c).title).not.toContain("المدين الصغير");
  });
});

describe("getRecommendation — Article 83 (restructuring) branch", () => {
  it("recommends restructuring when active with assets > 30% of debts", () => {
    const c = makeCase({ insolvencyStatus: "actual", isActive: "yes", totalDebts: 1_000_000, totalAssets: 400_000 });
    expect(getRecommendation(c).code).toBe("restructuring");
  });

  it("does NOT recommend restructuring at exactly 30% of debts (boundary — must be strictly greater)", () => {
    const c = makeCase({ insolvencyStatus: "actual", isActive: "yes", totalDebts: 1_000_000, totalAssets: 300_000 });
    expect(getRecommendation(c).code).not.toBe("restructuring");
  });

  it("does NOT recommend restructuring when the entity has stopped operating, even with high assets", () => {
    const c = makeCase({ insolvencyStatus: "actual", isActive: "no", totalDebts: 1_000_000, totalAssets: 800_000 });
    expect(getRecommendation(c).code).not.toBe("restructuring");
  });
});

describe("getRecommendation — Article 101 (regular liquidation) fallback", () => {
  it("falls back to regular liquidation when actual insolvency doesn't qualify for any other track", () => {
    const c = makeCase({ insolvencyStatus: "actual", isActive: "no", totalDebts: 1_000_000, totalAssets: 800_000 });
    expect(getRecommendation(c).code).toBe("regular");
  });

  it("falls back to regular liquidation when active but assets are insufficient for restructuring", () => {
    const c = makeCase({ insolvencyStatus: "actual", isActive: "yes", totalDebts: 1_000_000, totalAssets: 250_000 });
    expect(getRecommendation(c).code).toBe("regular");
  });
});

// ─── getDeficiencies ─────────────────────────────────────────────────────────

describe("getDeficiencies", () => {
  it("flags an incomplete CR number", () => {
    const c = makeCase({ crNumber: "123" });
    expect(getDeficiencies(c).some(d => d.id === "def-cr")).toBe(true);
  });

  it("does not flag a complete 10-digit CR number", () => {
    const c = makeCase({ crNumber: "1010101010" });
    expect(getDeficiencies(c).some(d => d.id === "def-cr")).toBe(false);
  });

  it("flags a missing shareholders' resolution for companies", () => {
    const c = makeCase({ isEstablishment: "company", uploadedFiles: [] });
    expect(getDeficiencies(c).some(d => d.id === "def-resolution")).toBe(true);
  });

  it("does not flag a missing resolution once one is uploaded", () => {
    const c = makeCase({
      isEstablishment: "company",
      uploadedFiles: [{ name: "قرار.pdf", type: "قرار الشركاء", size: "1 MB", status: "success" }],
    });
    expect(getDeficiencies(c).some(d => d.id === "def-resolution")).toBe(false);
  });

  it("does not require a resolution for sole establishments", () => {
    const c = makeCase({ isEstablishment: "establishment", uploadedFiles: [] });
    expect(getDeficiencies(c).some(d => d.id === "def-resolution")).toBe(false);
  });

  it("flags zero total debts and zero total assets as critical", () => {
    const c = makeCase({ totalDebts: 0, totalAssets: 0 });
    const ids = getDeficiencies(c).map(d => d.id);
    expect(ids).toContain("def-debts-zero");
    expect(ids).toContain("def-assets-zero");
  });
});

// ─── buildDiagnosisSignature ─────────────────────────────────────────────────

describe("buildDiagnosisSignature", () => {
  it("is stable for an unchanged case", () => {
    const c = makeCase({ totalDebts: 500_000, totalAssets: 100_000 });
    expect(buildDiagnosisSignature(c)).toBe(buildDiagnosisSignature(c));
  });

  it("changes when a legally relevant fact changes", () => {
    const before = makeCase({ insolvencyStatus: "upcoming" });
    const after = { ...before, insolvencyStatus: "actual" };
    expect(buildDiagnosisSignature(before)).not.toBe(buildDiagnosisSignature(after));
  });

  it("changes when total debts change", () => {
    const before = makeCase({ totalDebts: 500_000 });
    const after = makeCase({ totalDebts: 600_000 });
    expect(buildDiagnosisSignature(before)).not.toBe(buildDiagnosisSignature(after));
  });

  it("does not change for cosmetic edits unrelated to the legal facts (e.g. renaming the debtor)", () => {
    const before = makeCase({ debtorName: "شركة أ" });
    const after = { ...before, debtorName: "شركة ب" };
    expect(buildDiagnosisSignature(before)).toBe(buildDiagnosisSignature(after));
  });
});

// ─── isDiagnosisConsistent — the AI-output safety net ────────────────────────

describe("isDiagnosisConsistent", () => {
  const articles = ["المادة 168 — شروط التصفية الإدارية", "المادة 170 — تعيين مدير التصفية"];

  it("passes when the response cites the expected article number", () => {
    expect(isDiagnosisConsistent("## الإجراء الموصى به\nالتصفية الإدارية وفق المادة 168...", articles)).toBe(true);
  });

  it("passes when the response explicitly flags disagreement with the preliminary classification", () => {
    const text = "## ⚠️ تعارض مع التصنيف الأولي\nنرى أن الملف يستوفي شروط إعادة الهيكلة بدلاً من ذلك...";
    expect(isDiagnosisConsistent(text, articles)).toBe(true);
  });

  it("fails when the response neither cites the article nor flags disagreement — the drift case", () => {
    const text = "## الإجراء الموصى به\nنوصي بإعادة الهيكلة كإجراء أنسب لهذا الملف.";
    expect(isDiagnosisConsistent(text, articles)).toBe(false);
  });

  it("fails on silent drift even when the expected article number appears elsewhere in the document", () => {
    // The recommended procedure itself (إعادة الهيكلة) doesn't match Article 168,
    // and there's no disagreement heading — the mention of "168" in an unrelated
    // paragraph must not be mistaken for the model having followed the ground truth.
    const text = [
      "## الإجراء الموصى به",
      "نوصي بإعادة الهيكلة كإجراء أنسب لهذا الملف.",
      "## المخاطر القانونية",
      "بخلاف ما تنص عليه المادة 168 بشأن كفاية الأصول، نرى أن الوضع مختلف هنا.",
    ].join("\n");
    expect(isDiagnosisConsistent(text, articles)).toBe(false);
  });
});
