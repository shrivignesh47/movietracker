import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const UA =
  "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Mobile Safari/537.36";
const BMS_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1";
const TZ_OFFSET_MINUTES = 330; // IST

// City table shared with scrape-cities (District requires lat/lng on every call).
const CITIES: Record<string, { lat: number; lng: number; name: string }> = {
  hyderabad: { lat: 17.385, lng: 78.4867, name: "Hyderabad" },
  chennai: { lat: 13.0827, lng: 80.2707, name: "Chennai" },
  bengaluru: { lat: 12.9716, lng: 77.5946, name: "Bengaluru" },
  mumbai: { lat: 19.076, lng: 72.8777, name: "Mumbai" },
  delhi: { lat: 28.6139, lng: 77.209, name: "Delhi" },
  pune: { lat: 18.5204, lng: 73.8567, name: "Pune" },
  kochi: { lat: 9.9312, lng: 76.2673, name: "Kochi" },
  ahmedabad: { lat: 23.0225, lng: 72.5714, name: "Ahmedabad" },
};

function guestToken(): string {
  let digits = "";
  for (let i = 0; i < 18; i++) digits += Math.floor(Math.random() * 10);
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  let suffix = "";
  for (let i = 0; i < 11; i++) suffix += alphabet[Math.floor(Math.random() * alphabet.length)];
  return `${Date.now()}_${digits}_${suffix}`;
}

function bmsId(): string {
  return `1.${Math.floor(Math.random() * 9e8 + 1e8)}.${Date.now()}`;
}

/** Today's date in IST as YYYY-MM-DD. */
function istToday(): string {
  return new Date(Date.now() + TZ_OFFSET_MINUTES * 60000).toISOString().slice(0, 10);
}

/** District's showTime is UTC without a zone suffix; convert to IST wall-clock. */
function istTime(utc: string): string {
  const d = new Date(`${utc}Z`);
  if (Number.isNaN(d.getTime())) return utc;
  const ist = new Date(d.getTime() + TZ_OFFSET_MINUTES * 60000);
  let h = ist.getUTCHours();
  const m = ist.getUTCMinutes();
  const ap = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${h}:${String(m).padStart(2, "0")} ${ap}`;
}

function fmtDuration(mins: unknown): string | null {
  const n = Number(mins);
  if (!n || Number.isNaN(n)) return null;
  const h = Math.floor(n / 60);
  const m = n % 60;
  return h ? `${h}h${m ? ` ${m}m` : ""}` : `${m}m`;
}

function money(n: unknown): number | null {
  const v = Number(n);
  return Number.isFinite(v) && v > 0 ? Math.round(v) : null;
}

/** One showtime call. 204 / empty body = not open for that date. */
async function fetchShowtimes(contentId: string, cityKey: string, date: string) {
  // lat/lng are cosmetic (city_key alone decides which cinemas come back —
  // verified: 0,0 returns the same set), so unknown cities just send 0,0.
  const city = CITIES[cityKey] ?? { lat: 0, lng: 0, name: cityKey };
  const q = new URLSearchParams({
    version: "3",
    site_id: "1",
    channel: "mweb",
    child_site_id: "1",
    platform: "district",
    movieCode: "",
    city_key: cityKey,
    content_id: contentId,
    date,
    latitude: String(city.lat),
    longitude: String(city.lng),
    cinemaOrderLogic: "3",
  });
  const res = await fetch(`https://www.district.in/gw/consumer/movies/v5/movie?${q}`, {
    headers: {
      accept: "*/*",
      "accept-language": "en-IN,en;q=0.9",
      api_source: "district",
      "x-app-type": "ed_mweb",
      "x-guest-token": guestToken(),
      "x-request-id": crypto.randomUUID(),
      "user-agent": UA,
    },
    signal: AbortSignal.timeout(20000),
  });
  if (res.status === 204) return { status: 204, data: null };
  if (res.status === 400) {
    const body = await res.json().catch(() => null);
    // code 32 = "content not found" → announced but not listed yet, not a fault
    return { status: 400, data: body, notListed: body?.code === 32 };
  }
  if (!res.ok) return { status: res.status, data: null };
  return { status: 200, data: await res.json().catch(() => null) };
}

