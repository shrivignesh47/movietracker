import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const UA =
  "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Mobile Safari/537.36";
const BMS_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1";

/** Where a movie sits in its release cycle. Derived per platform: BookMyShow
 * exposes two separate lists (current vs upcoming), District carries a
 * release_date epoch. `upcoming` wins on conflict — a future official release
 * date means the film isn't in cinemas yet even if presale is open. */
type ReleaseStatus = "now_showing" | "upcoming";

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

/** Decode the handful of HTML entities District uses inside titles/URLs. */
function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&apos;|&#39;|&#x27;/gi, "'")
    .replace(/&quot;|&#34;/gi, '"')
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)));
}

type DistrictMeta = {
  release: string | null;
  image: string | null;
  genres: string[];
  duration: string | null;
  langs: string[];
};

/**
 * District's /movies?city=<key> page carries four layers of movie data:
 *  1. rendered grid cards — <a …-movie-tickets-MV…> with <h5> title, poster
 *     and a "censor | language" sub-line;
 *  2. inline "trending" prose links — slug + title only;
 *  3. a JSON-LD ItemList — name/URL/poster;
 *  4. MovieData blocks escaped into page state — release_date epoch, image,
 *     genres, duration, language variants.
 * Grid/prose supply the linkable set; MovieData decides the release status
 * (release_date in the future → upcoming, otherwise now showing).
 */
