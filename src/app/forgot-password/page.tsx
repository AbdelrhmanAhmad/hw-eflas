"use client";

import { useActionState } from "react";
import Link from "next/link";
import { requestPasswordReset } from "@/app/actions/auth";

export default function ForgotPasswordPage() {
  const [state, action, pending] = useActionState(requestPasswordReset, undefined);

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg-page)", padding: "20px" }}>
      <div className="card" style={{ width: "100%", maxWidth: "420px", padding: "32px", display: "flex", flexDirection: "column", gap: "18px" }}>
        <div style={{ textAlign: "center" }}>
          <div className="sidebar-logo-icon" style={{ margin: "0 auto 12px", width: "48px", height: "48px", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "12px" }}>⚖️</div>
          <h1 className="page-title gold-gradient-text" style={{ fontSize: "1.3rem" }}>استرجاع كلمة المرور</h1>
          <p style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>أدخل بريدك الإلكتروني وسنرسل لك رابط إعادة تعيين كلمة المرور</p>
        </div>

        {state?.success ? (
          <p style={{ color: "var(--text-primary)", fontSize: "0.85rem", textAlign: "center" }}>{state.message}</p>
        ) : (
          <form action={action} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
            <div className="field-group">
              <label className="field-label" htmlFor="email">البريد الإلكتروني</label>
              <input className="custom-input" id="email" name="email" type="email" required autoComplete="email" />
              {state?.errors?.email && <span style={{ color: "var(--red)", fontSize: "0.75rem" }}>{state.errors.email[0]}</span>}
            </div>

            {state?.message && <p style={{ color: "var(--red)", fontSize: "0.8rem", textAlign: "center" }}>{state.message}</p>}

            <button className="btn-primary" type="submit" disabled={pending}>
              {pending ? "جارٍ الإرسال..." : "إرسال رابط الاسترجاع"}
            </button>
          </form>
        )}

        <Link href="/login" style={{ fontSize: "0.8rem", color: "var(--text-muted)", textAlign: "center" }}>الرجوع لتسجيل الدخول</Link>
      </div>
    </div>
  );
}