/** Seat tiers live per session in `areas`. */
function tiersOf(session: any): string {
  const areas = Array.isArray(session?.areas) ? session.areas : [];
  return areas
    .map((a: any) => {
      const price = money(a?.price);
      const label = a?.label ?? a?.code ?? "Seat";
      const pricePart = price ? `₹${price}` : "";
      const avail =
        typeof a?.sAvail === "number" && typeof a?.sTotal === "number"
          ? ` (${a.sAvail}/${a.sTotal})`
          : "";
      return `${label} ${pricePart}${avail}`.replace(/\s+/g, " ").trim();
    })
    .filter(Boolean)
    .join(" · ");
}

function minPrice(session: any): number | null {
  const areas = Array.isArray(session?.areas) ? session.areas : [];
  const prices = areas.map((a: any) => money(a?.price)).filter((p: number | null) => p !== null);
  return prices.length ? Math.min(...prices) : null;
}

function sessionsOf(cinema: any) {
  const list = Array.isArray(cinema?.sessions) ? cinema.sessions : [];
  return list
    .map((s: any) => ({
      sid: String(s?.sid ?? ""),
      time: istTime(String(s?.showTime ?? "")),
      iso: s?.showTime ?? null,
      format: String(s?.scrnFmt ?? ""),
      audi: String(s?.audi ?? ""),
      subtitle: s?.subtitle ?? null,
      price: minPrice(s),
      avail: typeof s?.avail === "number" ? s.avail : null,
      total: typeof s?.total === "number" ? s.total : null,
      color: s?.statusColor ?? null,
      tiers: tiersOf(s),
    }))
    .filter((s: any) => s.sid);
}

function theatersOf(data: any) {
  const cinemas = [
    ...(Array.isArray(data?.pageData?.nearbyCinemas) ? data.pageData.nearbyCinemas : []),
    ...(Array.isArray(data?.pageData?.farCinemas) ? data.pageData.farCinemas : []),
  ];
  return cinemas
    .map((c: any) => {
      const info = c?.cinemaInfo ?? {};
      return {
        id: String(c?.id ?? info?.providerId ?? ""),
        name: info?.name ?? "Unknown theatre",
        address: info?.address ?? "",
        chain: info?.chainKey ?? info?.theaterGroupName ?? null,
        city: info?.city ?? null,
        distance: typeof c?.distanceFromUser === "number" ? c.distanceFromUser : null,
        sessions: sessionsOf(c),
      };
    })
    .filter((t: any) => t.sessions.length > 0)
    .sort((a: any, b: any) => (a.distance ?? 99) - (b.distance ?? 99));
}

function movieMeta(data: any, contentId: string, slug: string | null, cityCode: string) {
  const m = data?.meta?.movie ?? {};
  const mvId = contentId.startsWith("MV") ? contentId : `MV${contentId}`;
  const bookableUrl = slug
    ? `https://www.district.in/movies/${slug}-movie-tickets-${mvId}`
    : null;
  return {
    title: m?.name ?? null,
    poster_url: m?.poster ?? null,
    language: m?.primary_language ?? null,
    languages: Array.isArray(m?.languages) ? m.languages : [],
    genre: Array.isArray(m?.genre) ? m.genre.join(", ") : null,
    duration: fmtDuration(m?.duration),
    release_date: m?.release_date ?? null,
    censor: m?.censor ?? null,
    description: m?.description ?? null,
    trailer: m?.heroTrailer ?? null,
    city_code: cityCode,
    source: "district",
    source_movie_id: mvId,
    is_bookable: true,
    bookable_url: bookableUrl,
  };
}

// ---------------------------------------------------------------------------
// BookMyShow showtimes — buytickets page HTML carries the full showtimes
// payload in window.__INITIAL_STATE__ (verified reachable from edge IPs).
// ---------------------------------------------------------------------------

type BmsRegion = { code: string; slug: string; name: string; lat: string; lng: string; aliases: string[] };

let bmsRegionCache: { regions: BmsRegion[]; at: number } | null = null;
const BMS_REGION_TTL = 6 * 60 * 60 * 1000; // 6h

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

/** Today's date in IST as BMS dateCode (YYYYMMDD). */
function bmsTodayCode(): string {
  return new Date(Date.now() + TZ_OFFSET_MINUTES * 60000).toISOString().slice(0, 10).replace(/-/g, "");
}

