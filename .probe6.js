const UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1";
const bmsId = () => `1.${Math.floor(Math.random() * 9e8 + 1e8)}.${Date.now()}`;
const H = (a) => ({
  accept: a, "accept-language": "en-IN,en;q=0.9", "user-agent": UA,
  referer: "https://in.bookmyshow.com/", "x-app-code": "WEBV2",
  "x-platform-code": "WEB", "x-platform": "WEB", "x-bms-id": bmsId(),
});
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
  for (const [region, slug, et, date] of [
    ["hyderabad", "ramayana", "ET00451914", "20261125"],
    ["chennai", "ramayana", "ET00451914", "20261125"],
  ]) {
    const r2 = await fetch(`https://in.bookmyshow.com/movies/${region}/${slug}/buytickets/${et}/${date}`, {
      headers: H("text/html"), signal: AbortSignal.timeout(25000),
    });
    const state = extract(await r2.text());
    const q = state?.showtimesFunctionalApi?.queries ?? {};
    const key = Object.keys(q).find((k) => k.startsWith("fetchPrimaryDynamic"));
    const data = q[key]?.data?.data;
    if (!data) { console.log(`${region}: no data`); continue; }

    const langs = new Set();
    let sectionDump = null;
    for (const w of data?.showtimeWidgets ?? []) {
      if (w?.type !== "groupList") continue;
      for (const g of w?.data ?? []) {
        for (const c of g?.data ?? []) {
          if (c?.type !== "venue-card") continue;
          for (const sec of c?.showtimesSections ?? []) {
            if (!sectionDump) sectionDump = JSON.stringify(sec.filters ?? null).slice(0, 900);
            for (const s of sec?.showtimes ?? []) {
              const widgets = s?.customGestureCTA?.additionalData?.bottomSheetData?.widgets ?? [];
              const fmt = widgets.find((w) => w?.layoutId === "format-container")?.variableData?.format ?? "";
              const lang = fmt.split("|")[0].split("•")[0].trim();
              if (lang) langs.add(lang);
            }
          }
        }
      }
    }
    console.log(`\n=== ${region} === distinct session languages: ${[...langs].join(" | ")}`);
    console.log(`section.filters sample: ${sectionDump}`);

    // also: is there a global language/format filter widget?
    for (const w of data?.showtimeWidgets ?? []) {
      if (w?.type !== "groupList") {
        console.log(`widget type=${w.type} keys=${Object.keys(w).join(",")} data=${JSON.stringify(w.data ?? null).slice(0, 400)}`);
      }
    }
    // header / filters area
    console.log(`availableFilters: ${JSON.stringify(data.availableFilters ?? null)}`);
    console.log(`staticWidget: ${JSON.stringify(data.staticWidget ?? null).slice(0, 400)}`);
  }
})();
