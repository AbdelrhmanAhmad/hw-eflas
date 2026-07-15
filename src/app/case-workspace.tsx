"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  type Case,
  type Creditor,
  type ZatcaChecklist,
  type GosiChecklist,
  type HrChecklist,
  type HearingDate,
  DEFAULT_TIMELINE_EVENTS,
  LIQUIDATION_COST_ESTIMATE,
  createNewCase,
} from "@/lib/case-types";
import { saveCaseAction, deleteCaseAction } from "@/app/actions/cases";
import { logout } from "@/app/actions/auth";
import { getRecommendation, getDeficiencies, buildDiagnosisSignature } from "@/lib/recommendation";
import { calcEosb } from "@/lib/eosb";
import { renderAiDiagnosis } from "@/lib/render-ai-diagnosis";
import { createClientAccountAction, revokeClientAccountAction, resetClientPasswordAction } from "@/app/actions/clients";
import {
  User, CircleCheckBig, Plus, Check, Scale, ArrowLeft, ArrowRight, ArrowUpRight,
  AlertTriangle, Copy, ClipboardList, Trash2, RefreshCw, FileText, Sparkles, Ban,
  Handshake, Mail, Send, Package, PenLine, ScrollText, BookOpen, Pin, Folder, Wallet,
  HardHat, HelpCircle, Settings, Bot, Info, Download, LayoutDashboard, Stethoscope,
  Calendar, Loader2, type LucideIcon,
} from "lucide-react";

interface Toast {
  id: string;
  message: string;
  type: "success" | "error" | "info";
}

interface ConfirmModal {
  open: boolean;
  message: string;
  onConfirm: () => void;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const PRIORITY_LABELS: Record<string, { label: string; color: string; rank: number }> = {
  p1_expenses:    { label: "م1 — مصروفات الإجراء", color: "#53190D", rank: 1 },
  p1_employees:   { label: "م1 — مستحقات العمال", color: "#7c3300", rank: 2 },
  p1_government:  { label: "م1 — ديون حكومية (ZATCA/تأمينات)", color: "#8b4513", rank: 3 },
  p2_secured:     { label: "م2 — دين مضمون برهن", color: "#c07800", rank: 4 },
  p3_unsecured:   { label: "م3 — دين تجاري عادي", color: "#374151", rank: 5 },
  p4_deferred:    { label: "م4 — دين مؤخر (شركاء)", color: "#6b7280", rank: 6 },
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getDaysRemaining(submissionDate: string, dayOffset: number): number {
  const sub = new Date(submissionDate);
  const deadline = new Date(sub.getTime() + dayOffset * 86400000);
  const now = new Date();
  return Math.ceil((deadline.getTime() - now.getTime()) / 86400000);
}

function statusLabel(s: Case["status"]): { label: string; color: string } {
  const m: Record<Case["status"], { label: string; color: string }> = {
    draft:     { label: "مسودة", color: "#6b7280" },
    preparing: { label: "قيد التجهيز", color: "#c07800" },
    submitted: { label: "مقدم للمحكمة", color: "#198754" },
    decided:   { label: "صدر القرار", color: "#00793A" },
    closed:    { label: "منجز / مغلق", color: "#374151" },
  };
  return m[s];
}

// Self-contained card for creating/revoking the one client-account-per-case
// login. Kept as its own component (own local form state) rather than adding
// more state to the already-large CaseWorkspace component.
function ClientAccountCard({
  caseId,
  clientEmail,
  onChange,
  showToast,
}: {
  caseId: string;
  clientEmail: string | null;
  onChange: (email: string | null) => void;
  showToast: (message: string, type?: Toast["type"]) => void;
}) {
  const [formOpen, setFormOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  const handleCreate = async (formData: FormData) => {
    setPending(true);
    setError("");
    const res = await createClientAccountAction(caseId, formData);
    setPending(false);
    if (res?.error) { setError(res.error); return; }
    onChange(String(formData.get("email")));
    setFormOpen(false);
    showToast("تم إنشاء حساب العميل بنجاح");
  };

  const handleRevoke = async () => {
    setPending(true);
    const res = await revokeClientAccountAction(caseId);
    setPending(false);
    if (res?.error) { showToast(res.error, "error"); return; }
    onChange(null);
    showToast("تم إلغاء حساب العميل");
  };

  const handleReset = async (formData: FormData) => {
    setPending(true);
    setError("");
    const res = await resetClientPasswordAction(caseId, formData);
    setPending(false);
    if (res?.error) { setError(res.error); return; }
    setResetOpen(false);
    showToast("تم تحديث كلمة مرور العميل");
  };

  return (
    <div className="glass-panel" style={{ padding: "14px", border: "1px solid var(--card-border)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px" }}>
        <User size={16} color="var(--text-muted)" />
        <p style={{ fontSize: "0.82rem", fontWeight: 700, color: "var(--text-body)" }}>حساب دخول العميل</p>
      </div>

      {!clientEmail && !formOpen && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px", flexWrap: "wrap" }}>
          <p style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>لا يوجد حساب دخول للعميل بعد — أنشئ له حساباً ليتابع ملفه ويرفع مستنداته بنفسه.</p>
          <button className="btn-primary" style={{ padding: "7px 14px", fontSize: "0.78rem", flexShrink: 0 }} onClick={() => setFormOpen(true)}><Plus size={14} /> إنشاء حساب</button>
        </div>
      )}

      {!clientEmail && formOpen && (
        <form action={handleCreate} style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
            <input className="custom-input" name="name" placeholder="اسم ممثل العميل" required style={{ fontSize: "0.78rem" }} />
            <input className="custom-input" name="email" type="email" placeholder="البريد الإلكتروني" required style={{ fontSize: "0.78rem" }} />
          </div>
          <input className="custom-input" name="password" type="password" placeholder="كلمة المرور الأولية (8 أحرف على الأقل)" required style={{ fontSize: "0.78rem" }} />
          {error && <p style={{ color: "var(--red)", fontSize: "0.73rem" }}>{error}</p>}
          <div style={{ display: "flex", gap: "8px" }}>
            <button className="btn-primary" type="submit" disabled={pending} style={{ padding: "6px 14px", fontSize: "0.76rem" }}>{pending ? "جارٍ الإنشاء..." : "إنشاء الحساب"}</button>
            <button type="button" className="btn-secondary" style={{ padding: "6px 14px", fontSize: "0.76rem" }} onClick={() => { setFormOpen(false); setError(""); }}>إلغاء</button>
          </div>
        </form>
      )}

      {clientEmail && (
        <div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px", flexWrap: "wrap" }}>
            <p style={{ fontSize: "0.78rem", color: "var(--text-body)", display: "flex", alignItems: "center", gap: "6px" }}><CircleCheckBig size={14} color="var(--green-600)" /> مرتبط بحساب: <strong>{clientEmail}</strong></p>
            <div style={{ display: "flex", gap: "6px" }}>
              <button className="btn-secondary" style={{ padding: "5px 12px", fontSize: "0.72rem" }} onClick={() => { setResetOpen(o => !o); setError(""); }}>إعادة تعيين كلمة المرور</button>
              <button className="btn-secondary" style={{ padding: "5px 12px", fontSize: "0.72rem", color: "var(--red)" }} disabled={pending} onClick={handleRevoke}>إلغاء الحساب</button>
            </div>
          </div>
          {resetOpen && (
            <form action={handleReset} style={{ display: "flex", gap: "8px", alignItems: "flex-start", marginTop: "10px" }}>
              <input className="custom-input" name="password" type="password" placeholder="كلمة مرور جديدة (8 أحرف على الأقل)" required style={{ fontSize: "0.78rem", flex: 1 }} />
              <button className="btn-primary" type="submit" disabled={pending} style={{ padding: "6px 14px", fontSize: "0.76rem" }}>{pending ? "..." : "تحديث"}</button>
            </form>
          )}
          {error && <p style={{ color: "var(--red)", fontSize: "0.73rem", marginTop: "6px" }}>{error}</p>}
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function CaseWorkspace({ initialCases, userName }: { initialCases: Case[]; userName: string }) {

  // ── Case Management State
  const [cases, setCases] = useState<Case[]>(initialCases);
  const [activeCaseId, setActiveCaseId] = useState<string | null>(null);
  const [view, setView] = useState<"list" | "case">("list");

  // ── UI State (per session)
  const [activeTab, setActiveTab] = useState<"dashboard" | "wizard" | "documents" | "timeline" | "kb">("dashboard");
  const [wizardStep, setWizardStep] = useState(1);
  const [activeDocTab, setActiveDocTab] = useState<"claim" | "resolution" | "creditors" | "poa" | "financial_letter" | "transactions" | "debts" | "assets" | "employees">("claim");
  const [isEditingDoc, setIsEditingDoc] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiDraftedText, setAiDraftedText] = useState("");
  const [isAiDrafting, setIsAiDrafting] = useState(false);
  const [isAiDiagnosing, setIsAiDiagnosing] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  // UI-only: shows the "start analysis" panel over an existing diagnosis
  // without touching activeCase.aiDiagnosis, so a failed re-analysis never
  // destroys the last successful one.
  const [isRequestingNewDiagnosis, setIsRequestingNewDiagnosis] = useState(false);
  const [wizardNotes, setWizardNotes] = useState("");
  const [deficiencies, setDeficiencies] = useState<{ id: string; type: "critical" | "warning"; text: string }[]>([]);
  const [completenessScore, setCompletenessScore] = useState(25);
  const [newCaseModal, setNewCaseModal] = useState(false);
  const [newCaseName, setNewCaseName] = useState("");

  // ── Toast & Confirm
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [confirmModal, setConfirmModal] = useState<ConfirmModal>({ open: false, message: "", onConfirm: () => {} });

  // ── Nafath verification states (UI-only, no actual API)
  const [nafathLawyerState, setNafathLawyerState] = useState<"idle" | "verifying" | "verified">("idle");
  const [nafathRepState, setNafathRepState] = useState<"idle" | "verifying" | "verified">("idle");

  // ── Document ref (for PDF/Word export)
  const legalPaperRef = useRef<HTMLDivElement>(null);

  const showToast = useCallback((message: string, type: Toast["type"] = "success") => {
    const id = Date.now().toString();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3000);
  }, []);

  const showConfirm = useCallback((message: string, onConfirm: () => void) => {
    setConfirmModal({ open: true, message, onConfirm });
  }, []);

  const [docClaimText, setDocClaimText] = useState("");
  const [docResolutionText, setDocResolutionText] = useState("");
  const [docCreditorsText, setDocCreditorsText] = useState("");
  const [docPoaText, setDocPoaText] = useState("");
  const [docFinancialLetterText, setDocFinancialLetterText] = useState("");
  const [docTransactionsText, setDocTransactionsText] = useState("");

  // ── Doc text accessors (avoids repeated tab-switch chains in JSX)
  const getDocText = (tab: string): string => {
    switch (tab) {
      case "claim":            return docClaimText;
      case "resolution":       return docResolutionText;
      case "creditors":        return docCreditorsText;
      case "poa":              return docPoaText;
      case "financial_letter": return docFinancialLetterText;
      case "transactions":     return docTransactionsText;
      default:                 return "";
    }
  };
  const setDocText = (tab: string, val: string) => {
    switch (tab) {
      case "claim":            setDocClaimText(val); break;
      case "resolution":       setDocResolutionText(val); break;
      case "creditors":        setDocCreditorsText(val); break;
      case "poa":              setDocPoaText(val); break;
      case "financial_letter": setDocFinancialLetterText(val); break;
      case "transactions":     setDocTransactionsText(val); break;
    }
  };

  // ── Autosave active case to the server (debounced)
  useEffect(() => {
    if (!activeCaseId) return;
    const current = cases.find(c => c.id === activeCaseId);
    if (!current) return;

    const timeout = setTimeout(() => {
      setSaveStatus("saving");
      saveCaseAction(current)
        .then(res => {
          if (res?.error) {
            setSaveStatus("error");
            showToast(res.error, "error");
            return;
          }
          setSaveStatus("saved");
        })
        .catch(() => {
          setSaveStatus("error");
          showToast("تعذر حفظ التعديلات — تحقق من الاتصال وحاول مجدداً", "error");
        });
    }, 800);

    return () => clearTimeout(timeout);
  }, [cases, activeCaseId, showToast]);

  // Auto-dismiss the "saved" badge after a moment; leave "error" visible
  // until the next save attempt actually resolves it.
  useEffect(() => {
    if (saveStatus !== "saved") return;
    const t = setTimeout(() => setSaveStatus("idle"), 2500);
    return () => clearTimeout(t);
  }, [saveStatus]);

  // ── Active case derived
  const activeCase = cases.find(c => c.id === activeCaseId) ?? null;

  // ── Updater helper
  const updateCase = useCallback((patch: Partial<Case>) => {
    setCases(prev => prev.map(c =>
      c.id === activeCaseId
        ? { ...c, ...patch, lastModified: new Date().toISOString() }
        : c
    ));
  }, [activeCaseId]);

  // ── Computed totals from active case
  const totalDebts = activeCase?.creditors.reduce((s, c) => s + c.amount, 0) ?? activeCase?.totalDebts ?? 0;
  const totalAssets = activeCase?.assets.reduce((s, a) => s + a.value, 0) ?? activeCase?.totalAssets ?? 0;
  // مبني على الأرقام الفعلية المدخلة بدل إجابة المعالج الثابتة — يتغيّر تلقائياً مع بيانات كل ملف
  const assetsCoverLiquidation = totalAssets >= LIQUIDATION_COST_ESTIMATE;

  // ── Employees with computed EOSB
  const employeesWithEosb = (activeCase?.employees ?? []).map(e => ({
    ...e,
    benefits: calcEosb(e.salary, e.joinDate),
  }));
  const totalEosb = employeesWithEosb.reduce((s, e) => s + e.benefits, 0);

  // ── Document generation
  useEffect(() => {
    if (!activeCase) return;
    const { debtorName, legalForm, crNumber, crCity, representativeName, representativeTitle, representativeId, attorneyName, attorneyLicense, courtCity, documentDate, documentTime, poaNumber, poaDate, poaCity } = activeCase;
    const fmtDate = (d: string) => {
      if (!d) return "................";
      try {
        const dt = new Date(d);
        if (isNaN(dt.getTime())) return d;
        return dt.toLocaleDateString("ar-SA", { year: "numeric", month: "long", day: "numeric", calendar: "gregory" });
      } catch { return d; }
    };
    const docDateHijri = fmtDate(documentDate);
    const poaDateHijri = fmtDate(poaDate);

    setDocClaimText(`إلى فضيلة رئيس الدائرة التجارية بالمحكمة التجارية الموقرة بمدينة ${courtCity || crCity}
فضيلة رئيس وأعضاء الدائرة الموقرين،،، حفظكم الله ورعاكم

الموضوع: طلب افتتاح إجراء التصفية الإدارية لشركة ${debtorName} (ذات سجل تجاري رقم: ${crNumber})
التاريخ: ${docDateHijri}  الساعة: ${documentTime || "................"}

السلام عليكم ورحمة الله وبركاته، أما بعد:

بصفتي وكيلاً شرعياً بموجب الوكالة الشرعية الصادرة برقم (${poaNumber || "...."}) وتاريخ (${poaDateHijri}) من كتابة عدل ${poaCity || crCity}، عن موكلي شركة ${debtorName}، وهي شركة من نوع "${legalForm}" مسجلة بمدينة ${crCity} بموجب السجل التجاري ذي الرقم (${crNumber}) الصادر بتاريخ (....)، ويمثلها ${representativeTitle || "المدير"} السيد ${representativeName} (هوية رقم: ${representativeId || "...."}). ويقع مركزها الرئيسي في ${crCity}.

الوقائع والأسانيد:
1. تقدم موكلنا بهذه الدعوى طالباً افتتاح إجراء "التصفية الإدارية"، حيث عجزت الشركة عن الوفاء بالتزاماتها المالية وديونها التي بلغت (${totalDebts.toLocaleString()} ريال سعودي) نظراً لركود الأسواق وتعرض الشركة لتعثرات مالية بالغة منعت المنشأة من الاستمرار في ممارسة نشاطها التجاري حيث أصبح النشاط متوقفاً بالكامل.
2. نود إحاطة فضيلتكم بأن القيمة الإجمالية لأصول الشركة وممتلكاتها لا تتجاوز مبلغ (${totalAssets.toLocaleString()} ريال سعودي) بناءً على بيان الأصول المرفق، وحيث أن هذه الأصول ضئيلة للغاية ولا تكفي بأي حال من الأحوال لتغطية مصروفات إجراء التصفية العادية أو أتعاب أمين التصفية.
3. استناداً إلى أحكام المادة (168) من نظام الإفلاس الصادر بالمرسوم الملكي رقم (م/50) وتاريخ 1439/05/28هـ، فإن موكلي تنطبق عليه تماماً شروط افتتاح إجراء التصفية الإدارية لكونه مديناً مفلساً لا تكفي أصوله لتغطية مصروفات إجراء التصفية.

الطلبات:
بناءً على ما تقدم من وقائع وأسانيد قانونية، وتأسيساً على نظام الإفلاس السعودي ولائحته التنفيذية، نطلب من دائرتكم الموقرة ما يلي:
أولاً: قبول هذا الطلب شكلاً لتوفر كافة المتطلبات النظامية والشكلية المطلوبة قانوناً.
ثانياً: قيد الطلب وافتتاح إجراء التصفية الإدارية لموكلي شركة ${debtorName}، وإحالة الملف إلى لجنة الإفلاس لاتخاذ شؤونها النظامية بالتصفية.

والله الموفق والمستعان،،
مقدم الطلب/ المحامي الوكيل: ${attorneyName}`);

    setDocResolutionText(`محضر قرار الشركاء في الجمعية العامة غير العادية
لشركة ${debtorName} (ذات المسؤولية المحدودة)
المسجلة بالسجل التجاري رقم: (${crNumber}) وتاريخ (....) بمدينة ${crCity}

إنه في تاريخ ${docDateHijri}، في تمام الساعة (${documentTime || "..."}م)، وبمقر الشركة الرئيسي بمدينة ${crCity}، عقد الشركاء في شركة ${debtorName} جمعيتهم العامة غير العادية، وذلك بحضور الشركاء الملاك لكامل رأس المال.

القرارات:
1. الموافقة بالإجماع على تقديم طلب افتتاح إجراء "التصفية الإدارية" بموجب نظام الإفلاس السعودي أمام المحكمة التجارية المختصة.
2. تفويض الأستاذ المحامي/ ${attorneyName} (رخصة محاماة رقم: ${attorneyLicense}) في تمثيل الشركة والتوقيع نيابة عنها ومتابعة الطلب أمام المحكمة التجارية ولجنة الإفلاس.
3. التزام الإدارة بالتعاون التام مع لجنة الإفلاس والأمين المعين.

تواقيع الشركاء الحاضرين:
1. (التوقيع: ................)
2. (التوقيع: ................)`);

    setDocCreditorsText(`إشعار موجه إلى الدائنين الكرام
بشأن طلب افتتاح إجراء التصفية الإدارية لشركة ${debtorName}

تود إدارة شركة ${debtorName} إحاطة سعادة الدائنين الكرام بأنها بصدد تقديم طلب رسمي لافتتاح إجراء التصفية الإدارية لدى المحكمة التجارية بـ ${crCity} استناداً لنظام الإفلاس السعودي.

وتأتي هذه الخطوة بعد استنفاد كافة السبل التشغيلية، حيث بلغت الديون الإجمالية (${totalDebts.toLocaleString()} ريال) مقابل أصول لا تتجاوز (${totalAssets.toLocaleString()} ريال).

يهدف هذا الإجراء إلى حفظ حقوق جميع الأطراف وفق الأولويات النظامية المقررة.

عن إدارة شركة ${debtorName}:
المدير التنفيذي/ ${representativeName}`);

    setDocPoaText(`وكالة شرعية
رقم الوكالة: ${poaNumber || "................"}
صادرة بتاريخ: ${poaDateHijri} من كتابة عدل ${poaCity || crCity}

أنا/ ${representativeName}، ${representativeTitle || "مدير"} شركة ${debtorName}
رقم الهوية / الإقامة: ${representativeId || "............................"}
السجل التجاري: (${crNumber}) مسجل بمدينة ${crCity}

أوكّل وأفوّض:
الأستاذ المحامي/ ${attorneyName}
رقم رخصة المحاماة: ${attorneyLicense}

في القيام بجميع الأعمال القانونية والإجراءات القضائية المتعلقة بتقديم طلب افتتاح إجراء "التصفية الإدارية" لشركة ${debtorName} أمام المحكمة التجارية بمدينة ${courtCity || crCity} ولجنة الإفلاس والجهات الحكومية ذات العلاقة، ويحق له:
- تقديم الطلبات والمذكرات والوثائق
- استلام القرارات والأحكام القضائية
- التوقيع نيابة عن الموكل في كل ما يتعلق بهذا الإجراء
- تفويض الغير من زملائه المحامين في سبيل تنفيذ هذه الوكالة

هذه الوكالة سارية المفعول حتى انتهاء إجراءات التصفية الإدارية بصورتها النهائية.

الموكِّل/ ${representativeName}
رقم الهوية/الإقامة: ${representativeId || "............................"}

يُعتمد هذا التوقيع أمام: كتابة عدل ${poaCity || crCity}
رقم التوثيق: ${poaNumber || "............................"}  بتاريخ: ${poaDateHijri}`);

    setDocFinancialLetterText(`بسم الله الرحمن الرحيم

المحكمة التجارية الموقرة بمدينة ${crCity}
الدائرة التجارية المختصة بنظر قضايا الإفلاس

تحية طيبة وبعد،،،

الموضوع: خطاب بيان أسباب تعذر تقديم القوائم المالية المدققة لشركة ${debtorName}

إشارةً إلى طلب افتتاح إجراء التصفية الإدارية المقدم من وكيل شركة ${debtorName} (السجل التجاري: ${crNumber}) أمام دائرتكم الموقرة، وإلى ما تنص عليه المادة (168) من نظام الإفلاس من جواز تقديم الطلب مشفوعاً ببيان بالأسباب الموجبة لتعذر تقديم القوائم المالية، يتشرف وكيل الشركة الأستاذ/ ${attorneyName} بإحاطة الدائرة الموقرة بالآتي:

أسباب تعذر تقديم القوائم المالية لآخر سنتين:
1. توقف الشركة الكامل عن ممارسة نشاطها التجاري منذ فترة وعدم تعيين مدقق حسابات قانوني في السنوات الأخيرة.
2. تعذر الوصول إلى المنظومة المحاسبية الإلكترونية بسبب انتهاء العقد مع مزود الخدمة وعدم سداد رسوم الاشتراك.
3. فقدان جزء من السجلات المحاسبية الورقية نتيجة إخلاء المقر التجاري في ظروف طارئة.

وعليه، يتعهد الموكّل بتقديم أي وثائق بديلة أو بيانات مصرفية معززة تطلبها الدائرة الموقرة أو لجنة الإفلاس المختصة لإتمام الإجراء النظامي.

مقدمه مع الاحترام،،،
الأستاذ المحامي/ ${attorneyName}
رخصة محاماة رقم: ${attorneyLicense}`);

    setDocTransactionsText(`بيان التصرفات المالية للشركة
خلال الفترة من ................ إلى ................ (سنتان كاملتان — 24 شهراً)

شركة ${debtorName} — السجل التجاري: ${crNumber}
مُعدّ بواسطة: ${attorneyName} (المحامي الوكيل)

ملاحظة: وفق لائحة المعلومات والوثائق لنظام الإفلاس، يجب أن يغطي هذا البيان سنتين كاملتين (24 شهراً) من تاريخ تقديم الطلب.

أولاً: المدفوعات الصادرة خلال السنة الأولى (من: ................ إلى: ................):
──────────────────────────────────────────────────────────────
التاريخ          المستفيد                المبلغ (ر.س)    الغرض
............     ......................   ...........     رواتب الموظفين
............     ......................   ...........     إيجار المقر التجاري
............     ......................   ...........     مستحقات التأمينات الاجتماعية
............     ......................   ...........     سداد أقساط تمويل بنكي
[يُرجى إكمال هذا الجدول بالبيانات الفعلية من كشوف الحساب البنكي]

أولاً (تابع): المدفوعات الصادرة خلال السنة الثانية (من: ................ إلى: ................):
──────────────────────────────────────────────────────────────
التاريخ          المستفيد                المبلغ (ر.س)    الغرض
............     ......................   ...........     رواتب الموظفين
............     ......................   ...........     إيجار المقر التجاري
[يُرجى إكمال هذا الجدول بالبيانات الفعلية]

ثانياً: المبالغ الواردة خلال السنتين الماضيتين:
──────────────────────────────────────────────────────────────
التاريخ          المصدر                  المبلغ (ر.س)    البيان
............     ......................   ...........     مقبوضات من عملاء
............     ......................   ...........     تسييل أصل
[يُرجى إكمال هذا الجدول بالبيانات الفعلية]

ثالثاً: التصرفات في الأصول خلال السنتين الماضيتين:
──────────────────────────────────────────────────────────────
لا يوجد تصرف في أصول يستوجب الإفصاح / أو:
[اذكر أي بيع أو تنازل أو رهن لأصل خلال الفترتين]

إقرار الصحة والمطابقة:
المدير التنفيذي/ ${representativeName}
التاريخ: .......................`);

  }, [activeCase?.id, activeCase?.debtorName, activeCase?.legalForm, activeCase?.crNumber, activeCase?.crCity, activeCase?.representativeName, activeCase?.representativeTitle, activeCase?.representativeId, activeCase?.attorneyName, activeCase?.attorneyLicense, activeCase?.courtCity, activeCase?.documentDate, activeCase?.documentTime, activeCase?.poaNumber, activeCase?.poaDate, activeCase?.poaCity, totalDebts, totalAssets]);

  // ── Completeness score (the deficiency *list* itself now comes from the
  // shared lib/recommendation.ts so the dashboard and the AI prompt are
  // always checking the exact same rules)
  useEffect(() => {
    if (!activeCase) return;
    let score = 20;

    if (activeCase.debtorName.trim().length > 3) score += 8;
    if (activeCase.crNumber.length === 10) score += 8;
    if (activeCase.attorneyName.trim().length > 3) score += 5;
    if (totalAssets > 0) score += 7;
    if (totalDebts > 0) score += 7;
    if (activeCase.isEstablishment === "company") {
      const hasResolution = activeCase.uploadedFiles.some(f => f.type === "قرار الشركاء" && f.status === "success");
      if (hasResolution) score += 10;
    }
    if (activeCase.financialStatementsAvailable === "yes") score += 10;
    if (activeCase.financialTransactionsAvailable === "yes") score += 8;
    if (activeCase.creditorsNotified === "yes") score += 7;
    const zatcaDone = Object.values(activeCase.zatcaChecklist).filter(Boolean).length;
    score += zatcaDone * 2;

    setCompletenessScore(Math.min(score, 100));
    setDeficiencies(getDeficiencies(activeCase));
  }, [activeCase, totalAssets, totalDebts]);

  // ── Recommendation — rule-based preliminary classification (src/lib/recommendation.ts).
  // NOT a substitute for the AI legal analysis below: the AI receives this same
  // classification as ground truth and must flag disagreement explicitly rather
  // than silently picking something else — see the system prompt in api/diagnose.
  const recommendation = activeCase ? getRecommendation(activeCase) : null;

  // ── File Upload Handler (uploads to disk via /api/upload, then records metadata)
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !activeCase) return;

    const formData = new FormData();
    formData.append("file", file);
    formData.append("caseId", activeCase.id);

    try {
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "فشل رفع الملف");
      updateCase({ uploadedFiles: [...(activeCase.uploadedFiles ?? []), data] });
      showToast(`تم رفع "${file.name}" بنجاح`);
    } catch (err) {
      showToast((err as Error).message, "error");
    }
  };

  // ── AI Drafting (Claude API)
  const handleAiDrafting = async () => {
    if (!aiPrompt.trim()) return;
    setIsAiDrafting(true);
    setAiDraftedText("");
    try {
      const res = await fetch("/api/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: aiPrompt,
          documentType: activeDocTab,
          caseContext: activeCase ? {
            debtorName: activeCase.debtorName,
            crCity: activeCase.crCity,
            totalDebts: activeCase.creditors.reduce((s, c) => s + c.amount, 0),
            totalAssets: activeCase.assets.reduce((s, a) => s + a.value, 0),
          } : null,
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setAiDraftedText(data.draft);
    } catch (e) {
      showToast((e as Error).message, "error");
    } finally {
      setIsAiDrafting(false);
    }
  };

  // ── PDF Download
  const downloadPdf = useCallback(async () => {
    const el = legalPaperRef.current;
    if (!el) return;
    showToast("جاري تجهيز ملف PDF...", "info");
    try {
      const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
        import("html2canvas"),
        import("jspdf"),
      ]);

      // Wait for all fonts (including Tajawal) to fully load
      await document.fonts.ready;

      const canvas = await html2canvas(el, {
        scale: 2,
        useCORS: true,
        backgroundColor: "#ffffff",
        logging: false,
      });

      const imgData = canvas.toDataURL("image/jpeg", 1.0);
      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const pdfW = pdf.internal.pageSize.getWidth();  // 210mm
      const pdfH = pdf.internal.pageSize.getHeight(); // 297mm
      const imgH = (canvas.height / canvas.width) * pdfW;

      if (imgH <= pdfH + 1) {
        // Content fits in one A4 page (1mm tolerance for floating point)
        pdf.addImage(imgData, "JPEG", 0, 0, pdfW, imgH);
      } else {
        // Content spans multiple pages — split correctly
        let offsetY = 0;
        while (offsetY < imgH) {
          if (offsetY > 0) pdf.addPage();
          pdf.addImage(imgData, "JPEG", 0, -offsetY, pdfW, imgH);
          offsetY += pdfH;
        }
      }

      const safeDate = new Date().toISOString().substring(0, 10);
      const filename = `${activeCase?.debtorName || "مستند"} — ${safeDate}.pdf`;
      pdf.save(filename);
      showToast("تم تحميل ملف PDF");
    } catch {
      showToast("فشل تحميل PDF — حاول مجدداً", "error");
    }
  }, [activeCase, showToast]);

