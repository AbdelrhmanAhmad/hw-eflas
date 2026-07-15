import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { decrypt, getSessionCookie } from "@/lib/session";
import { prisma } from "@/lib/db";

export const verifySession = cache(async () => {
  const cookie = await getSessionCookie();
  const session = await decrypt(cookie);

  if (!session?.userId) {
    redirect("/login");
  }

  return { isAuth: true, userId: session.userId as string };
});

// Same as verifySession but returns null instead of redirecting — for optional-auth contexts.
export const getOptionalSession = cache(async () => {
  const cookie = await getSessionCookie();
  const session = await decrypt(cookie);
  if (!session?.userId) return null;
  return { userId: session.userId as string };
});

export const getUser = cache(async () => {
  const session = await verifySession();
  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { id: true, email: true, name: true, role: true },
  });
  if (!user) redirect("/api/auth/invalidate");
  return user;
});

// Same as getUser but returns null instead of redirecting — for Route Handlers
// that must respond with JSON (401/403) rather than a redirect.
export const getOptionalUser = cache(async () => {
  const session = await getOptionalSession();
  if (!session) return null;
  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { id: true, email: true, name: true, role: true },
  });
  return user;
});

// Blocks client accounts from admin-only Server Actions. Bounces to /portal
// rather than /login since a client IS authenticated, just not authorized.
export const requireAdmin = cache(async () => {
  const user = await getUser();
  if (user.role !== "admin") redirect("/portal");
  return user;
});