/** Extract window.__INITIAL_STATE__ JSON via string-aware brace matching. */
function extractInitialState(html: string): any | null {
  const startIdx = html.indexOf("window.__INITIAL_STATE__");
  if (startIdx === -1) return null;
  const braceStart = html.indexOf("{", startIdx);
  if (braceStart === -1) return null;
  let depth = 0, end = -1, inStr = false, esc = false;
  for (let i = braceStart; i < html.length; i++) {
    const ch = html[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) { end = i; break; }
    }
  }
  if (end <= braceStart) return null;
  try {
    return JSON.parse(html.slice(braceStart, end + 1));
  } catch {
    return null;
  }
}

async function bmsFetchPage(regionSlug: string, movieSlug: string, et: string, dateCode: string) {
  const url = `https://in.bookmyshow.com/movies/${regionSlug}/${movieSlug}/buytickets/${et}/${dateCode}`;
  try {
    const res = await fetch(url, {
      headers: bmsHeaders("text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"),
      signal: AbortSignal.timeout(25000),
    });
    const body = res.status === 200 ? await res.text() : "";
    return { status: res.status, body, state: body ? extractInitialState(body) : null };
  } catch (err) {
    return { status: 0, body: "", state: null, error: String(err?.message ?? err) };
  }
}

/** Find the movie's slug + poster + meta by ET code in the city's listing. */
async function bmsFindMovie(region: BmsRegion, et: string) {
  const urls = [
    `https://in.bookmyshow.com/api/explore/v1/discover/movies?city=${encodeURIComponent(region.slug)}&region=${encodeURIComponent(region.code)}`,
    `https://in.bookmyshow.com/api/explore/v1/discover/home/${encodeURIComponent(region.slug)}?region=${encodeURIComponent(region.code)}&embedded=true&lat=${region.lat}&lon=${region.lng}`,
  ];
  for (const url of urls) {
    try {
      const res = await fetch(url, { headers: bmsHeaders("application/json"), signal: AbortSignal.timeout(20000) });
      if (!res.ok) continue;
      const json = await res.json().catch(() => null);
      for (const listing of json?.listings ?? []) {
        for (const card of listing?.cards ?? []) {
          const m = String(card?.ctaUrl ?? "").match(/\/movies\/([^/]+)\/([^/]+)\/(ET\d+)/);
          if (!m || m[3].toUpperCase() !== et) continue;
          const title = (card?.text ?? [])
            .map((t: any) => (t?.components ?? []).map((x: any) => String(x?.text ?? "")).join(""))
            .find((s: string) => s.trim());
          const genreRaw = String(card?.analytics?.genre ?? "").trim();
          const langRaw = String(card?.analytics?.language ?? "").trim();
          return {
            slug: m[2],
            poster: card?.image?.url ?? null,
            title: title?.trim() ?? null,
            language: langRaw ? langRaw.charAt(0).toUpperCase() + langRaw.slice(1) : null,
            genre: genreRaw ? genreRaw.split("|").filter(Boolean).map((g) => g.charAt(0).toUpperCase() + g.slice(1)).join(", ") : null,
          };
        }
      }
    } catch {
      /* try next url */
    }
  }
  return null;
}

const BMS_CHAINS = [
  "pvr", "inox", "cinepolis", "miraj", "abirami", "vetri", "mayajaal", "asian",
  "sfs", "carnival", "wave", "panorama", "big cinemas", "gaiety", "regal", "satyam",
];

function bmsChainOf(name: string): string | null {
  const prefix = name.split(":")[0].trim().toLowerCase();
  return BMS_CHAINS.some((c) => prefix === c || prefix.startsWith(`${c} `))
    ? name.split(":")[0].trim()
    : null;
}

