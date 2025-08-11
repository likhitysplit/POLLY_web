// /api/chat.js  (Vercel Node Function)
const ALLOWED_ORIGINS = new Set([
  "https://pollylang.app",
  "https://www.pollylang.app",
  "http://localhost:5173",    // ok for local preview; remove later
  "http://localhost:3000"
]);

function cors(origin) {
  const allow = ALLOWED_ORIGINS.has(origin) ? origin : "";
  return {
    "Access-Control-Allow-Origin": allow || "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400"
  };
}

export default async function handler(req, res) {
  const origin = req.headers.origin || "";
  const headers = cors(origin);

  // 1) Preflight (WebGL will send this)
  if (req.method === "OPTIONS") {
    res.status(200);
    for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
    return res.end();
  }

  // 2) Only allow POST for actual work
  if (req.method !== "POST") {
    res.status(405);
    for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
    return res.json({ error: "Method not allowed. Use POST." });
  }

  try {
    const { persona = "", language = "", user = "" } = req.body || {};
    const system = `You are ${String(persona).slice(0,400)}. Reply only in ${String(language).slice(0,40)}. One sentence, <=60 chars, no emojis, no quotes, no prefixes.`;

    const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.GROQ_API_KEY}`
      },
      body: JSON.stringify({
        model: "llama-3.1-8b-instant",
        temperature: 0.6,
        max_tokens: 40,
        messages: [
          { role: "system", content: system },
          { role: "user", content: String(user).slice(0,400) }
        ]
      })
    });

    if (!r.ok) {
      const t = await r.text();
      res.status(502);
      for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
      return res.json({ error: `Groq error: ${t}` });
    }

    const data = await r.json();
    let text = (data?.choices?.[0]?.message?.content || "").trim();
    if (text.length > 60) text = text.slice(0, 60);

    res.status(200);
    for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
    return res.json({ text });
  } catch (e) {
    res.status(500);
    for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
    return res.json({ error: e?.message || "Server error" });
  }
}
