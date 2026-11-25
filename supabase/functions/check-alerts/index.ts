import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

const UA =
  "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Mobile Safari/537.36";
const BMS_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1";

const TZ_OFFSET_MINUTES = 330; // IST

/** District's guest token is generated client-side per request. */
function guestToken(): string {
  let digits = "";
  for (let i = 0; i < 18; i++) digits += Math.floor(Math.random() * 10);
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  let suffix = "";
  for (let i = 0; i < 11; i++) suffix += alphabet[Math.floor(Math.random() * alphabet.length)];
  return `${Date.now()}_${digits}_${suffix}`;
}

/** BMS x-bms-id is made up by the web client: 1.<9 digits>.<epoch_ms>. */
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
// BookMyShow regions: city_code (District-style key) → BMS slug/code
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
    return { status: res.status, body, state: body ? extractInitialState(body) : null, url };
  } catch {
    return { status: 0, body: "", state: null, url };
  }
}

function bmsDynamicData(state: any): any | null {
  const queries = state?.showtimesFunctionalApi?.queries ?? {};
  const key = Object.keys(queries).find((k) => k.startsWith("fetchPrimaryDynamic"));
  return key ? queries[key]?.data?.data ?? null : null;
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

/** Venue name → session count from a showtimes payload. */
function bmsVenuesOf(data: any): { name: string; sessions: number }[] {
  const out: { name: string; sessions: number }[] = [];
  for (const w of data?.showtimeWidgets ?? []) {
    if (w?.type !== "groupList") continue;
    for (const g of w?.data ?? []) {
      for (const c of g?.data ?? []) {
        if (c?.type !== "venue-card") continue;
        const name =
          c?.additionalData?.venueName ??
          c?.header?.data?.components?.[1]?.data?.data?.[0]?.components?.[0]?.text ??
          "Unknown theatre";
        let sessions = 0;
        for (const sec of c?.showtimesSections ?? []) {
          for (const s of sec?.showtimes ?? []) {
            const sid = String(s?.additionalData?.sessionId ?? "");
            if (sid) sessions++;
          }
        }
        out.push({ name: String(name), sessions });
      }
    }
  }
  return out;
}

/** Resolve ET + slug + poster from the city listing (by ET or by title). */
async function bmsResolveMovie(region: BmsRegion, et: string | null, title: string | null) {
  const urls = [
    `https://in.bookmyshow.com/api/explore/v1/discover/movies?city=${encodeURIComponent(region.slug)}&region=${encodeURIComponent(region.code)}`,
    `https://in.bookmyshow.com/api/explore/v1/discover/home/${encodeURIComponent(region.slug)}?region=${encodeURIComponent(region.code)}&embedded=true&lat=${region.lat}&lon=${region.lng}`,
  ];
  const wantEt = et ? et.toUpperCase() : null;
  const wantTitle = title ? bmsNorm(title) : null;
  for (const url of urls) {
    try {
      const res = await fetch(url, { headers: bmsHeaders("application/json"), signal: AbortSignal.timeout(20000) });
      if (!res.ok) continue;
      const json = await res.json().catch(() => null);
      for (const listing of json?.listings ?? []) {
        for (const card of listing?.cards ?? []) {
          const m = String(card?.ctaUrl ?? "").match(/\/movies\/([^/]+)\/([^/]+)\/(ET\d+)/);
          if (!m) continue;
          const cardTitle = (card?.text ?? [])
            .map((t: any) => (t?.components ?? []).map((x: any) => String(x?.text ?? "")).join(""))
            .find((s: string) => s.trim());
          if (wantEt) {
            if (m[3].toUpperCase() === wantEt) {
              return { et: m[3], slug: m[2], citySlug: m[1], title: cardTitle?.trim() ?? null, poster: card?.image?.url ?? null };
            }
          } else if (wantTitle && cardTitle && bmsNorm(cardTitle) === wantTitle) {
            return { et: m[3], slug: m[2], citySlug: m[1], title: cardTitle.trim(), poster: card?.image?.url ?? null };
          }
        }
      }
    } catch {
      /* try next url */
    }
  }
  return null;
}

/**
 * BookMyShow booking-open check.
 * Walks every date chip BMS offers (today + next days) because advance
 * bookings can open for a future date while today has no shows yet.
 */
async function checkBookMyShow(alert: any) {
  const regions = await fetchBmsRegions();
  if (!regions) return { open: false, note: "bms regions unavailable" };

  const region = resolveBmsRegion(regions, String(alert.city_code ?? ""));
  if (!region) return { open: false, note: `bms does not cover ${alert.city_code}` };

  let et = String(alert.source_movie_id ?? "").trim().toUpperCase();
  if (!/^ET\d+$/.test(et)) et = "";
  let slug = String(alert.slug ?? "").trim();

  if (!et || !slug) {
    const found = await bmsResolveMovie(region, et || null, alert.movie_title);
    if (!found) return { open: false, note: "movie not found in BMS listing" };
    et = found.et;
    slug = found.slug;
  }

  const target = String(alert.theater_name ?? "").trim().toLowerCase();
  const todayCode = bmsTodayCode();

  const first = await bmsFetchPage(region.slug, slug, et, todayCode);
  if (first.status === 404 || !first.state) return { open: false, note: "bms page not found" };
  const firstData = bmsDynamicData(first.state);
  if (!firstData) return { open: false, note: "no showtimes payload" };

  const chips = bmsChipsOf(firstData);
  const dates = [...new Set([todayCode, ...chips])].sort().slice(0, 4);

  const bookableUrl = `https://in.bookmyshow.com/movies/${region.slug}/${slug}/${et}`;
  let firstVenueName: string | null = null;

  for (const dateCode of dates) {
    let data = firstData;
    if (dateCode !== todayCode) {
      const page = await bmsFetchPage(region.slug, slug, et, dateCode);
      if (page.status === 404 || !page.state) continue;
      data = bmsDynamicData(page.state);
      if (!data) continue;
    }
    const venues = bmsVenuesOf(data).filter((v) => v.sessions > 0);
    if (!venues.length) continue;
    if (!firstVenueName) firstVenueName = venues[0].name;

    if (!target) {
      return { open: true, theaterName: venues[0].name, bookableUrl };
    }
    const match = venues.find((v) => v.name.toLowerCase().includes(target));
    if (match) return { open: true, theaterName: match.name, bookableUrl };
  }

  return { open: false, note: firstVenueName ? "target theater not on sale yet" : "booking not open yet" };
}

// ---------------------------------------------------------------------------
// District booking-open check
// ---------------------------------------------------------------------------
async function checkDistrict(alert: any) {
  try {
    const contentId = String(alert.source_movie_id ?? "").replace(/^MV/i, "");
    if (!contentId) return { open: false, note: "no district movie id" };
    const today = new Date(Date.now() + TZ_OFFSET_MINUTES * 60000).toISOString().slice(0, 10);
    const q = new URLSearchParams({
      version: "3",
      site_id: "1",
      channel: "mweb",
      child_site_id: "1",
      platform: "district",
      movieCode: "",
      city_key: String(alert.city_code ?? ""),
      content_id: contentId,
      date: today,
      latitude: "0",
      longitude: "0",
      cinemaOrderLogic: "3",
    });

    const res = await fetch(`https://www.district.in/gw/consumer/movies/v5/movie?${q}`, {
      headers: {
        accept: "*/*",
        api_source: "district",
        "x-app-type": "ed_mweb",
        "x-guest-token": guestToken(),
        "user-agent": UA,
      },
      signal: AbortSignal.timeout(15000),
    });

    if (res.status === 204 || res.status === 400 || !res.ok) {
      return { open: false, note: `district http ${res.status}` };
    }

    const data = await res.json().catch(() => null);
    const cinemas = [
      ...(Array.isArray(data?.pageData?.nearbyCinemas) ? data.pageData.nearbyCinemas : []),
      ...(Array.isArray(data?.pageData?.farCinemas) ? data.pageData.farCinemas : []),
    ];
    if (!cinemas.length) return { open: false, note: "no cinemas listed" };

    const target = String(alert.theater_name ?? "").trim().toLowerCase();
    let firstVenueName: string | null = null;

    for (const c of cinemas) {
      const name = String(c?.cinemaInfo?.name || "Unknown theatre");
      const hasSessions = Array.isArray(c?.sessions) && c.sessions.length > 0;
      if (!hasSessions) continue;
      if (!firstVenueName) firstVenueName = name;
      if (!target || name.toLowerCase().includes(target)) {
        return {
          open: true,
          theaterName: name,
          bookableUrl: `https://www.district.in/movies/${data?.meta?.movie?.slug || "movie"}-tickets-MV${contentId}`,
        };
      }
    }
    return { open: false, note: firstVenueName ? "target theater not on sale yet" : "booking not open yet" };
  } catch {
    return { open: false, note: "district check failed" };
  }
}

async function sendTelegramAlert(botToken: string, chatId: number | string, text: string) {
  try {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "Markdown",
        disable_web_page_preview: false,
      }),
    });
    return await res.json();
  } catch (e) {
    console.error("sendTelegramAlert error:", e);
    return null;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Access: cron scheduler (x-cron-secret) or a signed-in user JWT.
    const cronSecret = Deno.env.get("CRON_SECRET");
    const cronHeader = req.headers.get("x-cron-secret");
    let authorized = !!cronSecret && cronHeader === cronSecret;
    if (!authorized) {
      const token = req.headers.get("Authorization")?.replace("Bearer ", "") ?? "";
      if (token) {
        const probe = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
        const { data } = await probe.auth.getUser(token);
        authorized = !!data?.user;
      }
    }
    if (!authorized) {
      return new Response(JSON.stringify({ ok: false, error: "unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN");

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    // All active alerts + profile chat id (telegram_links has no direct FK
    // from alerts, so it is looked up per user below).
    const { data: activeAlerts, error } = await supabaseAdmin
      .from("alerts")
      .select("*, profile:profiles(telegram_chat_id, telegram_username)")
      .eq("is_active", true);

    if (error) throw error;

    let checkedCount = 0;
    let notifiedCount = 0;
    const results: any[] = [];

    for (const alert of activeAlerts || []) {
      checkedCount++;
      let chatId =
        alert.telegram_chat_id ||
        (alert.profile as any)?.telegram_chat_id;
      if (!chatId && alert.user_id) {
        const { data: link } = await supabaseAdmin
          .from("telegram_links")
          .select("telegram_chat_id")
          .eq("user_id", alert.user_id)
          .maybeSingle();
        chatId = link?.telegram_chat_id ?? null;
      }

      const bookingStatus =
        alert.source === "district"
          ? await checkDistrict(alert)
          : await checkBookMyShow(alert);

      const nowIso = new Date().toISOString();

      if (bookingStatus.open) {
        // One notification per alert (booking-open is a one-shot event).
        if (alert.status !== "triggered") {
          if (botToken && chatId) {
            const theaterDisplay = bookingStatus.theaterName || alert.theater_name || "All Theaters";
            const alertMsg =
              `🚨 *TICKETS OPEN NOW!* 🚨\n\n` +
              `🎬 *${alert.movie_title}*\n` +
              `🎭 Theater: *${theaterDisplay}*\n` +
              `📍 City: *${alert.city_name || alert.city_code}*\n` +
              `🎟️ Platform: *${alert.source === "district" ? "District" : "BookMyShow"}*\n` +
              `⚡ Status: *Bookings are officially open!*\n\n` +
              `👉 *Book your seats immediately:*\n${bookingStatus.bookableUrl || "Check platform app/website"}`;

            const sent = await sendTelegramAlert(botToken, chatId, alertMsg);
            if (sent?.ok) notifiedCount++;
          }

          await supabaseAdmin
            .from("alerts")
            .update({
              status: "triggered",
              last_notified_at: nowIso,
              last_checked_at: nowIso,
            })
            .eq("id", alert.id);

          results.push({
            id: alert.id,
            movie: alert.movie_title,
            theater: alert.theater_name || null,
            status: "triggered",
            notified: !!(botToken && chatId),
          });
        } else {
          await supabaseAdmin.from("alerts").update({ last_checked_at: nowIso }).eq("id", alert.id);
          results.push({ id: alert.id, movie: alert.movie_title, status: "already_triggered" });
        }
        continue;
      }

      // Not open yet: keep watching, remember when we last checked.
      await supabaseAdmin.from("alerts").update({ last_checked_at: nowIso }).eq("id", alert.id);

      results.push({
        id: alert.id,
        movie: alert.movie_title,
        theater: alert.theater_name || null,
        status: "watching",
        note: bookingStatus.note ?? null,
      });
    }

    return new Response(
      JSON.stringify({
        ok: true,
        checked: checkedCount,
        notified: notifiedCount,
        results,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ ok: false, error: err?.message || "Check alerts error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
