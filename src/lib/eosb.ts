// Single source of truth for end-of-service benefit (مكافأة نهاية الخدمة, Labor
// Law Art. 84): half a month's salary per year for the first 5 years, then a
// full month's salary per year beyond that — never a flat rate over the whole
// tenure. Shared by the dashboard employee table and the AI diagnosis prompt
// so the two can never silently diverge on the number a lawyer relies on.
export function calcEosb(salary: number, joinDateStr: string): number {
  if (!joinDateStr) return 0;
  const join = new Date(joinDateStr);
  const now = new Date();
  const years = (now.getTime() - join.getTime()) / (365.25 * 86400000);
  if (years <= 0) return 0;
  if (years <= 5) return Math.round((salary / 2) * years);
  return Math.round((salary / 2) * 5 + salary * (years - 5));
}
