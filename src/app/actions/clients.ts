"use server";

import * as z from "zod";
import { randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/dal";
import { createPasswordResetToken, getOrigin } from "@/lib/password-reset";
import { sendClientAccountSetupEmail } from "@/lib/email";

const NameSchema = z.string().trim().min(2, { error: "الاسم يجب أن يكون حرفين على الأقل" });
const EmailSchema = z.email({ error: "الرجاء إدخال بريد إلكتروني صحيح" }).trim().toLowerCase();
const PasswordSchema = z
  .string()
  .min(8, { error: "كلمة المرور يجب أن تكون 8 أحرف على الأقل" })
  .regex(/[a-zA-Z]/, { error: "يجب أن تحتوي على حرف واحد على الأقل" })
  .regex(/[0-9]/, { error: "يجب أن تحتوي على رقم واحد على الأقل" });

const ClientAccountSchema = z.object({
  name: NameSchema,
  email: EmailSchema,
});

const ACCOUNT_SETUP_TOKEN_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

export async function createClientAccountAction(caseId: string, formData: FormData): Promise<{ error?: string; warning?: string }> {
  const admin = await requireAdmin();

  const validated = ClientAccountSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
  });
  if (!validated.success) {
    const firstIssue = validated.error.issues[0];
    return { error: firstIssue?.message ?? "بيانات غير صالحة" };
  }
  const { name, email } = validated.data;

  let clientUserId: string;
  let debtorName: string;

  try {
    const result = await prisma.$transaction(async (tx) => {
      const targetCase = await tx.case.findUnique({ where: { id: caseId }, select: { userId: true, clientUserId: true, debtorName: true } });
      if (!targetCase || targetCase.userId !== admin.id) throw new Error("لا تملك صلاحية على هذا الملف");
      if (targetCase.clientUserId) throw new Error("يوجد حساب عميل مرتبط بهذا الملف بالفعل");

      const existingEmail = await tx.user.findUnique({ where: { email } });
      if (existingEmail) throw new Error("يوجد حساب مسجل بهذا البريد الإلكتروني بالفعل");

      // No password is ever set or known by the admin — the client sets their
      // own via the emailed setup link (same mechanism as "forgot password").
      // This placeholder hash is cryptographically unguessable and never used.
      const passwordHash = await bcrypt.hash(randomBytes(32).toString("hex"), 10);
      const clientUser = await tx.user.create({ data: { name, email, passwordHash, role: "client" } });
      await tx.case.update({ where: { id: caseId }, data: { clientUserId: clientUser.id } });
      return { clientUserId: clientUser.id, debtorName: targetCase.debtorName };
    });
    clientUserId = result.clientUserId;
    debtorName = result.debtorName;
  } catch (err) {
    return { error: err instanceof Error ? err.message : "تعذر إنشاء حساب العميل" };
  }

  try {
    const rawToken = await createPasswordResetToken(clientUserId, ACCOUNT_SETUP_TOKEN_DURATION_MS);
    const origin = await getOrigin();
    await sendClientAccountSetupEmail(email, name, `${origin}/reset-password?token=${rawToken}`, debtorName);
  } catch {
    return { warning: "تم إنشاء الحساب لكن تعذر إرسال بريد الدعوة — تأكد من إعدادات البريد أو أرسل الرابط يدويًا لاحقًا عبر \"إعادة تعيين كلمة المرور\"" };
  }

  return {};
}

export async function revokeClientAccountAction(caseId: string): Promise<{ error?: string }> {
  const admin = await requireAdmin();

  try {
    await prisma.$transaction(async (tx) => {
      const targetCase = await tx.case.findUnique({ where: { id: caseId }, select: { userId: true, clientUserId: true } });
      if (!targetCase || targetCase.userId !== admin.id) throw new Error("لا تملك صلاحية على هذا الملف");
      if (!targetCase.clientUserId) return;

      await tx.case.update({ where: { id: caseId }, data: { clientUserId: null } });
      await tx.user.delete({ where: { id: targetCase.clientUserId } });
    });
    return {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : "تعذر إلغاء حساب العميل" };
  }
}

export async function resetClientPasswordAction(caseId: string, formData: FormData): Promise<{ error?: string }> {
  const admin = await requireAdmin();

  const validated = PasswordSchema.safeParse(formData.get("password"));
  if (!validated.success) {
    return { error: validated.error.issues[0]?.message ?? "كلمة مرور غير صالحة" };
  }

  try {
    const targetCase = await prisma.case.findUnique({ where: { id: caseId }, select: { userId: true, clientUserId: true } });
    if (!targetCase || targetCase.userId !== admin.id) return { error: "لا تملك صلاحية على هذا الملف" };
    if (!targetCase.clientUserId) return { error: "لا يوجد حساب عميل مرتبط بهذا الملف" };

    const passwordHash = await bcrypt.hash(validated.data, 10);
    await prisma.user.update({ where: { id: targetCase.clientUserId }, data: { passwordHash } });
    return {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : "تعذر تحديث كلمة المرور" };
  }
}
