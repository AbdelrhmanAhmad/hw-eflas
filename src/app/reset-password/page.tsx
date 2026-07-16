"use client";

import { Suspense, useActionState } from "react";
import { useSearchParams } from "next/navigation";
import { resetPassword } from "@/app/actions/auth";

function ResetPasswordForm() {
  const [state, action, pending] = useActionState(resetPassword, undefined);
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";

  if (!token) {
    return <p style={{ color: "var(--red)", fontSize: "0.85rem", textAlign: "center" }}>رابط غير صالح. يرجى طلب رابط استرجاع جديد.</p>;
  }

  return (
    <form action={action} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
      <input type="hidden" name="token" value={token} />

      <div className="field-group">
        <label className="field-label" htmlFor="password">كلمة المرور الجديدة</label>
        <input className="custom-input" id="password" name="password" type="password" required autoComplete="new-password" />
        {state?.errors?.password && <span style={{ color: "var(--red)", fontSize: "0.75rem" }}>{state.errors.password[0]}</span>}
      </div>

      {state?.message && <p style={{ color: "var(--red)", fontSize: "0.8rem", textAlign: "center" }}>{state.message}</p>}

      <button className="btn-primary" type="submit" disabled={pending}>
        {pending ? "جارٍ الحفظ..." : "تعيين كلمة المرور"}
      </button>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg-page)", padding: "20px" }}>
      <div className="card" style={{ width: "100%", maxWidth: "420px", padding: "32px", display: "flex", flexDirection: "column", gap: "18px" }}>
        <div style={{ textAlign: "center" }}>
          <div className="sidebar-logo-icon" style={{ margin: "0 auto 12px", width: "48px", height: "48px", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "12px" }}>⚖️</div>
          <h1 className="page-title gold-gradient-text" style={{ fontSize: "1.3rem" }}>تعيين كلمة مرور جديدة</h1>
        </div>

        <Suspense fallback={null}>
          <ResetPasswordForm />
        </Suspense>
      </div>
    </div>
  );
}
