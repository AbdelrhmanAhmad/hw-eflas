import { redirect } from "next/navigation";
import { getUser } from "@/lib/dal";
import { loadCaseForClient } from "@/lib/cases";
import ClientPortal from "./client-portal";

export default async function PortalPage() {
  const user = await getUser();
  if (user.role === "admin") redirect("/");

  const clientCase = await loadCaseForClient(user.id);
  // An orphaned client account (case deleted, link severed) has nothing to
  // show — treat it the same as a stale session rather than rendering an
  // empty portal.
  if (!clientCase) redirect("/api/auth/invalidate");

  return <ClientPortal initialCase={clientCase} userName={user.name} />;
}
