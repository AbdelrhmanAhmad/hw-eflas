// ─── Deterministic procedure classifier ──────────────────────────────────────
// Single source of truth for "which bankruptcy procedure applies", used by
// BOTH the dashboard card (client) and the AI diagnosis route (server), so
// the two can never silently diverge. The AI is instructed to treat this
// classification as ground truth and only override it with an explicit,
// visible disagreement — never silently.

import type { Case } from "./case-types";
import { LIQUIDATION_COST_ESTIMATE } from "./case-types";

export type RecommendationCode = "preventive" | "needs_review" | "admin" | "restructuring" | "regular";

export interface Recommendation {
  title: string;
  code: RecommendationCode;
  color: string;
  articles: string[];
  reason: string;
  steps: string[];
}

// Ordering follows the actual statutory gate: first ask whether the debtor is
// even in ACTUAL insolvency yet (Art. 168/101/83 all presuppose that) —
// anticipated-but-not-actual distress is a separate track (Art. 71) and must
// never fall through into a liquidation recommendation.
export function getRecommendation(c: Case): Recommendation {
  const totalDebts = c.creditors.reduce((s, cr) => s + cr.amount, 0);
  const totalAssets = c.assets.reduce((s, a) => s + a.value, 0);
  const assetsCoverLiquidation = totalAssets >= LIQUIDATION_COST_ESTIMATE;

  const { isActive, insolvencyStatus, operatedTwelveMonths, previousSettlement, hasAssets } = c;
  const isSmallDebtor = c.employees.length <= 5 && totalDebts < 1_000_000;
  const noAssetsAtAll = hasAssets === "no" || totalAssets === 0;

  // 1) Anticipated (not yet actual) insolvency — Article 71 is the procedure
  // designed specifically for this stage, before the debtor is bankrupt.
  if (insolvencyStatus === "upcoming") {
    if (operatedTwelveMonths === "yes" && previousSettlement === "no") {
      return {
        title: "التسوية الوقائية (المادة 71)",
        code: "preventive",
        color: "var(--success)",
        articles: ["المادة 71 — شروط قبول التسوية الوقائية", "المادة 73 — خطة التسوية ومهل الموافقة", "المادة 79 — التصويت على الخطة"],
        reason: "التعثر متوقع لا فعلي — وهذا هو بالضبط النطاق الذي صُمم له إجراء التسوية الوقائية، لمعالجة الوضع قبل الوصول إلى الإعسار الكامل. المنشأة مارست نشاطاً فعلياً لا يقل عن 12 شهراً ولا توجد سابقة تسوية غير منقضية تحول دون القبول.",
        steps: ["إعداد خطة هيكلة الديون مع جدول السداد.", "مخاطبة الدائنين الرئيسيين والحصول على موافقتهم.", "تقديم الخطة للمحكمة التجارية للمصادقة.", "تعيين مشرف التسوية."],
      };
    }
    const missing = operatedTwelveMonths !== "yes"
      ? "عدم استيفاء شرط ممارسة النشاط الفعلي لمدة 12 شهراً على الأقل"
      : "وجود سابقة تسوية وقائية أو إعادة هيكلة لم تنقضِ مدتها النظامية بعد";
    return {
      title: "يتطلب مراجعة قانونية — لا يستوفي شروط المادة 71 بعد",
      code: "needs_review",
      color: "var(--text-muted)",
      articles: ["المادة 71 — شروط قبول التسوية الوقائية"],
      reason: `التعثر متوقع لا فعلي، لكن الملف لا يستوفي حالياً شروط التسوية الوقائية بسبب: ${missing}. بما أن الإعسار غير فعلي بعد، لا يجوز توجيه الملف لأي إجراء تصفية أو هيكلة قبل استيفاء الشرط الناقص أو إعادة تقييم الحالة.`,
      steps: ["مراجعة الشرط الناقص أعلاه مع الموكّل.", "توثيق تاريخ بدء النشاط الفعلي أو تاريخ انقضاء التسوية السابقة.", "إعادة تقييم الملف بعد استيفاء الشرط، أو الانتظار حتى يتحول التعثر إلى فعلي."],
    };
  }

  // 2) Actual insolvency + no assets at all / insufficient for liquidation costs → التصفية الإدارية
  if (noAssetsAtAll || !assetsCoverLiquidation) {
    const variant = isSmallDebtor ? "التصفية الإدارية — مسار المدين الصغير (المادة 168/أ)" : "التصفية الإدارية (المادة 168)";
    return {
      title: variant,
      code: "admin",
      color: "var(--error)",
      articles: isSmallDebtor
        ? ["المادة 168/أ — إجراء مبسط للمدين الصغير", "المادة 7 — تعريف المدين الصغير"]
        : ["المادة 168 — شروط التصفية الإدارية", "المادة 170 — تعيين مدير التصفية"],
      reason: isSmallDebtor
        ? `الإعسار فعلي، والملف مؤهل للإجراء المبسط للمدين الصغير (المادة 168/أ) — الديون (${totalDebts.toLocaleString()} ريال) أقل من مليون ريال وعدد العمال (${c.employees.length}) لا يتجاوز خمسة.`
        : `الإعسار فعلي، و${noAssetsAtAll ? "لا توجد أصول مسجلة للمنشأة" : `الأصول المسجلة (${totalAssets.toLocaleString()} ريال) لا تكفي لتغطية نفقات التصفية العادية المقدّرة بنحو ${LIQUIDATION_COST_ESTIMATE.toLocaleString()} ريال`}؛ التصفية الإدارية هي الإجراء الوحيد الممكن وفق المادة 168.`,
      steps: ["تعبئة نماذج الطلب الإلكتروني عبر ناجز.", "تجهيز خطاب تعذر القوائم المالية (إن لزم).", "استصدار قرار الشركاء بتفويض المحامي.", "إرفاق بيان الدائنين والأصول."],
    };
  }

  // 3) Actual insolvency, still operating, assets > 30% of debts → إعادة الهيكلة
  if (isActive === "yes" && totalAssets > totalDebts * 0.3) {
    return {
      title: "إعادة الهيكلة (المادة 83)",
      code: "restructuring",
      color: "var(--warning)",
      articles: ["المادة 83 — شروط إعادة الهيكلة", "المادة 85 — إجراءات تعيين أمين الهيكلة", "المادة 92 — خطة الهيكلة ومتطلبات الإفصاح"],
      reason: `الإعسار فعلي، لكن المنشأة نشطة وقيمة أصولها (${totalAssets.toLocaleString()} ريال) تتجاوز 30% من الديون (${totalDebts.toLocaleString()} ريال) — مؤهلة لإعادة الهيكلة بدلاً من التصفية الفورية.`,
      steps: ["تعيين أمين هيكلة معتمد من المحكمة.", "إعداد خطة هيكلة شاملة للأصول والديون.", "التفاوض مع الدائنين والتصويت على الخطة.", "مراقبة تنفيذ الخطة خلال المهلة المحددة."],
    };
  }

  // 4) Actual insolvency, none of the above apply → التصفية العادية
  return {
    title: "التصفية العادية (المادة 101)",
    code: "regular",
    color: "var(--warning)",
    articles: ["المادة 101 — إجراءات التصفية العادية", "المادة 103 — تعيين أمين التصفية", "المادة 110 — توزيع حصيلة التصفية"],
    reason: "الإعسار فعلي، والأصول كافية للتصفية العادية، لكن الوضع لا يستوفي متطلبات إعادة الهيكلة (نشاط مستمر + أصول > 30% من الديون).",
    steps: ["تقديم بيان الأصول مصدقاً من خبير معتمد.", "إعداد القوائم المالية الحديثة.", "طلب تعيين أمين تصفية معتمد من المحكمة.", "إخطار جميع الدائنين ونشر الإعلانات القانونية."],
  };
}

