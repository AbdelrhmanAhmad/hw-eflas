"use server";

import { requireAdmin } from "@/lib/dal";
import { loadCasesForUser, saveCaseForUser, deleteCaseForUser } from "@/lib/cases";
import type { Case } from "@/lib/case-types";
import { unlink } from "fs/promises";
import { prisma } from "@/lib/db";

export async function getCasesAction(): Promise<Case[]> {
  const admin = await requireAdmin();
  return loadCasesForUser(admin.id);
}

export async function saveCaseAction(caseData: Case): Promise<{ error?: string }> {
  const admin = await requireAdmin();
  try {
    await saveCaseForUser(admin.id, caseData);
    return {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : "تعذر حفظ الملف" };
  }
}

export async function deleteCaseAction(caseId: string): Promise<{ error?: string }> {
  const admin = await requireAdmin();

  const existing = await prisma.case.findUnique({ where: { id: caseId }, select: { userId: true } });
  if (!existing || existing.userId !== admin.id) {
    return { error: "لا تملك صلاحية حذف هذا الملف" };
  }

  const files = await prisma.uploadedFile.findMany({ where: { caseId }, select: { storagePath: true } });
  await deleteCaseForUser(admin.id, caseId);
  await Promise.all(
    files.map((f) => unlink(f.storagePath).catch(() => undefined))
  );
  return {};
}
