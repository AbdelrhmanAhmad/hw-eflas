// ─── Shared case data model ──────────────────────────────────────────────────
// Used by both the client workspace (src/app/case-workspace.tsx) and the
// server-side data layer (src/lib/cases.ts) so the shape stays in sync.

export interface Creditor {
  id: string;
  name: string;
  amount: number;
  priority: "p1_expenses" | "p1_employees" | "p1_government" | "p2_secured" | "p3_unsecured" | "p4_deferred";
  type: string;
  date: string;
  contact?: string;
  pledgeType?: "عقاري" | "تجاري" | "مركبة" | "معدات" | "ضمان_شخصي" | "لا_يوجد";
  pledgeRegistered?: boolean;
}

export interface Asset {
  id: string;
  name: string;
  value: number;
  location: string;
  description: string;
}

export interface Employee {
  id: string;
  name: string;
  nationality: string;
  iqama: string;
  salary: number;
  joinDate: string;
  benefits: number;
}

export interface UploadedFile {
  id?: string;
  name: string;
  type: string;
  size: string;
  status: "success" | "pending";
  storagePath?: string;
  mimeType?: string;
}

export interface TimelineEvent {
  id: string;
  label: string;
  dayOffset: number;
  category: "critical" | "warning" | "info";
  done: boolean;
}

export interface ZatcaChecklist {
  accountStatement: boolean;
  vatRegistration: boolean;
  zakahCert: boolean;
  clearanceLetter: boolean;
}

export interface GosiChecklist {
  registered: boolean;
  debtsStatement: boolean;
  clearanceLetter: boolean;
}

export interface HrChecklist {
  employeesListed: boolean;
  mudadCleared: boolean;
  workPermitsCancelled: boolean;
}

export interface HearingDate {
  id: string;
  date: string;
  type: "جلسة_أولى" | "جلسة_موضوع" | "جلسة_قرار" | "أخرى";
  notes: string;
  result?: string;
}

export interface Case {
  id: string;
  createdAt: string;
  lastModified: string;
  status: "draft" | "preparing" | "submitted" | "decided" | "closed";
  caseNumber?: string;
  submissionDate?: string;

  // Debtor profile
  debtorName: string;
  legalForm: string;
  crNumber: string;
  crCity: string;
  courtCity: string;
  representativeName: string;
  representativeTitle: string;
  representativeId: string;
  attorneyName: string;
  attorneyLicense: string;

  // Document metadata
  documentDate: string;
  documentTime: string;
  poaNumber: string;
  poaDate: string;
  poaCity: string;

  // Signatures (base64 data URLs)
  lawyerSignatureData: string;
  representativeSignatureData: string;

  // Financials
  totalDebts: number;
  totalAssets: number;

  // Wizard answers
  isEstablishment: string;
  isActive: string;
  hasAssets: string;
  assetsCoverExpenses: string;
  insolvencyStatus: string;
  financialStatementsAvailable: string;
  financialTransactionsAvailable: string;
  creditorsNotified: string;
  operatedTwelveMonths: string;
  previousSettlement: string;

  // Lists
  creditors: Creditor[];
  assets: Asset[];
  employees: Employee[];
  uploadedFiles: UploadedFile[];

  // ZATCA
  zatcaFileNumber: string;
  zatcaChecklist: ZatcaChecklist;

  // Government agencies
  gosiFileNumber: string;
  gosiChecklist: GosiChecklist;
  hrChecklist: HrChecklist;
  commerceCrCancellationRequested: boolean;
  samaNotified: boolean;

  // Timeline
  timelineEvents: TimelineEvent[];

  // Post-submission
  trusteeName: string;
  hearingDates: HearingDate[];

  // AI legal analysis (persisted so it survives reloads instead of vanishing)
  aiDiagnosis: string;
  aiDiagnosisAt: string;
  // Snapshot of the facts the analysis was run against — lets the UI detect
  // "this analysis is now stale, the file has changed since" instead of
  // silently showing an opinion that no longer matches the current file.
  aiDiagnosisSignature: string;
  // True when the server's automated cross-check found the AI's text doesn't
  // match the deterministic classification AND didn't explicitly flag why.
  aiDiagnosisConsistencyWarning: boolean;

