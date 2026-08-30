// Google OIDC, verified here; identity is Google's problem, authorization is the ledger's.
// The session is a signed HTTP-only cookie: email.team.expiry.signature.
import type { Env } from "./index";

const b64url = (buf: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const hmacKey = (env: Env) =>
  crypto.subtle.importKey("raw", new TextEncoder().encode(env.SESSION_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);

export const seal = async (env: Env, email: string, team: string): Promise<string> => {
  const body = btoa(JSON.stringify({ email, team, exp: Date.now() + 30 * 86_400_000 })).replace(/=+$/, "");
  const sig = b64url(await crypto.subtle.sign("HMAC", await hmacKey(env), new TextEncoder().encode(body)));
  return `aludel=${body}.${sig}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=2592000`;
};

export const session = async (env: Env, req: Request): Promise<{ email: string; team: string } | null> => {
  if (env.DEV_USER) return { email: env.DEV_USER, team: "dev" };
  const raw = req.headers.get("Cookie")?.match(/aludel=([^;]+)/)?.[1];
  const [body, sig] = raw?.split(".") ?? [];
  if (!body || !sig) return null;
  const bytes = Uint8Array.from(atob(sig.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
  if (!(await crypto.subtle.verify("HMAC", await hmacKey(env), bytes, new TextEncoder().encode(body)))) return null;
  const claims = JSON.parse(atob(body)) as { email: string; team: string; exp: number };
  return claims.exp > Date.now() ? claims : null;
};

// The two-step dance: /login sends the browser to Google; /callback verifies what came back.
export const login = (env: Env, req: Request): Response =>
  Response.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID, redirect_uri: `${new URL(req.url).origin}/api/auth/callback`,
    response_type: "code", scope: "openid email", prompt: "select_account",
  })}`, 302);

export const callback = async (env: Env, req: Request): Promise<string | null> => {
  const here = new URL(req.url);
  const code = here.searchParams.get("code");
  if (!code) return null;
  const token = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET, redirect_uri: `${here.origin}/api/auth/callback`, grant_type: "authorization_code" }),
  }).then((r) => r.json() as Promise<{ id_token?: string }>);
  if (!token.id_token) return null;
  // The id_token arrived over TLS directly from Google in exchange for our client secret —
  // that channel is its authenticity; we still check we are the audience and it is fresh.
  const claims = JSON.parse(atob(token.id_token.split(".")[1]!.replace(/-/g, "+").replace(/_/g, "/"))) as { email?: string; aud?: string; exp?: number };
  return claims.email && claims.aud === env.GOOGLE_CLIENT_ID && (claims.exp ?? 0) * 1000 > Date.now() ? claims.email : null;
};
