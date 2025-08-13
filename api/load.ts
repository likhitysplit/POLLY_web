import type { VercelRequest, VercelResponse } from "@vercel/node";
import { cors, apply } from "./_lib/cors";
import { readSession } from "./_lib/session";
import { dbQuery } from "./_lib/db";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const origin = (Array.isArray(req.headers.origin) ? req.headers.origin[0] : req.headers.origin) || "";
  const headers = cors(origin);
  if (req.method === "OPTIONS") { apply(res, headers); return res.status(200).end(); }
  if (req.method !== "GET")    { apply(res, headers); return res.status(405).send("Method Not Allowed"); }
  apply(res, headers);

  const uid = await readSession(req, process.env.SESSION_SECRET!);
  if (!uid) return res.status(401).json({ error: "No session" });

  const r = await dbQuery(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE!,
    `/rest/v1/player_saves?user_id=eq.${uid}&select=data`
  );
  if (!r.ok) return res.status(502).json({ error: await r.text() });
  const arr = await r.json() as Array<{ data: any }>;
  return res.status(200).json({ data: arr[0]?.data ?? {} });
}