/** Seat tiers + min price + sold-out detection from the bottom-sheet widgets. */
function bmsSeatInfo(widgets: any[]) {
  const seatWs = widgets.filter((w) => String(w?.layoutId ?? "").startsWith("seat-category"));
  let price: number | null = null;
  const tiers: string[] = [];
  let soldOut = false;
  if (seatWs.length) {
    soldOut = seatWs.every((w) =>
      /sold|unavailable/i.test(String(w?.layoutId ?? "") + String(w?.variableData?.seatAvalibility ?? ""))
    );
    for (const w of seatWs) {
      const vd = w?.variableData ?? {};
      const n = Number(String(vd.seatCost ?? "").replace(/[^\d.]/g, ""));
      const label = String(vd.seatType ?? "").trim();
      if (Number.isFinite(n) && n > 0) {
        const rounded = Math.round(n);
        if (price === null || rounded < price) price = rounded;
        tiers.push(`${label || "Seat"} ₹${rounded}`);
      } else if (label) {
        tiers.push(label);
      }
    }
  }
  return { price, tiers: tiers.join(" · "), soldOut };
}

function bmsTheatersOf(data: any) {
  const cards: any[] = [];
  for (const w of data?.showtimeWidgets ?? []) {
    if (w?.type !== "groupList") continue;
    for (const g of w?.data ?? []) {
      for (const c of g?.data ?? []) if (c?.type === "venue-card") cards.push(c);
    }
  }
  const showCodes = new Set<string>();
  const theaters = cards
    .map((c) => {
      const name =
        c?.additionalData?.venueName ??
        c?.header?.data?.components?.[1]?.data?.data?.[0]?.components?.[0]?.text ??
        "Unknown theatre";
      const id = String(c?.additionalData?.venueCode ?? c?.id ?? "");
      const sessions: any[] = [];
      for (const sec of c?.showtimesSections ?? []) {
        for (const s of sec?.showtimes ?? []) {
          const ad = s?.additionalData ?? {};
          if (ad.showDateCode) showCodes.add(String(ad.showDateCode));
          const sid = String(ad.sessionId ?? "");
          if (!sid) continue;
          const widgets = s?.customGestureCTA?.additionalData?.bottomSheetData?.widgets ?? [];
          const fmtStr = String(widgets.find((w: any) => w?.layoutId === "format-container")?.variableData?.format ?? "");
          const segs = fmtStr.split("|").map((x: string) => x.trim()).filter(Boolean);
          const bits = (segs[0] ?? "").split("•").map((x: string) => x.trim()).filter(Boolean);
          const format = bits.slice(1).join(" • ") || null;
          const audi = segs[1] || ad.attributes || s.screenAttr || null;
          const { price, tiers, soldOut } = bmsSeatInfo(widgets);
          sessions.push({
            sid,
            time: ad.showTime || s.title || "",
            iso: null,
            format,
            audi,
            subtitle: null,
            price,
            avail: soldOut ? 0 : null,
            total: soldOut ? 1 : null,
            color: null,
            tiers,
          });
        }
      }
      return {
        id: id || `bms_${name}`,
        name: String(name),
        address: "",
        chain: bmsChainOf(String(name)),
        city: null,
        distance: null,
        sessions,
      };
    })
    .filter((t) => t.sessions.length > 0);
  return { theaters, showCodes: [...showCodes] };
}

function bmsChipsOf(data: any): string[] {
  const raw: string[] = [];
  for (const sticky of data?.topStickyWidgets ?? []) {
    for (const item of sticky?.data ?? []) {
      const code = String(item?.cta?.additionalData?.dateCode ?? "");
      if (/^\d{8}$/.test(code)) raw.push(code);
    }
  }
  return [...new Set(raw)].sort();
}

const codeToIso = (c: string) => `${c.slice(0, 4)}-${c.slice(4, 6)}-${c.slice(6, 8)}`;

