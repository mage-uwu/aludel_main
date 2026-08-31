// Auth is Cloudflare Access (Zero Trust): the edge authenticates everyone before our code
// runs, and hands us a signed JWT naming who they are. We verify it against the team's
// public keys — identity is Cloudflare's problem, authorization is the ledger's granted
// facts. There is no login flow, no cookie, no secret to keep: nothing here to attack.
import type { Env } from "./index";

const b64 = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
let jwks: Promise<CryptoKey[]> | undefined; // per-isolate cache; Access rotates keys slowly

const keys = (team: string): Promise<CryptoKey[]> =>
  (jwks ??= fetch(`https://${team}.cloudflareaccess.com/cdn-cgi/access/certs`)
    .then((r) => r.json() as Promise<{ keys: JsonWebKey[] }>)
    .then((body) => Promise.all(body.keys.map((k) => crypto.subtle.importKey("jwk", k, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"])))));

export const session = async (env: Env, req: Request): Promise<{ email: string; team: string } | null> => {
  if (!env.ACCESS_AUD) return env.DEV_USER ? { email: env.DEV_USER, team: "dev" } : null; // DEV_USER only exists while Access does not
  const jwt = req.headers.get("Cf-Access-Jwt-Assertion");
  const [head, body, sig] = jwt?.split(".") ?? [];
  if (!head || !body || !sig) return null;
  const claims = JSON.parse(new TextDecoder().decode(b64(body))) as { email?: string; aud?: string[]; exp?: number };
  if (!claims.email || !claims.aud?.includes(env.ACCESS_AUD) || (claims.exp ?? 0) * 1000 < Date.now()) return null;
  const data = new TextEncoder().encode(`${head}.${body}`);
  for (const key of await keys(env.ACCESS_TEAM)) if (await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, b64(sig), data)) {
    // team: the directory if we have one; otherwise everyone shares the alpha team,
    // which is exactly right for a crew small enough to not need a directory yet
    return { email: claims.email, team: (await env.DIR?.get(claims.email)) ?? "alpha" };
  }
  return null;
};
