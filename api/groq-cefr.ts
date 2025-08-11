import type { VercelRequest, VercelResponse } from "@vercel/node";

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const MODEL = "llama-3.1-8b-instant";
const ORIGINS = new Set([
  "https://pollylang.app",
  "https://www.pollylang.app",
  "http://localhost:5173",
]);

const deaccent = (s: string) =>
  s.normalize("NFD").replace(/\p{Diacritic}/gu, "");
const toks = (s: string) =>
  deaccent(s.toLowerCase()).match(/[a-záéíóúñü]+/gi) ?? [];

let BANK_CACHE: Record<string, Set<string>> = {};
let CEFR_CACHE: Record<string, Record<string, string>> = {};

function cors(origin = "") {
  return {
    "Access-Control-Allow-Origin": ORIGINS.has(origin) ? origin : "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
  };
}

function applyHeaders(res: VercelResponse, headers: Record<string, string>) {
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
}

async function loadJSON<T = any>(url: string): Promise<T> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`fetch ${url}: ${r.status}`);
  return (await r.json()) as T;
}

async function loadBank(lang: string, level: string) {
  const key = `${lang}:${level}`;
  if (BANK_CACHE[key]) return BANK_CACHE[key];
  const arr = await loadJSON<string[]>(
    `https://pollylang.app/wordbanks/${lang}/${level}.json`
  );
  BANK_CACHE[key] = new Set(arr);
  return BANK_CACHE[key];
}

async function loadCefr(lang: string) {
  if (CEFR_CACHE[lang]) return CEFR_CACHE[lang];
  CEFR_CACHE[lang] = await loadJSON<Record<string, string>>(
    `https://pollylang.app/cefr/${lang}.json`
  );
  return CEFR_CACHE[lang];
}

function chooseSlice(
  full: Set<string>,
  topicWords: string[] | null,
  n = 180
) {
  const slice: string[] = [];
  if (topicWords)
    for (const w of topicWords) if (full.has(w) && slice.length < n) slice.push(w);
  if (slice.length < n)
    for (const w of full) {
      if (slice.length >= n) break;
      if (!slice.includes(w)) slice.push(w);
    }
  return slice;
}

function oov(text: string, full: Set<string>) {
  return Array.from(new Set(toks(text).filter((t) => !full.has(t))));
}

async function groqCall(system: string, user: string, key: string) {
  const r = await fetch(GROQ_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.6,
      max_tokens: 40,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });
  if (!r.ok) throw new Error(await r.text());
  const data: any = await r.json();
  let text = (data?.choices?.[0]?.message?.content || "").trim();
  if (text.length > 60) text = text.slice(0, 60);
  return text;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const rawOrigin = req.headers.origin;
  const origin =
    (Array.isArray(rawOrigin) ? rawOrigin[0] : rawOrigin) || "";
  const headers = cors(origin);

  if (req.method === "OPTIONS") {
    applyHeaders(res, headers);
    return res.status(200).end();
  }
  if (req.method !== "POST") {
    applyHeaders(res, headers);
    return res.status(405).send("Method Not Allowed");
  }

  try {
    const {
      persona = "María, teen from Madrid who loves art and padel.",
      language = "Spanish",
      langCode = "es",
      level = "A1", // "A1"|"A2"|"B1"|"B2"|"C1"
      topic = "",
      user = "Greet the player.",
    } = (req.body || {}) as Record<string, string>;

    const key = process.env.GROQ_API_KEY!;
    const cefr = await loadCefr(langCode);
    const levelRule = cefr[level] || "";
    const full = await loadBank(langCode, level);

    const topicArr = topic ? toks(topic).filter((t) => full.has(t)) : [];
    const slice = chooseSlice(full, topicArr, 200);

    const system =
      `You are ${persona}. Speak only ${language}. ` +
      `CEFR ${level}: ${levelRule} ` +
      `Use ONLY BANK words when possible; paraphrase to stay in level. ` +
      `One sentence, <=60 chars. No emojis/quotes/prefixes. Stay in character.`;

    const userMsg = `BANK: ${slice.join(", ")}
TOPIC: ${topic}
PLAYER: ${user}`;

    let text = await groqCall(system, userMsg, key);
    let bad = oov(text, full);

    if (bad.length) {
      const fix = `Rewrite without: ${bad.join(
        ", "
      )}. Use only BANK words. Keep meaning.`;
      text = await groqCall(
        system,
        `BANK: ${slice.join(", ")}\n${fix}\nOriginal: ${text}`,
        key
      );
      bad = oov(text, full);
      if (bad.length) text = "¿Puedes decirlo de otra forma?";
    }

    applyHeaders(res, headers);
    return res.status(200).json({ text });
  } catch (e: any) {
    applyHeaders(res, headers);
    return res.status(502).json({ error: e?.message || "LLM error" });
  }
}
