"use client";

import { useState } from "react";
import type { Case } from "@/lib/case-types";
import { logout } from "@/app/actions/auth";
import { renderAiDiagnosis } from "@/lib/render-ai-diagnosis";

function statusLabel(s: Case["status"]): { label: string; color: string } {
  const m: Record<Case["status"], { label: string; color: string }> = {
    draft: { label: "مسودة", color: "#6b7280" },
    preparing: { label: "قيد التجهيز", color: "#c07800" },
    submitted: { label: "مقدم للمحكمة", color: "#198754" },
    decided: { label: "صدر القرار", color: "#00793A" },
    closed: { label: "منجز / مغلق", color: "#374151" },
  };
  return m[s];
}

export default function ClientPortal({ initialCase, userName }: { initialCase: Case; userName: string }) {
  const [caseData, setCaseData] = useState(initialCase);
  const [isUploading, setIsUploading] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  const showToast = (message: string, type: "success" | "error" = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  const totalDebts = caseData.creditors.reduce((s, c) => s + c.amount, 0);
  const totalAssets = caseData.assets.reduce((s, a) => s + a.value, 0);
  const st = statusLabel(caseData.status);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setIsUploading(true);
    const formData = new FormData();
    formData.append("file", file);
    formData.append("caseId", caseData.id);

    try {
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "فشل رفع الملف");
      setCaseData(prev => ({ ...prev, uploadedFiles: [...prev.uploadedFiles, data] }));
      showToast(`تم رفع "${file.name}" بنجاح`);
    } catch (err) {
      showToast((err as Error).message, "error");
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", padding: "32px 20px", background: "var(--bg-page)" }}>
      <div style={{ maxWidth: "720px", margin: "0 auto", display: "flex", flexDirection: "column", gap: "18px" }}>

        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div style={{ width: "40px", height: "40px", borderRadius: "10px", background: "var(--gold)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 800, fontSize: "1.2rem", flexShrink: 0 }}>إ</div>
            <div>
              <h1 className="gold-gradient-text" style={{ fontSize: "1.25rem", fontWeight: 800, lineHeight: 1.1 }}>إفلاس تك</h1>
              <p style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>بوابة العميل</p>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>{userName}</span>
            <form action={logout}>
              <button type="submit" className="btn-ghost" style={{ fontSize: "0.73rem" }}>تسجيل الخروج</button>
            </form>
          </div>
        </div>

        {/* Case summary */}
        <div className="card" style={{ padding: "20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "14px", flexWrap: "wrap", gap: "8px" }}>
            <div>
              <h2 style={{ fontSize: "1.1rem", fontWeight: 800, color: "var(--text-heading)" }}>{caseData.debtorName || "—"}</h2>
              <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "2px" }}>
                {caseData.crNumber ? `${caseData.crNumber} — ` : ""}{caseData.crCity}
              </p>
            </div>
            <span style={{ fontSize: "0.72rem", fontWeight: 700, color: st.color, background: `${st.color}1a`, borderRadius: "20px", padding: "3px 12px" }}>
              {st.label}
            </span>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            <div className="glass-panel" style={{ padding: "10px 12px" }}>
              <p style={{ fontSize: "0.68rem", color: "var(--text-muted)" }}>إجمالي الديون</p>
              <p style={{ fontSize: "0.95rem", fontWeight: 700 }}>{totalDebts.toLocaleString()} ريال</p>
            </div>
            <div className="glass-panel" style={{ padding: "10px 12px" }}>
              <p style={{ fontSize: "0.68rem", color: "var(--text-muted)" }}>إجمالي الأصول</p>
              <p style={{ fontSize: "0.95rem", fontWeight: 700 }}>{totalAssets.toLocaleString()} ريال</p>
            </div>
          </div>
        </div>

        {/* AI diagnosis (read-only) */}
        <div className="card" style={{ padding: "20px" }}>
          <p style={{ fontSize: "0.82rem", fontWeight: 700, color: "var(--text-body)", marginBottom: "10px" }}>🤖 التحليل القانوني</p>
          {caseData.aiDiagnosis ? (
            <div style={{ fontSize: "0.78rem", color: "var(--text-body)", lineHeight: 1.75 }}>
              {renderAiDiagnosis(caseData.aiDiagnosis)}
            </div>
          ) : (
            <p style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>لم يُجرَ تحليل قانوني لملفك بعد.</p>
          )}
        </div>

        {/* Documents */}
        <div className="card" style={{ padding: "20px" }}>
          <p style={{ fontSize: "0.82rem", fontWeight: 700, color: "var(--text-body)", marginBottom: "10px" }}>📎 المستندات</p>

          {caseData.uploadedFiles.length > 0 ? (
            <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: "6px", marginBottom: "14px" }}>
              {caseData.uploadedFiles.map(f => (
                <li key={f.id}>
                  <a
                    href={`/api/files/${f.id}`}
                    target="_blank"
                    rel="noreferrer"
                    style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.75rem", color: "var(--text-body)", textDecoration: "none", padding: "8px 10px", borderRadius: "6px", background: "var(--bg-subtle)" }}
                  >
                    <span>📄 {f.name}</span>
                    <span style={{ color: "var(--text-muted)" }}>{f.size}</span>
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "14px" }}>لا توجد مستندات مرفوعة بعد.</p>
          )}

          <input id="client-upload-input" type="file" accept=".pdf,.jpg,.jpeg,.png" style={{ display: "none" }} onChange={handleUpload} />
          <div
            style={{ border: "2px dashed var(--card-border)", borderRadius: "8px", padding: "16px", textAlign: "center", background: "var(--bg-tertiary)", cursor: isUploading ? "default" : "pointer", opacity: isUploading ? 0.6 : 1 }}
            onClick={() => !isUploading && document.getElementById("client-upload-input")?.click()}
          >
            <p style={{ fontSize: "1.4rem" }}>📤</p>
            <p style={{ fontSize: "0.76rem", fontWeight: 600 }}>{isUploading ? "جارٍ الرفع..." : "اضغط لرفع مستند جديد"}</p>
            <p style={{ fontSize: "0.65rem", color: "var(--text-muted)" }}>PDF, JPG, PNG — حتى 15 ميغابايت</p>
          </div>
        </div>
      </div>

      {toast && (
        <div style={{ position: "fixed", bottom: "20px", insetInlineEnd: "20px", background: toast.type === "error" ? "var(--red)" : "var(--success)", color: "#fff", padding: "10px 16px", borderRadius: "8px", fontSize: "0.8rem", boxShadow: "0 4px 12px rgba(0,0,0,0.15)" }}>
          {toast.message}
        </div>
      )}
    </div>
  );
}
