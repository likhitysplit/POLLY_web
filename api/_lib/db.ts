export async function dbQuery(
  supaUrl: string,
  supaKey: string,
  path: string,
  init?: RequestInit
) {
  const headers = {
    "apikey": supaKey,
    "Authorization": `Bearer ${supaKey}`,
    ...(init?.headers || {})
  } as any;
  return fetch(`${supaUrl}${path}`, { ...init, headers });
}
