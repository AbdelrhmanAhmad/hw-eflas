import "server-only";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

const DEV_SESSION_SECRET = "dev-session-secret-change-me";

function getSessionSecret() {
  const secret = process.env.SESSION_SECRET ?? DEV_SESSION_SECRET;

  if (!process.env.SESSION_SECRET) {
    console.warn("SESSION_SECRET missing; using a development-only fallback secret.");
  }

  return secret;
}

function getEncodedKey() {
  return new TextEncoder().encode(getSessionSecret());
}

const SESSION_COOKIE = "iflastec_session";
const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

interface SessionPayload {
  userId: string;
  [key: string]: unknown;
}

export async function encrypt(payload: SessionPayload) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(getEncodedKey());
}

export async function decrypt(token: string | undefined = ""): Promise<SessionPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getEncodedKey(), { algorithms: ["HS256"] });
    return payload as SessionPayload;
  } catch {
    return null;
  }
}

export async function createSession(userId: string) {
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);
  const session = await encrypt({ userId });
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, session, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    expires: expiresAt,
    sameSite: "lax",
    path: "/",
  });
}

export async function getSessionCookie() {
  const cookieStore = await cookies();
  return cookieStore.get(SESSION_COOKIE)?.value;
}

export async function deleteSession() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}

export { SESSION_COOKIE };
