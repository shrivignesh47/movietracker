import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const UA =
  "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Mobile Safari/537.36";

/**
 * City keys verified working against District's showtimes API
 * (/gw/consumer/movies/v5/movie returns cinemas for these keys).
 * Used as the instant list before/while the live search runs.
 */
const CITIES = [
  { code: "hyderabad", name: "Hyderabad" },
  { code: "chennai", name: "Chennai" },
  { code: "bengaluru", name: "Bengaluru" },
  { code: "mumbai", name: "Mumbai" },
  { code: "new-delhi", name: "Delhi" },
  { code: "pune", name: "Pune" },
  { code: "kochi", name: "Kochi" },
  { code: "ahmedabad", name: "Ahmedabad" },
  { code: "kolkata", name: "Kolkata" },
  { code: "vijayawada", name: "Vijayawada" },
  { code: "visakhapatnam", name: "Visakhapatnam" },
  { code: "warangal", name: "Warangal" },
  { code: "tirupati", name: "Tirupati" },
  { code: "nizamabad", name: "Nizamabad" },
  { code: "karimnagar", name: "Karimnagar" },
  { code: "guntur", name: "Guntur" },
  { code: "khammam", name: "Khammam" },
  { code: "nellore", name: "Nellore" },
  { code: "rajahmundry", name: "Rajahmundry" },
  { code: "kurnool", name: "Kurnool" },
  { code: "secunderabad", name: "Secunderabad" },
  { code: "coimbatore", name: "Coimbatore" },
  { code: "madurai", name: "Madurai" },
  { code: "trichy", name: "Trichy" },
  { code: "salem", name: "Salem" },
  { code: "erode", name: "Erode" },
  { code: "tirupur", name: "Tirupur" },
  { code: "vellore", name: "Vellore" },
  { code: "puducherry", name: "Puducherry" },
  { code: "thrissur", name: "Thrissur" },
  { code: "thiruvananthapuram", name: "Thiruvananthapuram" },
  { code: "kozhikode", name: "Kozhikode" },
  { code: "kannur", name: "Kannur" },
  { code: "kollam", name: "Kollam" },
  { code: "palakkad", name: "Palakkad" },
  { code: "nagpur", name: "Nagpur" },
  { code: "indore", name: "Indore" },
  { code: "bhopal", name: "Bhopal" },
  { code: "jaipur", name: "Jaipur" },
  { code: "lucknow", name: "Lucknow" },
  { code: "kanpur", name: "Kanpur" },
  { code: "varanasi", name: "Varanasi" },
  { code: "agra", name: "Agra" },
  { code: "surat", name: "Surat" },
  { code: "vadodara", name: "Vadodara" },
  { code: "rajkot", name: "Rajkot" },
  { code: "bhavnagar", name: "Bhavnagar" },
  { code: "chandigarh", name: "Chandigarh" },
  { code: "ludhiana", name: "Ludhiana" },
  { code: "amritsar", name: "Amritsar" },
  { code: "jalandhar", name: "Jalandhar" },
  { code: "dehradun", name: "Dehradun" },
  { code: "srinagar", name: "Srinagar" },
  { code: "jammu", name: "Jammu" },
  { code: "shimla", name: "Shimla" },
  { code: "guwahati", name: "Guwahati" },
  { code: "patna", name: "Patna" },
  { code: "ranchi", name: "Ranchi" },
  { code: "bhubaneswar", name: "Bhubaneswar" },
  { code: "cuttack", name: "Cuttack" },
  { code: "howrah", name: "Howrah" },
  { code: "siliguri", name: "Siliguri" },
  { code: "jamshedpur", name: "Jamshedpur" },
  { code: "raipur", name: "Raipur" },
  { code: "goa", name: "Goa" },
  { code: "panaji", name: "Panaji" },
  { code: "udaipur", name: "Udaipur" },
  { code: "jodhpur", name: "Jodhpur" },
  { code: "ajmer", name: "Ajmer" },
  { code: "bikaner", name: "Bikaner" },
  { code: "mysuru", name: "Mysuru" },
  { code: "mangalore", name: "Mangaluru" },
  { code: "hubli", name: "Hubballi" },
  { code: "gulbarga", name: "Gulbarga" },
  { code: "tumkur", name: "Tumkur" },
  { code: "shivamogga", name: "Shivamogga" },
  { code: "nashik", name: "Nashik" },
  { code: "aurangabad", name: "Aurangabad" },
  { code: "kolhapur", name: "Kolhapur" },
  { code: "thane", name: "Thane" },
  { code: "noida", name: "Noida" },
  { code: "faridabad", name: "Faridabad" },
  { code: "ghaziabad", name: "Ghaziabad" },
  { code: "meerut", name: "Meerut" },
  { code: "prayagraj", name: "Prayagraj" },
  { code: "bareilly", name: "Bareilly" },
  { code: "gorakhpur", name: "Gorakhpur" },
  { code: "aligarh", name: "Aligarh" },
  { code: "moradabad", name: "Moradabad" },
  { code: "rourkela", name: "Rourkela" },
  { code: "dhanbad", name: "Dhanbad" },
  { code: "gwalior", name: "Gwalior" },
  { code: "kota", name: "Kota" },
  { code: "kanchipuram", name: "Kanchipuram" },
  { code: "silchar", name: "Silchar" },
  { code: "dibrugarh", name: "Dibrugarh" },
  { code: "agartala", name: "Agartala" },
  { code: "leh", name: "Leh" },
  { code: "vizag", name: "Vizag" },
];

