import { randomBytes, scrypt as _scrypt, timingSafeEqual } from "crypto";
const scrypt = (pwd: string, salt: Buffer, N=16384, r=8, p=1, keylen=64) =>
  new Promise<Buffer>((resolve, reject) => {
    (_scrypt as any)(pwd, salt, keylen, { N, r, p }, (err: any, dk: Buffer) => err ? reject(err) : resolve(dk));
  });

export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const N=16384,r=8,p=1,keylen=64;
  const dk = await scrypt(password, salt, N,r,p,keylen);
  return `scrypt$${N}$${r}$${p}$${salt.toString("base64")}$${dk.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string) {
  const [alg, nStr, rStr, pStr, saltB64, hashB64] = stored.split("$");
  if (alg !== "scrypt") return false;
  const N = parseInt(nStr,10), r = parseInt(rStr,10), p = parseInt(pStr,10);
  const salt = Buffer.from(saltB64, "base64");
  const hash = Buffer.from(hashB64, "base64");
  const dk = await scrypt(password, salt, N, r, p, hash.length);
  return timingSafeEqual(hash, dk);
}
