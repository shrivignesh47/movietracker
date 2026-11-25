const UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1";
const DUA = "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Mobile Safari/537.36";
const bmsId = () => `1.${Math.floor(Math.random() * 9e8 + 1e8)}.${Date.now()}`;
const H = (a) => ({
  accept: a, "accept-language": "en-IN,en;q=0.9", "user-agent": UA,
  referer: "https://in.bookmyshow.com/", "x-app-code": "WEBV2",
  "x-platform-code": "WEB", "x-platform": "WEB", "x-bms-id": bmsId(),
});
function guestToken() {
  let d = ""; for (let i = 0; i < 18; i++) d += Math.floor(Math.random() * 10);
  const a = "abcdefghijklmnopqrstuvwxyz0123456789"; let s = "";
  for (let i = 0; i < 11; i++) s += a[Math.floor(Math.random() * a.length)];
  return `${Date.now()}_${d}_${s}`;
}

(async () => {
  // 1) Chennai listing: is Ramayana present, any language grouping?
  const res = await fetch("https://in.bookmyshow.com/api/explore/v1/discover/movies?city=chennai&region=MAA", {
    headers: H("application/json"), signal: AbortSignal.timeout(20000),
  });
  const j = await res.json();
  console.log("=== chennai listing: Ramayana cards ===");
  for (const listing of j?.listings ?? []) {
    console.log(` listing keys: ${Object.keys(listing).join(",")} title=${JSON.stringify(listing.title ?? listing.name ?? null)}`);
    for (const card of listing?.cards ?? []) {
      const cta = String(card?.ctaUrl ?? "");
      const m = cta.match(/\/movies\/([^/]+)\/([^/]+)\/(ET\d+)/);
      if (!m) continue;
      const title = (card?.text ?? []).map((t) => (t?.components ?? []).map((c) => String(c?.text ?? "")).join("")).find((s) => s.trim());
      if (!/ramayana/i.test(String(title))) continue;
      console.log(`  CARD "${title}" et=${m[3]} slug=${m[2]} lang=${JSON.stringify(card?.analytics?.language)} tags=${JSON.stringify(card?.tags ?? null)} cardDivisions=${JSON.stringify(card?.cardDivisions ?? null).slice(0,400)}`);
    }
  }

  // 2) Multi-language movie: collect distinct session languages across a metro
  function extract(html) {
    const i = html.indexOf("window.__INITIAL_STATE__"); if (i === -1) return null;
    const s = html.indexOf("{", i); let d = 0, end = -1, inStr = false, esc = false;
    for (let k = s; k < html.length; k++) { const c = html[k];
      if (inStr) { if (esc) esc = false; else if (c === "\\") esc = true; else if (c === '"') inStr = false; continue; }
      if (c === '"') inStr = true; else if (c === "{") d++; else if (c === "}") { d--; if (d === 0) { end = k; break; } } }
    if (end <= s) return null;
    try { return JSON.parse(html.slice(s, end + 1)); } catch { return null; }
  }
  for (const [region, slug, et, date] of [["mumbai","ramayana","ET00451914","20261125"],["bengaluru","avengers-doomsday","ET00439706","20261217"]]) {
    const r2 = await fetch(`https://in.bookmyshow.com/movies/${region}/${slug}/buytickets/${et}/${date}`, {
      headers: H("text/html"), signal: AbortSignal.timeout(25000),
    });
    const state = extract(await r2.text());
    const q = state?.showtimesFunctionalApi?.queries ?? {};
    const key = Object.keys(q).find((k) => k.startsWith("fetchPrimaryDynamic"));
    const data = q[key]?.data?.data;
    const langs = new Set(); const fmts = new Set();
    for (const w of data?.showtimeWidgets ?? []) {
      if (w?.type !== "groupList") continue;
      for (const g of w?.data ?? []) for (const c of g?.data ?? []) {
        if (c?.type !== "venue-card") continue;
        for (const sec of c?.showtimesSections ?? []) for (const s of sec?.showtimes ?? []) {
          const ws = s?.customGestureCTA?.additionalData?.bottomSheetData?.widgets ?? [];
          const fmt = ws.find((w) => w?.layoutId === "format-container")?.variableData?.format ?? "";
          fmts.add(fmt);
          const lang = fmt.split("|")[0].split("•")[0].trim();
          if (lang) langs.add(lang);
        }
      }
    }
    console.log(`\n=== ${region}/${slug} === langs: ${[...langs].join(" | ")}`);
    console.log(`  distinct fmts (${fmts.size}): ${[...fmts].slice(0, 12).join("  ||  ")}`);
  }

  // 3) District: language on movie meta + session
  const dq = new URLSearchParams({
    version: "3", site_id: "1", channel: "mweb", child_site_id: "1",
    platform: "district", movieCode: "", city_key: "hyderabad",
    content_id: "1000285456", date: "2026-11-25",
    latitude: "17.385", longitude: "78.4867", cinemaOrderLogic: "3",
  });
  // first find a real MV id from district html
  const dres = await fetch("https://www.district.in/movies?city=hyderabad", {
    headers: { accept: "text/html", "user-agent": DUA, "x-app-type": "ed_mweb", "x-guest-token": guestToken() },
    signal: AbortSignal.timeout(20000),
  });
  const dhtml = await dres.text();
  const mvs = [...dhtml.matchAll(/\/movies\/([a-z0-9-]+)-movie-tickets-(MV\d+)/gi)].slice(0, 6);
  console.log("\n=== district movies found ===");
  for (const m of mvs) console.log(`  ${m[1]} ${m[2]}`);
  const first = mvs[0];
  if (first) {
    dq.set("content_id", first[2].replace(/^MV/i, ""));
    const ds = await fetch(`https://www.district.in/gw/consumer/movies/v5/movie?${dq}`, {
      headers: { accept: "*/*", api_source: "district", "x-app-type": "ed_mweb", "x-guest-token": guestToken(), "user-agent": DUA },
      signal: AbortSignal.timeout(20000),
    });
    const dj = ds.status === 200 ? await ds.json().catch(() => null) : null;
    if (dj) {
      console.log(`  meta.movie: ${JSON.stringify(dj?.meta?.movie ?? null).slice(0, 700)}`);
      const cinemas = [...(dj?.pageData?.nearbyCinemas ?? []), ...(dj?.pageData?.farCinemas ?? [])];
      outer: for (const c of cinemas) for (const s of c?.sessions ?? []) {
        console.log(`  session keys: ${Object.keys(s).join(",")}`);
        console.log(`  session sample: ${JSON.stringify(s).slice(0, 500)}`);
        break outer;
      }
    } else {
      console.log(`  district showtimes http=${ds.status}`);
    }
  }
})();