function parseDistrictMovies(html: string, cityCode: string): any[] {
  const today = new Date().toISOString().slice(0, 10);

  // --- layer 4: MovieData metadata keyed by MV id -------------------------
  const meta = new Map<string, DistrictMeta>();
  const positions: number[] = [];
  const mdRe = /MovieData/g;
  let m: RegExpExecArray | null;
  while ((m = mdRe.exec(html))) positions.push(m.index);
  for (let i = 0; i < positions.length; i++) {
    // slice to the next block so name/release can never cross-match
    const seg = html.slice(positions[i], i + 1 < positions.length ? positions[i + 1] : positions[i] + 3000);
    const num = seg.match(/movie_id\\?":\\?"(\d+)/)?.[1];
    if (!num || meta.has(`MV${num}`)) continue;
    const epoch = seg.match(/release_date\\?":\\?"(\d+)/)?.[1];
    const image = seg.match(/image\\?":\\?"([^"\\]{5,300})/)?.[1];
    const dur = seg.match(/Duration\\?":(\d{1,4})/)?.[1];
    const genresRaw = seg.match(/genres\\?":\[([^\]]{0,400})\]/)?.[1];
    const genres = genresRaw
      ? [...genresRaw.matchAll(/\\?"([^"\\]{2,40})\\?"/g)].map((x) => x[1])
      : [];
    const langs = [...seg.matchAll(/language\\?":\\?"([^"\\]{2,30})/g)].map((x) => x[1]);
    let release: string | null = null;
    if (epoch) {
      const ms = Number(epoch) * 1000;
      if (Number.isFinite(ms) && ms > 0) release = new Date(ms).toISOString().slice(0, 10);
    }
    meta.set(`MV${num}`, {
      release,
      image: image ?? null,
      genres,
      duration: dur ? `${dur} min` : null,
      langs: [...new Set(langs)],
    });
  }

  // --- layer 3: JSON-LD ItemList (name/URL/poster fallback) ---------------
  const ld = new Map<string, { name: string; slug: string; image: string | null }>();
  const scriptRe = /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi;
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
      const mt = url.match(/\/movies\/([a-z0-9-]+)-movie-tickets-(MV\d+)/i);
      if (mt && item?.name && !ld.has(mt[2])) {
        ld.set(mt[2], { name: String(item.name), slug: mt[1], image: item.image || null });
      }
    }
  }

  // --- layers 1+2: grid cards vs inline prose links -----------------------
  const anchorRe =
    /<a href="https:\/\/www\.district\.in\/movies\/([a-z0-9-]+)-movie-tickets-(MV\d+)"[^>]*>([\s\S]{0,3000}?)(?=<a href="https:\/\/www\.district\.in\/movies\/|<\/div>\s*<\/div>\s*<\/div>\s*<section|$)/g;
  const cards = new Map<string, { slug: string; title: string; poster: string | null; sub: string | null }>();
  const prose = new Map<string, { slug: string; title: string }>();
  while ((m = anchorRe.exec(html))) {
    const [, slug, id, inner] = m;
    if (cards.has(id) || prose.has(id)) continue;
    const h5 = inner.match(/<h5[^>]*>([^<]{2,90})<\/h5>/);
    if (h5) {
      const imgTag = inner.match(/<img[^>]*>/)?.[0] ?? "";
      const src = imgTag.match(/(?:^|\s)src="([^"]+)"/)?.[1] ?? null;
      const sub = inner.match(/dds-text-secondary[^>]*>([^<]{2,60})</)?.[1] ?? null;
      cards.set(id, {
        slug,
        title: decodeEntities(h5[1].trim()),
        poster: src && !src.startsWith("data:") ? decodeEntities(src) : null,
        sub,
      });
    } else {
      // prose link: title is the anchor text before </a>
      const txt =
        inner.match(/^([^<]{2,90})<\/a>/)?.[1] ??
        inner.replace(/<[^>]+>/g, "").split(",")[0].trim();
      if (txt.length >= 2 && txt.length <= 90) prose.set(id, { slug, title: decodeEntities(txt) });
    }
  }

  // --- assemble: linkable set = grid ∪ prose ∪ JSON-LD --------------------
  const ids = new Set([...cards.keys(), ...prose.keys(), ...ld.keys()]);
  const out: any[] = [];
  for (const id of ids) {
    const card = cards.get(id);
    const link = prose.get(id);
    const list = ld.get(id);
    const md = meta.get(id);
    const slug = card?.slug ?? link?.slug ?? list?.slug ?? null;
    const title = card?.title ?? link?.title ?? list?.name ?? null;
    if (!slug || !title) continue;

    const subParts = card?.sub ? card.sub.split("|").map((s) => s.trim()) : [];
    const language = md?.langs?.[0] ?? subParts[1]?.split(" and ")[0]?.trim() ?? null;
    const release = md?.release ?? null;
    const status: ReleaseStatus | null = release
      ? release > today
        ? "upcoming"
        : "now_showing"
      : null;

    out.push({
      source_movie_id: id,
      slug,
      title,
      poster_url: card?.poster ?? md?.image ?? list?.image ?? null,
      language,
      genre: md?.genres?.length ? md.genres.join(", ") : null,
      duration: md?.duration ?? null,
      release_date: release,
      release_status: status,
      city_code: cityCode,
      source: "district",
      is_bookable: status !== "upcoming",
      bookable_url: `https://www.district.in/movies/${slug}-movie-tickets-${id}`,
    });
  }
  return out;
}

/**
 * BookMyShow movie listing via the WEBV2 discover API (verified reachable
 * from edge-function IPs): two clean lists per region with zero overlap —
 * /discover/movies (currently in cinemas) and /discover/upcoming-movies-<slug>
 * (coming soon) — each tagged by the endpoint that returned it. /discover/home
 * is the fallback when no now-showing cards come back.
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

  const targets: { url: string; status: ReleaseStatus }[] = [
    {
      url: `https://in.bookmyshow.com/api/explore/v1/discover/movies?city=${encodeURIComponent(region.slug)}&region=${encodeURIComponent(region.code)}`,
      status: "now_showing",
    },
    {
      url: `https://in.bookmyshow.com/api/explore/v1/discover/upcoming-movies-${encodeURIComponent(region.slug)}?city=${encodeURIComponent(region.slug)}&region=${encodeURIComponent(region.code)}`,
      status: "upcoming",
    },
  ];

  const fetched = await Promise.all(
    targets.map(async (t) => {
      try {
        const res = await fetch(t.url, { headers: bmsHeaders("application/json"), signal: AbortSignal.timeout(20000) });
        if (!res.ok) return { ...t, http: res.status, json: null as any };
        return { ...t, http: res.status, json: await res.json().catch(() => null) };
      } catch {
        return { ...t, http: 0, json: null as any };
      }
    })
  );

  const out: any[] = [];
  const seen = new Set<string>();
  let rateLimited = false;
  let responded = false;

  const absorb = (json: any, fallback: ReleaseStatus) => {
    if (!json) return;
    responded = true;
    for (const listing of json?.listings ?? []) {
      const listingId = String(listing?.id ?? "");
      // nav cards carry no ET id, so listing-level hints only ever classify
      // real movie cards (COMING_SOON_* carousels → upcoming, etc.)
      const status: ReleaseStatus = /COMING_SOON|UPCOMING/i.test(listingId)
        ? "upcoming"
        : /NOW_SHOWING/i.test(listingId)
          ? "now_showing"
          : fallback;
      for (const card of listing?.cards ?? []) {
        const cta = String(card?.ctaUrl ?? "");
        const match = cta.match(/\/movies\/([^/]+)\/([^/]+)\/(ET\d+)/);
        if (!match || seen.has(match[3])) continue;
        const [, citySlug, movieSlug, et] = match;
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
          release_date: null,
          release_status: status,
          city_code: cityCode,
          source: "bookmyshow",
          is_bookable: status !== "upcoming",
          bookable_url: `https://in.bookmyshow.com/movies/${citySlug}/${movieSlug}/${et}`,
        });
      }
    }
  };

  for (const r of fetched) {
    if (r.http === 403 || r.http === 401) rateLimited = true;
    absorb(r.json, r.status);
  }

  // Fallback: home feed when no current (now-showing) cards came back.
  if (!out.some((m) => m.release_status === "now_showing")) {
    try {
      const res = await fetch(
        `https://in.bookmyshow.com/api/explore/v1/discover/home/${encodeURIComponent(region.slug)}?region=${encodeURIComponent(region.code)}&embedded=true&lat=${region.lat}&lon=${region.lng}`,
        { headers: bmsHeaders("application/json"), signal: AbortSignal.timeout(20000) }
      );
      if (res.status === 403 || res.status === 401) rateLimited = true;
      if (res.ok) absorb(await res.json().catch(() => null), "now_showing");
    } catch {
      /* ignore */
    }
  }

  if (!out.length) {
    if (rateLimited) {
      return { movies: [], blocked: true, note: "BookMyShow returned 403 (Cloudflare rate-limit)" };
    }
    if (!responded) {
      return { movies: [], blocked: true, note: "BookMyShow did not respond" };
    }
    return {
      movies: [],
      blocked: false,
      notListed: true,
      note: `No movies listed for ${region.name} right now.`,
    };
  }
  return { movies: out, blocked: false, region: { slug: region.slug, code: region.code } };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { source = "district", city_code = "hyderabad" } = await req.json().catch(() => ({}));

    // Merged search: both platforms at once, one card per movie with a
    // platform tag and a release-status tag — no manual BookMyShow/District
    // toggle, upcoming and now-showing listed together.
    if (source === "both") {
      const [bmsRes, distRes] = await Promise.allSettled([
        scrapeBookMyShow(city_code),
        scrapeDistrict(city_code),
      ]);
      const bms = bmsRes.status === "fulfilled"
        ? bmsRes.value
        : { movies: [], blocked: true, note: "BookMyShow failed" };
      const dist = distRes.status === "fulfilled"
        ? distRes.value
        : { movies: [], blocked: true, note: "District failed" };

      const { movies, folded } = mergeMovieLists(bms.movies ?? [], dist.movies ?? []);
      const blocked = !!bms.blocked && !!dist.blocked;
      const notes = [bms.note, dist.note].filter(Boolean).join(" · ");

      return new Response(
        JSON.stringify({
          ok: true,
          movies,
          blocked,
          notListed: movies.length === 0,
          note: notes || null,
          counts: {
            bookmyshow: bms.movies?.length ?? 0,
            district: dist.movies?.length ?? 0,
            merged: folded,
            now_showing: movies.filter((m) => m.release_status === "now_showing").length,
            upcoming: movies.filter((m) => m.release_status === "upcoming").length,
            untagged: movies.filter((m) => !m.release_status).length,
          },
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

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

    // District: fetch the city movies page and layer grid/prose/JSON-LD/MovieData
    const { movies, blocked, note } = await scrapeDistrict(city_code);

    return new Response(
      JSON.stringify({
        ok: true,
        movies,
        blocked: blocked ?? false,
        note: note ?? null,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ ok: false, error: err?.message ?? "unknown error", movies: [] }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

/** District city listing as a plain list (used by the merged "both" search). */
async function scrapeDistrict(cityCode: string): Promise<{ movies: any[]; blocked?: boolean; note?: string }> {
  const url = `https://www.district.in/movies?city=${encodeURIComponent(cityCode)}`;
  try {
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
    if (!res.ok) return { movies: [], blocked: true, note: `District HTTP ${res.status}` };
    const movies = parseDistrictMovies(await res.text(), cityCode);
    if (!movies.length) return { movies: [], blocked: false, note: "District listing not found for this city" };
    return { movies };
  } catch {
    return { movies: [], blocked: true, note: "District did not respond" };
  }
}

const normTitle = (t: unknown) =>
  String(t ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** upcoming wins over now_showing; otherwise first known status stands. */
const mergeStatus = (a: unknown, b: unknown): ReleaseStatus | null =>
  a === "upcoming" || b === "upcoming" ? "upcoming" : ((a as ReleaseStatus) ?? (b as ReleaseStatus) ?? null);

/**
 * One card per movie across both platforms: BookMyShow entries come first,
 * District entries that match by title are folded in as `alt_*` (so the movie
 * page can cross-check the other platform), the rest are appended. Statuses
 * merge with upcoming winning; is_bookable is true if either platform sells it.
 */
function mergeMovieLists(bmsList: any[], districtList: any[]) {
  const out: any[] = [];
  const byTitle = new Map<string, any>();

  for (const m of bmsList) {
    const entry = { ...m, sources: ["bookmyshow"] };
    out.push(entry);
    const key = normTitle(entry.title);
    if (key && !byTitle.has(key)) byTitle.set(key, entry);
  }

  let folded = 0;
  for (const m of districtList) {
    const key = normTitle(m.title);
    const hit = key ? byTitle.get(key) : null;
    if (hit) {
      hit.sources.push("district");
      hit.alt_source = "district";
      hit.alt_movie_id = m.source_movie_id;
      hit.alt_slug = m.slug ?? null;
      if (!hit.poster_url) hit.poster_url = m.poster_url ?? null;
      if (!hit.language && m.language) hit.language = m.language;
      if (!hit.genre && m.genre) hit.genre = m.genre;
      if (!hit.duration && m.duration) hit.duration = m.duration;
      if (!hit.release_date && m.release_date) hit.release_date = m.release_date;
      hit.release_status = mergeStatus(hit.release_status, m.release_status);
      hit.is_bookable = !!(hit.is_bookable || m.is_bookable);
      folded++;
    } else {
      const entry = { ...m, sources: ["district"] };
      out.push(entry);
      if (key && !byTitle.has(key)) byTitle.set(key, entry);
    }
  }

  return { movies: out, folded };
}