  // Derived from the Case↔User client-account link — read-only, never written
  // back via saveCaseForUser. Null when no client account is linked yet.
  clientEmail?: string | null;
}

export const DEFAULT_TIMELINE_EVENTS: TimelineEvent[] = [
  { id: "t1", label: "تقديم الطلب لقيد الدعاوى (يوم 0)", dayOffset: 0, category: "info", done: false },
  { id: "t2", label: "فحص النواقص الشكلية بالإدارة (3 أيام)", dayOffset: 3, category: "critical", done: false },
  { id: "t3", label: "تبليغ المدين من قِبل الجهة المختصة (5 أيام)", dayOffset: 5, category: "warning", done: false },
  { id: "t4", label: "صدور قرار المحكمة بالقبول/الرفض (15 يوم)", dayOffset: 15, category: "critical", done: false },
  { id: "t5", label: "نشر الإعلان في الجريدة الرسمية (30 يوم)", dayOffset: 30, category: "warning", done: false },
  { id: "t6", label: "تعيين لجنة الإفلاس وإدارة الإجراء (45 يوم)", dayOffset: 45, category: "info", done: false },
  { id: "t7", label: "حصر الأصول وتقييمها من الأمين (60 يوم)", dayOffset: 60, category: "info", done: false },
  { id: "t8", label: "إصدار قائمة الدائنين المعتمدة (90 يوم)", dayOffset: 90, category: "info", done: false },
];

// نظام الإفلاس السعودي، المادة 168 — الحد الأعلى لتقدير نفقات التصفية العادية (100,000–150,000 ريال)
export const LIQUIDATION_COST_ESTIMATE = 150_000;

export const createNewCase = (): Case => ({
  id: `case_${Date.now()}`,
  createdAt: new Date().toISOString(),
  lastModified: new Date().toISOString(),
  status: "draft",
  debtorName: "",
  legalForm: "شركة ذات مسؤولية محدودة",
  crNumber: "",
  crCity: "الرياض",
  courtCity: "الرياض",
  representativeName: "",
  representativeTitle: "المدير التنفيذي",
  representativeId: "",
  attorneyName: "",
  attorneyLicense: "",
  documentDate: new Date().toISOString().substring(0, 10),
  documentTime: new Date().toTimeString().substring(0, 5),
  poaNumber: "",
  poaDate: "",
  poaCity: "الرياض",
  lawyerSignatureData: "",
  representativeSignatureData: "",
  totalDebts: 0,
  totalAssets: 0,
  isEstablishment: "company",
  isActive: "no",
  hasAssets: "yes",
  assetsCoverExpenses: "no",
  insolvencyStatus: "actual",
  financialStatementsAvailable: "no",
  financialTransactionsAvailable: "no",
  creditorsNotified: "no",
  operatedTwelveMonths: "yes",
  previousSettlement: "no",
  creditors: [],
  assets: [],
  employees: [],
  uploadedFiles: [],
  zatcaFileNumber: "",
  zatcaChecklist: { accountStatement: false, vatRegistration: false, zakahCert: false, clearanceLetter: false },
  gosiFileNumber: "",
  gosiChecklist: { registered: false, debtsStatement: false, clearanceLetter: false },
  hrChecklist: { employeesListed: false, mudadCleared: false, workPermitsCancelled: false },
  commerceCrCancellationRequested: false,
  samaNotified: false,
  timelineEvents: DEFAULT_TIMELINE_EVENTS,
  trusteeName: "",
  hearingDates: [],
  aiDiagnosis: "",
  aiDiagnosisAt: "",
  aiDiagnosisSignature: "",
  aiDiagnosisConsistencyWarning: false,
});

