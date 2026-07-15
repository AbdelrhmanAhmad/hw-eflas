// Splits the AI's "## عنوان" markdown-style headings into styled blocks, and
// visually flags the disagreement section (if present) instead of letting it
// blend into a wall of plain text — a lawyer needs to notice a conflict, not
// scan for it.
export function renderAiDiagnosis(text: string) {
  const lines = text.split("\n");
  const blocks: { heading: string | null; body: string }[] = [];
  let current: { heading: string | null; lines: string[] } = { heading: null, lines: [] };

  for (const line of lines) {
    if (line.trim().startsWith("## ")) {
      blocks.push({ heading: current.heading, body: current.lines.join("\n").trim() });
      current = { heading: line.trim().replace(/^##\s*/, ""), lines: [] };
    } else {
      current.lines.push(line);
    }
  }
  blocks.push({ heading: current.heading, body: current.lines.join("\n").trim() });

  return blocks.filter(b => b.heading || b.body).map((b, i) => {
    const isConflict = b.heading?.includes("تعارض") ?? false;
    return (
      <div key={i} style={{ marginBottom: "14px", ...(isConflict ? { background: "var(--red-light)", border: "1px solid var(--red-border)", borderRadius: "8px", padding: "10px 12px" } : {}) }}>
        {b.heading && (
          <p style={{ fontSize: "0.85rem", fontWeight: 800, color: isConflict ? "var(--red)" : "var(--gold)", marginBottom: "6px" }}>
            {b.heading.replace(/^⚠️\s*/, "")}
          </p>
        )}
        {b.body && <div style={{ whiteSpace: "pre-wrap" }}>{b.body}</div>}
      </div>
    );
  });
}
