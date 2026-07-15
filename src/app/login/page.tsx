"use client";

import { Suspense, useActionState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { login } from "@/app/actions/auth";

function LoginForm() {
  const [state, action, pending] = useActionState(login, undefined);
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/";

  return (
    <form action={action} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
      <input type="hidden" name="next" value={next} />

      <div className="field-group">
        <label className="field-label" htmlFor="email">البريد الإلكتروني</label>
        <input className="custom-input" id="email" name="email" type="email" required autoComplete="email" />
        {state?.errors?.email && <span style={{ color: "var(--red)", fontSize: "0.75rem" }}>{state.errors.email[0]}</span>}
      </div>

      <div className="field-group">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <label className="field-label" htmlFor="password">كلمة المرور</label>
          <Link href="/forgot-password" style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>نسيت كلمة المرور؟</Link>
        </div>
        <input className="custom-input" id="password" name="password" type="password" required autoComplete="current-password" />
        {state?.errors?.password && <span style={{ color: "var(--red)", fontSize: "0.75rem" }}>{state.errors.password[0]}</span>}
      </div>

      {state?.message && <p style={{ color: "var(--red)", fontSize: "0.8rem", textAlign: "center" }}>{state.message}</p>}

      <button className="btn-primary" type="submit" disabled={pending}>
        {pending ? "جارٍ الدخول..." : "دخول"}
      </button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg-page)", padding: "20px" }}>
      <div className="card" style={{ width: "100%", maxWidth: "420px", padding: "32px", display: "flex", flexDirection: "column", gap: "18px" }}>
        <div style={{ textAlign: "center" }}>
          <div className="sidebar-logo-icon" style={{ margin: "0 auto 12px", width: "48px", height: "48px", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "12px" }}>⚖️</div>
          <h1 className="page-title gold-gradient-text" style={{ fontSize: "1.3rem" }}>تسجيل الدخول</h1>
          <p style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>مستشار الإفلاس الذكي</p>
        </div>

        <Suspense fallback={null}>
          <LoginForm />
        </Suspense>
      </div>
    </div>
  );
}
