import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/server/auth";

/**
 * Route guard (Next 16 `proxy` convention — the successor to `middleware`).
 *
 * Everything requires the signed reviewer session except:
 *  - /login and the auth endpoints themselves
 *  - /api/health (uptime probes shouldn't need a cookie)
 *  - static assets (excluded via the matcher)
 *
 * Pages redirect to /login carrying the original destination in ?next=;
 * API routes return 401 JSON instead, so fetch() callers fail loudly.
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isPublic =
    pathname === "/login" || pathname.startsWith("/api/auth/") || pathname === "/api/health";
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const authed = await verifySessionToken(token);

  if (!isPublic && !authed) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    const login = new URL("/login", request.url);
    if (pathname !== "/") login.searchParams.set("next", pathname);
    return NextResponse.redirect(login);
  }

  // already signed in → keep /login from rendering again
  if (pathname === "/login" && authed) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // run on everything except Next internals and static files with extensions
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|webp|ico|txt|woff2?)$).*)",
  ],
};
