import { redirect } from "next/navigation";
import { getUser } from "@/lib/dal";
import { loadCasesForUser } from "@/lib/cases";
import CaseWorkspace from "./case-workspace";

export default async function Page() {
  const user = await getUser();
  if (user.role !== "admin") redirect("/portal");

  const cases = await loadCasesForUser(user.id);

  return <CaseWorkspace initialCases={cases} userName={user.name} />;
}
