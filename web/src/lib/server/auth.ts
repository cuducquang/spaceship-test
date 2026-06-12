/**
 * Demo authentication for reviewers.
 *
 * The brief allows authentication as long as test credentials are provided,
 * so this is intentionally simple: one reviewer account configured through
 * environment variables (REVIEWER_USERNAME / REVIEWER_PASSWORD — never
 * committed to the repository) and a signed, HttpOnly session cookie. The
 * token is HMAC-SHA256 over an expiry timestamp (Web Crypto, so the same
 * code runs in the proxy edge runtime and in Node route handlers). There is
 * no user table — the mock dataset contains nothing personal; the gate
 * exists to demonstrate the auth flow.
 */

const REVIEWER = () => ({
  username: process.env.REVIEWER_USERNAME ?? "",
  password: process.env.REVIEWER_PASSWORD ?? "",
});

export const SESSION_COOKIE = "spaceship_session";
export const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days

/** Demo signing secret — override with AUTH_SECRET in production deployments. */
const SECRET = () => process.env.AUTH_SECRET ?? "spaceship-demo-secret-2026";

const encoder = new TextEncoder();

async function hmac(message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(SECRET()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** Token format: `<expiry-epoch-seconds>.<hmac(expiry + username)>` */
export async function createSessionToken(now = Date.now()): Promise<string> {
  const exp = Math.floor(now / 1000) + SESSION_TTL_SECONDS;
  const sig = await hmac(`${exp}.${REVIEWER().username}`);
  return `${exp}.${sig}`;
}

export async function verifySessionToken(
  token: string | undefined,
  now = Date.now(),
): Promise<boolean> {
  if (!token) return false;
  const dot = token.indexOf(".");
  if (dot <= 0) return false;
  const exp = Number(token.slice(0, dot));
  if (!Number.isFinite(exp) || exp * 1000 < now) return false;
  const expected = await hmac(`${exp}.${REVIEWER().username}`);
  const given = token.slice(dot + 1);
  if (given.length !== expected.length) return false;
  // constant-time-ish comparison
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= given.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

/** True when both REVIEWER_USERNAME and REVIEWER_PASSWORD are set. */
export function isAuthConfigured(): boolean {
  const { username, password } = REVIEWER();
  return username.length > 0 && password.length > 0;
}

export function checkCredentials(username: string, password: string): boolean {
  if (!isAuthConfigured()) return false;
  const expected = REVIEWER();
  return username === expected.username && password === expected.password;
}
