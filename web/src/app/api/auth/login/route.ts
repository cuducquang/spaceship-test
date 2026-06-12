import { NextResponse } from "next/server";
import {
  checkCredentials,
  createSessionToken,
  isAuthConfigured,
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
} from "@/lib/server/auth";

export async function POST(req: Request) {
  if (!isAuthConfigured()) {
    return NextResponse.json(
      { error: "Reviewer login is not configured. Set REVIEWER_USERNAME and REVIEWER_PASSWORD." },
      { status: 503 },
    );
  }
  let body: { username?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  const username = String(body.username ?? "").trim();
  const password = String(body.password ?? "");
  if (!checkCredentials(username, password)) {
    return NextResponse.json(
      { error: "Invalid credentials. Use the reviewer account provided to you." },
      { status: 401 },
    );
  }
  const token = await createSessionToken();
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
  return res;
}
