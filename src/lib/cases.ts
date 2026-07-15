import "server-only";
import { prisma } from "@/lib/db";
import type { Prisma } from "@prisma/client";
import {
  type Case,
  type ZatcaChecklist,
  type GosiChecklist,
  type HrChecklist,
  type TimelineEvent,
  type HearingDate,
} from "@/lib/case-types";

type CaseWithRelations = Prisma.CaseGetPayload<{
  include: { creditors: true; assets: true; employees: true; files: true; clientUser: { select: { email: true } } };
}>;

const INCLUDE = {
  creditors: true,
  assets: true,
  employees: true,
  files: true,
  clientUser: { select: { email: true } },
} as const;

function parseJson<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function dbCaseToClient(row: CaseWithRelations): Case {
  return {
    id: row.id,
    createdAt: row.createdAt,
    lastModified: row.lastModified,
    status: row.status as Case["status"],
    caseNumber: row.caseNumber ?? undefined,
    submissionDate: row.submissionDate ?? undefined,
    debtorName: row.debtorName,
    legalForm: row.legalForm,
    crNumber: row.crNumber,
    crCity: row.crCity,
    courtCity: row.courtCity,
    representativeName: row.representativeName,
    representativeTitle: row.representativeTitle,
    representativeId: row.representativeId,
    attorneyName: row.attorneyName,
    attorneyLicense: row.attorneyLicense,
    documentDate: row.documentDate,
    documentTime: row.documentTime,
    poaNumber: row.poaNumber,
    poaDate: row.poaDate,
    poaCity: row.poaCity,
    lawyerSignatureData: row.lawyerSignatureData,
    representativeSignatureData: row.representativeSignatureData,
    totalDebts: row.totalDebts,
    totalAssets: row.totalAssets,
    isEstablishment: row.isEstablishment,
    isActive: row.isActive,
    hasAssets: row.hasAssets,
    assetsCoverExpenses: row.assetsCoverExpenses,
    insolvencyStatus: row.insolvencyStatus,
    financialStatementsAvailable: row.financialStatementsAvailable,
    financialTransactionsAvailable: row.financialTransactionsAvailable,
    creditorsNotified: row.creditorsNotified,
    operatedTwelveMonths: row.operatedTwelveMonths,
    previousSettlement: row.previousSettlement,
    creditors: row.creditors.map((c) => ({
      id: c.id,
      name: c.name,
      amount: c.amount,
      priority: c.priority as Case["creditors"][number]["priority"],
      type: c.type,
      date: c.date,
      contact: c.contact ?? undefined,
      pledgeType: (c.pledgeType as Case["creditors"][number]["pledgeType"]) ?? undefined,
      pledgeRegistered: c.pledgeRegistered ?? undefined,
    })),
    assets: row.assets.map((a) => ({
      id: a.id,
      name: a.name,
      value: a.value,
      location: a.location,
      description: a.description,
    })),
    employees: row.employees.map((e) => ({
      id: e.id,
      name: e.name,
      nationality: e.nationality,
      iqama: e.iqama,
      salary: e.salary,
      joinDate: e.joinDate,
      benefits: e.benefits,
    })),
    uploadedFiles: row.files.map((f) => ({
      id: f.id,
      name: f.name,
      type: f.type,
      size: f.size,
      status: f.status as "success" | "pending",
      storagePath: f.storagePath,
      mimeType: f.mimeType,
    })),
    zatcaFileNumber: row.zatcaFileNumber,
    zatcaChecklist: parseJson<ZatcaChecklist>(row.zatcaChecklist, {
      accountStatement: false,
      vatRegistration: false,
      zakahCert: false,
      clearanceLetter: false,
    }),
    gosiFileNumber: row.gosiFileNumber,
    gosiChecklist: parseJson<GosiChecklist>(row.gosiChecklist, {
      registered: false,
      debtsStatement: false,
      clearanceLetter: false,
    }),
    hrChecklist: parseJson<HrChecklist>(row.hrChecklist, {
      employeesListed: false,
      mudadCleared: false,
      workPermitsCancelled: false,
    }),
    commerceCrCancellationRequested: row.commerceCrCancellationRequested,
    samaNotified: row.samaNotified,
    timelineEvents: parseJson<TimelineEvent[]>(row.timelineEvents, []),
    trusteeName: row.trusteeName,
    hearingDates: parseJson<HearingDate[]>(row.hearingDates, []),
    aiDiagnosis: row.aiDiagnosis,
    aiDiagnosisAt: row.aiDiagnosisAt,
    aiDiagnosisSignature: row.aiDiagnosisSignature,
    aiDiagnosisConsistencyWarning: row.aiDiagnosisConsistencyWarning,
    clientEmail: row.clientUser?.email ?? null,
  };
}

export async function loadCasesForUser(userId: string): Promise<Case[]> {
  const rows = await prisma.case.findMany({
    where: { userId },
    include: INCLUDE,
    orderBy: { createdAt: "desc" },
  });
  return rows.map(dbCaseToClient);
}

