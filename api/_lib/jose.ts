// api/_lib/jose.ts
export function loadJose() {
  // Force a true dynamic import; avoids require()
  // eslint-disable-next-line no-new-func
  return (new Function('return import("jose")'))() as Promise<typeof import("jose")>;
}
