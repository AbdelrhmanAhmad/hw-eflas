import "server-only";
import { randomBytes, createHash } from "crypto";
import { headers } from "next/headers";
import { prisma } from "@/lib/db";

// Shared by "forgot password" (auth.ts) and "set up your client account"
// (clients.ts) — both are the same underlying mechanism: a single-use,
// time-limited link that lets someone set a new password for a known user.
export async function createPasswordResetToken(userId: string, durationMs: number): Promise<string> {
  const rawToken = randomBytes(32).toString("hex");
  const tokenHash = createHash("sha256").update(rawToken).digest("hex");

  await prisma.passwordResetToken.create({
    data: {
      userId,
      tokenHash,
      expiresAt: new Date(Date.now() + durationMs),
    },
  });

  return rawToken;
}

export async function getOrigin() {
  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "https";
  const host = h.get("host");
  return `${proto}://${host}`;
}
