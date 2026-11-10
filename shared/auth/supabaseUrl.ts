// Supabase's dashboard shows the project address in a few forms, e.g.
// "https://abcd.supabase.co" or "https://abcd.supabase.co/rest/v1/". The client
// libraries add their own paths ("/auth/v1/..."), so anything after the host
// breaks every request with "Invalid path specified in request URL". Keep only
// the origin. Returns null for anything that isn't an http(s) URL.
export function supabaseProjectUrl(raw: string | undefined): string | null {
  const value = raw?.trim();
  if (!value) return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  return url.protocol === 'https:' || url.protocol === 'http:' ? url.origin : null;
}
