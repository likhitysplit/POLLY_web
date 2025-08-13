import type { VercelRequest, VercelResponse } from "@vercel/node";
import { cors, apply } from "../_lib/cors";
import { dbQuery } from "../_lib/db";
import { verifyPassword } from "../_lib/hash";
import { makeSessionCookie } from "../_lib/session";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const origin = (Array.isArray(req.headers.origin) ? req.headers.origin[0] : req.headers.origin) || "";
  const headers = cors(origin);
  if (req.method === "OPTIONS") { apply(res, headers); return res.status(200).end(); }
  if (req.method !== "POST")   { apply(res, headers); return res.status(405).send("Method Not Allowed"); }
  apply(res, headers);

  const { usernameOrEmail, password } = (req.body || {}) as Record<string, string>;
  if (!usernameOrEmail || !password) return res.status(400).json({ error: "Missing fields" });

  const supaUrl = process.env.SUPABASE_URL!;
  const supaKey = process.env.SUPABASE_SERVICE_ROLE!;
  const secret  = process.env.SESSION_SECRET!;

  const q = encodeURIComponent(usernameOrEmail);
  const r = await dbQuery(supaUrl, supaKey,
    `/rest/v1/users_auth?or=(username.eq.${q},email.eq.${q})&select=id,pass_hash`
  );
  if (!r.ok) return res.status(502).json({ error: await r.text() });
  const users = await r.json();
  if (!users.length) return res.status(401).json({ error: "Invalid credentials" });

  const { id, pass_hash } = users[0];
  const ok = await verifyPassword(password, pass_hash);
  if (!ok) return res.status(401).json({ error: "Invalid credentials" });

  const cookie = await makeSessionCookie(id, secret);
  res.setHeader("Set-Cookie", cookie);
  return res.status(200).json({ userId: id });
}