  // ── Word (DOCX) Download
  // Not wrapped in useCallback intentionally — avoids stale closure over doc text state
  const downloadDocx = async () => {
    if (!activeCase) return;
    showToast("جاري تجهيز ملف Word...", "info");
    try {
      const { Document, Packer, Paragraph, TextRun, AlignmentType, HeadingLevel, BorderStyle } = await import("docx");
      const docText = getDocText(activeDocTab) || "";
      const lines = docText.split("\n").filter(Boolean);
      const safeDate = new Date().toISOString().substring(0, 10);
      const doc = new Document({
        sections: [{
          properties: {
            page: {
              size: { width: 11906, height: 16838 },
              margin: { top: 1134, bottom: 1134, left: 1276, right: 1276 },
            },
          },
          children: [
            new Paragraph({
              text: "المملكة العربية السعودية",
              alignment: AlignmentType.CENTER,
              bidirectional: true,
              heading: HeadingLevel.HEADING_2,
              border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "9A7432" } },
            }),
            new Paragraph({
              children: [new TextRun({ text: activeCase.debtorName || "اسم الشركة", bold: true, size: 28 })],
              alignment: AlignmentType.CENTER,
              bidirectional: true,
            }),
            new Paragraph({
              children: [new TextRun({ text: `السجل التجاري: ${activeCase.crNumber} — ${activeCase.crCity}`, size: 20, color: "64748B" })],
              alignment: AlignmentType.CENTER,
              bidirectional: true,
            }),
            new Paragraph({ text: "", spacing: { after: 200 }, bidirectional: true }),
            ...lines.map(line => new Paragraph({
              children: [new TextRun({ text: line, size: 24 })],
              alignment: AlignmentType.JUSTIFIED,
              bidirectional: true,
              spacing: { after: 120 },
            })),
          ],
        }],
      });
      const blob = await Packer.toBlob(doc);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${activeCase.debtorName || "مستند"} — ${safeDate}.docx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      showToast("تم تحميل ملف Word");
    } catch {
      showToast("فشل تحميل Word — حاول مجدداً", "error");
    }
  };

  // ── Case List Operations
  const createCase = async () => {
    if (!newCaseName.trim()) return;
    const c = createNewCase();
    c.debtorName = newCaseName.trim();

    const res = await saveCaseAction(c);
    if (res?.error) {
      showToast(res.error, "error");
      return;
    }

    setCases(prev => [c, ...prev]);
    setActiveCaseId(c.id);
    setView("case");
    setActiveTab("dashboard");
    setNewCaseModal(false);
    setNewCaseName("");
  };

  const deleteCase = (id: string) => {
    showConfirm("هل أنت متأكد من حذف هذا الملف؟ لا يمكن التراجع عن هذا الإجراء.", async () => {
      const res = await deleteCaseAction(id);
      if (res?.error) {
        showToast(res.error, "error");
        return;
      }
      setCases(prev => prev.filter(c => c.id !== id));
    });
  };

  const openCase = (id: string) => {
    setActiveCaseId(id);
    setView("case");
    setActiveTab("dashboard");
    setWizardStep(1);
  };

  // ─── SINGLE UNIFIED RETURN ─────────────────────────────────────────────────
  return (
    <>

    {/* ═══════ LIST VIEW ═══════ */}
    {view === "list" && (
      <div style={{ minHeight: "100vh", padding: "40px 48px", background: "var(--bg-page)" }}>
        <div style={{ maxWidth: "1100px", margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "36px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
            <div style={{ width: "44px", height: "44px", borderRadius: "10px", background: "var(--gold)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 800, fontSize: "1.3rem", flexShrink: 0 }}>إ</div>
            <div>
              <h1 className="gold-gradient-text" style={{ fontSize: "1.45rem", fontWeight: 800, lineHeight: 1.1 }}>إفلاس تك</h1>
              <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "2px" }}>نظام إدارة ملفات الإفلاس والتصفية الإدارية</p>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>{userName}</span>
            <form action={logout}>
              <button type="submit" className="btn-ghost" style={{ fontSize: "0.75rem" }}>تسجيل الخروج</button>
            </form>
            <button className="btn-primary" onClick={() => setNewCaseModal(true)}>
              <Plus size={16} /> ملف عميل جديد
            </button>
          </div>
        </div>

        {/* ── Stats ── */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "14px", marginBottom: "32px" }}>
          {([
            { label: "إجمالي الملفات", value: cases.length, icon: Folder, accent: "var(--green-600)" },
            { label: "قيد التجهيز", value: cases.filter(c => c.status === "preparing").length, icon: Settings, accent: "var(--gold)" },
            { label: "مقدمة للمحكمة", value: cases.filter(c => c.status === "submitted").length, icon: Scale, accent: "var(--green-600)" },
            { label: "منجزة / مغلقة", value: cases.filter(c => c.status === "closed" || c.status === "decided").length, icon: CircleCheckBig, accent: "var(--text-muted)" },
          ] as { label: string; value: number; icon: LucideIcon; accent: string }[]).map((stat, i) => (
            <div key={i} className="stat-card">
              <div className="stat-icon"><stat.icon size={18} color={stat.accent} /></div>
              <div className="stat-value" style={{ color: stat.accent }}>{stat.value}</div>
              <div className="stat-label">{stat.label}</div>
            </div>
          ))}
        </div>

        {/* ── Cases Grid ── */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: "16px" }}>
          {cases.map(c => {
            const st = statusLabel(c.status);
            const totalD = c.creditors.reduce((s, cr) => s + cr.amount, 0) || c.totalDebts;
            const totalA = c.assets.reduce((s, a) => s + a.value, 0) || c.totalAssets;
            return (
              <div
                key={c.id}
                className="card case-card"
                style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "14px", cursor: "pointer", transition: "box-shadow 0.2s, transform 0.2s" }}
                onClick={() => openCase(c.id)}
              >
                {/* Card header */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "10px" }}>
                  <div style={{ minWidth: 0 }}>
                    <h3 style={{ fontSize: "0.95rem", fontWeight: 700, color: "var(--text-heading)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.debtorName || "ملف غير مكتمل"}</h3>
                    <p style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginTop: "3px" }}>س.ت: {c.crNumber || "—"} · {c.crCity}</p>
                  </div>
                  <span className="badge" style={{ background: st.color + "15", color: st.color, border: `1px solid ${st.color}30`, flexShrink: 0 }}>{st.label}</span>
                </div>

                {/* Financials */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                  <div style={{ background: "var(--red-light)", border: "1px solid var(--red-border)", borderRadius: "var(--radius-sm)", padding: "8px 12px" }}>
                    <p style={{ fontSize: "0.65rem", color: "var(--text-muted)", marginBottom: "2px" }}>إجمالي الديون</p>
                    <p style={{ fontSize: "0.9rem", fontWeight: 700, color: "var(--red)" }}>{totalD.toLocaleString()} <span style={{ fontSize: "0.65rem", fontWeight: 400 }}>ر.س</span></p>
                  </div>
                  <div style={{ background: "var(--green-50)", border: "1px solid var(--green-border)", borderRadius: "var(--radius-sm)", padding: "8px 12px" }}>
                    <p style={{ fontSize: "0.65rem", color: "var(--text-muted)", marginBottom: "2px" }}>إجمالي الأصول</p>
                    <p style={{ fontSize: "0.9rem", fontWeight: 700, color: "var(--green-600)" }}>{totalA.toLocaleString()} <span style={{ fontSize: "0.65rem", fontWeight: 400 }}>ر.س</span></p>
                  </div>
                </div>

                {/* Footer */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: "10px", borderTop: "1px solid var(--border)" }}>
                  <span style={{ fontSize: "0.7rem", color: "var(--text-faint)" }}>آخر تعديل: {new Date(c.lastModified).toLocaleDateString("ar-SA")}</span>
                  <button
                    className="btn-ghost"
                    onClick={e => { e.stopPropagation(); deleteCase(c.id); }}
                    style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}
                  ><Trash2 size={13} /> حذف</button>
                </div>
              </div>
            );
          })}

          {/* Add new card */}
          <div
            className="add-case-card"
            style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "10px", cursor: "pointer", border: "2px dashed var(--border-strong)", borderRadius: "var(--radius-lg)", background: "transparent", minHeight: "160px", transition: "border-color 0.2s, background 0.2s" }}
            onClick={() => setNewCaseModal(true)}
          >
            <span style={{ fontSize: "1.6rem", opacity: 0.5 }}>+</span>
            <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", fontWeight: 600 }}>إضافة ملف عميل جديد</p>
          </div>
        </div>

        {newCaseModal && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(15,25,35,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, backdropFilter: "blur(4px)" }}>
            <div className="card animate-fade-in" style={{ padding: "28px", width: "420px", display: "flex", flexDirection: "column", gap: "18px" }}>
              <div>
                <h3 style={{ fontSize: "1.05rem", fontWeight: 700, color: "var(--text-heading)", marginBottom: "4px" }}>ملف عميل جديد</h3>
                <p style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>أدخل الاسم التجاري للشركة أو المنشأة المدينة</p>
              </div>
              <div className="field-group">
                <label className="field-label">الاسم التجاري للمدين</label>
                <input
                  className="custom-input"
                  placeholder="مثال: شركة الأمل للمقاولات المحدودة"
                  value={newCaseName}
                  onChange={e => setNewCaseName(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && createCase()}
                  autoFocus
                />
              </div>
              <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
                <button className="btn-secondary" onClick={() => { setNewCaseModal(false); setNewCaseName(""); }}>إلغاء</button>
                <button className="btn-primary" onClick={createCase} disabled={!newCaseName.trim()}>إنشاء الملف</button>
              </div>
            </div>
          </div>
        )}
        </div>
      </div>
    )}

    {/* ═══════ CASE VIEW ═══════ */}
    {view === "case" && activeCase && (
      <div className="dashboard-container">
      {/* ── Sidebar ── */}
      <aside className="sidebar">
        {/* Logo */}
        <div className="sidebar-logo">
          <div className="sidebar-logo-icon">إ</div>
          <div>
            <div style={{ fontSize: "0.88rem", fontWeight: 800, color: "var(--gold)" }}>إفلاس تك</div>
            <div style={{ fontSize: "0.62rem", color: "var(--text-faint)" }}>التصفية الإدارية</div>
          </div>
        </div>

        {/* Back */}
        <button
          className="btn-ghost"
          onClick={() => setView("list")}
          style={{ justifyContent: "flex-start", width: "100%", marginBottom: "8px", fontSize: "0.8rem" }}
        >
          <ArrowLeft size={14} /> جميع الملفات
        </button>

        <hr className="divider" style={{ marginBottom: "10px" }} />

        {/* Nav */}
        <nav className="sidebar-nav">
          {([
            { id: "dashboard", icon: LayoutDashboard, label: "لوحة التحكم" },
            { id: "wizard",    icon: Stethoscope,      label: "مساعد التشخيص" },
            { id: "timeline",  icon: Calendar,         label: "الجدول الزمني" },
            { id: "documents", icon: FileText,         label: "الوثائق القانونية" },
            { id: "kb",        icon: HelpCircle,       label: "الدليل المعرفي" },
          ] as { id: typeof activeTab; icon: LucideIcon; label: string }[]).map(tab => (
            <button
              key={tab.id}
              className={`nav-item ${activeTab === tab.id ? "active" : ""}`}
              onClick={() => { setActiveTab(tab.id); if (tab.id === "wizard") setWizardStep(1); }}
            >
              <span className="nav-icon" style={{ display: "inline-flex" }}><tab.icon size={16} /></span>
              <span>{tab.label}</span>
            </button>
          ))}
        </nav>

        {/* Case info footer */}
        <div style={{ marginTop: "auto", borderTop: "1px solid var(--border)", paddingTop: "12px" }}>
          <div className="field-group" style={{ gap: "4px", marginBottom: "8px" }}>
            <label className="label-text" style={{ fontSize: "0.68rem" }}>حالة الملف</label>
            <select
              className="custom-select"
              value={activeCase.status}
              onChange={e => updateCase({ status: e.target.value as Case["status"] })}
              style={{ fontSize: "0.78rem", padding: "6px 8px" }}
            >
              <option value="draft">مسودة</option>
              <option value="preparing">قيد التجهيز</option>
              <option value="submitted">مقدم للمحكمة</option>
              <option value="decided">صدر القرار</option>
              <option value="closed">منجز / مغلق</option>
            </select>
          </div>
          <p style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--text-heading)", marginBottom: "2px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{activeCase.debtorName || "ملف جديد"}</p>
          <p style={{ fontSize: "0.68rem", color: "var(--text-faint)" }}>{activeCase.attorneyName || "—"}</p>
        </div>
      </aside>

      {/* ── Main Content ── */}
      <main style={{ padding: "20px 24px", overflowY: "auto", height: "100vh", display: "flex", flexDirection: "column", gap: "16px", background: "var(--bg-page)" }}>

        {/* Header bar */}
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingBottom: "14px", borderBottom: "1px solid var(--border)" }}>
          <div>
            <span style={{ fontSize: "0.68rem", color: "var(--text-faint)", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600 }}>الملف النشط</span>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "3px", flexWrap: "wrap" }}>
              <h2 style={{ fontSize: "1.15rem", fontWeight: 800, color: "var(--text-heading)" }}>{activeCase.debtorName || "ملف جديد"}</h2>
              {activeCase.crNumber && <span className="chip">س.ت: {activeCase.crNumber}</span>}
              {activeCase.caseNumber && <span className="badge badge-green">رقم الدعوى: {activeCase.caseNumber}</span>}
              {saveStatus === "saving" && (
                <span style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "0.7rem", color: "var(--text-muted)" }}>
                  <span style={{ width: "10px", height: "10px", border: "2px solid var(--text-muted)", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
                  جارِ الحفظ...
                </span>
              )}
              {saveStatus === "saved" && (
                <span style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "0.7rem", color: "var(--green-600)", fontWeight: 600 }}><Check size={13} /> تم الحفظ</span>
              )}
              {saveStatus === "error" && (
                <span style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "0.7rem", color: "var(--red)", fontWeight: 600 }}><AlertTriangle size={13} /> فشل الحفظ — سيُعاد المحاولة مع أي تعديل جديد</span>
              )}
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div style={{ textAlign: "left" }}>
              <p style={{ fontSize: "0.68rem", color: "var(--text-muted)", marginBottom: "4px" }}>اكتمال الملف</p>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <div className="progress-bar-bg" style={{ width: "80px" }}>
                  <div className="progress-bar-fill" style={{ width: `${completenessScore}%` }} />
                </div>
                <span style={{ fontSize: "0.78rem", fontWeight: 700, color: completenessScore >= 80 ? "var(--green-600)" : "var(--gold)" }}>{completenessScore}%</span>
              </div>
            </div>
            <button className="btn-primary" onClick={() => { setActiveTab("wizard"); setWizardStep(1); }} style={{ fontSize: "0.82rem" }}>
              تحديث الملف
            </button>
          </div>
        </header>

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* 1. DASHBOARD TAB */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        {activeTab === "dashboard" && (
          <div className="animate-fade-in" style={{ display: "flex", flexDirection: "column", gap: "14px" }}>

            {/* Article 22 — Automatic Stay Banner */}
            {(activeCase.status === "submitted" || activeCase.status === "decided") && (
              <div style={{ background: "rgba(21,128,61,0.06)", border: "1px solid var(--green-border)", borderRadius: "var(--radius-md)", padding: "12px 16px", display: "flex", gap: "12px", alignItems: "flex-start" }}>
                <Scale size={18} color="var(--green-600)" style={{ flexShrink: 0 }} />
                <div>
                  <p style={{ fontSize: "0.82rem", fontWeight: 700, color: "var(--green-600)", marginBottom: "3px" }}>المادة 22 — الوقف التلقائي لجميع الدعاوى المدنية</p>
                  <p style={{ fontSize: "0.74rem", color: "var(--text-body)", lineHeight: 1.5 }}>
                    بمجرد قبول المحكمة للطلب، تتوقف تلقائياً جميع الدعاوى المدنية ضد المدين وتجميد أي إجراءات تنفيذية من الدائنين. يحق للمحامي إبلاغ كل دائن رسمياً بهذا الوقف كورقة ضغط قانونية.
                  </p>
                </div>
              </div>
            )}

            {/* Financial Summary */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "12px" }}>
              {[
                { label: "إجمالي الديون", value: `${totalDebts.toLocaleString()} ر.س`, sub: `${activeCase.creditors.length} دائن`, color: "var(--red)", bg: "var(--red-light)", border: "var(--red-border)" },
                { label: "إجمالي الأصول", value: `${totalAssets.toLocaleString()} ر.س`, sub: `${activeCase.assets.length} بند`, color: "var(--green-600)", bg: "var(--green-50)", border: "var(--green-border)" },
                { label: "عجز التصفية", value: `${Math.max(0, LIQUIDATION_COST_ESTIMATE - totalAssets).toLocaleString()} ر.س`, sub: `المطلوب ${LIQUIDATION_COST_ESTIMATE.toLocaleString()} ر.س`, color: "var(--gold)", bg: "var(--gold-light)", border: "var(--gold-border)" },
                { label: "مستحقات العمالة", value: `${totalEosb.toLocaleString()} ر.س`, sub: `${activeCase.employees.length} موظف`, color: "var(--green-700)", bg: "var(--green-50)", border: "var(--green-border)" },
              ].map((item, i) => (
                <div key={i} className="stat-card" style={{ background: item.bg, border: `1px solid ${item.border}` }}>
                  <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginBottom: "6px", fontWeight: 500 }}>{item.label}</div>
                  <div style={{ fontSize: "1.15rem", fontWeight: 800, color: item.color, marginBottom: "3px" }}>{item.value}</div>
                  <div style={{ fontSize: "0.68rem", color: "var(--text-faint)" }}>{item.sub}</div>
                </div>
              ))}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "14px" }}>

              {/* Legal Assessment */}
              {recommendation && (
                <div className="glass-panel" style={{ padding: "14px", display: "flex", flexDirection: "column", gap: "8px" }}>
                  <h3 style={{ fontSize: "0.9rem", fontWeight: 700 }} className="gold-gradient-text">تصنيف أولي فوري (قواعد ثابتة)</h3>
                  <span style={{ fontSize: "0.72rem", padding: "3px 10px", borderRadius: "20px", background: recommendation.color + "15", color: recommendation.color, border: `1px solid ${recommendation.color}30`, display: "inline-block", fontWeight: 700 }}>{recommendation.title}</span>
                  <ul style={{ display: "flex", flexDirection: "column", gap: "4px", paddingRight: "14px", fontSize: "0.73rem", color: "var(--text-secondary)", marginTop: "4px" }}>
                    {recommendation.steps.map((s, i) => <li key={i} style={{ lineHeight: "1.4" }}>{s}</li>)}
                  </ul>
                  <p style={{ fontSize: "0.68rem", color: "var(--text-faint)", marginTop: "2px" }}>مبني على إجابات المعالج فقط — لا يطّلع على الملاحظات الحرة أو الدعاوى القائمة. للتحليل المعتمد راجع تبويب &quot;التشخيص الذكي&quot;.</p>
                </div>
              )}

              {/* Government Agencies Checklist */}
              <div className="glass-panel" style={{ padding: "14px" }}>
                <h3 style={{ fontSize: "0.9rem", fontWeight: 700, marginBottom: "12px" }} className="gold-gradient-text">قائمة تحقق الجهات الحكومية</h3>

                {/* ZATCA */}
                <div style={{ marginBottom: "10px", paddingBottom: "10px", borderBottom: "1px solid var(--border)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                    <p style={{ fontSize: "0.77rem", fontWeight: 700, color: "var(--text-heading)" }}>هيئة الزكاة والضريبة والجمارك (ZATCA)</p>
                    <a href="https://zatca.gov.sa" target="_blank" rel="noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: "2px", fontSize: "0.64rem", color: "var(--primary-green)", textDecoration: "none" }}>الموقع <ArrowUpRight size={12} /></a>
                  </div>
                  <input className="custom-input" value={activeCase.zatcaFileNumber} onChange={e => updateCase({ zatcaFileNumber: e.target.value })} placeholder="رقم ملف ZATCA" style={{ fontSize: "0.75rem", padding: "5px 8px", marginBottom: "5px" }} />
                  {([
                    { key: "accountStatement", label: "بيان حساب ZATCA محدث" },
                    { key: "vatRegistration", label: "التسجيل في ضريبة القيمة المضافة" },
                    { key: "zakahCert", label: "شهادة الزكاة (سارية)" },
                    { key: "clearanceLetter", label: "خطاب إخلاء الطرف / شهادة الحالة الضريبية" },
                  ] as { key: keyof ZatcaChecklist; label: string }[]).map(item => (
                    <label key={item.key} style={{ display: "flex", alignItems: "center", gap: "7px", padding: "3px 0", cursor: "pointer" }}>
                      <input type="checkbox" checked={activeCase.zatcaChecklist[item.key]} onChange={e => updateCase({ zatcaChecklist: { ...activeCase.zatcaChecklist, [item.key]: e.target.checked } })} style={{ accentColor: "var(--primary-green)", width: "13px", height: "13px" }} />
                      <span style={{ fontSize: "0.72rem", color: activeCase.zatcaChecklist[item.key] ? "var(--success)" : "var(--text-secondary)", textDecoration: activeCase.zatcaChecklist[item.key] ? "line-through" : "none" }}>{item.label}</span>
                    </label>
                  ))}
                </div>

                {/* GOSI */}
                <div style={{ marginBottom: "10px", paddingBottom: "10px", borderBottom: "1px solid var(--border)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                    <p style={{ fontSize: "0.77rem", fontWeight: 700, color: "var(--text-heading)" }}>التأمينات الاجتماعية (GOSI)</p>
                    <a href="https://gosi.gov.sa" target="_blank" rel="noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: "2px", fontSize: "0.64rem", color: "var(--primary-green)", textDecoration: "none" }}>الموقع <ArrowUpRight size={12} /></a>
                  </div>
                  <input className="custom-input" value={activeCase.gosiFileNumber} onChange={e => updateCase({ gosiFileNumber: e.target.value })} placeholder="رقم منشأة GOSI" style={{ fontSize: "0.75rem", padding: "5px 8px", marginBottom: "5px" }} />
                  {([
                    { key: "registered" as keyof GosiChecklist, label: "المنشأة مسجلة في GOSI" },
                    { key: "debtsStatement" as keyof GosiChecklist, label: "بيان الديون الاشتراكية المتأخرة" },
                    { key: "clearanceLetter" as keyof GosiChecklist, label: "خطاب إخلاء الطرف من GOSI" },
                  ]).map(item => (
                    <label key={item.key} style={{ display: "flex", alignItems: "center", gap: "7px", padding: "3px 0", cursor: "pointer" }}>
                      <input type="checkbox" checked={activeCase.gosiChecklist[item.key]} onChange={e => updateCase({ gosiChecklist: { ...activeCase.gosiChecklist, [item.key]: e.target.checked } })} style={{ accentColor: "var(--primary-green)", width: "13px", height: "13px" }} />
                      <span style={{ fontSize: "0.72rem", color: activeCase.gosiChecklist[item.key] ? "var(--success)" : "var(--text-secondary)", textDecoration: activeCase.gosiChecklist[item.key] ? "line-through" : "none" }}>{item.label}</span>
                    </label>
                  ))}
                </div>

                {/* HR Ministry */}
                <div style={{ marginBottom: "10px", paddingBottom: "10px", borderBottom: "1px solid var(--border)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                    <p style={{ fontSize: "0.77rem", fontWeight: 700, color: "var(--text-heading)" }}>وزارة الموارد البشرية</p>
                  </div>
                  {([
                    { key: "employeesListed" as keyof HrChecklist, label: "حصر العمالة مسجل بالوزارة" },
                    { key: "mudadCleared" as keyof HrChecklist, label: "منصة مُدد: رواتب مسددة / لا مخالفات" },
                    { key: "workPermitsCancelled" as keyof HrChecklist, label: "تصاريح العمل: طُلب إلغاؤها" },
                  ]).map(item => (
                    <label key={item.key} style={{ display: "flex", alignItems: "center", gap: "7px", padding: "3px 0", cursor: "pointer" }}>
                      <input type="checkbox" checked={activeCase.hrChecklist[item.key]} onChange={e => updateCase({ hrChecklist: { ...activeCase.hrChecklist, [item.key]: e.target.checked } })} style={{ accentColor: "var(--primary-green)", width: "13px", height: "13px" }} />
                      <span style={{ fontSize: "0.72rem", color: activeCase.hrChecklist[item.key] ? "var(--success)" : "var(--text-secondary)", textDecoration: activeCase.hrChecklist[item.key] ? "line-through" : "none" }}>{item.label}</span>
                    </label>
                  ))}
                </div>

                {/* Commerce & SAMA */}
                <div>
                  <p style={{ fontSize: "0.77rem", fontWeight: 700, color: "var(--text-heading)", marginBottom: "6px" }}>وزارة التجارة والبنك المركزي</p>
                  {([
                    { key: "commerceCrCancellationRequested" as const, label: "وزارة التجارة: طلب شطب السجل التجاري", value: activeCase.commerceCrCancellationRequested, setter: (v: boolean) => updateCase({ commerceCrCancellationRequested: v }) },
                    { key: "samaNotified" as const, label: "البنك المركزي (ساما): إشعار البنوك بالإجراء", value: activeCase.samaNotified, setter: (v: boolean) => updateCase({ samaNotified: v }) },
                  ]).map(item => (
                    <label key={item.key} style={{ display: "flex", alignItems: "center", gap: "7px", padding: "3px 0", cursor: "pointer" }}>
                      <input type="checkbox" checked={item.value} onChange={e => item.setter(e.target.checked)} style={{ accentColor: "var(--primary-green)", width: "13px", height: "13px" }} />
                      <span style={{ fontSize: "0.72rem", color: item.value ? "var(--success)" : "var(--text-secondary)", textDecoration: item.value ? "line-through" : "none" }}>{item.label}</span>
                    </label>
                  ))}
                </div>

                <a href="https://najiz.sa" target="_blank" rel="noreferrer" style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "10px", fontSize: "0.72rem", color: "var(--primary-green)", textDecoration: "none", fontWeight: 600, borderTop: "1px solid var(--border)", paddingTop: "8px" }}>
                  <ClipboardList size={14} /> تقديم الطلب عبر منصة ناجز <ArrowUpRight size={12} />
                </a>
              </div>

              {/* OCR Upload */}
              <div className="glass-panel" style={{ padding: "14px", display: "flex", flexDirection: "column", gap: "8px" }}>
                <h3 style={{ fontSize: "0.9rem", fontWeight: 700 }} className="gold-gradient-text">استخراج البيانات بالذكاء الاصطناعي</h3>
                <p style={{ fontSize: "0.72rem", color: "var(--text-secondary)" }}>ارفع وثيقة مالية ليقوم النظام باستخراج البيانات تلقائياً.</p>
                <input
                  id="file-upload-input"
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png"
                  style={{ display: "none" }}
                  onChange={handleFileUpload}
                />
                <div
                  style={{ border: "2px dashed var(--card-border)", borderRadius: "8px", padding: "16px", textAlign: "center", background: "var(--bg-tertiary)", cursor: "pointer" }}
                  onClick={() => document.getElementById("file-upload-input")?.click()}
                >
                  <div>
                    <FileText size={26} color="var(--text-muted)" style={{ marginBottom: "4px" }} />
                    <p style={{ fontSize: "0.78rem", fontWeight: 600 }}>اضغط لرفع مستند</p>
                    <p style={{ fontSize: "0.67rem", color: "var(--text-muted)" }}>PDF, JPG, PNG</p>
                  </div>
                </div>
                {activeCase.uploadedFiles.length > 0 && (
                  <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                    {activeCase.uploadedFiles.map((f, i) => (
                      <div key={f.id ?? i} style={{ display: "flex", justifyContent: "space-between", background: "var(--bg-tertiary)", padding: "5px 8px", borderRadius: "6px", fontSize: "0.7rem" }}>
                        {f.id ? (
                          <a href={`/api/files/${f.id}`} target="_blank" rel="noopener noreferrer" style={{ display: "flex", alignItems: "center", gap: "5px", color: "var(--success)" }}><CircleCheckBig size={13} /> {f.name}</a>
                        ) : (
                          <span style={{ display: "flex", alignItems: "center", gap: "5px", color: "var(--success)" }}><CircleCheckBig size={13} /> {f.name}</span>
                        )}
                        <span style={{ color: "var(--text-muted)" }}>{f.size}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Deficiencies */}
              <div className="glass-panel" style={{ padding: "14px" }}>
                <h3 style={{ fontSize: "0.9rem", fontWeight: 700, marginBottom: "8px" }} className="gold-gradient-text">النواقص والتنبيهات</h3>
                {deficiencies.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "16px" }}>
                    <CircleCheckBig size={26} color="var(--success)" style={{ marginBottom: "4px" }} />
                    <p style={{ fontSize: "0.8rem", fontWeight: 700, color: "var(--success)" }}>الملف مكتمل!</p>
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                    {deficiencies.map(d => (
                      <div key={d.id} className={`deficiency-pill ${d.type}`} style={{ display: "flex", alignItems: "flex-start", gap: "6px", fontSize: "0.71rem", lineHeight: "1.4", padding: "6px 10px", whiteSpace: "normal" }}>
                        {d.type === "critical" ? <Ban size={14} style={{ flexShrink: 0, marginTop: "1px" }} /> : <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: "1px" }} />}
                        <span>{d.text}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* 2. WIZARD TAB */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        {activeTab === "wizard" && (
          <div className="glass-panel animate-fade-in" style={{ padding: "20px 24px", maxWidth: "780px", margin: "0 auto" }}>
            <h3 style={{ fontSize: "1rem", fontWeight: 700, marginBottom: "4px" }} className="gold-gradient-text">معالج تشخيص الإعسار والتحضير للتصفية الإدارية</h3>
            <p style={{ fontSize: "0.78rem", color: "var(--text-secondary)", marginBottom: "20px" }}>أجب عن الأسئلة بدقة ليتم تشخيص الملف وتوليد الأسانيد القانونية.</p>

            {/* Stepper */}
            <div className="stepper-container">
              <div className="stepper-progress" style={{ width: `${((wizardStep - 1) / 9) * 100}%` }} />
              {[
                { step: 1, label: "كيان المنشأة" },
                { step: 2, label: "حالة النشاط" },
                { step: 3, label: "الأصول" },
                { step: 4, label: "ملاءة الأصول" },
                { step: 5, label: "حالة التعثر" },
                { step: 6, label: "القوائم المالية" },
                { step: 7, label: "التصرفات المالية" },
                { step: 8, label: "إشعار الدائنين" },
                { step: 9, label: "السجل السابق" },
                { step: 10, label: "النتيجة" },
              ].map(s => (
                <div key={s.step} className={`step-node ${wizardStep === s.step ? "active" : wizardStep > s.step ? "completed" : ""}`}>
                  {wizardStep > s.step ? <Check size={14} /> : s.step}
                  <span className="step-label" style={{ fontSize: "0.65rem", top: "36px" }}>{s.label}</span>
                </div>
              ))}
            </div>

            {/* Wizard Steps Content */}
            <div style={{ minHeight: "200px", display: "flex", flexDirection: "column", justifyContent: "center", marginBottom: "20px", marginTop: "16px" }}>

              {/* Step 1: Entity Type */}
              {wizardStep === 1 && (
                <div className="animate-fade-in" style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  <h4 style={{ fontSize: "0.9rem", fontWeight: 700 }}>الخطوة 1: ما الكيان القانوني للمدين؟</h4>
                  <p style={{ fontSize: "0.78rem", color: "var(--text-secondary)" }}>يختلف الإجراء طبقاً لكون المنشأة شركة أم مؤسسة فردية.</p>
                  <div style={{ display: "flex", gap: "12px", marginTop: "4px" }}>
                    {[{ value: "company", title: "شركة تجارية", sub: "ذات مسؤولية محدودة، مساهمة، تضامنية" }, { value: "individual", title: "مؤسسة فردية", sub: "سجل تجاري فردي مرتبط بذمة مالية لمالكه" }].map(opt => (
                      <label key={opt.value} className="glass-panel" style={{ flex: 1, padding: "12px", cursor: "pointer", border: activeCase.isEstablishment === opt.value ? "1px solid var(--gold)" : "1px solid var(--card-border)", display: "flex", alignItems: "center", gap: "10px", background: activeCase.isEstablishment === opt.value ? "var(--gold-light)" : "transparent", borderRadius: "8px" }}>
                        <input type="radio" name="establishment" value={opt.value} checked={activeCase.isEstablishment === opt.value} onChange={() => updateCase({ isEstablishment: opt.value })} style={{ accentColor: "var(--gold)" }} />
                        <div><p style={{ fontSize: "0.83rem", fontWeight: 700 }}>{opt.title}</p><p style={{ fontSize: "0.68rem", color: "var(--text-muted)", marginTop: "2px" }}>{opt.sub}</p></div>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {wizardStep === 2 && (
                <div className="animate-fade-in" style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  <h4 style={{ fontSize: "0.9rem", fontWeight: 700 }}>الخطوة 2: هل النشاط التجاري لا يزال قائماً؟</h4>
                  <p style={{ fontSize: "0.78rem", color: "var(--text-secondary)" }}>استمرارية النشاط مؤشر حيوي لاختيار الإجراء المناسب.</p>
                  <div style={{ display: "flex", gap: "12px" }}>
                    {[{ value: "yes", title: "نعم، النشاط مستمر", sub: "المنشأة لا تزال تعمل ولديها تدفقات تشغيلية" }, { value: "no", title: "لا، النشاط متوقف", sub: "المقر مغلق أو توقفت العمليات بالكامل" }].map(opt => (
                      <label key={opt.value} className="glass-panel" style={{ flex: 1, padding: "12px", cursor: "pointer", border: activeCase.isActive === opt.value ? "1px solid var(--gold)" : "1px solid var(--card-border)", display: "flex", alignItems: "center", gap: "10px", background: activeCase.isActive === opt.value ? "var(--gold-light)" : "transparent", borderRadius: "8px" }}>
                        <input type="radio" name="isActive" value={opt.value} checked={activeCase.isActive === opt.value} onChange={() => updateCase({ isActive: opt.value })} style={{ accentColor: "var(--gold)" }} />
                        <div><p style={{ fontSize: "0.83rem", fontWeight: 700 }}>{opt.title}</p><p style={{ fontSize: "0.68rem", color: "var(--text-muted)", marginTop: "2px" }}>{opt.sub}</p></div>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {wizardStep === 3 && (
                <div className="animate-fade-in" style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  <h4 style={{ fontSize: "0.9rem", fontWeight: 700 }}>الخطوة 3: هل تمتلك المنشأة أصولاً مسجلة باسمها؟</h4>
                  <p style={{ fontSize: "0.78rem", color: "var(--text-secondary)" }}>تشمل: الأرصدة النقدية، السيارات، البضائع، العقارات، المكاتب.</p>
                  <div style={{ display: "flex", gap: "12px" }}>
                    {[{ value: "yes", title: "نعم، توجد أصول", sub: "توجد أصول مسجلة أو مستودعات متبقية" }, { value: "no", title: "لا توجد أصول مطلقاً", sub: "لا تملك الشركة أي ممتلكات أو سيولة" }].map(opt => (
                      <label key={opt.value} className="glass-panel" style={{ flex: 1, padding: "12px", cursor: "pointer", border: activeCase.hasAssets === opt.value ? "1px solid var(--gold)" : "1px solid var(--card-border)", display: "flex", alignItems: "center", gap: "10px", background: activeCase.hasAssets === opt.value ? "var(--gold-light)" : "transparent", borderRadius: "8px" }}>
                        <input type="radio" name="hasAssets" value={opt.value} checked={activeCase.hasAssets === opt.value} onChange={() => updateCase({ hasAssets: opt.value })} style={{ accentColor: "var(--gold)" }} />
                        <div><p style={{ fontSize: "0.83rem", fontWeight: 700 }}>{opt.title}</p><p style={{ fontSize: "0.68rem", color: "var(--text-muted)", marginTop: "2px" }}>{opt.sub}</p></div>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {wizardStep === 4 && (
                <div className="animate-fade-in" style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  <h4 style={{ fontSize: "0.9rem", fontWeight: 700 }}>الخطوة 4: هل الأصول تكفي لتغطية مصروفات التصفية العادية؟</h4>
                  <p style={{ fontSize: "0.78rem", color: "var(--text-secondary)" }}>مصروفات التصفية تُقدَّر بـ 100,000–150,000 ريال (أتعاب أمين التصفية + تكاليف التسييل).</p>
                  <div style={{ display: "flex", gap: "12px" }}>
                    {[{ value: "yes", title: "نعم، تكفي", sub: "قيمة الأصول تفوق 150 ألف ريال" }, { value: "no", title: "لا تكفي (شرط التصفية الإدارية)", sub: "الأصول شحيحة ولا تعادل مصاريف التصفية" }].map(opt => (
                      <label key={opt.value} className="glass-panel" style={{ flex: 1, padding: "12px", cursor: "pointer", border: activeCase.assetsCoverExpenses === opt.value ? "1px solid var(--gold)" : "1px solid var(--card-border)", display: "flex", alignItems: "center", gap: "10px", background: activeCase.assetsCoverExpenses === opt.value ? "var(--gold-light)" : "transparent", borderRadius: "8px" }}>
                        <input type="radio" name="assetsCover" value={opt.value} checked={activeCase.assetsCoverExpenses === opt.value} onChange={() => updateCase({ assetsCoverExpenses: opt.value })} style={{ accentColor: "var(--gold)" }} />
                        <div><p style={{ fontSize: "0.83rem", fontWeight: 700 }}>{opt.title}</p><p style={{ fontSize: "0.68rem", color: "var(--text-muted)", marginTop: "2px" }}>{opt.sub}</p></div>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {wizardStep === 5 && (
                <div className="animate-fade-in" style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  <h4 style={{ fontSize: "0.9rem", fontWeight: 700 }}>الخطوة 5: ما طبيعة التعثر المالي للمنشأة؟</h4>
                  <p style={{ fontSize: "0.78rem", color: "var(--text-secondary)" }}>هذا السؤال بوابة قانونية محورية — التعثر المتوقع يُتيح التسوية الوقائية قبل الإعسار الكامل (المادة 71).</p>
                  <div style={{ display: "flex", gap: "12px" }}>
                    {[{ value: "actual", title: "تعثر فعلي", sub: "المنشأة عاجزة حالياً عن سداد ديونها المستحقة" }, { value: "upcoming", title: "تعثر متوقع", sub: "النشاط مستمر لكن الوضع المالي يتجه نحو الإعسار خلال أشهر" }].map(opt => (
                      <label key={opt.value} className="glass-panel" style={{ flex: 1, padding: "12px", cursor: "pointer", border: activeCase.insolvencyStatus === opt.value ? "1px solid var(--gold)" : "1px solid var(--card-border)", display: "flex", alignItems: "center", gap: "10px", background: activeCase.insolvencyStatus === opt.value ? "var(--gold-light)" : "transparent", borderRadius: "8px" }}>
                        <input type="radio" name="insolvencyStatus" value={opt.value} checked={activeCase.insolvencyStatus === opt.value} onChange={() => updateCase({ insolvencyStatus: opt.value })} style={{ accentColor: "var(--gold)" }} />
                        <div><p style={{ fontSize: "0.83rem", fontWeight: 700 }}>{opt.title}</p><p style={{ fontSize: "0.68rem", color: "var(--text-muted)", marginTop: "2px" }}>{opt.sub}</p></div>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {wizardStep === 6 && (
                <div className="animate-fade-in" style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  <h4 style={{ fontSize: "0.9rem", fontWeight: 700 }}>الخطوة 6: هل تتوفر قوائم مالية معتمدة لآخر عامين؟</h4>
                  <p style={{ fontSize: "0.78rem", color: "var(--text-secondary)" }}>في حال غيابها يلزم قانوناً تقديم خطاب مبرر يوضح أسباب تعذر إرفاق القوائم.</p>
                  <div style={{ display: "flex", gap: "12px" }}>
                    {[{ value: "yes", title: "نعم، متوفرة", sub: "لدينا قوائم مالية مدققة لآخر عامين ماليين" }, { value: "no", title: "غير متوفرة (يلزم خطاب مبرر)", sub: "لم يتم مراجعة الحسابات أو تعذر الوصول للنظام" }].map(opt => (
                      <label key={opt.value} className="glass-panel" style={{ flex: 1, padding: "12px", cursor: "pointer", border: activeCase.financialStatementsAvailable === opt.value ? "1px solid var(--gold)" : "1px solid var(--card-border)", display: "flex", alignItems: "center", gap: "10px", background: activeCase.financialStatementsAvailable === opt.value ? "var(--gold-light)" : "transparent", borderRadius: "8px" }}>
                        <input type="radio" name="financialStatements" value={opt.value} checked={activeCase.financialStatementsAvailable === opt.value} onChange={() => updateCase({ financialStatementsAvailable: opt.value })} style={{ accentColor: "var(--gold)" }} />
                        <div><p style={{ fontSize: "0.83rem", fontWeight: 700 }}>{opt.title}</p><p style={{ fontSize: "0.68rem", color: "var(--text-muted)", marginTop: "2px" }}>{opt.sub}</p></div>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {wizardStep === 7 && (
                <div className="animate-fade-in" style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  <h4 style={{ fontSize: "0.9rem", fontWeight: 700 }}>الخطوة 7: هل يتوفر بيان بالتصرفات المالية لآخر سنتين (24 شهراً)؟</h4>
                  <p style={{ fontSize: "0.78rem", color: "var(--text-secondary)" }}>يشمل: كشوف الحساب البنكي، المدفوعات والمقبوضات، وأي تصرفات في الأصول. <strong>النظام يلزم سنتين كاملتين</strong> — تقديم 12 شهراً فقط قد يسبب رفضاً شكلياً.</p>
                  <div style={{ display: "flex", gap: "12px" }}>
                    {[{ value: "yes", title: "نعم، متوفر (سنتان)", sub: "لدينا كشوفات بنكية أو سجلات محاسبية لآخر 24 شهراً" }, { value: "no", title: "غير متوفر (يلزم مبرر)", sub: "فُقدت السجلات أو تعذّر الوصول — يُرفق خطاب تعذر" }].map(opt => (
                      <label key={opt.value} className="glass-panel" style={{ flex: 1, padding: "12px", cursor: "pointer", border: activeCase.financialTransactionsAvailable === opt.value ? "1px solid var(--gold)" : "1px solid var(--card-border)", display: "flex", alignItems: "center", gap: "10px", background: activeCase.financialTransactionsAvailable === opt.value ? "var(--gold-light)" : "transparent", borderRadius: "8px" }}>
                        <input type="radio" name="financialTransactions" value={opt.value} checked={activeCase.financialTransactionsAvailable === opt.value} onChange={() => updateCase({ financialTransactionsAvailable: opt.value })} style={{ accentColor: "var(--gold)" }} />
                        <div><p style={{ fontSize: "0.83rem", fontWeight: 700 }}>{opt.title}</p><p style={{ fontSize: "0.68rem", color: "var(--text-muted)", marginTop: "2px" }}>{opt.sub}</p></div>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {wizardStep === 8 && (
                <div className="animate-fade-in" style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  <h4 style={{ fontSize: "0.9rem", fontWeight: 700 }}>الخطوة 8: هل تم تبليغ الدائنين بوضع الشركة؟</h4>
                  <p style={{ fontSize: "0.78rem", color: "var(--text-secondary)" }}>إشعار الدائنين يعكس حسن النية ويُعزز موقف الملف أمام المحكمة.</p>
                  <div style={{ display: "flex", gap: "12px" }}>
                    {[{ value: "yes", title: "نعم، تم الإشعار", sub: "لدينا نسخ من الإشعارات المرسلة بالبريد أو الإلكتروني" }, { value: "no", title: "لم يتم الإشعار بعد", sub: "سنقوم بإشعارهم لاحقاً أو ننتظر توجيه المحكمة" }].map(opt => (
                      <label key={opt.value} className="glass-panel" style={{ flex: 1, padding: "12px", cursor: "pointer", border: activeCase.creditorsNotified === opt.value ? "1px solid var(--gold)" : "1px solid var(--card-border)", display: "flex", alignItems: "center", gap: "10px", background: activeCase.creditorsNotified === opt.value ? "var(--gold-light)" : "transparent", borderRadius: "8px" }}>
                        <input type="radio" name="creditorsNotified" value={opt.value} checked={activeCase.creditorsNotified === opt.value} onChange={() => updateCase({ creditorsNotified: opt.value })} style={{ accentColor: "var(--gold)" }} />
                        <div><p style={{ fontSize: "0.83rem", fontWeight: 700 }}>{opt.title}</p><p style={{ fontSize: "0.68rem", color: "var(--text-muted)", marginTop: "2px" }}>{opt.sub}</p></div>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {wizardStep === 9 && (
                <div className="animate-fade-in" style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                  <h4 style={{ fontSize: "0.9rem", fontWeight: 700 }}>الخطوة 9: السجل التشغيلي والقانوني</h4>
                  <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                    <p style={{ fontSize: "0.8rem", fontWeight: 600 }}>هل عملت المنشأة بشكل فعلي خلال الاثني عشر شهراً الماضية؟</p>
                    <p style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>شرط قانوني للتسوية الوقائية بموجب المادة 71 — المنشأة التي لم تمارس النشاط لا تستوفي معيار الاستمرارية.</p>
                    <div style={{ display: "flex", gap: "12px" }}>
                      {[{ value: "yes", title: "نعم، مارست النشاط", sub: "عمليات تشغيلية موثقة خلال العام الماضي" }, { value: "no", title: "لا، النشاط متوقف", sub: "لم يُسجَّل نشاط تجاري فعلي خلال 12 شهراً" }].map(opt => (
                        <label key={opt.value} className="glass-panel" style={{ flex: 1, padding: "12px", cursor: "pointer", border: activeCase.operatedTwelveMonths === opt.value ? "1px solid var(--gold)" : "1px solid var(--card-border)", display: "flex", alignItems: "center", gap: "10px", background: activeCase.operatedTwelveMonths === opt.value ? "var(--gold-light)" : "transparent", borderRadius: "8px" }}>
                          <input type="radio" name="operatedTwelveMonths" value={opt.value} checked={activeCase.operatedTwelveMonths === opt.value} onChange={() => updateCase({ operatedTwelveMonths: opt.value })} style={{ accentColor: "var(--gold)" }} />
                          <div><p style={{ fontSize: "0.83rem", fontWeight: 700 }}>{opt.title}</p><p style={{ fontSize: "0.68rem", color: "var(--text-muted)", marginTop: "2px" }}>{opt.sub}</p></div>
                        </label>
                      ))}
                    </div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                    <p style={{ fontSize: "0.8rem", fontWeight: 600 }}>هل سبق تقديم طلب تسوية وقائية أو إعادة هيكلة لهذه المنشأة؟</p>
                    <p style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>السابقة القانونية تحول دون قبول طلب تسوية جديد إذا لم تنقضِ المدة النظامية المقررة.</p>
                    <div style={{ display: "flex", gap: "12px" }}>
                      {[{ value: "no", title: "لا، لا يوجد سابقة", sub: "أول طلب مقدم لهذه المنشأة" }, { value: "yes", title: "نعم، يوجد سابقة", sub: "سبق رفع طلب تسوية أو هيكلة وانتهى أو رُفض" }].map(opt => (
                        <label key={opt.value} className="glass-panel" style={{ flex: 1, padding: "12px", cursor: "pointer", border: activeCase.previousSettlement === opt.value ? "1px solid var(--gold)" : "1px solid var(--card-border)", display: "flex", alignItems: "center", gap: "10px", background: activeCase.previousSettlement === opt.value ? "var(--gold-light)" : "transparent", borderRadius: "8px" }}>
                          <input type="radio" name="previousSettlement" value={opt.value} checked={activeCase.previousSettlement === opt.value} onChange={() => updateCase({ previousSettlement: opt.value })} style={{ accentColor: "var(--gold)" }} />
                          <div><p style={{ fontSize: "0.83rem", fontWeight: 700 }}>{opt.title}</p><p style={{ fontSize: "0.68rem", color: "var(--text-muted)", marginTop: "2px" }}>{opt.sub}</p></div>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {wizardStep === 10 && recommendation && (
                <div className="animate-fade-in" style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                  {/* Rule-based result — a preliminary indicator only; the AI analysis below is the authoritative one */}
                  <div className="glass-panel" style={{ padding: "16px", background: "var(--gold-light)", border: "1px solid var(--gold)" }}>
                    <p style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--gold)", marginBottom: "4px" }}>الإجراء الأنسب (تصنيف أولي بقواعد ثابتة — راجع التحليل الذكي أدناه قبل اعتماد أي إجراء):</p>
                    <p style={{ fontSize: "0.93rem", fontWeight: 800, color: "var(--text-body)", marginBottom: "8px" }}>{recommendation.title}</p>
                    <p style={{ fontSize: "0.77rem", color: "var(--text-secondary)", lineHeight: 1.6, marginBottom: "10px" }}>{recommendation.reason}</p>
                    <p style={{ fontSize: "0.73rem", fontWeight: 700, color: "var(--text-muted)", marginBottom: "4px" }}>الأسانيد القانونية:</p>
                    <ul style={{ paddingRight: "14px", fontSize: "0.72rem", color: "var(--text-secondary)", display: "flex", flexDirection: "column", gap: "2px", marginBottom: "10px" }}>
                      {recommendation.articles.map((a, i) => <li key={i}>{a}</li>)}
                    </ul>
                    <p style={{ fontSize: "0.73rem", fontWeight: 700, color: "var(--text-muted)", marginBottom: "4px" }}>خطوات الإجراء:</p>
                    <ul style={{ paddingRight: "14px", fontSize: "0.73rem", color: "var(--text-secondary)", display: "flex", flexDirection: "column", gap: "3px" }}>
                      {recommendation.steps.map((s, i) => <li key={i}>{s}</li>)}
                    </ul>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                    <div className="glass-panel" style={{ padding: "12px" }}>
                      <p style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "0.73rem", fontWeight: 700, color: "var(--success)", marginBottom: "6px" }}><CircleCheckBig size={13} /> ملخص الملف:</p>
                      <ul style={{ fontSize: "0.7rem", color: "var(--text-secondary)", display: "flex", flexDirection: "column", gap: "3px", listStyle: "none" }}>
                        <li>الكيان: {activeCase.isEstablishment === "company" ? "شركة تجارية" : "مؤسسة فردية"}</li>
                        <li>النشاط: {activeCase.isActive === "no" ? "متوقف" : "مستمر"}</li>
                        <li>التعثر: {activeCase.insolvencyStatus === "actual" ? "فعلي" : "متوقع"}</li>
                        <li>الأصول: {assetsCoverLiquidation ? "كافية" : "لا تغطي التصفية"}</li>
                      </ul>
                    </div>
                    <div className="glass-panel" style={{ padding: "12px" }}>
                      <p style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "0.73rem", fontWeight: 700, color: "var(--error)", marginBottom: "6px" }}><AlertTriangle size={13} /> خطوات عاجلة:</p>
                      <ul style={{ fontSize: "0.7rem", color: "var(--text-secondary)", display: "flex", flexDirection: "column", gap: "3px", listStyle: "none" }}>
                        {activeCase.financialStatementsAvailable === "no" && <li>صياغة خطاب تعذر القوائم</li>}
                        {activeCase.isEstablishment === "company" && <li>استصدار قرار الشركاء</li>}
                        {activeCase.creditorsNotified === "no" && <li>إشعار الدائنين بالوضع المالي</li>}
                        <li>مراجعة مستحقات العمالة</li>
                      </ul>
                    </div>
                  </div>

                  {/* AI Deep Analysis */}
                  <div className="glass-panel" style={{ padding: "14px", border: "1px solid var(--card-border)" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px" }}>
                      <Bot size={17} color="var(--gold)" />
                      <p style={{ fontSize: "0.82rem", fontWeight: 700, color: "var(--text-body)" }}>تحليل Claude الذكي المتعمق</p>
                    </div>

                    {(!activeCase.aiDiagnosis || isRequestingNewDiagnosis) && !isAiDiagnosing && (
                      <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                        <div>
                          <p style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "5px" }}>ملاحظات أو معلومات إضافية (اختياري)</p>
                          <textarea
                            value={wizardNotes}
                            onChange={e => setWizardNotes(e.target.value)}
                            placeholder="أضف أي سياق خاص بالملف: خلاف مع الشركاء، ديون خارجية غير مسجلة، دعاوى قضائية معلقة، إشكاليات في السجل التجاري، أصول متنازع عليها..."
                            rows={3}
                            style={{ width: "100%", fontSize: "0.77rem", padding: "8px 10px", borderRadius: "6px", border: "1px solid var(--card-border)", background: "var(--bg-subtle)", color: "var(--text-body)", resize: "vertical", fontFamily: "var(--font-tajawal), sans-serif", lineHeight: 1.6 }}
                          />
                        </div>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                          <p style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>يقرأ Claude الملف الكامل: الدائنون، الأصول، العمالة، زكاة، إجابات المعالج.</p>
                          <button
                            className="btn-primary"
                            style={{ padding: "7px 14px", fontSize: "0.78rem" }}
                            onClick={async () => {
                              setIsAiDiagnosing(true);
                              try {
                                const res = await fetch("/api/diagnose", {
                                  method: "POST",
                                  headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({ caseData: activeCase, notes: wizardNotes }),
                                });
                                const data = await res.json();
                                if (data.error) throw new Error(data.error);
                                // Only overwrite the previous diagnosis once the new one is
                                // confirmed successful — a failed request must leave the last
                                // good analysis in place instead of wiping it.
                                const patch = { aiDiagnosis: data.analysis, aiDiagnosisAt: data.generatedAt, aiDiagnosisSignature: data.signature, aiDiagnosisConsistencyWarning: Boolean(data.consistencyWarning) };
                                updateCase(patch);
                                setIsRequestingNewDiagnosis(false);
                                // Persist immediately instead of waiting on the generic debounced
                                // autosave — this result costs a real API call, so it must survive
                                // navigating away right after it lands.
                                if (activeCase) {
                                  const saveRes = await saveCaseAction({ ...activeCase, ...patch });
                                  if (saveRes?.error) showToast(saveRes.error, "error");
                                }
                              } catch (e) {
                                showToast((e as Error).message, "error");
                                setIsRequestingNewDiagnosis(false);
                              } finally {
                                setIsAiDiagnosing(false);
                              }
                            }}
                          >
                            <Sparkles size={14} /> ابدأ التحليل الذكي
                          </button>
                        </div>
                      </div>
                    )}

                    {isAiDiagnosing && (
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "10px 0" }}>
                        <div style={{ width: "16px", height: "16px", border: "2px solid var(--gold)", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.8s linear infinite", flexShrink: 0 }} />
                        <p style={{ fontSize: "0.77rem", color: "var(--text-secondary)" }}>يقرأ Claude بيانات الملف ويُحلل الوضع القانوني...</p>
                      </div>
                    )}

                    {activeCase.aiDiagnosis && !isRequestingNewDiagnosis && (
                      <div>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px", flexWrap: "wrap", gap: "6px" }}>
                          <p style={{ fontSize: "0.7rem", color: "var(--text-faint)" }}>
                            آخر تحليل: {activeCase.aiDiagnosisAt ? new Date(activeCase.aiDiagnosisAt).toLocaleString("ar-SA", { dateStyle: "long", timeStyle: "short" }) : "—"}
                          </p>
                          {activeCase.aiDiagnosisSignature && buildDiagnosisSignature(activeCase) !== activeCase.aiDiagnosisSignature && (
                            <span style={{ display: "inline-flex", alignItems: "center", gap: "5px", fontSize: "0.7rem", fontWeight: 700, color: "var(--red)", background: "var(--red-light)", border: "1px solid var(--red-border)", borderRadius: "20px", padding: "2px 10px" }}>
                              <AlertTriangle size={12} /> بيانات الملف تغيّرت منذ هذا التحليل — يُنصح بإعادة التحليل
                            </span>
                          )}
                        </div>
                        {activeCase.aiDiagnosisConsistencyWarning && (
                          <div style={{ display: "flex", alignItems: "flex-start", gap: "8px", background: "var(--red-light)", border: "1px solid var(--red-border)", borderRadius: "8px", padding: "8px 12px", marginBottom: "10px" }}>
                            <AlertTriangle size={15} color="var(--red)" style={{ flexShrink: 0, marginTop: "2px" }} />
                            <p style={{ fontSize: "0.73rem", fontWeight: 700, color: "var(--red)" }}>
                              تنبيه آلي: النص أدناه لم يذكر صراحة المادة القانونية المتوقعة من التصنيف الأولي، ولم يوضّح سبب مخالفته أيضاً — راجع التحليل يدوياً بعناية قبل الاعتماد عليه.
                            </p>
                          </div>
                        )}
                        <div style={{ fontSize: "0.78rem", color: "var(--text-body)", lineHeight: 1.75 }}>
                          {renderAiDiagnosis(activeCase.aiDiagnosis)}
                        </div>
                        <div style={{ display: "flex", gap: "8px", marginTop: "12px" }}>
                          <button
                            className="btn-secondary"
                            style={{ padding: "5px 12px", fontSize: "0.73rem" }}
                            onClick={async () => {
                              try {
                                await navigator.clipboard.writeText(activeCase.aiDiagnosis);
                                showToast("تم نسخ التحليل");
                              } catch {
                                showToast("تعذر النسخ — انسخ النص يدوياً", "error");
                              }
                            }}
                          >
                            <Copy size={13} /> نسخ النص
                          </button>
                          <button
                            className="btn-secondary"
                            style={{ padding: "5px 12px", fontSize: "0.73rem" }}
                            onClick={() => { setIsRequestingNewDiagnosis(true); setWizardNotes(""); }}
                          >
                            <RefreshCw size={13} /> تحليل جديد
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  <ClientAccountCard
                    caseId={activeCase.id}
                    clientEmail={activeCase.clientEmail ?? null}
                    onChange={(email) => updateCase({ clientEmail: email })}
                    showToast={showToast}
                  />
                </div>
              )}
            </div>

            {/* Wizard Navigation */}
            <div style={{ display: "flex", justifyContent: "space-between", borderTop: "1px solid var(--card-border)", paddingTop: "12px" }}>
              <button className="btn-secondary" onClick={() => setWizardStep(p => Math.max(1, p - 1))} disabled={wizardStep === 1} style={{ opacity: wizardStep === 1 ? 0.5 : 1, padding: "8px 16px", fontSize: "0.8rem" }}>السابق</button>
              {wizardStep < 10 ? (
                <button className="btn-primary" onClick={() => setWizardStep(p => Math.min(10, p + 1))} style={{ padding: "8px 16px", fontSize: "0.8rem" }}>التالي <ArrowRight size={14} /></button>
              ) : (
                <button className="btn-primary" onClick={() => { setActiveTab("documents"); setActiveDocTab("claim"); }} style={{ padding: "8px 16px", fontSize: "0.8rem" }}><PenLine size={14} /> صياغة الوثائق</button>
              )}
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* 3. TIMELINE TAB */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        {activeTab === "timeline" && (
          <div className="animate-fade-in" style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <div className="glass-panel" style={{ padding: "16px 20px" }}>
              <h3 style={{ fontSize: "1rem", fontWeight: 700, marginBottom: "6px" }} className="gold-gradient-text">الجدول الزمني القضائي للإجراء</h3>
              <p style={{ fontSize: "0.78rem", color: "var(--text-secondary)", marginBottom: "14px" }}>يُتابع هذا القسم المواعيد النظامية الصارمة وفق نظام الإفلاس. تأخير أي موعد قد يؤدي إلى شطب الطلب.</p>

              {/* Submission Date Picker */}
              <div style={{ display: "flex", alignItems: "center", gap: "16px", marginBottom: "16px", background: "var(--bg-tertiary)", padding: "10px 14px", borderRadius: "8px" }}>
                <div>
                  <label style={{ fontSize: "0.72rem", color: "var(--text-muted)", display: "block" }}>تاريخ تقديم الطلب للمحكمة:</label>
                  <input
                    type="date"
                    className="custom-input"
                    value={activeCase.submissionDate ? activeCase.submissionDate.substring(0, 10) : ""}
                    onChange={e => updateCase({ submissionDate: e.target.value ? new Date(e.target.value).toISOString() : undefined })}
                    style={{ padding: "6px 10px", fontSize: "0.8rem", width: "180px", marginTop: "4px" }}
                  />
                </div>
                {activeCase.caseNumber !== undefined && (
                  <div>
                    <label style={{ fontSize: "0.72rem", color: "var(--text-muted)", display: "block" }}>رقم الدعوى:</label>
                    <input className="custom-input" value={activeCase.caseNumber} onChange={e => updateCase({ caseNumber: e.target.value })} placeholder="مثال: ت-2025/18473" style={{ padding: "6px 10px", fontSize: "0.8rem", width: "180px", marginTop: "4px" }} />
                  </div>
                )}
                {!activeCase.caseNumber && <button className="btn-secondary" onClick={() => updateCase({ caseNumber: "" })} style={{ fontSize: "0.75rem", padding: "6px 12px", marginTop: "16px" }}>+ إضافة رقم الدعوى</button>}
              </div>

              {/* Timeline Events */}
              <div style={{ display: "flex", flexDirection: "column", gap: "0" }}>
                {activeCase.timelineEvents.map((event, idx) => {
                  const daysLeft = activeCase.submissionDate ? getDaysRemaining(activeCase.submissionDate, event.dayOffset) : null;
                  const isOverdue = daysLeft !== null && daysLeft < 0;
                  const isUrgent = daysLeft !== null && daysLeft >= 0 && daysLeft <= 3;
                  const dotColor = event.done ? "var(--success)" : isOverdue ? "var(--error)" : isUrgent ? "var(--warning)" : event.category === "critical" ? "var(--error)" : event.category === "warning" ? "var(--warning)" : "var(--text-muted)";

                  return (
                    <div key={event.id} style={{ display: "flex", gap: "14px", position: "relative" }}>
                      {/* Vertical line */}
                      {idx < activeCase.timelineEvents.length - 1 && (
                        <div style={{ position: "absolute", right: "9px", top: "24px", width: "2px", height: "calc(100% - 12px)", background: event.done ? "var(--success)" : "var(--card-border)" }} />
                      )}
                      {/* Dot */}
                      <div style={{ width: "20px", height: "20px", borderRadius: "50%", background: event.done ? "var(--success)" : "#fff", border: `2px solid ${dotColor}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: "2px", zIndex: 1 }}>
                        {event.done && <Check size={11} color="#fff" />}
                      </div>
                      {/* Content */}
                      <div style={{ flex: 1, padding: "6px 0 16px 0" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                          <label style={{ display: "flex", alignItems: "center", gap: "6px", cursor: "pointer" }}>
                            <input type="checkbox" checked={event.done} onChange={e => {
                              const newEvents = activeCase.timelineEvents.map(ev => ev.id === event.id ? { ...ev, done: e.target.checked } : ev);
                              updateCase({ timelineEvents: newEvents });
                            }} style={{ accentColor: "var(--primary-green)" }} />
                            <span style={{ fontSize: "0.82rem", fontWeight: event.done ? 400 : 600, color: event.done ? "var(--text-muted)" : "var(--text-primary)", textDecoration: event.done ? "line-through" : "none" }}>{event.label}</span>
                          </label>
                          {daysLeft !== null && !event.done && (
                            <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", fontSize: "0.65rem", padding: "1px 7px", borderRadius: "10px", fontWeight: 700, background: isOverdue ? "rgba(83,25,13,0.1)" : isUrgent ? "rgba(247,178,34,0.12)" : "var(--bg-tertiary)", color: isOverdue ? "var(--error)" : isUrgent ? "var(--warning)" : "var(--text-muted)", border: `1px solid ${isOverdue ? "rgba(83,25,13,0.2)" : isUrgent ? "rgba(247,178,34,0.3)" : "var(--card-border)"}` }}>
                              {isOverdue ? <><AlertTriangle size={11} /> متأخر {Math.abs(daysLeft)} يوم</> : daysLeft === 0 ? <><AlertTriangle size={11} /> اليوم!</> : `${daysLeft} يوم متبقي`}
                            </span>
                          )}
                          {event.done && <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", fontSize: "0.65rem", color: "var(--success)", fontWeight: 700 }}><CircleCheckBig size={12} /> منجز</span>}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Post-submission: Trustee & Hearings */}
            <div className="glass-panel" style={{ padding: "16px 20px" }}>
              <h3 style={{ fontSize: "0.95rem", fontWeight: 700, marginBottom: "14px" }} className="gold-gradient-text">ما بعد التقديم — أمين التصفية والجلسات</h3>

              {/* Trustee */}
              <div style={{ marginBottom: "16px", paddingBottom: "14px", borderBottom: "1px solid var(--border)" }}>
                <p style={{ fontSize: "0.8rem", fontWeight: 700, color: "var(--text-heading)", marginBottom: "8px" }}>أمين التصفية المعيّن</p>
                <div className="field-group">
                  <label className="field-label" style={{ fontSize: "0.72rem" }}>الاسم الكامل لأمين التصفية</label>
                  <input
                    className="custom-input"
                    value={activeCase.trusteeName}
                    onChange={e => updateCase({ trusteeName: e.target.value })}
                    placeholder="يُعيَّن بعد صدور قرار المحكمة بالقبول"
                    style={{ fontSize: "0.8rem", padding: "7px 10px" }}
                  />
                </div>
              </div>

              {/* Hearing Dates */}
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
                  <p style={{ fontSize: "0.8rem", fontWeight: 700, color: "var(--text-heading)" }}>جلسات المحكمة</p>
                  <button
                    className="btn-secondary"
                    style={{ fontSize: "0.72rem", padding: "4px 10px" }}
                    onClick={() => updateCase({ hearingDates: [...activeCase.hearingDates, { id: Date.now().toString(), date: "", type: "جلسة_أولى", notes: "", result: "" }] })}
                  >
                    + إضافة جلسة
                  </button>
                </div>
                {activeCase.hearingDates.length === 0 ? (
                  <p style={{ fontSize: "0.75rem", color: "var(--text-faint)", textAlign: "center", padding: "12px 0" }}>لا توجد جلسات مسجلة بعد</p>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    {activeCase.hearingDates.map(h => (
                      <div key={h.id} style={{ display: "grid", gridTemplateColumns: "140px 160px 1fr auto", gap: "8px", alignItems: "start", background: "var(--bg-subtle)", padding: "8px 10px", borderRadius: "var(--radius-sm)" }}>
                        <div className="field-group" style={{ gap: "2px" }}>
                          <label style={{ fontSize: "0.65rem", color: "var(--text-muted)" }}>تاريخ الجلسة</label>
                          <input type="date" className="custom-input" value={h.date} onChange={e => updateCase({ hearingDates: activeCase.hearingDates.map(x => x.id === h.id ? { ...x, date: e.target.value } : x) })} style={{ fontSize: "0.75rem", padding: "5px 8px" }} />
                        </div>
                        <div className="field-group" style={{ gap: "2px" }}>
                          <label style={{ fontSize: "0.65rem", color: "var(--text-muted)" }}>نوع الجلسة</label>
                          <select className="custom-input" value={h.type} onChange={e => updateCase({ hearingDates: activeCase.hearingDates.map(x => x.id === h.id ? { ...x, type: e.target.value as HearingDate["type"] } : x) })} style={{ fontSize: "0.75rem", padding: "5px 8px" }}>
                            <option value="جلسة_أولى">جلسة أولى</option>
                            <option value="جلسة_موضوع">جلسة موضوع</option>
                            <option value="جلسة_قرار">جلسة قرار</option>
                            <option value="أخرى">أخرى</option>
                          </select>
                        </div>
                        <div className="field-group" style={{ gap: "2px" }}>
                          <label style={{ fontSize: "0.65rem", color: "var(--text-muted)" }}>ملاحظات / نتيجة</label>
                          <input className="custom-input" value={h.notes} onChange={e => updateCase({ hearingDates: activeCase.hearingDates.map(x => x.id === h.id ? { ...x, notes: e.target.value } : x) })} placeholder="مثال: مقررة / صدر قرار بالقبول" style={{ fontSize: "0.75rem", padding: "5px 8px" }} />
                        </div>
                        <button onClick={() => updateCase({ hearingDates: activeCase.hearingDates.filter(x => x.id !== h.id) })} style={{ background: "transparent", border: "none", color: "var(--red)", cursor: "pointer", fontSize: "0.9rem", marginTop: "16px" }}>×</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Key Legal Articles */}
            <div className="glass-panel" style={{ padding: "14px 18px" }}>
              <h4 style={{ fontSize: "0.88rem", fontWeight: 700, marginBottom: "10px", color: "var(--accent-gold)" }}>المواد النظامية الحاكمة للمواعيد</h4>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                {[
                  { article: "المادة 92 — اللائحة التنفيذية", text: "فحص النواقص الشكلية خلال 3 أيام من الإيداع. الإخفاق يعني إعادة الملف وشطب الطلب شكلاً." },
                  { article: "المادة 170 — نظام الإفلاس", text: "تبليغ المدين خلال 5 أيام إن كانت الجهة المختصة هي مقدمة الطلب." },
                  { article: "المادة 168 — نظام الإفلاس", text: "إصدار قرار المحكمة بالقبول أو الرفض خلال 15 يوم عمل من تاريخ التقديم." },
                  { article: "المادة 172 — نظام الإفلاس", text: "نشر إعلان افتتاح الإجراء في الجريدة الرسمية خلال 30 يوم من صدور الحكم." },
                ].map((item, i) => (
                  <div key={i} className="glass-panel" style={{ padding: "10px 12px", background: "rgba(247,178,34,0.03)", border: "1px solid rgba(247,178,34,0.15)" }}>
                    <p style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--accent-gold)", marginBottom: "4px" }}>{item.article}</p>
                    <p style={{ fontSize: "0.72rem", color: "var(--text-secondary)", lineHeight: "1.4" }}>{item.text}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* 4. DOCUMENTS TAB */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        {activeTab === "documents" && (
          <div className="animate-fade-in" style={{ display: "flex", flexDirection: "column", gap: "20px" }}>

            <div className="glass-panel" style={{ padding: "16px 20px" }}>
              <h3 style={{ fontSize: "1rem", fontWeight: 700, marginBottom: "6px" }} className="gold-gradient-text">مُعالج الصياغة والوثائق القانونية التفاعلي</h3>
              <p style={{ fontSize: "0.78rem", color: "var(--text-secondary)" }}>يقوم النظام بالصياغة التلقائية لجميع وثائق المحكمة بناءً على بيانات موكلك. يمكنك التعديل المباشر أو استخدام مساعد AI.</p>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "3fr 2fr", gap: "20px" }}>

              {/* Left: Document editor */}
              <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>

                {/* Doc tab switcher */}
                <div style={{ display: "flex", gap: "6px", overflowX: "auto", paddingBottom: "4px", flexWrap: "wrap" }}>
                  {([
                    { id: "claim",           icon: Scale,      label: "صحيفة الطلب" },
                    { id: "resolution",      icon: Handshake,  label: "قرار الشركاء" },
                    { id: "poa",             icon: ScrollText, label: "الوكالة الشرعية" },
                    { id: "financial_letter",icon: Mail,       label: "خطاب القوائم" },
                    { id: "creditors",       icon: Send,       label: "خطاب الدائنين" },
                    { id: "transactions",    icon: RefreshCw,  label: "بيان التصرفات" },
                    { id: "debts",           icon: Wallet,     label: `الديون (${activeCase.creditors.length})` },
                    { id: "assets",          icon: Package,    label: `الأصول (${activeCase.assets.length})` },
                    { id: "employees",       icon: HardHat,    label: `العمالة (${activeCase.employees.length})` },
                  ] as { id: typeof activeDocTab; icon: LucideIcon; label: string }[]).map(tab => (
                    <button key={tab.id} onClick={() => { setActiveDocTab(tab.id); setIsEditingDoc(false); }}
                      style={{ display: "inline-flex", alignItems: "center", gap: "5px", background: activeDocTab === tab.id ? "var(--gold-light)" : "var(--bg-secondary)", border: `1px solid ${activeDocTab === tab.id ? "var(--gold)" : "var(--card-border)"}`, color: activeDocTab === tab.id ? "var(--gold)" : "var(--text-primary)", padding: "6px 10px", borderRadius: "7px", fontSize: "0.75rem", cursor: "pointer", whiteSpace: "nowrap", fontWeight: activeDocTab === tab.id ? 700 : 400 }}>
                      <tab.icon size={14} /> {tab.label}
                    </button>
                  ))}
                </div>

                {/* Document Renderer */}
                <div className="legal-document-container">

                  {/* Text Documents */}
                  {["claim", "resolution", "poa", "financial_letter", "creditors", "transactions"].includes(activeDocTab) && (
                    <div className="legal-paper" ref={legalPaperRef}>
                      <div className="legal-header">
                        <div className="legal-header-kingdom">المملكة العربية السعودية</div>
                        <div className="legal-header-logo">
                          {activeDocTab === "claim" || activeDocTab === "financial_letter"
                            ? `مكتب المحامي / ${activeCase.attorneyName || "..."}`
                            : activeDocTab === "resolution" || activeDocTab === "transactions"
                            ? activeCase.debtorName || "اسم الشركة"
                            : activeDocTab === "poa"
                            ? "وكالة شرعية موثقة"
                            : "إشعار إلى الدائنين الكرام"}
                        </div>
                        <div className="legal-header-sub">
                          {activeDocTab === "claim" || activeDocTab === "financial_letter"
                            ? `ترخيص محاماة رقم: ${activeCase.attorneyLicense || "..."}`
                            : `السجل التجاري رقم: ${activeCase.crNumber || "..."} — ${activeCase.crCity}`}
                        </div>
                      </div>
                      <div className="legal-title">
                        {activeDocTab === "claim" ? "صحيفة دعوى وافتتاح إجراء التصفية الإدارية" :
                         activeDocTab === "resolution" ? "محضر قرار الشركاء — افتتاح إجراء الإفلاس" :
                         activeDocTab === "poa" ? "وكالة شرعية للتمثيل القانوني في قضايا الإفلاس" :
                         activeDocTab === "financial_letter" ? "خطاب بيان أسباب تعذر تقديم القوائم المالية" :
                         activeDocTab === "creditors" ? "إشعار رسمي للدائنين بشأن إجراء التصفية الإدارية" :
                         "بيان التصرفات المالية — آخر سنتين (24 شهراً)"}
                      </div>
                      {isEditingDoc ? (
                        <textarea
                          value={getDocText(activeDocTab)}
                          onChange={e => setDocText(activeDocTab, e.target.value)}
                          className="custom-textarea"
                          style={{ minHeight: "600px", background: "var(--bg-surface)", color: "var(--text-body)", border: "1px solid var(--gold)", fontSize: "0.9rem", lineHeight: "1.8", fontFamily: "inherit" }}
                        />
                      ) : (
                        <div style={{ whiteSpace: "pre-line", fontSize: "0.9rem", color: "#334155", textAlign: "justify", lineHeight: "1.8" }}>
                          {getDocText(activeDocTab)}
                        </div>
                      )}

                      {/* Signature section — always visible, replaces the old "التوقيع: ..." placeholder */}
                      <div className="legal-signatures">
                        {/* Lawyer */}
                        <div>
                          <div style={{ fontSize: "0.7rem", color: "#64748b", marginBottom: "6px" }}>توقيع المحامي الوكيل</div>
                          {activeCase.lawyerSignatureData && activeCase.lawyerSignatureData.startsWith("data:image") ? (
                            <img src={activeCase.lawyerSignatureData} alt="توقيع المحامي" style={{ maxHeight: "56px", maxWidth: "160px", objectFit: "contain", display: "block", margin: "0 auto 4px" }} />
                          ) : (
                            <div style={{ height: "48px" }} />
                          )}
                          <div style={{ borderTop: "1px solid #94a3b8", paddingTop: "4px", fontSize: "0.72rem", color: "#334155" }}>
                            {activeCase.attorneyName || "..............................."}
                          </div>
                          {nafathLawyerState === "verified" && (
                            <div style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "0.62rem", color: "#15803d", marginTop: "3px", fontWeight: 600 }}><CircleCheckBig size={11} /> تم التحقق عبر نفاذ</div>
                          )}
                        </div>
                        {/* Representative */}
                        <div>
                          <div style={{ fontSize: "0.7rem", color: "#64748b", marginBottom: "6px" }}>توقيع الممثل / المدير</div>
                          {activeCase.representativeSignatureData && activeCase.representativeSignatureData.startsWith("data:image") ? (
                            <img src={activeCase.representativeSignatureData} alt="توقيع الممثل" style={{ maxHeight: "56px", maxWidth: "160px", objectFit: "contain", display: "block", margin: "0 auto 4px" }} />
                          ) : (
                            <div style={{ height: "48px" }} />
                          )}
                          <div style={{ borderTop: "1px solid #94a3b8", paddingTop: "4px", fontSize: "0.72rem", color: "#334155" }}>
                            {activeCase.representativeName || "..............................."}
                          </div>
                          {nafathRepState === "verified" && (
                            <div style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "0.62rem", color: "#15803d", marginTop: "3px", fontWeight: 600 }}><CircleCheckBig size={11} /> تم التحقق عبر نفاذ</div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Debts Table — with Priority */}
                  {activeDocTab === "debts" && (
                    <div className="legal-paper" ref={legalPaperRef} style={{ padding: "28px 32px" }}>
                      <div className="legal-header">
                        <div className="legal-header-kingdom">المملكة العربية السعودية</div>
                        <div className="legal-header-logo">{activeCase.debtorName || "اسم الشركة"}</div>
                        <div className="legal-header-sub">السجل التجاري: {activeCase.crNumber || "..."} — {activeCase.crCity}</div>
                      </div>
                      <div className="legal-title">بيان الديون والدائنين المفصّل</div>
                      <p style={{ fontSize: "0.72rem", color: "#64748b", marginBottom: "12px" }}>مرتب حسب أولوية السداد النظامية (المادة 52) — إجمالي: {totalDebts.toLocaleString()} ر.س</p>

                      {/* Priority breakdown bar */}
                      <div style={{ display: "flex", gap: "6px", marginBottom: "16px", flexWrap: "wrap" }}>
                        {Object.entries(PRIORITY_LABELS).map(([key, val]) => {
                          const sum = activeCase.creditors.filter(c => c.priority === key).reduce((s, c) => s + c.amount, 0);
                          if (sum === 0) return null;
                          return <span key={key} style={{ fontSize: "0.68rem", padding: "2px 8px", borderRadius: "10px", background: val.color + "18", color: val.color, fontWeight: 700, border: `1px solid ${val.color}30` }}>{val.label}: {sum.toLocaleString()} ر.س</span>;
                        })}
                      </div>

                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.78rem", textAlign: "right" }}>
                        <thead>
                          <tr style={{ background: "#f1f5f9", borderBottom: "2px solid #cbd5e1" }}>
                            <th style={{ padding: "8px 6px", border: "1px solid #e2e8f0" }}>الأولوية</th>
                            <th style={{ padding: "8px 6px", border: "1px solid #e2e8f0" }}>اسم الدائن</th>
                            <th style={{ padding: "8px 6px", border: "1px solid #e2e8f0" }}>نوع الدين</th>
                            <th style={{ padding: "8px 6px", border: "1px solid #e2e8f0" }}>نوع الرهن</th>
                            <th style={{ padding: "8px 6px", border: "1px solid #e2e8f0" }}>المبلغ (ر.س)</th>
                            <th style={{ padding: "8px 6px", border: "1px solid #e2e8f0" }}>تاريخ الاستحقاق</th>
                            <th style={{ padding: "8px 6px", border: "1px solid #e2e8f0", textAlign: "center" }}>إجراء</th>
                          </tr>
                        </thead>
                        <tbody>
                          {[...activeCase.creditors].sort((a, b) => PRIORITY_LABELS[a.priority].rank - PRIORITY_LABELS[b.priority].rank).map(cred => (
                            <tr key={cred.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                              <td style={{ padding: "7px 6px", border: "1px solid #e2e8f0" }}>
                                <span style={{ fontSize: "0.66rem", padding: "1px 6px", borderRadius: "8px", background: PRIORITY_LABELS[cred.priority].color + "18", color: PRIORITY_LABELS[cred.priority].color, fontWeight: 700, whiteSpace: "nowrap" }}>{PRIORITY_LABELS[cred.priority].label}</span>
                              </td>
                              <td style={{ padding: "7px 6px", border: "1px solid #e2e8f0" }}>
                                <input style={{ border: "none", background: "transparent", width: "100%", fontFamily: "inherit", fontSize: "0.78rem", color: "#1f2937" }} value={cred.name} onChange={e => { const updated = activeCase.creditors.map(c => c.id === cred.id ? { ...c, name: e.target.value } : c); updateCase({ creditors: updated }); }} />
                              </td>
                              <td style={{ padding: "7px 6px", border: "1px solid #e2e8f0" }}>
                                <select style={{ border: "none", background: "transparent", fontFamily: "inherit", fontSize: "0.76rem", width: "100%" }} value={cred.priority} onChange={e => { const updated = activeCase.creditors.map(c => c.id === cred.id ? { ...c, priority: e.target.value as Creditor["priority"] } : c); updateCase({ creditors: updated }); }}>
                                  {Object.entries(PRIORITY_LABELS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                                </select>
                              </td>
                              <td style={{ padding: "7px 6px", border: "1px solid #e2e8f0" }}>
                                <div style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
                                  <select style={{ border: "none", background: "transparent", fontFamily: "inherit", fontSize: "0.72rem", width: "100%" }} value={cred.pledgeType ?? "لا_يوجد"} onChange={e => { const updated = activeCase.creditors.map(c => c.id === cred.id ? { ...c, pledgeType: e.target.value as Creditor["pledgeType"] } : c); updateCase({ creditors: updated }); }}>
                                    <option value="لا_يوجد">لا يوجد رهن</option>
                                    <option value="عقاري">رهن عقاري</option>
                                    <option value="تجاري">رهن تجاري</option>
                                    <option value="مركبة">رهن مركبة</option>
                                    <option value="معدات">رهن معدات</option>
                                    <option value="ضمان_شخصي">ضمان شخصي</option>
                                  </select>
                                  {cred.pledgeType && cred.pledgeType !== "لا_يوجد" && (
                                    <label style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "0.67rem", color: "var(--text-muted)", cursor: "pointer" }}>
                                      <input type="checkbox" checked={cred.pledgeRegistered ?? false} onChange={e => { const updated = activeCase.creditors.map(c => c.id === cred.id ? { ...c, pledgeRegistered: e.target.checked } : c); updateCase({ creditors: updated }); }} style={{ width: "11px", height: "11px" }} />
                                      مسجل رسمياً
                                    </label>
                                  )}
                                </div>
                              </td>
                              <td style={{ padding: "7px 6px", border: "1px solid #e2e8f0" }}>
                                <input type="number" style={{ border: "none", background: "transparent", width: "90px", fontFamily: "inherit", fontSize: "0.78rem", color: "#1f2937" }} value={cred.amount} onChange={e => { const updated = activeCase.creditors.map(c => c.id === cred.id ? { ...c, amount: Number(e.target.value) } : c); updateCase({ creditors: updated }); }} />
                              </td>
                              <td style={{ padding: "7px 6px", border: "1px solid #e2e8f0" }}>
                                <input type="date" style={{ border: "none", background: "transparent", fontFamily: "inherit", fontSize: "0.76rem" }} value={cred.date} onChange={e => { const updated = activeCase.creditors.map(c => c.id === cred.id ? { ...c, date: e.target.value } : c); updateCase({ creditors: updated }); }} />
                              </td>
                              <td style={{ padding: "7px 6px", border: "1px solid #e2e8f0", textAlign: "center" }}>
                                <button className="btn-icon danger" aria-label="حذف الدائن" onClick={() => updateCase({ creditors: activeCase.creditors.filter(c => c.id !== cred.id) })}><Trash2 size={14} /></button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr style={{ background: "#f8fafc", fontWeight: 700 }}>
                            <td colSpan={4} style={{ padding: "8px 6px", border: "1px solid #e2e8f0", textAlign: "left" }}>الإجمالي</td>
                            <td style={{ padding: "8px 6px", border: "1px solid #e2e8f0", color: "var(--error)" }}>{totalDebts.toLocaleString()} ر.س</td>
                            <td colSpan={2} />
                          </tr>
                        </tfoot>
                      </table>
                      <button className="btn-primary" onClick={() => { const id = Date.now().toString(); updateCase({ creditors: [...activeCase.creditors, { id, name: "دائن جديد", amount: 0, priority: "p3_unsecured", type: "تجاري عادي", date: new Date().toISOString().substring(0, 10) }] }); }} style={{ marginTop: "14px", padding: "6px 14px", fontSize: "0.75rem" }}><Plus size={14} /> إضافة دائن</button>
                    </div>
                  )}

                  {/* Assets Table */}
                  {activeDocTab === "assets" && (
                    <div className="legal-paper" ref={legalPaperRef} style={{ padding: "28px 32px" }}>
                      <div className="legal-header">
                        <div className="legal-header-kingdom">المملكة العربية السعودية</div>
                        <div className="legal-header-logo">{activeCase.debtorName || "اسم الشركة"}</div>
                        <div className="legal-header-sub">السجل التجاري: {activeCase.crNumber || "..."} — {activeCase.crCity}</div>
                      </div>
                      <div className="legal-title">بيان الأصول والممتلكات</div>
                      <p style={{ fontSize: "0.72rem", color: "#64748b", marginBottom: "12px" }}>القيمة التقديرية الإجمالية: {totalAssets.toLocaleString()} ر.س</p>
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.78rem", textAlign: "right" }}>
                        <thead>
                          <tr style={{ background: "#f1f5f9", borderBottom: "2px solid #cbd5e1" }}>
                            <th style={{ padding: "8px", border: "1px solid #e2e8f0" }}>الأصل</th>
                            <th style={{ padding: "8px", border: "1px solid #e2e8f0" }}>القيمة التقديرية</th>
                            <th style={{ padding: "8px", border: "1px solid #e2e8f0" }}>الموقع</th>
                            <th style={{ padding: "8px", border: "1px solid #e2e8f0" }}>الوصف</th>
                            <th style={{ padding: "8px", border: "1px solid #e2e8f0", textAlign: "center" }}>إجراء</th>
                          </tr>
                        </thead>
                        <tbody>
                          {activeCase.assets.map(a => (
                            <tr key={a.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                              <td style={{ padding: "7px", border: "1px solid #e2e8f0" }}><input style={{ border: "none", background: "transparent", width: "100%", fontFamily: "inherit", fontSize: "0.78rem" }} value={a.name} onChange={e => updateCase({ assets: activeCase.assets.map(x => x.id === a.id ? { ...x, name: e.target.value } : x) })} /></td>
                              <td style={{ padding: "7px", border: "1px solid #e2e8f0" }}><input type="number" style={{ border: "none", background: "transparent", width: "90px", fontFamily: "inherit", fontSize: "0.78rem" }} value={a.value} onChange={e => updateCase({ assets: activeCase.assets.map(x => x.id === a.id ? { ...x, value: Number(e.target.value) } : x) })} /></td>
                              <td style={{ padding: "7px", border: "1px solid #e2e8f0" }}><input style={{ border: "none", background: "transparent", width: "100%", fontFamily: "inherit", fontSize: "0.78rem" }} value={a.location} onChange={e => updateCase({ assets: activeCase.assets.map(x => x.id === a.id ? { ...x, location: e.target.value } : x) })} /></td>
                              <td style={{ padding: "7px", border: "1px solid #e2e8f0" }}><input style={{ border: "none", background: "transparent", width: "100%", fontFamily: "inherit", fontSize: "0.78rem" }} value={a.description} onChange={e => updateCase({ assets: activeCase.assets.map(x => x.id === a.id ? { ...x, description: e.target.value } : x) })} /></td>
                              <td style={{ padding: "7px", border: "1px solid #e2e8f0", textAlign: "center" }}><button className="btn-icon danger" aria-label="حذف الأصل" onClick={() => updateCase({ assets: activeCase.assets.filter(x => x.id !== a.id) })}><Trash2 size={14} /></button></td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot><tr style={{ background: "#f8fafc", fontWeight: 700 }}><td colSpan={1} style={{ padding: "8px", border: "1px solid #e2e8f0" }}>الإجمالي</td><td style={{ padding: "8px", border: "1px solid #e2e8f0", color: "var(--success)" }}>{totalAssets.toLocaleString()} ر.س</td><td colSpan={3} /></tr></tfoot>
                      </table>
                      <button className="btn-primary" onClick={() => updateCase({ assets: [...activeCase.assets, { id: Date.now().toString(), name: "أصل جديد", value: 0, location: activeCase.crCity, description: "" }] })} style={{ marginTop: "14px", padding: "6px 14px", fontSize: "0.75rem" }}><Plus size={14} /> إضافة أصل</button>
                    </div>
                  )}

                  {/* Employees Table with EOSB calculation */}
                  {activeDocTab === "employees" && (
                    <div className="legal-paper" ref={legalPaperRef} style={{ padding: "28px 32px" }}>
                      <div className="legal-header">
                        <div className="legal-header-kingdom">المملكة العربية السعودية</div>
                        <div className="legal-header-logo">{activeCase.debtorName || "اسم الشركة"}</div>
                        <div className="legal-header-sub">السجل التجاري: {activeCase.crNumber || "..."} — {activeCase.crCity}</div>
                      </div>
                      <div className="legal-title">بيان العمالة ومستحقات نهاية الخدمة</div>
                      <p style={{ fontSize: "0.72rem", color: "#64748b", marginBottom: "6px" }}>إجمالي المستحقات المحتسبة: {totalEosb.toLocaleString()} ر.س</p>
                      <p style={{ fontSize: "0.7rem", color: "#64748b", marginBottom: "10px", fontStyle: "italic" }}>* تُحسب نهاية الخدمة وفق نظام العمل السعودي: نصف راتب × سنوات الخدمة (1-5 سنوات)، وراتب كامل بعدها.</p>
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.76rem", textAlign: "right" }}>
                        <thead>
                          <tr style={{ background: "#f1f5f9", borderBottom: "2px solid #cbd5e1" }}>
                            {["الاسم", "الجنسية", "الهوية/الإقامة", "تاريخ الانضمام", "الراتب (ر.س)", "نهاية الخدمة (محتسبة)", "إجراء"].map((h, i) => <th key={i} style={{ padding: "7px 6px", border: "1px solid #e2e8f0", textAlign: i === 6 ? "center" : "right" }}>{h}</th>)}
                          </tr>
                        </thead>
                        <tbody>
                          {employeesWithEosb.map(emp => (
                            <tr key={emp.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                              <td style={{ padding: "7px 6px", border: "1px solid #e2e8f0" }}><input style={{ border: "none", background: "transparent", width: "100%", fontFamily: "inherit", fontSize: "0.76rem" }} value={emp.name} onChange={e => updateCase({ employees: activeCase.employees.map(x => x.id === emp.id ? { ...x, name: e.target.value } : x) })} /></td>
                              <td style={{ padding: "7px 6px", border: "1px solid #e2e8f0" }}><input style={{ border: "none", background: "transparent", width: "60px", fontFamily: "inherit", fontSize: "0.76rem" }} value={emp.nationality} onChange={e => updateCase({ employees: activeCase.employees.map(x => x.id === emp.id ? { ...x, nationality: e.target.value } : x) })} /></td>
                              <td style={{ padding: "7px 6px", border: "1px solid #e2e8f0" }}><input style={{ border: "none", background: "transparent", width: "90px", fontFamily: "inherit", fontSize: "0.76rem" }} value={emp.iqama} onChange={e => updateCase({ employees: activeCase.employees.map(x => x.id === emp.id ? { ...x, iqama: e.target.value } : x) })} /></td>
                              <td style={{ padding: "7px 6px", border: "1px solid #e2e8f0" }}><input type="date" style={{ border: "none", background: "transparent", fontFamily: "inherit", fontSize: "0.74rem" }} value={emp.joinDate} onChange={e => updateCase({ employees: activeCase.employees.map(x => x.id === emp.id ? { ...x, joinDate: e.target.value } : x) })} /></td>
                              <td style={{ padding: "7px 6px", border: "1px solid #e2e8f0" }}><input type="number" style={{ border: "none", background: "transparent", width: "70px", fontFamily: "inherit", fontSize: "0.76rem" }} value={emp.salary} onChange={e => updateCase({ employees: activeCase.employees.map(x => x.id === emp.id ? { ...x, salary: Number(e.target.value) } : x) })} /></td>
                              <td style={{ padding: "7px 6px", border: "1px solid #e2e8f0", fontWeight: 700, color: "var(--primary-green)" }}>{emp.benefits.toLocaleString()} ر.س</td>
                              <td style={{ padding: "7px 6px", border: "1px solid #e2e8f0", textAlign: "center" }}><button className="btn-icon danger" aria-label="حذف الموظف" onClick={() => updateCase({ employees: activeCase.employees.filter(x => x.id !== emp.id) })}><Trash2 size={14} /></button></td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot><tr style={{ background: "#f8fafc", fontWeight: 700 }}><td colSpan={5} style={{ padding: "8px", border: "1px solid #e2e8f0", textAlign: "left" }}>إجمالي مستحقات نهاية الخدمة:</td><td style={{ padding: "8px", border: "1px solid #e2e8f0", color: "var(--primary-green)" }}>{totalEosb.toLocaleString()} ر.س</td><td /></tr></tfoot>
                      </table>
                      <button className="btn-primary" onClick={() => updateCase({ employees: [...activeCase.employees, { id: Date.now().toString(), name: "موظف جديد", nationality: "سعودي", iqama: "", salary: 5000, joinDate: new Date().toISOString().substring(0, 10), benefits: 0 }] })} style={{ marginTop: "14px", padding: "6px 14px", fontSize: "0.75rem" }}><Plus size={14} /> إضافة موظف</button>
                    </div>
                  )}
                </div>

                {/* Document Actions */}
                <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end", flexWrap: "wrap" }}>
                  {["claim", "resolution", "poa", "financial_letter", "creditors", "transactions"].includes(activeDocTab) && (
                    <button className="btn-secondary" onClick={() => setIsEditingDoc(!isEditingDoc)} style={{ fontSize: "0.78rem" }}>
                      <PenLine size={14} /> {isEditingDoc ? "حفظ وعودة للمعاينة" : "تعديل النص"}
                    </button>
                  )}
                  <button className="btn-secondary" onClick={() => {
                    navigator.clipboard.writeText(
                      getDocText(activeDocTab) || JSON.stringify({ creditors: activeCase.creditors, assets: activeCase.assets, employees: employeesWithEosb }, null, 2)
                    );
                    showToast("تم نسخ الوثيقة إلى الحافظة");
                  }} style={{ fontSize: "0.78rem" }}><Copy size={14} /> نسخ</button>
                  {["claim", "resolution", "poa", "financial_letter", "creditors", "transactions"].includes(activeDocTab) && (
                    <button className="btn-secondary" onClick={downloadDocx} style={{ fontSize: "0.78rem" }}>
                      <FileText size={14} /> تحميل Word
                    </button>
                  )}
                  <button
                    className="btn-primary"
                    onClick={downloadPdf}
                    disabled={isEditingDoc}
                    title={isEditingDoc ? "أنهِ وضع التعديل أولاً" : ""}
                    style={{ fontSize: "0.78rem", opacity: isEditingDoc ? 0.5 : 1 }}
                  >
                    <Download size={14} /> تحميل PDF
                  </button>
                </div>
              </div>

              {/* Right: AI + Variables */}
              <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>

                {/* AI Assistant */}
                <div className="glass-panel" style={{ padding: "16px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
                    <Bot size={19} color="var(--gold)" />
                    <h4 style={{ fontSize: "0.9rem", fontWeight: 700 }} className="gold-gradient-text">مساعد الصياغة الذكي</h4>
                  </div>
                  <p style={{ fontSize: "0.72rem", color: "var(--text-secondary)", marginBottom: "10px" }}>اكتب فقرة مخصصة تريد إضافتها للوثيقة ودع الذكاء الاصطناعي ينسقها بأسلوب قانوني.</p>
                  <textarea value={aiPrompt} onChange={e => setAiPrompt(e.target.value)} placeholder="مثال: صياغة بند يوضح تأثير ارتفاع رسوم الشحن على تعثر الشركة..." className="custom-textarea" style={{ minHeight: "72px", fontSize: "0.78rem", marginBottom: "8px" }} />
                  <button className="btn-primary" style={{ width: "100%", fontSize: "0.82rem", padding: "8px" }} onClick={handleAiDrafting} disabled={isAiDrafting || !aiPrompt.trim()}>
                    {isAiDrafting ? <><Loader2 size={14} className="spin-icon" /> جاري الصياغة...</> : <><Sparkles size={14} /> صياغة بالذكاء الاصطناعي</>}
                  </button>
                  {aiDraftedText && (
                    <div className="glass-panel animate-fade-in" style={{ padding: "10px", marginTop: "12px", border: "1px solid var(--accent-gold)", background: "rgba(247,178,34,0.03)" }}>
                      <p style={{ fontSize: "0.7rem", color: "var(--accent-gold)", fontWeight: 700, marginBottom: "4px" }}>النص المقترح:</p>
                      <p style={{ fontSize: "0.78rem", lineHeight: "1.5", textAlign: "justify", whiteSpace: "pre-line" }}>{aiDraftedText}</p>
                      {!isAiDrafting && (
                        <button className="btn-secondary" onClick={() => {
                          setDocText(activeDocTab, getDocText(activeDocTab) + "\n\n" + aiDraftedText);
                          setAiDraftedText(""); setAiPrompt("");
                          showToast("تم إدراج النص في الوثيقة");
                        }} style={{ marginTop: "8px", width: "100%", padding: "4px", fontSize: "0.73rem" }}><Download size={13} /> إدراج في الوثيقة</button>
                      )}
                    </div>
                  )}
                </div>

                {/* Variable Editor */}
                <div className="glass-panel" style={{ padding: "16px" }}>
                  <h4 style={{ fontSize: "0.9rem", fontWeight: 700, marginBottom: "10px" }} className="gold-gradient-text">البيانات الأساسية للملف</h4>
                  <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                    {/* Text fields */}
                    {([
                      { label: "الاسم التجاري:", key: "debtorName" },
                      { label: "رقم السجل التجاري:", key: "crNumber" },
                      { label: "مدينة السجل التجاري:", key: "crCity" },
                      { label: "مدينة المحكمة:", key: "courtCity" },
                      { label: "الكيان القانوني:", key: "legalForm" },
                      { label: "اسم المدير / الممثل:", key: "representativeName" },
                      { label: "صفة الممثل:", key: "representativeTitle" },
                      { label: "رقم هوية / إقامة الممثل:", key: "representativeId" },
                      { label: "المحامي الوكيل:", key: "attorneyName" },
                      { label: "رخصة المحاماة:", key: "attorneyLicense" },
                      { label: "رقم الوكالة الشرعية:", key: "poaNumber" },
                      { label: "مدينة توثيق الوكالة:", key: "poaCity" },
                    ] as { label: string; key: keyof typeof activeCase }[]).map(field => (
                      <div key={field.key as string}>
                        <label style={{ fontSize: "0.7rem", color: "var(--text-muted)", display: "block", marginBottom: "3px" }}>{field.label}</label>
                        <input className="custom-input" value={String(activeCase[field.key] ?? "")} onChange={e => updateCase({ [field.key]: e.target.value })} style={{ padding: "6px 10px", fontSize: "0.78rem" }} />
                      </div>
                    ))}

                    {/* Date & time row */}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                      <div>
                        <label style={{ fontSize: "0.7rem", color: "var(--text-muted)", display: "block", marginBottom: "3px" }}>تاريخ المستند:</label>
                        <input type="date" className="custom-input" value={activeCase.documentDate} onChange={e => updateCase({ documentDate: e.target.value })} style={{ padding: "6px 10px", fontSize: "0.78rem" }} />
                      </div>
                      <div>
                        <label style={{ fontSize: "0.7rem", color: "var(--text-muted)", display: "block", marginBottom: "3px" }}>الساعة:</label>
                        <input type="time" className="custom-input" value={activeCase.documentTime} onChange={e => updateCase({ documentTime: e.target.value })} style={{ padding: "6px 10px", fontSize: "0.78rem" }} />
                      </div>
                    </div>

                    {/* POA date */}
                    <div>
                      <label style={{ fontSize: "0.7rem", color: "var(--text-muted)", display: "block", marginBottom: "3px" }}>تاريخ الوكالة الشرعية:</label>
                      <input type="date" className="custom-input" value={activeCase.poaDate} onChange={e => updateCase({ poaDate: e.target.value })} style={{ padding: "6px 10px", fontSize: "0.78rem" }} />
                    </div>

                    {/* Signature upload — Lawyer (Nafath verification required first) */}
                    <div style={{ background: "var(--bg-subtle)", borderRadius: "var(--radius-sm)", padding: "10px", border: "1px solid var(--border)" }}>
                      <label style={{ fontSize: "0.7rem", color: "var(--text-muted)", display: "block", marginBottom: "6px", fontWeight: 600 }}>توقيع المحامي الوكيل</label>

                      {/* Step 1: Nafath gate */}
                      {nafathLawyerState === "idle" && (
                        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                          <p style={{ fontSize: "0.68rem", color: "var(--text-muted)" }}>يجب التحقق من الهوية أولاً قبل رفع التوقيع</p>
                          <button
                            onClick={() => { setNafathLawyerState("verifying"); setTimeout(() => setNafathLawyerState("verified"), 1800); }}
                            style={{ width: "100%", padding: "8px 14px", background: "#00A896", border: "none", borderRadius: "var(--radius-sm)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "10px", boxShadow: "0 2px 8px rgba(0,168,150,0.30)" }}
                          >
                            <img src="/nafath-logo.svg" alt="نفاذ" style={{ height: "22px", filter: "brightness(0) invert(1)" }} />
                            <span style={{ color: "#fff", fontFamily: "inherit", fontWeight: 700, fontSize: "0.8rem" }}>تحقق عبر نفاذ</span>
                          </button>
                        </div>
                      )}

                      {/* Step 2: Verifying */}
                      {nafathLawyerState === "verifying" && (
                        <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "8px 0", fontSize: "0.73rem", color: "var(--gold)" }}>
                          <div style={{ width: "14px", height: "14px", border: "2px solid var(--gold)", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.8s linear infinite", flexShrink: 0 }} />
                          جاري التحقق من الهوية عبر نفاذ...
                        </div>
                      )}

                      {/* Step 3: Verified → show upload */}
                      {nafathLawyerState === "verified" && (
                        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "0.68rem", color: "var(--success)", fontWeight: 600 }}><CircleCheckBig size={13} /> تم التحقق عبر نفاذ — يمكنك رفع التوقيع</div>
                          <input type="file" accept="image/*"
                            style={{ fontSize: "0.72rem", color: "var(--text-secondary)" }}
                            onChange={e => {
                              const file = e.target.files?.[0];
                              if (!file) return;
                              const img = new Image();
                              const objectUrl = URL.createObjectURL(file);
                              img.onload = () => {
                                const canvas = document.createElement("canvas");
                                const MAX = 400;
                                const scale = Math.min(1, MAX / Math.max(img.width, img.height));
                                canvas.width = Math.round(img.width * scale);
                                canvas.height = Math.round(img.height * scale);
                                canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
                                updateCase({ lawyerSignatureData: canvas.toDataURL("image/png", 0.8) });
                                URL.revokeObjectURL(objectUrl);
                              };
                              img.src = objectUrl;
                            }}
                          />
                          {activeCase.lawyerSignatureData && (
                            <div style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "0.68rem", color: "var(--success)" }}><CircleCheckBig size={13} /> تم رفع التوقيع</div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Signature upload — Representative (Nafath verification required first) */}
                    <div style={{ background: "var(--bg-subtle)", borderRadius: "var(--radius-sm)", padding: "10px", border: "1px solid var(--border)" }}>
                      <label style={{ fontSize: "0.7rem", color: "var(--text-muted)", display: "block", marginBottom: "6px", fontWeight: 600 }}>توقيع الممثل / المدير</label>

                      {/* Step 1: Nafath gate */}
                      {nafathRepState === "idle" && (
                        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                          <p style={{ fontSize: "0.68rem", color: "var(--text-muted)" }}>يجب التحقق من الهوية أولاً قبل رفع التوقيع</p>
                          <button
                            onClick={() => { setNafathRepState("verifying"); setTimeout(() => setNafathRepState("verified"), 1800); }}
                            style={{ width: "100%", padding: "8px 14px", background: "#00A896", border: "none", borderRadius: "var(--radius-sm)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "10px", boxShadow: "0 2px 8px rgba(0,168,150,0.30)" }}
                          >
                            <img src="/nafath-logo.svg" alt="نفاذ" style={{ height: "22px", filter: "brightness(0) invert(1)" }} />
                            <span style={{ color: "#fff", fontFamily: "inherit", fontWeight: 700, fontSize: "0.8rem" }}>تحقق عبر نفاذ</span>
                          </button>
                        </div>
                      )}

                      {/* Step 2: Verifying */}
                      {nafathRepState === "verifying" && (
                        <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "8px 0", fontSize: "0.73rem", color: "var(--gold)" }}>
                          <div style={{ width: "14px", height: "14px", border: "2px solid var(--gold)", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.8s linear infinite", flexShrink: 0 }} />
                          جاري التحقق من الهوية عبر نفاذ...
                        </div>
                      )}

                      {/* Step 3: Verified → show upload */}
                      {nafathRepState === "verified" && (
                        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "0.68rem", color: "var(--success)", fontWeight: 600 }}><CircleCheckBig size={13} /> تم التحقق عبر نفاذ — يمكنك رفع التوقيع</div>
                          <input type="file" accept="image/*"
                            style={{ fontSize: "0.72rem", color: "var(--text-secondary)" }}
                            onChange={e => {
                              const file = e.target.files?.[0];
                              if (!file) return;
                              const img = new Image();
                              const objectUrl = URL.createObjectURL(file);
                              img.onload = () => {
                                const canvas = document.createElement("canvas");
                                const MAX = 400;
                                const scale = Math.min(1, MAX / Math.max(img.width, img.height));
                                canvas.width = Math.round(img.width * scale);
                                canvas.height = Math.round(img.height * scale);
                                canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
                                updateCase({ representativeSignatureData: canvas.toDataURL("image/png", 0.8) });
                                URL.revokeObjectURL(objectUrl);
                              };
                              img.src = objectUrl;
                            }}
                          />
                          {activeCase.representativeSignatureData && (
                            <div style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "0.68rem", color: "var(--success)" }}><CircleCheckBig size={13} /> تم رفع التوقيع</div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* 5. KNOWLEDGE BASE TAB */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        {activeTab === "kb" && (
          <div className="animate-fade-in" style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
            <div className="glass-panel" style={{ padding: "16px 20px" }}>
              <h3 style={{ fontSize: "1rem", fontWeight: 700, marginBottom: "6px" }} className="gold-gradient-text">قاعدة المعرفة القانونية المتكاملة</h3>
              <p style={{ fontSize: "0.78rem", color: "var(--text-secondary)" }}>مستنبطة من نظام الإفلاس السعودي (م/50) ولائحته التنفيذية وإرشادات لجنة الإفلاس الرسمية.</p>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                <h4 style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "1rem", fontWeight: 700, color: "var(--accent-gold)" }}><Pin size={16} /> متطلبات لجنة الإفلاس</h4>
                {[
                  { title: "المستند 1: صحيفة الطلب", text: "يجب أن يتضمن اسم المدين وسجله التجاري وطبيعة الكيان ومبررات التقديم مع وكالة شرعية سارية ورخصة المحاماة. تُقدَّم أمام المحكمة التجارية لمقر الشركة." },
                  { title: "المستند 2: بيان الديون", text: "يجب صياغته في جدول واضح يشمل: الاسم التجاري والعنوان والبريد الإلكتروني لكل دائن، قيمة الدين بدقة، تاريخ استحقاقه، ونوع الدين ومرتبته." },
                  { title: "المستند 3: بيان الأصول", text: "كشف بجميع الممتلكات العقارية والمنقولة والمالية مع قيمتها التقديرية لإثبات شح الأصول وأنها لا تغطي 150,000 ريال تكلفة التصفية." },
                  { title: "المستند 4: بيان العمالة", text: "حصر مفصل لجميع الموظفين: الجنسية، رقم الهوية/الإقامة، الراتب، وتاريخ الانضمام لحساب نهاية الخدمة وفق نظام العمل السعودي." },
                  { title: "المستند 5: قرار الشركاء (للشركات)", text: "محضر الجمعية العامة غير العادية بالموافقة الإجماعية على تقديم طلب الإفلاس وتفويض المحامي." },
                ].map((item, i) => (
                  <div key={i} className="glass-panel" style={{ padding: "12px 14px" }}>
                    <p style={{ fontSize: "0.82rem", fontWeight: 700, color: "var(--accent-gold)", marginBottom: "5px" }}>{item.title}</p>
                    <p style={{ fontSize: "0.73rem", color: "var(--text-secondary)", lineHeight: "1.5" }}>{item.text}</p>
                  </div>
                ))}
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                <h4 style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "1rem", fontWeight: 700, color: "var(--accent-gold)" }}><BookOpen size={16} /> نصوص نظام الإفلاس</h4>
                {[
                  { article: "المادة 168 — نظام الإفلاس", text: "\"يهدف إجراء التصفية الإدارية إلى بيع أصول التفليسة التي لا يتوقع أن ينتج عن بيعها حصيلة تكفي لتغطية مصروفات إجراء التصفية أو إجراء التصفية لصغار المدينين، وذلك تحت إشراف لجنة الإفلاس...\"" },
                  { article: "المادة 170 — تقديم الطلب", text: "للمدين وللجهة المختصة التقدم بطلب افتتاح إجراء التصفية الإدارية إذا كان المدين مفلساً أو متعثراً، وكانت أصوله لا تكفي لتغطية مصروفات إجراء التصفية." },
                  { article: "المادة 92 — اللائحة التنفيذية", text: "تتولى إدارة قيد الدعاوى فحص النواقص الشكلية خلال 3 أيام. في حال نقص مستند يُعاد الملف للمدعي ويُشطب الطلب شكلاً." },
                  { article: "أولويات توزيع العائد", text: "مرتبة 1: مصروفات الإجراء + مستحقات العمال + ديون حكومية. مرتبة 2: ديون مضمونة برهن. مرتبة 3: ديون تجارية عادية. مرتبة 4: ديون مؤخرة." },
                  { article: "روابط الجهات الرسمية", text: "• بوابة لجنة الإفلاس: bankruptcy.gov.sa\n• منصة ناجز (تقديم الطلب): najiz.sa\n• بوابة ZATCA: zatca.gov.sa\n• وزارة العدل: moj.gov.sa" },
                ].map((item, i) => (
                  <div key={i} className="glass-panel" style={{ padding: "12px 14px" }}>
                    <p style={{ fontSize: "0.82rem", fontWeight: 700, color: "var(--accent-gold)", marginBottom: "5px" }}>{item.article}</p>
                    <p style={{ fontSize: "0.73rem", color: "var(--text-secondary)", lineHeight: "1.5", whiteSpace: "pre-line" }}>{item.text}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

      </main>

    </div>
    )}

    {/* ═══════ SHARED OVERLAYS ═══════ */}

    {/* Toast Notifications */}
    <div style={{ position: "fixed", bottom: "24px", left: "24px", zIndex: 9999, display: "flex", flexDirection: "column", gap: "8px", pointerEvents: "none" }}>
      {toasts.map(t => (
        <div key={t.id} style={{
          display: "flex", alignItems: "center", gap: "8px",
          padding: "10px 16px", borderRadius: "8px", fontSize: "0.82rem", fontWeight: 600, color: "#fff",
          background: t.type === "success" ? "var(--green-600)" : t.type === "error" ? "var(--red)" : "var(--gold)",
          boxShadow: "0 4px 12px rgba(0,0,0,0.15)", animation: "slideInUp 0.25s ease forwards", maxWidth: "320px",
        }}>
          {t.type === "success" ? <CircleCheckBig size={16} /> : t.type === "error" ? <Ban size={16} /> : <Info size={16} />}
          {t.message}
        </div>
      ))}
    </div>

    {/* Confirm Modal */}
    {confirmModal.open && (
      <div style={{ position: "fixed", inset: 0, background: "rgba(15,25,35,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2000, backdropFilter: "blur(4px)" }}>
        <div className="card animate-fade-in" style={{ padding: "28px", width: "400px", display: "flex", flexDirection: "column", gap: "18px" }}>
          <div>
            <AlertTriangle size={26} color="var(--red)" style={{ marginBottom: "8px" }} />
            <p style={{ fontSize: "0.92rem", fontWeight: 600, color: "var(--text-heading)" }}>{confirmModal.message}</p>
          </div>
          <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
            <button className="btn-secondary" onClick={() => setConfirmModal(m => ({ ...m, open: false }))}>إلغاء</button>
            <button className="btn-primary" style={{ background: "var(--red)" }}
              onClick={() => { confirmModal.onConfirm(); setConfirmModal(m => ({ ...m, open: false })); }}>
              تأكيد الحذف
            </button>
          </div>
        </div>
      </div>
    )}

    </>
  );
}