// The isolation boundary for client accounts: scoped strictly by the caller's
// own userId via the unique clientUserId link, never by a case id supplied by
// the client — so a client account can structurally never load another case.
export async function loadCaseForClient(clientUserId: string): Promise<Case | null> {
  const row = await prisma.case.findUnique({
    where: { clientUserId },
    include: INCLUDE,
  });
  return row ? dbCaseToClient(row) : null;
}

export async function saveCaseForUser(userId: string, data: Case): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const existing = await tx.case.findUnique({ where: { id: data.id }, select: { userId: true } });
    if (existing && existing.userId !== userId) {
      throw new Error("لا تملك صلاحية تعديل هذا الملف");
    }

    const caseData = {
      userId,
      createdAt: data.createdAt,
      lastModified: new Date().toISOString(),
      status: data.status,
      caseNumber: data.caseNumber ?? null,
      submissionDate: data.submissionDate ?? null,
      debtorName: data.debtorName,
      legalForm: data.legalForm,
      crNumber: data.crNumber,
      crCity: data.crCity,
      courtCity: data.courtCity,
      representativeName: data.representativeName,
      representativeTitle: data.representativeTitle,
      representativeId: data.representativeId,
      attorneyName: data.attorneyName,
      attorneyLicense: data.attorneyLicense,
      documentDate: data.documentDate,
      documentTime: data.documentTime,
      poaNumber: data.poaNumber,
      poaDate: data.poaDate,
      poaCity: data.poaCity,
      lawyerSignatureData: data.lawyerSignatureData,
      representativeSignatureData: data.representativeSignatureData,
      totalDebts: data.totalDebts,
      totalAssets: data.totalAssets,
      isEstablishment: data.isEstablishment,
      isActive: data.isActive,
      hasAssets: data.hasAssets,
      assetsCoverExpenses: data.assetsCoverExpenses,
      insolvencyStatus: data.insolvencyStatus,
      financialStatementsAvailable: data.financialStatementsAvailable,
      financialTransactionsAvailable: data.financialTransactionsAvailable,
      creditorsNotified: data.creditorsNotified,
      operatedTwelveMonths: data.operatedTwelveMonths,
      previousSettlement: data.previousSettlement,
      zatcaFileNumber: data.zatcaFileNumber,
      zatcaChecklist: JSON.stringify(data.zatcaChecklist),
      gosiFileNumber: data.gosiFileNumber,
      gosiChecklist: JSON.stringify(data.gosiChecklist),
      hrChecklist: JSON.stringify(data.hrChecklist),
      commerceCrCancellationRequested: data.commerceCrCancellationRequested,
      samaNotified: data.samaNotified,
      timelineEvents: JSON.stringify(data.timelineEvents),
      trusteeName: data.trusteeName,
      hearingDates: JSON.stringify(data.hearingDates),
      aiDiagnosis: data.aiDiagnosis,
      aiDiagnosisAt: data.aiDiagnosisAt,
      aiDiagnosisSignature: data.aiDiagnosisSignature,
      aiDiagnosisConsistencyWarning: data.aiDiagnosisConsistencyWarning,
    };

    await tx.case.upsert({
      where: { id: data.id },
      create: { id: data.id, ...caseData },
      update: caseData,
    });

    // Child lists are small (a handful of rows per case) — simplest correct
    // approach is to fully replace them on every save rather than diffing.
    await tx.creditor.deleteMany({ where: { caseId: data.id } });
    if (data.creditors.length > 0) {
      await tx.creditor.createMany({
        data: data.creditors.map((c) => ({ ...c, caseId: data.id })),
      });
    }

    await tx.asset.deleteMany({ where: { caseId: data.id } });
    if (data.assets.length > 0) {
      await tx.asset.createMany({
        data: data.assets.map((a) => ({ ...a, caseId: data.id })),
      });
    }

    await tx.employee.deleteMany({ where: { caseId: data.id } });
    if (data.employees.length > 0) {
      await tx.employee.createMany({
        data: data.employees.map((e) => ({ ...e, caseId: data.id })),
      });
    }

    // Uploaded files are managed via /api/upload (which writes rows directly),
    // so we only sync metadata edits here — never drop the storagePath link.
    for (const f of data.uploadedFiles) {
      if (!f.id) continue;
      await tx.uploadedFile.updateMany({
        where: { id: f.id, caseId: data.id },
        data: { name: f.name, type: f.type, status: f.status },
      });
    }
  });
}

export async function deleteCaseForUser(userId: string, caseId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const existing = await tx.case.findFirst({ where: { id: caseId, userId }, select: { clientUserId: true } });
    if (!existing) return;
    await tx.case.deleteMany({ where: { id: caseId, userId } });
    // A case's linked client account has no purpose without the case — leaving
    // it alive would be a dangling, still-loginable credential.
    if (existing.clientUserId) {
      await tx.user.delete({ where: { id: existing.clientUserId } }).catch(() => undefined);
    }
  });
}
