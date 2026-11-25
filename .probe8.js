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
function extract(html) {
  const i = html.indexOf("window.__INITIAL_STATE__");
  if (i === -1) return null;
  const s = html.indexOf("{", i);
  let d = 0, end = -1, inStr = false, esc = false;
  for (let k = s; k < html.length; k++) {
    const c = html[k];
    if (inStr) { if (esc) esc = false; else if (c === "\\") esc = true; else if (c === '"') inStr = false; continue; }
    if (c === '"') inStr = true; else if (c === "{") d++;
    else if (c === "}") { d--; if (d === 0) { end = k; break; } }
  }
  if (end <= s) return null;
  try { return JSON.parse(html.slice(s, end + 1)); } catch { return null; }
}

(async () => {
  // ---- BMS cinemas page ----
  const r = await fetch("https://in.bookmyshow.com/movies/hyderabad/cinemas", {
    headers: H("text/html"), signal: AbortSignal.timeout(25000),
  });
  const html = await r.text();
  console.log(`BMS cinemas page http=${r.status} len=${html.length}`);
  const state = extract(html);
  if (state) {
    console.log(`  state top keys: ${Object.keys(state).join(",")}`);
    // walk for venue/cinema names
    const found = [];
    (function walk(o, path, depth) {
      if (!o || depth > 9 || found.length > 40) return;
      if (Array.isArray(o)) { o.forEach((v, i) => walk(v, path + "[" + i + "]", depth + 1)); return; }
      if (typeof o !== "object") return;
      const nm = o.venueName ?? o.name ?? o.cinemaName;
      if (typeof nm === "string" && nm.length > 3 && /cinema|pvr|inox|inox|theatre|theater|multiplex|cinepolis|arena|talkies/i.test(nm)) {
        found.push(nm);
      }
      for (const k of Object.keys(o)) walk(o[k], path + "." + k, depth + 1);
    })(state, "$", 0);
    console.log(`  cinemas found: ${found.length}`);
    console.log(`  ${[...new Set(found)].slice(0, 25).join(" | ")}`);
  } else {
    // JSON-LD?
    const ld = [...html.matchAll(/<script[^>]*type="application\/ld\+json"[^]*?<\/script>/gi)];
    console.log(`  no state; ld+json blocks: ${ld.length}`);
    const names = [...html.matchAll(/"name"\s*:\s*"([^"]{4,80})"/g)].map((m) => m[1]);
    console.log(`  "name" occurrences: ${names.length} -> ${[...new Set(names)].slice(0, 20).join(" | ")}`);
  }

  // ---- District cinemas for a city ----
  console.log("\n=== district cinemas ===");
  for (const url of [
    "https://www.district.in/cinemas",
    "https://www.district.in/cinemas?city=hyderabad",
    "https://www.district.in/movie-theatres",
  ]) {
    try {
      const dr = await fetch(url, {
        headers: { accept: "text/html", "user-agent": DUA, "x-app-type": "ed_mweb", "x-guest-token": guestToken() },
        signal: AbortSignal.timeout(20000),
      });
      const dt = await dr.text();
      const names = [...dt.matchAll(/"name"\s*:\s*"([^"]{4,80})"/g)].map((m) => m[1]);
      console.log(`  ${url} -> http=${dr.status} len=${dt.length} names=${names.length} ${[...new Set(names)].slice(0, 8).join(" | ")}`);
    } catch (e) { console.log(`  ${url} ERR ${e}`); }
  }

  // ---- District: does a movie endpoint expose the full cinema list even with no sessions? ----
  console.log("\n=== district cinemas with no sessions? ===");
  const q = new URLSearchParams({
    version: "3", site_id: "1", channel: "mweb", child_site_id: "1",
    platform: "district", movieCode: "", city_key: "hyderabad",
    content_id: "176276", date: "2026-11-25",
    latitude: "17.385", longitude: "78.4867", cinemaOrderLogic: "3",
  });
  const ds = await fetch(`https://www.district.in/gw/consumer/movies/v5/movie?${q}`, {
    headers: { accept: "*/*", api_source: "district", "x-app-type": "ed_mweb", "x-guest-token": guestToken(), "user-agent": DUA },
    signal: AbortSignal.timeout(20000),
  });
  const dj = ds.status === 200 ? await ds.json().catch(() => null) : null;
  if (dj) {
    const cinemas = [...(dj?.pageData?.nearbyCinemas ?? []), ...(dj?.pageData?.farCinemas ?? [])];
    console.log(`  cinemas=${cinemas.length} withSessions=${cinemas.filter((c) => (c.sessions ?? []).length).length}`);
    console.log(`  meta.movie.languages=${JSON.stringify(dj?.meta?.movie?.languages)} primary=${JSON.stringify(dj?.meta?.movie?.primary_language)}`);
    console.log(`  meta keys=${Object.keys(dj?.meta ?? {}).join(",")}`);
    console.log(`  pageData keys=${Object.keys(dj?.pageData ?? {}).join(",")}`);
    for (const c of cinemas.slice(0, 3)) {
      console.log(`   ${c?.cinemaInfo?.name} sessions=${(c?.sessions ?? []).length} scrnFmt=${JSON.stringify((c?.sessions ?? [])[0]?.scrnFmt)} audi=${JSON.stringify((c?.sessions ?? [])[0]?.audi)}`);
    }
  } else console.log(`  http=${ds.status}`);
})();
