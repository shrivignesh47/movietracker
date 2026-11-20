import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const UA =
  "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Mobile Safari/537.36";
const BMS_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1";

/** District's guest token is generated client-side per request: <epoch_ms>_<18 digits>_<11 chars>. */
function guestToken(): string {
  let digits = "";
  for (let i = 0; i < 18; i++) digits += Math.floor(Math.random() * 10);
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  let suffix = "";
  for (let i = 0; i < 11; i++) suffix += alphabet[Math.floor(Math.random() * alphabet.length)];
  return `${Date.now()}_${digits}_${suffix}`;
}

/** BMS's x-bms-id is also made up by the web client: 1.<9 digits>.<epoch_ms>. */
function bmsId(): string {
  return `1.${Math.floor(Math.random() * 9e8 + 1e8)}.${Date.now()}`;
}

function bmsHeaders(accept: string): Record<string, string> {
  return {
    accept,
    "accept-language": "en-IN,en;q=0.9",
    "user-agent": BMS_UA,
    referer: "https://in.bookmyshow.com/",
    "x-app-code": "WEBV2",
    "x-platform-code": "WEB",
    "x-platform": "WEB",
    "x-bms-id": bmsId(),
  };
}

// ---------------------------------------------------------------------------
// BookMyShow regions: city_code (District-style key) → BMS slug/code/lat/lng
// ---------------------------------------------------------------------------
type BmsRegion = { code: string; slug: string; name: string; lat: string; lng: string; aliases: string[] };

let bmsRegionCache: { regions: BmsRegion[]; at: number } | null = null;
const BMS_REGION_TTL = 6 * 60 * 60 * 1000; // 6h

async function fetchBmsRegions(): Promise<BmsRegion[] | null> {
  if (bmsRegionCache && Date.now() - bmsRegionCache.at < BMS_REGION_TTL) return bmsRegionCache.regions;
  try {
    const res = await fetch("https://in.bookmyshow.com/api/explore/v1/discover/regions", {
      headers: bmsHeaders("application/json"),
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) return null;
    const json = await res.json().catch(() => null);
    const bms = json?.BookMyShow ?? json;
    const list = [...(bms?.TopCities ?? []), ...(bms?.OtherCities ?? [])];
    const regions: BmsRegion[] = list
      .filter((c: any) => c?.RegionSlug && c?.RegionCode)
      .map((c: any) => ({
        code: String(c.RegionCode),
        slug: String(c.RegionSlug),
        name: String(c.RegionName ?? c.RegionSlug),
        lat: String(c.Lat ?? ""),
        lng: String(c.Long ?? ""),
        aliases: Array.isArray(c.Alias) ? c.Alias.map((a: any) => String(a)) : [],
      }));
    if (!regions.length) return null;
    bmsRegionCache = { regions, at: Date.now() };
    return regions;
  } catch {
    return null;
  }
}

const bmsNorm = (s: string) =>
  String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

function bmsCommonPrefix(a: string, b: string): number {
  const n = Math.min(a.length, b.length);
  let i = 0;
  while (i < n && a[i] === b[i]) i++;
  return i;
}

/** Does `needle` occur in `hay` on a "-" boundary (or string edge)? */
function bmsBoundaryIn(hay: string, needle: string): boolean {
  let idx = hay.indexOf(needle);
  while (idx !== -1) {
    const before = idx === 0 ? "-" : hay[idx - 1];
    const after = idx + needle.length >= hay.length ? "-" : hay[idx + needle.length];
    if (before === "-" && after === "-") return true;
    idx = hay.indexOf(needle, idx + 1);
  }
  return false;
}

/**
 * Resolve any District-style city key ("new-delhi", "vizag", "mangaluru")
 * to a BookMyShow region. Passes: exact slug/code → exact name/alias →
 * token equality → boundary containment → token prefix (alternate spellings).
 */
function resolveBmsRegion(regions: BmsRegion[], cityCode: string): BmsRegion | null {
  const q = bmsNorm(cityCode);
  if (!q) return null;
  const qTokens = q.split("-").filter((t) => t.length >= 3);
  const code = String(cityCode).trim().toLowerCase();

  for (const r of regions) {
    if (bmsNorm(r.slug) === q || r.code.toLowerCase() === code) return r;
  }
  for (const r of regions) {
    if (bmsNorm(r.name) === q || r.aliases.some((a) => bmsNorm(a) === q)) return r;
  }
  for (const r of regions) {
    const names = [r.name, r.slug, ...r.aliases].map(bmsNorm);
    const tokens = new Set(names.flatMap((n) => n.split("-").filter((t) => t.length >= 4)));
    if (qTokens.some((t) => t.length >= 4 && tokens.has(t))) return r;
  }
  for (const r of regions) {
    const names = [r.name, r.slug, ...r.aliases].map(bmsNorm);
    if (names.some((n) => n.length >= 5 && (bmsBoundaryIn(n, q) || bmsBoundaryIn(q, n)))) return r;
  }
  for (const r of regions) {
    const cTokens = [r.name, r.slug, ...r.aliases].map(bmsNorm).flatMap((n) => n.split("-"));
    if (qTokens.some((t) => t.length >= 5 && cTokens.some((c) => c.length >= 5 && bmsCommonPrefix(t, c) >= 5))) {
      return r;
    }
  }
  return null;
}

const bmsTitleCase = (s: string) =>
  s.split(/\s+/).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");

/**
 * District's /movies?city=<key> page embeds a schema.org ItemList in JSON-LD
 * with every movie's name, URL (carrying the MV code) and poster.
 */
function parseDistrictMovies(html: string, cityCode: string) {
  const out: any[] = [];
  const seen = new Set<string>();
  const scriptRe = /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = scriptRe.exec(html))) {
    let data: any;
    try {
      data = JSON.parse(m[1]);
    } catch {
      continue;
    }
    const items = Array.isArray(data?.itemListElement) ? data.itemListElement : [];
    for (const item of items) {
      const url: string = item?.url ?? "";
      const match = url.match(/\/movies\/([a-z0-9-]+)-movie-tickets-(MV\d+)/i);
      if (!match || !item?.name || seen.has(match[2])) continue;
      seen.add(match[2]);
      const slug = match[1];
      out.push({
        source_movie_id: match[2].toUpperCase(),
        slug,
        title: item.name,
        poster_url: item.image || null,
        city_code: cityCode,
        source: "district",
        is_bookable: true,
        bookable_url: url,
      });
    }
  }
  return out;
}

