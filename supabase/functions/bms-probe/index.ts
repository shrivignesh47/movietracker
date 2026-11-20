import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const H = {
  accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "accept-language": "en-IN,en;q=0.9",
  "user-agent":
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1",
  referer: "https://in.bookmyshow.com/",
  "x-app-code": "WEBV2",
  "x-platform-code": "WEB",
  "x-platform": "WEB",
  "x-bms-id": `1.${Math.floor(Math.random() * 9e8 + 1e8)}.${Date.now()}`,
};

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
  try { return JSON.parse(html.slice(braceStart, end + 1)); } catch { return null; }
}

async function grab(url: string, accept = H.accept) {
  const res = await fetch(url, { headers: { ...H, accept }, signal: AbortSignal.timeout(25000) });
  return { status: res.status, body: await res.text() };
}

function showDatesOf(data: any): { codes: string[]; venues: number; shows: number } {
  const codes = new Set<string>();
  let venues = 0, shows = 0;
  for (const w of data?.showtimeWidgets ?? []) {
    if (w.type !== "groupList") continue;
    for (const g of w.data ?? []) for (const c of g.data ?? []) {
      venues++;
      for (const sec of c.showtimesSections ?? []) for (const s of sec.showtimes ?? []) {
        shows++;
        codes.add(String(s.additionalData?.showDateCode));
      }
    }
  }
  return { codes: [...codes], venues, shows };
}

function chipDatesOf(data: any): (string | null)[] {
  return (data?.topStickyWidgets?.[0]?.data ?? []).map((x: any) => x?.cta?.additionalData?.dateCode ?? null);
}

// Region resolver (same algorithm planned for production)
const norm = (s: string) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

function resolveRegion(regions: any[], cityCode: string): any | null {
  const q = norm(cityCode);
  if (!q) return null;
  for (const r of regions) {
    if (norm(r.RegionSlug) === q || String(r.RegionCode).toLowerCase() === String(cityCode).toLowerCase()) return r;
  }
  for (const r of regions) {
    if (norm(r.RegionName) === q) return r;
    if ((r.Alias ?? []).some((a: string) => norm(a) === q)) return r;
  }
  for (const r of regions) {
    const names = [r.RegionName, r.RegionSlug, ...(r.Alias ?? [])].map(norm);
    if (names.some((n) => n.length >= 4 && (n.includes(q) || q.includes(n)))) return r;
  }
  return null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const out: any = {};

    // 1) chip-date fetch: does 20261121 return 20261121's shows?
    const t1 = await grab("https://in.bookmyshow.com/movies/rajapalayam/scene/buytickets/ET00516631/20261121");
    const s1 = extractInitialState(t1.body);
    const q1 = s1?.showtimesFunctionalApi?.queries ?? {};
    const k1 = Object.keys(q1).find((k) => k.startsWith("fetchPrimaryDynamic"));
    const d1 = k1 ? q1[k1]?.data?.data : null;
    out.date20261121 = { key: k1, ...showDatesOf(d1), chips: chipDatesOf(d1) };

    // 2) hyderabad movie, chip date 20261123
    const home = await grab("https://in.bookmyshow.com/api/explore/v1/discover/home/hyderabad?region=HYD&embedded=true", "application/json");
    const hj = JSON.parse(home.body);
    const topW = (hj.listings ?? []).find((l: any) => l.id === "TOP_MOVIES_MOBILE_V2");
    const card = topW?.cards?.[0];
    const m2 = card?.ctaUrl?.match(/\/movies\/([^/]+)\/([^/]+)\/(ET\d+)/);
    if (m2) {
      const [, citySlug, movieSlug, et] = m2;
      const t2 = await grab(`https://in.bookmyshow.com/movies/${citySlug}/${movieSlug}/buytickets/${et}/20261123`);
      const s2 = extractInitialState(t2.body);
      const q2 = s2?.showtimesFunctionalApi?.queries ?? {};
      const k2 = Object.keys(q2).find((k) => k.startsWith("fetchPrimaryDynamic"));
      const d2 = k2 ? q2[k2]?.data?.data : null;
      out.hyd20261123 = { key: k2, ...showDatesOf(d2), chips: chipDatesOf(d2) };
    }

    // 3) region resolver over District-style city keys
    const reg = await grab("https://in.bookmyshow.com/api/explore/v1/discover/regions", "application/json");
    const rj = JSON.parse(reg.body);
    const bm = rj.BookMyShow ?? rj;
    const regions = [...(bm.TopCities ?? []), ...(bm.OtherCities ?? [])];
    const keys = ["hyderabad", "chennai", "bengaluru", "mumbai", "new-delhi", "delhi", "pune", "kochi",
      "ahmedabad", "kolkata", "vijayawada", "visakhapatnam", "vizag", "lucknow", "jaipur",
      "thiruvananthapuram", "coimbatore", "madurai", "nagpur", "indore", "surat", "vadodara",
      "chandigarh", "bhopal", "patna", "guwahati", "ranchi", "raipur", "dehradun", "mysuru",
      "mangaluru", "thrissur", "kozhikode", "tirupati", "warangal", "nellore", "guntur",
      "rajahmundry", "tirupati", "srilankam", "pondicherry", "puducherry", "gaya", "tirunelveli",
      "salem", "erode", "karur", "theni", "kanchipuram", "nellore", "khammam", "nizamabad",
      "rajapalayam", "virudhunagar", "kumarapuram", "kumbakonam", "thanjavur"];
    out.regionMatches = {};
    out.regionMisses = [];
    for (const k of keys) {
      const r = resolveRegion(regions, k);
      if (r) out.regionMatches[k] = `${r.RegionSlug}/${r.RegionCode}/${r.RegionName}`;
      else out.regionMisses.push(k);
    }
    out.regionTotal = regions.length;

    return new Response(JSON.stringify(out, null, 1), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: String(err?.message ?? err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
