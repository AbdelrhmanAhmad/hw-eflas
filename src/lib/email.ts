import "server-only";
import { Resend } from "resend";

const apiKey = process.env.RESEND_API_KEY;
const fromAddress = process.env.EMAIL_FROM;

export async function sendPasswordResetEmail(to: string, resetUrl: string) {
  if (!apiKey || !fromAddress) {
    throw new Error("RESEND_API_KEY أو EMAIL_FROM غير مضبوطين");
  }

  const resend = new Resend(apiKey);
  await resend.emails.send({
    from: fromAddress,
    to,
    subject: "استرجاع كلمة المرور - مستشار الإفلاس الذكي",
    html: `
      <div dir="rtl" style="font-family: Tahoma, Arial, sans-serif; max-width: 480px; margin: 0 auto;">
        <h2>طلب استرجاع كلمة المرور</h2>
        <p>وصلنا طلب لإعادة تعيين كلمة المرور الخاصة بحسابك. اضغط الرابط أدناه لتعيين كلمة مرور جديدة:</p>
        <p><a href="${resetUrl}" style="display:inline-block;background:#0f172a;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;">إعادة تعيين كلمة المرور</a></p>
        <p style="color:#666;font-size:0.85rem;">هذا الرابط صالح لمدة ساعة واحدة فقط. إذا لم تطلب هذا، تجاهل هذه الرسالة.</p>
      </div>
    `,
  });
}
