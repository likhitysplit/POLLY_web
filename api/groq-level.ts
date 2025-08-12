// api/groq-level.ts
import type { VercelRequest, VercelResponse } from "@vercel/node";

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const MODEL = "llama-3.1-8b-instant";
const ORIGINS = new Set([
  "https://pollylang.app",
  "https://www.pollylang.app",
  "http://localhost:5173",
]);

const deaccent = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "");
const toks = (s: string) =>
  deaccent(s.toLowerCase()).match(/[a-záéíóúñü]+/gi) ?? [];

let BANK_CACHE: Record<string, Set<string>> = {};
let CEFR_CACHE: Record<string, Record<string, string>> = {};

// ---------- helpers ----------

// numeric "1|2|3…" => 1000, 2000…
function levelToCount(level: string): number {
  const n = parseInt(level, 10);
  if (!Number.isFinite(n) || n <= 0) return 1000;
  return n >= 1000 ? n : n * 1000;
}

// numeric to CEFR (optional guidance file)
function numericToCefr(level: string): string {
  const map: Record<string, string> = {
    "1": "A1",
    "2": "A2",
    "3": "B1",
    "4": "B2",
    "5": "C1",
    "1000": "A1",
    "2000": "A2",
    "3000": "B1",
    "4000": "B2",
    "5000": "C1",
  };
  return map[level] || "";
}

// pull a clean display name from `persona`
function extractPersonaName(persona: string): string {
  // Try before the first comma/sentence break; fallback to first word.
  const firstClause = persona.split(/[,\.\n]/)[0]?.trim() || persona.trim();
  // Strip leading role words like "Soy", quotes, etc.
  const cleaned = firstClause.replace(/^"(.*)"$/, "$1").replace(/^(soy|i am)\s+/i, "").trim();
  // If there are multiple words, keep the first token as a name guess
  const name = cleaned.split(/\s+/)[0] || "Personaje";
  return name;
}

const CUMULATIVE = true;

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

async function loadCefr(lang: string) {
  if (CEFR_CACHE[lang]) return CEFR_CACHE[lang];
  CEFR_CACHE[lang] = await loadJSON<Record<string, string>>(
    `https://pollylang.app/cefr/${lang}.json`
  );
  return CEFR_CACHE[lang];
}

async function loadOneBank(lang: string, count: number): Promise<Set<string>> {
  const key = `${lang}:${count}`;
  if (BANK_CACHE[key]) return BANK_CACHE[key];
  // expects /public/wordbanks/es/es_1000.json, es_2000.json, ...
  const arr = await loadJSON<string[]>(
    `https://pollylang.app/wordbanks/${lang}/${lang}_${count}.json`
  );
  BANK_CACHE[key] = new Set(arr.map((w) => deaccent(w.toLowerCase())));
  return BANK_CACHE[key];
}

async function loadBank(lang: string, level: string): Promise<Set<string>> {
  const count = levelToCount(level);
  if (!CUMULATIVE) return loadOneBank(lang, count);

  const union = new Set<string>();
  for (let k = 1000; k <= count; k += 1000) {
    const set = await loadOneBank(lang, k);
    for (const w of set) union.add(w);
  }
  return union;
}

function chooseSlice(full: Set<string>, topicWords: string[] | null, n = 200) {
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
  if (text.length > 150) text = text.slice(0, 150);
  return text;
}

// ---------- handler ----------

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const rawOrigin = req.headers.origin;
  const origin = (Array.isArray(rawOrigin) ? rawOrigin[0] : rawOrigin) || "";
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
      level = "1", // numeric or CEFR-like
      topic = "",
      user = "Greet the player.",
    } = (req.body || {}) as Record<string, string>;

    const key = process.env.GROQ_API_KEY!;
    const full = await loadBank(langCode, level);

    // Optional CEFR guidance
    const cefrLevel = numericToCefr(level) || level;
    let levelRule = "";
    try {
      const cefrData = await loadCefr(langCode);
      levelRule = cefrData[cefrLevel] || "";
    } catch {
      levelRule = "";
    }

    const topicArr = topic ? toks(topic).filter((t) => full.has(t)) : [];
    const slice = chooseSlice(full, topicArr, 200);

    // identity lock
    const npcName = extractPersonaName(persona);

    const system =
      `You are ${persona}. ` +
      // identity instructions (language-agnostic phrasing)
      `Your fixed personal name is "${npcName}". ` +
      `If the player asks who you are, your name, or "what are you called", clearly say your name (e.g., "Me llamo ${npcName}", "Soy ${npcName}", or the correct equivalent in ${language}). ` +
      `Never answer with only a pronoun like "yo/ella/él" instead of your name. ` +
      `Speak only ${language}. ` +
      (levelRule ? `${levelRule} ` : "") +
      `Prefer using only the BANK vocabulary for Level ${level} (${cefrLevel || "no CEFR"}). ` +
      `If a key word is missing, you may use simple outside words sparingly. ` +
      `One sentence, <=150 characters. No emojis/quotes/prefixes. Stay in character.`;

    const userMsg =
      `BANK (Level ${level}): ${slice.join(", ")}\n` +
      `TOPIC: ${topic}\n` +
      `PLAYER: ${user}`;

    let text = await groqCall(system, userMsg, key);

    // Soft constraint: only rewrite if >30% OOV
    const tokens = toks(text);
    let bad = oov(text, full);
    const oovRatio = tokens.length ? bad.length / tokens.length : 0;

    if (oovRatio > 0.30) {
      const fix =
        `Rewrite using mainly BANK words. Replace outside words (${bad.join(
          ", "
        )}) with close BANK synonyms when possible. Keep meaning.`;
      text = await groqCall(
        system,
        `BANK (Level ${level}): ${slice.join(", ")}\n${fix}\nOriginal: ${text}`,
        key
      );
      if (text.length > 150) text = text.slice(0, 150);
    }

    applyHeaders(res, headers);
    return res.status(200).json({ text });
  } catch (e: any) {
    applyHeaders(res, headers);
    return res.status(502).json({ error: e?.message || "LLM error" });
  }
}
