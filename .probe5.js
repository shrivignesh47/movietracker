const UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1";
const bmsId = () => `1.${Math.floor(Math.random() * 9e8 + 1e8)}.${Date.now()}`;
const H = (a) => ({
  accept: a,
  "accept-language": "en-IN,en;q=0.9",
  "user-agent": UA,
  referer: "https://in.bookmyshow.com/",
  "x-app-code": "WEBV2",
  "x-platform-code": "WEB",
  "x-platform": "WEB",
  "x-bms-id": bmsId(),
});

function extract(html) {
  const i = html.indexOf("window.__INITIAL_STATE__");
  if (i === -1) return null;
  const s = html.indexOf("{", i);
  let d = 0, end = -1, inStr = false, esc = false;
  for (let k = s; k < html.length; k++) {
    const c = html[k];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === "{") d++;
    else if (c === "}") { d--; if (d === 0) { end = k; break; } }
  }
  if (end <= s) return null;
  try { return JSON.parse(html.slice(s, end + 1)); } catch (e) { return null; }
}

(async () => {
  const res = await fetch(
    "https://in.bookmyshow.com/api/explore/v1/discover/movies?city=hyderabad&region=HYD",
    { headers: H("application/json"), signal: AbortSignal.timeout(20000) }
  );
  const j = await res.json();
  for (const listing of j?.listings ?? []) {
    for (const card of listing?.cards ?? []) {
      const cta = String(card?.ctaUrl ?? "");
      const m = cta.match(/\/movies\/([^/]+)\/([^/]+)\/(ET\d+)/);
      if (!m) continue;
      const title = (card?.text ?? [])
        .map((t) => (t?.components ?? []).map((c) => String(c?.text ?? "")).join(""))
        .find((s) => s.trim());
      if (!/ramayana|avengers/i.test(String(title))) continue;
      console.log(
        `LISTING "${title}" et=${m[3]} slug=${m[2]} lang=${JSON.stringify(card?.analytics?.language)} genre=${JSON.stringify(card?.analytics?.genre)}`
      );
      console.log(`   card keys: ${Object.keys(card).join(",")}`);
      for (const k of Object.keys(card)) {
        const v = JSON.stringify(card[k]);
        if (/hindi|tamil|telugu|language/i.test(v) && k !== "analytics") {
          console.log(`   field ${k}: ${v.slice(0, 400)}`);
        }
      }
    }
  }

  const r2 = await fetch(
    "https://in.bookmyshow.com/movies/hyderabad/ramayana/buytickets/ET00451914/20261125",
    { headers: H("text/html"), signal: AbortSignal.timeout(25000) }
  );
  const state = extract(await r2.text());
  const q = state?.showtimesFunctionalApi?.queries ?? {};
  const key = Object.keys(q).find((k) => k.startsWith("fetchPrimaryDynamic"));
  const data = q[key]?.data?.data;
  console.log("\n--- session language/format sample ---");
  let n = 0;
  for (const w of data?.showtimeWidgets ?? []) {
    if (w?.type !== "groupList") continue;
    for (const g of w?.data ?? []) {
      for (const c of g?.data ?? []) {
        if (c?.type !== "venue-card") continue;
        for (const sec of c?.showtimesSections ?? []) {
          console.log(`  SECTION keys=${Object.keys(sec).join(",")} title=${JSON.stringify(sec.title ?? sec.header ?? sec.label ?? null)}`);
          for (const s of sec?.showtimes ?? []) {
            if (n++ > 6) break;
            const ad = s?.additionalData ?? {};
            const widgets = s?.customGestureCTA?.additionalData?.bottomSheetData?.widgets ?? [];
            const fmt = widgets.find((w) => w?.layoutId === "format-container")?.variableData?.format;
            console.log(
              `    title=${JSON.stringify(s.title)} adAttrs=${JSON.stringify(ad.attributes)} fmt=${JSON.stringify(fmt)} screenAttr=${JSON.stringify(s.screenAttr)} adKeys=${Object.keys(ad).join(",")}`
            );
          }
        }
      }
    }
  }

  console.log("\navailableFilters:", JSON.stringify(data?.availableFilters ?? null).slice(0, 800));
  console.log("meta keys:", Object.keys(data?.meta ?? {}).join(","));
  console.log("meta.movie:", JSON.stringify(data?.meta?.movie ?? null).slice(0, 600));
})();