export const DEMO_CASE: Case = {
  id: "case_demo",
  createdAt: new Date(Date.now() - 7 * 86400000).toISOString(),
  lastModified: new Date().toISOString(),
  status: "preparing",
  caseNumber: "ت-2025/18473",
  submissionDate: new Date(Date.now() - 2 * 86400000).toISOString(),
  debtorName: "شركة التميز للخدمات اللوجستية",
  legalForm: "شركة ذات مسؤولية محدودة",
  crNumber: "1010892746",
  crCity: "الرياض",
  courtCity: "الرياض",
  representativeName: "خالد بن عبد الله الدوسري",
  representativeTitle: "المدير التنفيذي",
  representativeId: "1083749274",
  attorneyName: "عبد العزيز بن صالح العقيلي",
  attorneyLicense: "41/892",
  documentDate: new Date().toISOString().substring(0, 10),
  documentTime: "10:00",
  poaNumber: "1234/2025",
  poaDate: "2025-03-01",
  poaCity: "الرياض",
  lawyerSignatureData: "",
  representativeSignatureData: "",
  totalDebts: 850000,
  totalAssets: 45000,
  isEstablishment: "company",
  isActive: "no",
  hasAssets: "yes",
  assetsCoverExpenses: "no",
  insolvencyStatus: "actual",
  financialStatementsAvailable: "no",
  financialTransactionsAvailable: "no",
  creditorsNotified: "yes",
  operatedTwelveMonths: "no",
  previousSettlement: "no",
  creditors: [
    { id: "1", name: "مصرف الراجحي", amount: 450000, priority: "p2_secured", type: "تمويل بنكي مضمون", date: "2025-01-15", contact: "تمويل@alrajhibank.com" },
    { id: "2", name: "المؤسسة العامة للتأمينات الاجتماعية", amount: 80000, priority: "p1_government", type: "اشتراكات تأمينية متأخرة", date: "2025-03-20" },
    { id: "3", name: "شركة تأجير العقارات المتحدة", amount: 220000, priority: "p3_unsecured", type: "إيجار تجاري متأخر", date: "2024-11-10" },
    { id: "4", name: "شركة توريد التقنيات المحدودة", amount: 100000, priority: "p3_unsecured", type: "مستحقات تجارية", date: "2025-02-05" },
  ],
  assets: [
    { id: "1", name: "أجهزة حاسب آلي ومعدات مكتبية", value: 15000, location: "مقر الشركة بالرياض", description: "مستعملة وبحالة متوسطة" },
    { id: "2", name: "أثاث مكتبي", value: 10000, location: "مقر الشركة بالرياض", description: "مكاتب وكراسي وشاشات عرض" },
    { id: "3", name: "سيارة نقل بضائع خفيفة (تويوتا)", value: 20000, location: "مستودع الشركة", description: "موديل 2018، بحاجة لصيانة" },
  ],
  employees: [
    { id: "1", name: "محمد أحمد علي", nationality: "مصري", iqama: "2394827492", salary: 6500, joinDate: "2021-03-01", benefits: 0 },
    { id: "2", name: "سعد عبد الله الحربي", nationality: "سعودي", iqama: "1083749274", salary: 8000, joinDate: "2020-01-15", benefits: 0 },
    { id: "3", name: "كومار كريشنا", nationality: "هندي", iqama: "2483948273", salary: 3500, joinDate: "2022-06-10", benefits: 0 },
  ],
  uploadedFiles: [],
  zatcaFileNumber: "",
  zatcaChecklist: { accountStatement: false, vatRegistration: true, zakahCert: false, clearanceLetter: false },
  gosiFileNumber: "G-2025-18473",
  gosiChecklist: { registered: true, debtsStatement: false, clearanceLetter: false },
  hrChecklist: { employeesListed: true, mudadCleared: false, workPermitsCancelled: false },
  commerceCrCancellationRequested: false,
  samaNotified: false,
  timelineEvents: DEFAULT_TIMELINE_EVENTS,
  trusteeName: "",
  hearingDates: [],
  aiDiagnosis: "",
  aiDiagnosisAt: "",
  aiDiagnosisSignature: "",
  aiDiagnosisConsistencyWarning: false,
};
