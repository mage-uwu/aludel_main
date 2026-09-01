import { newId } from "../src/kernel";
import { session } from "./auth";
import { chat, out as json, refine, voice } from "./agent";
import { Team } from "./do";
export { Team };

export type Env = {
  TEAM: DurableObjectNamespace<Team>;
  DIR?: KVNamespace;           // email → team id; absent until real sign-in needs it
  BLOBS?: R2Bucket;            // photo bytes by content hash; absent = photos stay on-device
  OPENAI_API_KEY: string;      // secret; Aludel is down without it
  OPENAI_MODEL: string;        // exact model id: config, not code
  OPENAI_VOICE_MODEL?: string; // the model that holds the mic open, and the one that turns
  OPENAI_HEAR_MODEL?: string;  // its audio into words — config, like OPENAI_MODEL
  ACCESS_TEAM: string;         // <team>.cloudflareaccess.com, the JWT signer
  ACCESS_AUD?: string;         // the Access application's audience tag; unset = Access not yet enabled
  DEV_USER?: string;           // honored only while ACCESS_AUD is unset
};


export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const path = new URL(req.url).pathname;
    const who = await session(env, req); if (!who) return json({ error: "signed out" }, 401);

    if (path === "/api/team" && req.method === "POST") {
      if (!env.DIR) return json({ error: "single-team mode: bind the DIR KV namespace first" }, 501); // founding needs the directory
      const team = newId<string>();
      await env.TEAM.get(env.TEAM.idFromName(team)).append(who.email, [{ type: "granted", email: who.email, role: "admin" }]);
      await env.DIR.put(who.email, team); return json({ team });
    }
    const stub = env.TEAM.get(env.TEAM.idFromName(who.team));

    if (path === "/api/t/me") return json({ email: who.email, team: who.team, role: await stub.role(who.email) });
    if (path === "/api/t/pull") return json(await stub.pull(Number(new URL(req.url).searchParams.get("since") ?? 0)));
    if (path === "/api/t/append" && req.method === "POST") {
      const out = await stub.append(who.email, await req.json());
      for (const f of out.admitted) if (f.type === "granted") await env.DIR?.put(f.email, who.team); // new teammate can now log in
      return json(out);
    }
    if (path === "/api/agent" && req.method === "POST") return chat(env, stub, who.email, await req.json()).catch((e: unknown) => json({ reply: `The desk threw: ${e}`, drafts: [] }));
    if (path === "/api/refine" && req.method === "POST") return refine(env, await req.json());
    if (path === "/api/voice" && req.method === "POST") return voice(env);

    const hash = path.match(/^\/api\/blob\/([a-f0-9]{64})$/)?.[1]; // content-addressed: the ledger only ever holds the hash
    if (hash && req.method === "PUT") { await env.BLOBS?.put(hash, req.body); return json({ ok: !!env.BLOBS }); } if (hash) return env.BLOBS ? env.BLOBS.get(hash).then((b) => (b ? new Response(b.body) : json({ error: "no such blob" }, 404))) : json({ error: "no blob store yet" }, 501);
    return json({ error: "no such route" }, 404);
  },
};
