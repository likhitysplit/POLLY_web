export const ORIGINS = new Set([
  "https://pollylang.app",
  "https://www.pollylang.app",
  "http://localhost:5173",
  "http://localhost:3000"
]);

export function cors(origin = "") {
  return {
    "Access-Control-Allow-Origin": ORIGINS.has(origin) ? origin : "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400"
  };
}
export function apply(res: any, headers: Record<string, string>) {
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
}
