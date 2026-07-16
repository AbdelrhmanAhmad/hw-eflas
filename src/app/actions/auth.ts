"use server";

import * as z from "zod";
import { createHash } from "crypto";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { createSession, deleteSession } from "@/lib/session";
import { sendPasswordResetEmail } from "@/lib/email";
import { createPasswordResetToken, getOrigin } from "@/lib/password-reset";
import bcrypt from "bcryptjs";

const LoginSchema = z.object({
  email: z.email({ error: "الرجاء إدخال بريد إلكتروني صحيح" }).trim().toLowerCase(),
  password: z.string().min(1, { error: "كلمة المرور مطلوبة" }),
});

export interface AuthFormState {
  errors?: { email?: string[]; password?: string[] };
  message?: string;
}

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000;

// A dummy hash so the failed-lookup path still runs bcrypt.compare, keeping
// response time similar to the user-found path and avoiding email enumeration via timing.
const DUMMY_HASH = "$2a$10$CwTycUXWue0Thq9StjUM0uJ8Uy2Xn1uKVHu4y9ovKp0M6O2WBc0Vu";

// Only allow same-origin relative paths — never redirect off-site.
function sanitizeNext(next: FormDataEntryValue | null): string {
  if (typeof next !== "string" || !next.startsWith("/") || next.startsWith("//")) return "/";
  return next;
}

export async function login(_state: AuthFormState | undefined, formData: FormData): Promise<AuthFormState> {
  const validated = LoginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!validated.success) {
    return { errors: z.flattenError(validated.error).fieldErrors };
  }

  const { email, password } = validated.data;
  const next = sanitizeNext(formData.get("next"));

  const user = await prisma.user.findUnique({ where: { email } });

  if (!user) {
    await bcrypt.compare(password, DUMMY_HASH);
    return { message: "البريد الإلكتروني أو كلمة المرور غير صحيحة" };
  }

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    const minutesLeft = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000);
    return { message: `تم قفل الحساب مؤقتًا بسبب محاولات دخول متكررة. حاول مرة أخرى بعد ${minutesLeft} دقيقة` };
  }

  const passwordsMatch = await bcrypt.compare(password, user.passwordHash);
  if (!passwordsMatch) {
    const attempts = user.failedLoginAttempts + 1;
    const lockingOut = attempts >= MAX_FAILED_ATTEMPTS;
    await prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginAttempts: lockingOut ? 0 : attempts,
        lockedUntil: lockingOut ? new Date(Date.now() + LOCKOUT_DURATION_MS) : null,
      },
    });
    if (lockingOut) {
      return { message: "تم قفل الحساب مؤقتًا بسبب محاولات دخول متكررة. حاول مرة أخرى بعد 15 دقيقة" };
    }
    return { message: "البريد الإلكتروني أو كلمة المرور غير صحيحة" };
  }

  if (user.failedLoginAttempts > 0 || user.lockedUntil) {
    await prisma.user.update({ where: { id: user.id }, data: { failedLoginAttempts: 0, lockedUntil: null } });
  }

  await createSession(user.id);
  redirect(next);
}

export async function logout() {
  await deleteSession();
  redirect("/login");
}

const RESET_TOKEN_DURATION_MS = 60 * 60 * 1000;

const ForgotPasswordSchema = z.object({
  email: z.email({ error: "الرجاء إدخال بريد إلكتروني صحيح" }).trim().toLowerCase(),
});

export interface ForgotPasswordFormState {
  errors?: { email?: string[] };
  message?: string;
  success?: boolean;
}

export async function requestPasswordReset(
  _state: ForgotPasswordFormState | undefined,
  formData: FormData,
): Promise<ForgotPasswordFormState> {
  const validated = ForgotPasswordSchema.safeParse({ email: formData.get("email") });
  if (!validated.success) {
    return { errors: z.flattenError(validated.error).fieldErrors };
  }

  const { email } = validated.data;
  const genericSuccess = { success: true, message: "إذا كان البريد الإلكتروني مسجلاً لدينا، سنرسل رابط استرجاع كلمة المرور إليه" };

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    // Same response whether or not the account exists, to avoid email enumeration.
    return genericSuccess;
  }

  const rawToken = await createPasswordResetToken(user.id, RESET_TOKEN_DURATION_MS);
  const origin = await getOrigin();
  const resetUrl = `${origin}/reset-password?token=${rawToken}`;

  try {
    await sendPasswordResetEmail(user.email, resetUrl);
  } catch {
    return { message: "تعذر إرسال رسالة الاسترجاع، حاول مرة أخرى لاحقًا" };
  }

  return genericSuccess;
}

const PasswordSchema = z
  .string()
  .min(8, { error: "كلمة المرور يجب أن تكون 8 أحرف على الأقل" })
  .regex(/[a-zA-Z]/, { error: "يجب أن تحتوي على حرف واحد على الأقل" })
  .regex(/[0-9]/, { error: "يجب أن تحتوي على رقم واحد على الأقل" });

const ResetPasswordSchema = z.object({
  token: z.string().min(1),
  password: PasswordSchema,
});

export interface ResetPasswordFormState {
  errors?: { password?: string[] };
  message?: string;
}

export async function resetPassword(
  _state: ResetPasswordFormState | undefined,
  formData: FormData,
): Promise<ResetPasswordFormState> {
  const validated = ResetPasswordSchema.safeParse({
    token: formData.get("token"),
    password: formData.get("password"),
  });
  if (!validated.success) {
    return { errors: z.flattenError(validated.error).fieldErrors };
  }

  const { token, password } = validated.data;
  const tokenHash = createHash("sha256").update(token).digest("hex");

  const resetToken = await prisma.passwordResetToken.findUnique({ where: { tokenHash } });
  if (!resetToken || resetToken.usedAt || resetToken.expiresAt < new Date()) {
    return { message: "رابط الاسترجاع غير صالح أو منتهي الصلاحية، يرجى طلب رابط جديد" };
  }

  const passwordHash = await bcrypt.hash(password, 10);

  await prisma.$transaction([
    prisma.user.update({
      where: { id: resetToken.userId },
      data: { passwordHash, failedLoginAttempts: 0, lockedUntil: null },
    }),
    prisma.passwordResetToken.update({
      where: { id: resetToken.id },
      data: { usedAt: new Date() },
    }),
  ]);

  // Log the browser in as the token's owner, replacing any session already
  // present (e.g. the admin who is still logged in on the device used to
  // set up the client's account) — otherwise "go to login" bounces back
  // into whichever account was already authenticated instead of this one.
  await createSession(resetToken.userId);
  redirect("/");
}
