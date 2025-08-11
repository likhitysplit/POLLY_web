// /api/chat.js  (Vercel Node function)
export default async function handler(req, res) {
  // Only allow POST; visiting in the browser (GET) should not crash
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed. Use POST." });
  }

  try {
    // Safe destructuring even if body is missing
    const { persona = "", language = "", user = "" } = req.body || {};

    // Keep replies short, single sentence, in target language
    const system = `You are ${String(persona).slice(0,400)}. Reply only in ${String(language).slice(0,40)}. One sentence, <=60 chars, no emojis, no quotes, no prefixes.`;

    // Use Groq's OpenAI-compatible endpoint
    const resp = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: "llama-3.1-8b-instant",   // fast + cheap
        temperature: 0.6,
        max_tokens: 40,
        messages: [
          { role: "system", content: system },
          { role: "user", content: String(user).slice(0,400) }
        ],
      }),
    });

    if (!resp.ok) {
      const text = await resp.text();
      return res.status(502).json({ error: `Groq error: ${text}` });
    }

    const data = await resp.json();
    let text = (data?.choices?.[0]?.message?.content || "").trim();
    if (text.length > 60) text = text.slice(0, 60);

    return res.status(200).json({ text });
  } catch (e) {
    return res.status(500).json({ error: e?.message || "Server error" });
  }
}
