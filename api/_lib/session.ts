import { SignJWT, jwtVerify } from "jose-node-cjs-runtime";

const ALG = "HS256";
const COOKIE = "pl_session";
const days = (n: number) => n * 24 * 60 * 60;

export async function makeSessionCookie(userId: string, secret: string) {
  const token = await new SignJWT({ uid: userId })
    .setProtectedHeader({ alg: ALG })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(new TextEncoder().encode(secret));

  return [
    `${COOKIE}=${token}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${days(30)}`,
    "Secure"
  ].join("; ");
}

export async function readSession(req: any, secret: string): Promise<string | null> {
  const raw = (req.headers.cookie || "") as string;
  const dict: Record<string, string> = {};
  for (const part of raw.split(";")) {
    const [k, ...rest] = part.trim().split("="); if (!k) continue;
    dict[decodeURIComponent(k)] = decodeURIComponent(rest.join("="));
  }
  const token = dict[COOKIE];
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret));
    return (payload as any).uid as string;
  } catch {
    return null;
  }
}

export function clearCookie() {
  return `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Secure`;
}