// Mirrors the "deficiencies" completeness checks that already run client-side,
// so the server (AI prompt) and dashboard card are checking the exact same
// rules and can never silently disagree about what's missing.
export interface Deficiency {
  id: string;
  type: "critical" | "warning";
  text: string;
}

export function getDeficiencies(c: Case): Deficiency[] {
  const totalDebts = c.creditors.reduce((s, cr) => s + cr.amount, 0);
  const totalAssets = c.assets.reduce((s, a) => s + a.value, 0);
  const list: Deficiency[] = [];

  if (c.crNumber.length !== 10) {
    list.push({ id: "def-cr", type: "critical", text: "رقم السجل التجاري يجب أن يتكون من 10 أرقام كاملة لتجنب رفض الطلب شكلاً." });
  }
  if (c.attorneyName.trim().length <= 3) {
    list.push({ id: "def-atty", type: "critical", text: "يجب إدخال اسم المحامي الوكيل ورقم رخصة المحاماة." });
  }
  if (totalAssets <= 0) {
    list.push({ id: "def-assets-zero", type: "critical", text: "يجب تحديد قيمة أصول المنشأة بدقة." });
  }
  if (totalDebts <= 0) {
    list.push({ id: "def-debts-zero", type: "critical", text: "يجب إدخال بيان ديون تفصيلي محدث." });
  }
  if (c.isEstablishment === "company") {
    const hasResolution = c.uploadedFiles.some(f => f.type === "قرار الشركاء" && f.status === "success");
    if (!hasResolution) {
      list.push({ id: "def-resolution", type: "critical", text: "بما أن المنشأة شركة، يجب إرفاق قرار الشركاء/محضر الجمعية غير العادية." });
    }
  }
  if (c.financialStatementsAvailable !== "yes") {
    list.push({ id: "def-financials", type: "critical", text: "يتطلب النظام قوائم مالية لآخر سنتين. في حال تعذر تقديمها، يجب إرفاق خطاب مبرر رسمي." });
  }
  if (c.financialTransactionsAvailable !== "yes") {
    list.push({ id: "def-transactions", type: "warning", text: "يوصى بإرفاق بيان التصرفات المالية لآخر 12 شهر." });
  }
  if (c.creditorsNotified !== "yes") {
    list.push({ id: "def-notifications", type: "warning", text: "يوصى بإثبات إرسال إشعارات رسمية للدائنين." });
  }
  const zatcaDone = Object.values(c.zatcaChecklist).filter(Boolean).length;
  if (zatcaDone < 4) {
    list.push({ id: "def-zatca", type: "warning", text: `قائمة تحقق ZATCA: ${4 - zatcaDone} عناصر لم تُستكمل بعد.` });
  }

  return list;
}

