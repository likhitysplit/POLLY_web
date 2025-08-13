import type { VercelRequest, VercelResponse } from "@vercel/node";
import { cors, apply } from "./_lib/cors";
import { readSession } from "./_lib/session";
import { dbQuery } from "./_lib/db";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const origin = (Array.isArray(req.headers.origin) ? req.headers.origin[0] : req.headers.origin) || "";
  const headers = cors(origin);
  if (req.method === "OPTIONS") { apply(res, headers); return res.status(200).end(); }
  if (req.method !== "POST")   { apply(res, headers); return res.status(405).send("Method Not Allowed"); }
  apply(res, headers);

  const uid = await readSession(req, process.env.SESSION_SECRET!);
  if (!uid) return res.status(401).json({ error: "No session" });

  const data = (req.body?.data ?? {}) as any;
  const txt = JSON.stringify(data);
  if (txt.length > 500_000) return res.status(413).json({ error: "Save too large" });

  const r = await dbQuery(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE!,
    `/rest/v1/player_saves`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "Prefer": "resolution=merge-duplicates" },
      body: JSON.stringify([{ user_id: uid, data }])
    }
  );
  if (!r.ok) return res.status(502).json({ error: await r.text() });
  return res.status(200).json({ ok: true });
}
