"use server";

import * as z from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/dal";

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
  password: PasswordSchema,
});

export async function createClientAccountAction(caseId: string, formData: FormData): Promise<{ error?: string }> {
  const admin = await requireAdmin();

  const validated = ClientAccountSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!validated.success) {
    const firstIssue = validated.error.issues[0];
    return { error: firstIssue?.message ?? "بيانات غير صالحة" };
  }
  const { name, email, password } = validated.data;

  try {
    await prisma.$transaction(async (tx) => {
      const targetCase = await tx.case.findUnique({ where: { id: caseId }, select: { userId: true, clientUserId: true } });
      if (!targetCase || targetCase.userId !== admin.id) throw new Error("لا تملك صلاحية على هذا الملف");
      if (targetCase.clientUserId) throw new Error("يوجد حساب عميل مرتبط بهذا الملف بالفعل");

      const existingEmail = await tx.user.findUnique({ where: { email } });
      if (existingEmail) throw new Error("يوجد حساب مسجل بهذا البريد الإلكتروني بالفعل");

      const passwordHash = await bcrypt.hash(password, 10);
      const clientUser = await tx.user.create({ data: { name, email, passwordHash, role: "client" } });
      await tx.case.update({ where: { id: caseId }, data: { clientUserId: clientUser.id } });
    });
    return {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : "تعذر إنشاء حساب العميل" };
  }
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
