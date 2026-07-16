import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { decrypt, SESSION_COOKIE } from "@/lib/session";

const PUBLIC_ROUTES = ["/login", "/forgot-password", "/reset-password"];
// Token-authenticated: must render regardless of any existing session cookie,
// since the link's own token — not the browser's current login — decides access.
const TOKEN_ROUTES = ["/reset-password"];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isPublicRoute = PUBLIC_ROUTES.includes(pathname);
  const isTokenRoute = TOKEN_ROUTES.includes(pathname);

  const cookie = request.cookies.get(SESSION_COOKIE)?.value;
  const session = await decrypt(cookie);
  const isAuthed = Boolean(session?.userId);

  if (!isPublicRoute && !isAuthed) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname + request.nextUrl.search);
    return NextResponse.redirect(loginUrl);
  }

  if (isPublicRoute && !isTokenRoute && isAuthed) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