// A stable snapshot of every fact that could change the legal analysis.
// Stored alongside a saved AI diagnosis; recomputed on render and compared —
// if they differ, the file has changed since the analysis ran and the UI
// must say so instead of silently presenting a stale opinion as current.
export function buildDiagnosisSignature(c: Case): string {
  return JSON.stringify({
    isEstablishment: c.isEstablishment,
    isActive: c.isActive,
    hasAssets: c.hasAssets,
    assetsCoverExpenses: c.assetsCoverExpenses,
    insolvencyStatus: c.insolvencyStatus,
    financialStatementsAvailable: c.financialStatementsAvailable,
    financialTransactionsAvailable: c.financialTransactionsAvailable,
    creditorsNotified: c.creditorsNotified,
    operatedTwelveMonths: c.operatedTwelveMonths,
    previousSettlement: c.previousSettlement,
    totalDebts: c.creditors.reduce((s, cr) => s + cr.amount, 0),
    totalAssets: c.assets.reduce((s, a) => s + a.value, 0),
    creditorCount: c.creditors.length,
    assetCount: c.assets.length,
    employeeCount: c.employees.length,
    zatcaChecklist: c.zatcaChecklist,
  });
}

// Independent safety net for the AI diagnosis: don't just trust that Claude
// followed the "use the deterministic classification unless you flag
// disagreement" instruction — verify it. If the response neither cites the
// expected article number nor contains an explicit disagreement heading,
// something drifted from the ground truth silently, and the lawyer needs to
// be told that plainly rather than trusting the prose at face value.
//
// The article-number check is scoped to the "## الإجراء الموصى به" section
// specifically (falling back to the full text only if that heading is
// missing) — checking the whole document would let an incidental mention of
// the number elsewhere (a comparison, a footnote, an unrelated citation)
// mask an actual silent drift from the deterministic classification.
export function isDiagnosisConsistent(analysisText: string, recommendationArticles: string[]): boolean {
  const primaryArticleMatch = recommendationArticles[0]?.match(/المادة\s*(\d+)/);
  const articleNumber = primaryArticleMatch?.[1];

  const sectionMatch = analysisText.match(/## الإجراء الموصى به([\s\S]*?)(?=\n## |$)/);
  const recommendationSection = sectionMatch?.[1] ?? analysisText;

  const mentionsExpectedArticle = articleNumber ? recommendationSection.includes(articleNumber) : true;
  const flagsDisagreement = analysisText.includes("تعارض مع التصنيف الأولي");
  return mentionsExpectedArticle || flagsDisagreement;
}
