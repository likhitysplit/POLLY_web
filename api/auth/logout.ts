import type { VercelRequest, VercelResponse } from "@vercel/node";
import { cors, apply } from "../_lib/cors";
import { clearCookie } from "../_lib/session";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const origin = (Array.isArray(req.headers.origin) ? req.headers.origin[0] : req.headers.origin) || "";
  const headers = cors(origin);

  if (req.method === "OPTIONS") { apply(res, headers); return res.status(200).end(); }
  if (req.method !== "POST")   { apply(res, headers); return res.status(405).send("Method Not Allowed"); }

  apply(res, headers);
  res.setHeader("Set-Cookie", clearCookie());
  return res.status(200).json({ ok: true });
}
