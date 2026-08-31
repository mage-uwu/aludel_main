import { newId } from "../src/kernel";
import { callback, login, seal, session } from "./auth";
import { chat } from "./agent";
import { Team } from "./do";
export { Team };

export type Env = {
  TEAM: DurableObjectNamespace<Team>;
  DIR?: KVNamespace;           // email → team id; absent until real sign-in needs it
  BLOBS?: R2Bucket;            // photo bytes by content hash; absent = photos stay on-device
  SESSION_SECRET: string;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  ANTHROPIC_API_KEY: string;
  DEV_USER?: string;
};

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const path = new URL(req.url).pathname;

    if (path === "/api/auth/login") return login(env, req);
    if (path === "/api/auth/callback") {
      const email = await callback(env, req);
      if (!email) return json({ error: "sign-in failed" }, 401);
      const team = (await env.DIR?.get(email)) ?? "";
      return new Response(null, { status: 302, headers: { Location: "/", "Set-Cookie": await seal(env, email, team) } });
    }

    const who = await session(env, req);
    if (!who) return json({ error: "signed out" }, 401);

    if (path === "/api/team" && req.method === "POST") { // founding: mint a team, self-grant admin
      if (who.team) return json({ error: "already on a team" }, 409);
      const team = newId<string>();
      const stub = env.TEAM.get(env.TEAM.idFromName(team));
      await stub.append(who.email, [{ type: "granted", email: who.email, role: "admin" }]);
      await env.DIR?.put(who.email, team);
      return json({ team }, 200, { "Set-Cookie": await seal(env, who.email, team) });
    }
    if (!who.team) return json({ error: "no team yet" }, 428);
    const stub = env.TEAM.get(env.TEAM.idFromName(who.team));

    if (path === "/api/t/me") return json({ email: who.email, team: who.team, role: await stub.role(who.email) });
    if (path === "/api/t/pull") return json(await stub.pull(Number(new URL(req.url).searchParams.get("since") ?? 0)));
    if (path === "/api/t/append" && req.method === "POST") {
      const out = await stub.append(who.email, await req.json());
      for (const f of out.admitted) if (f.type === "granted") await env.DIR?.put(f.email, who.team); // new teammate can now log in
      return json(out);
    }
    if (path === "/api/t/find" && req.method === "POST") return json(await stub.find(await req.json()));
    if (path === "/api/t/ask" && req.method === "POST") return json(await stub.ask(await req.json()));
    if (path === "/api/agent" && req.method === "POST") return chat(env, stub, who.email, await req.json());

    const hash = path.match(/^\/api\/blob\/([a-f0-9]{64})$/)?.[1];
    if (hash && req.method === "PUT") { await env.BLOBS?.put(hash, req.body); return json({ ok: !!env.BLOBS }); }
    if (hash) return env.BLOBS ? env.BLOBS.get(hash).then((b) => (b ? new Response(b.body) : json({ error: "no such blob" }, 404))) : json({ error: "no blob store yet" }, 501);
    return json({ error: "no such route" }, 404);
  },
};