/**
 * District's location-search titles don't always match the city_key its
 * showtimes API accepts (verified by probing). Map the slugified title
 * to the working key.
 */
const KEY_ALIASES: Record<string, string> = {
  "delhi-ncr": "new-delhi",
  "delhi": "new-delhi",
  "mangaluru": "mangalore",
  "hubballi": "hubli",
  "bengaluru": "bengaluru",
  "mysore": "mysuru",
  "cochin": "kochi",
  "calicut": "kozhikode",
  "pondicherry": "puducherry",
  "bangalore": "bengaluru",
};

function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function cityKeyFromTitle(title: string): string {
  const slug = slugify(title);
  return KEY_ALIASES[slug] ?? slug;
}

/**
 * Live city search via District's own location endpoint — returns every
 * Indian city District knows about (not just a hardcoded list).
 */
async function searchDistrictCities(query: string) {
  const res = await fetch("https://www.district.in/gw/web/get_location_search", {
    method: "POST",
    headers: {
      accept: "application/json",
      "accept-language": "en-IN,en;q=0.9",
      "content-type": "application/json",
      "api_source": "district",
      "x-app-type": "ed_mweb",
      "x-guest-token": `${Date.now()}_${Math.floor(Math.random() * 1e18)}_${Math.random().toString(36).slice(2, 13)}`,
      "x-request-id": crypto.randomUUID(),
      "user-agent": UA,
      origin: "https://www.district.in",
      referer: "https://www.district.in/",
    },
    body: JSON.stringify({ searched_text: query }),
    signal: AbortSignal.timeout(12000),
  });
  if (!res.ok) return [];
  const data = await res.json().catch(() => null);
  const entities: any[] = Array.isArray(data?.entities) ? data.entities : [];

  const seen = new Set<string>();
  const out: any[] = [];
  for (const e of entities) {
    if (e?.entity_type !== "LOCATION_ENTITY_TYPE_CITY" || !e?.title) continue;
    const code = cityKeyFromTitle(String(e.title));
    if (!code || seen.has(code)) continue;
    seen.add(code);
    out.push({
      code,
      name: String(e.title),
      subtitle: e.subtitle ?? null,
      lat: typeof e.lat === "number" ? e.lat : null,
      lng: typeof e.long === "number" ? e.long : null,
    });
    if (out.length >= 8) break;
  }
  return out;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { q = "" } = await req.json().catch(() => ({}));
    const query = String(q ?? "").trim();

    if (query) {
      // Live search: District's full city database + local matches as fallback
      const live = await searchDistrictCities(query).catch(() => []);
      const ql = query.toLowerCase();
      const local = CITIES.filter(
        (c) => c.name.toLowerCase().includes(ql) && !live.some((l) => l.code === c.code)
      ).slice(0, 6);
      const cities = [...live, ...local].slice(0, 12);
      return new Response(
        JSON.stringify({ ok: true, cities, live: live.length > 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // No query: instant full list (no network hop needed to render the dropdown)
    return new Response(
      JSON.stringify({ ok: true, cities: CITIES, live: false }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ ok: false, error: err?.message ?? "unknown error", cities: CITIES }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
