import type { VercelRequest, VercelResponse } from "@vercel/node";
import { cors, apply } from "../_lib/cors";
import { dbQuery } from "../_lib/db";
import { hashPassword } from "../_lib/hash";
import { makeSessionCookie } from "../_lib/session";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const origin = (Array.isArray(req.headers.origin) ? req.headers.origin[0] : req.headers.origin) || "";
  const headers = cors(origin);
  if (req.method === "OPTIONS") { apply(res, headers); return res.status(200).end(); }
  if (req.method !== "POST")   { apply(res, headers); return res.status(405).send("Method Not Allowed"); }
  apply(res, headers);

  const { username, email, password, characterName } = (req.body || {}) as Record<string, string>;
  if (!username || !email || !password || !characterName) {
    return res.status(400).json({ error: "Missing fields" });
  }
  if (!/^[a-z0-9_.]{3,32}$/i.test(username)) {
    return res.status(400).json({ error: "Invalid username" });
  }

  const supaUrl = process.env.SUPABASE_URL!;
  const supaKey = process.env.SUPABASE_SERVICE_ROLE!;
  const secret  = process.env.SESSION_SECRET!;

  // Unique username/email checks
  {
    const r = await dbQuery(supaUrl, supaKey, `/rest/v1/users_auth?username=eq.${encodeURIComponent(username)}&select=id`);
    if (!r.ok) return res.status(502).json({ error: await r.text() });
    const arr = await r.json(); 
    if (arr.length) return res.status(409).json({ error: "Username already taken" });
  }
  {
    const r = await dbQuery(supaUrl, supaKey, `/rest/v1/users_auth?email=eq.${encodeURIComponent(email)}&select=id`);
    if (!r.ok) return res.status(502).json({ error: await r.text() });
    const arr = await r.json(); 
    if (arr.length) return res.status(409).json({ error: "Email already in use" });
  }

  const pass_hash = await hashPassword(password);

  const ins = await dbQuery(supaUrl, supaKey, `/rest/v1/users_auth`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Prefer": "return=representation" },
    body: JSON.stringify([{ username, email, pass_hash, character_name: characterName }])
  });
  if (!ins.ok) return res.status(502).json({ error: await ins.text() });
  const [row] = await ins.json();

  // FIX: jose dynamic import inside function to avoid ERR_REQUIRE_ESM
  const cookie = await makeSessionCookie(row.id, secret);
  res.setHeader("Set-Cookie", cookie);

  return res.status(200).json({ userId: row.id });
}