async function bmsShowtimesResponse(params: { movie_id: any; city_code: any; date: any; slug: any }) {
  const et = String(params.movie_id ?? "").trim().toUpperCase();
  if (!/^ET\d+$/.test(et)) {
    return new Response(
      JSON.stringify({ ok: false, error: "movie_id must be a BookMyShow event code (ET…)", theaters: [] }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const regions = await fetchBmsRegions();
  if (!regions) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: "BookMyShow regions endpoint unavailable",
        movie: null, theaters: [], showDates: [],
      }),
      { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
  const region = resolveBmsRegion(regions, String(params.city_code ?? ""));
  if (!region) {
    return new Response(
      JSON.stringify({
        ok: true,
        notListed: true,
        note: `BookMyShow doesn't cover ${params.city_code} yet.`,
        movie: null, theaters: [], showDates: [],
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const cityCode = String(params.city_code ?? "");
  const requestedCode = /^\d{4}-\d{2}-\d{2}$/.test(String(params.date ?? ""))
    ? String(params.date).replace(/-/g, "")
    : bmsTodayCode();

  // Poster/slug lookup (also needed when the frontend didn't pass a slug)
  const listing = await bmsFindMovie(region, et);
  let movieSlug = String(params.slug ?? "").trim() || listing?.slug || "";
  if (!movieSlug) {
    return new Response(
      JSON.stringify({
        ok: true,
        notListed: true,
        note: "This movie isn't listed on BookMyShow for this city yet.",
        movie: null, theaters: [], showDates: [],
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  let page = await bmsFetchPage(region.slug, movieSlug, et, requestedCode);
  if (page.status === 403 || page.status === 401) {
    return new Response(
      JSON.stringify({
        ok: true,
        blocked: true,
        note: `BookMyShow returned ${page.status} (Cloudflare rate-limit). Try again in a minute.`,
        movie: null, theaters: [], showDates: [],
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
  // Wrong slug → retry once with the canonical one from the listing
  if ((page.status === 404 || !page.state) && listing?.slug && listing.slug !== movieSlug) {
    movieSlug = listing.slug;
    page = await bmsFetchPage(region.slug, movieSlug, et, requestedCode);
  }
  if (page.status === 404 || !page.state) {
    return new Response(
      JSON.stringify({
        ok: true,
        notListed: true,
        note: "BookMyShow has no showtimes for this movie in this city yet.",
        movie: null, theaters: [], showDates: [],
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
  if (page.status !== 200) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: `BookMyShow HTTP ${page.status}`,
        movie: null, theaters: [], showDates: [],
      }),
      { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const queries = page.state?.showtimesFunctionalApi?.queries ?? {};
  const dynKey = Object.keys(queries).find((k) => k.startsWith("fetchPrimaryDynamic"));
  let data = dynKey ? queries[dynKey]?.data?.data ?? null : null;

  let parsed = data ? bmsTheatersOf(data) : { theaters: [], showCodes: [] };
  let chips = data ? bmsChipsOf(data) : [];
  let usedCode = requestedCode;

  if (chips.length && !chips.includes(requestedCode)) {
    // BMS silently falls back to the nearest date for non-chip dates — ask for
    // a date it actually offers instead.
    const target = chips.find((c) => c >= requestedCode) ?? chips[0];
    if (target) {
      if (parsed.showCodes.includes(target)) {
        usedCode = target; // the page already fell back to the target date
      } else {
        const retry = await bmsFetchPage(region.slug, movieSlug, et, target);
        const rq = retry.state?.showtimesFunctionalApi?.queries ?? {};
        const rk = Object.keys(rq).find((k) => k.startsWith("fetchPrimaryDynamic"));
        const rdata = rk ? rq[rk]?.data?.data ?? null : null;
        if (rdata) {
          const rp = bmsTheatersOf(rdata);
          if (rp.theaters.length) {
            data = rdata;
            parsed = rp;
            chips = bmsChipsOf(rdata);
          }
        }
        usedCode = target;
      }
    }
  } else if (chips.includes(requestedCode) && parsed.showCodes.length && !parsed.showCodes.includes(requestedCode)) {
    // Requested a valid chip date but BMS served another date's shows — be
    // honest: no shows for the requested date (chips let the user pick again).
    parsed = { theaters: [], showCodes: parsed.showCodes };
  }

  // Movie metadata from the buytickets page state
  const header = data?.header ?? {};
  const analytics = data?.metadata?.analytics ?? {};
  const rawDuration = String(header?.subtitle?.text ?? "").replace(/^Movie runtime:\s*/i, "").trim();
  const genreRaw = String(header?.additionalData?.genre ?? analytics?.genre ?? "").trim();
  const movie = {
    title: header?.title?.text ?? listing?.title ?? null,
    poster_url: listing?.poster ?? null,
    language: analytics?.language ?? listing?.language ?? null,
    genre: genreRaw ? genreRaw.split("|").filter(Boolean).join(", ") : listing?.genre ?? null,
    duration: rawDuration || null,
    release_date: null,
    censor: header?.additionalData?.eventCensor ?? null,
    description: null,
    trailer: null,
    city_code: cityCode,
    source: "bookmyshow",
    source_movie_id: et,
    is_bookable: true,
    bookable_url: `https://in.bookmyshow.com/movies/${region.slug}/${movieSlug}/${et}`,
  };

  const showDates = [...new Set([...chips.map(codeToIso), codeToIso(usedCode)])].sort();
  const theaters = parsed.theaters;

  return new Response(
    JSON.stringify({
      ok: true,
      blocked: false,
      date: codeToIso(usedCode),
      showDates,
      movie,
      theaters,
      stats: {
        cinemaCount: theaters.length,
        sessionCount: theaters.reduce((n: number, t: any) => n + t.sessions.length, 0),
      },
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const {
      source = "district",
      movie_id = "",
      city_code = "hyderabad",
      date = null,
      slug = null,
    } = await req.json().catch(() => ({}));

    if (source === "bookmyshow") {
      return await bmsShowtimesResponse({ movie_id, city_code, date, slug });
    }

    const contentId = String(movie_id).replace(/^MV/i, "").trim();
    if (!contentId) {
      return new Response(
        JSON.stringify({ ok: false, error: "movie_id is required", theaters: [] }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Accept any District city key (free-text city search), not just the
    // built-in table — District validates the key and answers 204 if unknown.
    const rawKey = String(city_code ?? "").trim().toLowerCase();
    const cityKey = /^[a-z0-9][a-z0-9-]*$/.test(rawKey) ? rawKey : "hyderabad";
    const requestedDate = /^\d{4}-\d{2}-\d{2}$/.test(String(date ?? "")) ? String(date) : istToday();

    let result = await fetchShowtimes(contentId, cityKey, requestedDate);
    let usedDate = requestedDate;

    // Not open today (or no shows listed): fall back to the first date the API offers.
    const noShows =
      result.status !== 200 ||
      theatersOf(result.data).length === 0;

    if (noShows && result.status === 200) {
      const showDates: string[] = Array.isArray(result.data?.meta?.showDates)
        ? result.data.meta.showDates
        : [];
      const releaseDate = result.data?.meta?.movie?.release_date;
      const candidates = [...new Set([...showDates, releaseDate])]
        .filter((d: any) => typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d) && d > requestedDate)
        .sort();

      for (const candidate of candidates.slice(0, 3)) {
        const retry = await fetchShowtimes(contentId, cityKey, candidate);
        if (retry.status === 200 && theatersOf(retry.data).length > 0) {
          result = retry;
          usedDate = candidate;
          break;
        }
        if (retry.status === 200 && retry.data) result = retry; // keep richest metadata
      }
    }

    if (result.status === 400 && result.notListed) {
      return new Response(
        JSON.stringify({
          ok: true,
          notListed: true,
          note: "This movie isn't listed for shows yet. We'll have data once bookings open.",
          movie: null,
          theaters: [],
          showDates: [],
          date: usedDate,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (result.status === 204) {
      // District recognised the request but has nothing for this movie+city
      // (invalid city key or no cinemas showing it here).
      return new Response(
        JSON.stringify({
          ok: true,
          notListed: true,
          note: "District has no showtimes for this movie in this city yet.",
          movie: null,
          theaters: [],
          showDates: [],
          date: usedDate,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (result.status !== 200 || !result.data) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: `District HTTP ${result.status}`,
          movie: null,
          theaters: [],
          showDates: [],
        }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const theaters = theatersOf(result.data);
    const showDates: string[] = Array.isArray(result.data?.meta?.showDates)
      ? [...result.data.meta.showDates].sort()
      : [];

    return new Response(
      JSON.stringify({
        ok: true,
        blocked: false,
        date: usedDate,
        showDates,
        movie: movieMeta(result.data, contentId, slug, cityKey),
        theaters,
        stats: {
          cinemaCount: theaters.length,
          sessionCount: theaters.reduce((n: number, t: any) => n + t.sessions.length, 0),
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: err?.message ?? "unknown error",
        movie: null,
        theaters: [],
        showDates: [],
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