/**
 * BookMyShow movie listing via the WEBV2 discover API (verified reachable
 * from edge-function IPs): regions → /discover/movies (full listing, all
 * coming-soon + now-showing cards) with /discover/home as a fallback source.
 */
async function scrapeBookMyShow(cityCode: string) {
  const regions = await fetchBmsRegions();
  if (!regions) return { movies: [], blocked: true, note: "BookMyShow regions endpoint unavailable" };
  const region = resolveBmsRegion(regions, cityCode);
  if (!region) {
    return {
      movies: [],
      blocked: false,
      notListed: true,
      note: `BookMyShow doesn't cover ${cityCode} yet.`,
    };
  }

  const urls = [
    `https://in.bookmyshow.com/api/explore/v1/discover/movies?city=${encodeURIComponent(region.slug)}&region=${encodeURIComponent(region.code)}`,
    `https://in.bookmyshow.com/api/explore/v1/discover/home/${encodeURIComponent(region.slug)}?region=${encodeURIComponent(region.code)}&embedded=true&lat=${region.lat}&lon=${region.lng}`,
  ];

  const out: any[] = [];
  const seen = new Set<string>();
  let anyOk = false;

  for (const url of urls) {
    let res: Response;
    try {
      res = await fetch(url, { headers: bmsHeaders("application/json"), signal: AbortSignal.timeout(20000) });
    } catch {
      continue;
    }
    if (res.status === 403 || res.status === 401) {
      return { movies: [], blocked: true, note: `BookMyShow returned ${res.status} (Cloudflare rate-limit)` };
    }
    if (!res.ok) continue;
    anyOk = true;
    const json = await res.json().catch(() => null);
    for (const listing of json?.listings ?? []) {
      for (const card of listing?.cards ?? []) {
        const cta = String(card?.ctaUrl ?? "");
        const m = cta.match(/\/movies\/([^/]+)\/([^/]+)\/(ET\d+)/);
        if (!m || seen.has(m[3])) continue;
        const [, citySlug, movieSlug, et] = m;
        const title =
          (card?.text ?? [])
            .map((t: any) => (t?.components ?? []).map((c: any) => String(c?.text ?? "")).join(""))
            .find((s: string) => s.trim()) ??
          card?.analytics?.title ??
          null;
        if (!title) continue;
        seen.add(et);
        const genreRaw = String(card?.analytics?.genre ?? "").trim();
        const langRaw = String(card?.analytics?.language ?? "").trim();
        out.push({
          source_movie_id: et,
          slug: movieSlug,
          title: String(title).trim(),
          poster_url: card?.image?.url ?? null,
          language: langRaw ? bmsTitleCase(langRaw) : null,
          genre: genreRaw ? genreRaw.split("|").filter(Boolean).map(bmsTitleCase).join(", ") : null,
          duration: null,
          city_code: cityCode,
          source: "bookmyshow",
          is_bookable: true,
          bookable_url: `https://in.bookmyshow.com/movies/${citySlug}/${movieSlug}/${et}`,
        });
      }
    }
  }

  if (!anyOk) return { movies: [], blocked: true, note: "BookMyShow did not respond" };
  if (!out.length) {
    return { movies: [], blocked: false, notListed: true, note: `No movies listed for ${region.name} right now.` };
  }
  return { movies: out, blocked: false, region: { slug: region.slug, code: region.code } };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { source = "district", city_code = "hyderabad" } = await req.json().catch(() => ({}));

    if (source === "bookmyshow") {
      const { movies, blocked, note, notListed } = await scrapeBookMyShow(city_code);
      return new Response(
        JSON.stringify({
          ok: true,
          movies,
          blocked: blocked ?? false,
          notListed: notListed ?? false,
          note: note ?? null,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // District: fetch the city movies page and read the JSON-LD ItemList
    const url = `https://www.district.in/movies?city=${encodeURIComponent(city_code)}`;
    const res = await fetch(url, {
      headers: {
        accept: "text/html,application/xhtml+xml",
        "accept-language": "en-IN,en;q=0.9",
        "user-agent": UA,
        "x-app-type": "ed_mweb",
        "x-guest-token": guestToken(),
        "x-request-id": crypto.randomUUID(),
      },
      signal: AbortSignal.timeout(20000),
    });

    if (!res.ok) {
      return new Response(
        JSON.stringify({ ok: false, error: `District HTTP ${res.status}`, movies: [] }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const html = await res.text();
    const movies = parseDistrictMovies(html, city_code);

    return new Response(
      JSON.stringify({ ok: true, movies, blocked: false }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ ok: false, error: err?.message ?? "unknown error", movies: [] }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
