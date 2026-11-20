import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const UA =
  "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Mobile Safari/537.36";
const BMS_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1";

function guestToken(): string {
  let digits = "";
  for (let i = 0; i < 18; i++) digits += Math.floor(Math.random() * 10);
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  let suffix = "";
  for (let i = 0; i < 11; i++) suffix += alphabet[Math.floor(Math.random() * alphabet.length)];
  return `${Date.now()}_${digits}_${suffix}`;
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

// Check District availability
async function checkDistrict(movieId: string, cityKey: string, targetTheater?: string | null) {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const contentId = movieId.replace(/^MV/i, "");
    const q = new URLSearchParams({
      version: "3",
      site_id: "1",
      channel: "mweb",
      child_site_id: "1",
      platform: "district",
      movieCode: "",
      city_key: cityKey,
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
      return { open: false };
    }

    const data = await res.json().catch(() => null);
    const cinemas = [
      ...(Array.isArray(data?.pageData?.nearbyCinemas) ? data.pageData.nearbyCinemas : []),
      ...(Array.isArray(data?.pageData?.farCinemas) ? data.pageData.farCinemas : []),
    ];

    if (!cinemas.length) return { open: false };

    const matchingTheaters = cinemas.filter((c: any) => {
      const name = c?.cinemaInfo?.name || "";
      const hasSessions = Array.isArray(c?.sessions) && c.sessions.length > 0;
      if (!hasSessions) return false;
      if (!targetTheater) return true;
      return name.toLowerCase().includes(targetTheater.toLowerCase().trim());
    });

    if (matchingTheaters.length > 0) {
      const first = matchingTheaters[0];
      return {
        open: true,
        theaterName: first?.cinemaInfo?.name || targetTheater,
        bookableUrl: `https://www.district.in/movies/${data?.meta?.movie?.slug || "movie"}-tickets-MV${contentId}`,
      };
    }

    return { open: false };
  } catch {
    return { open: false };
  }
}

// Check BookMyShow availability
async function checkBookMyShow(movieId: string, cityKey: string, targetTheater?: string | null) {
  try {
    const url = `https://in.bookmyshow.com/movies/${cityKey}/any/buytickets/${movieId}`;
    const res = await fetch(url, {
      headers: {
        accept: "text/html,application/xhtml+xml",
        "user-agent": BMS_UA,
        referer: "https://in.bookmyshow.com/",
        "x-app-code": "WEBV2",
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) return { open: false };
    const html = await res.text();

    if (html.includes("window.__INITIAL_STATE__")) {
      if (targetTheater) {
        if (html.toLowerCase().includes(targetTheater.toLowerCase().trim())) {
          return {
            open: true,
            theaterName: targetTheater,
            bookableUrl: url,
          };
        }
      } else if (html.includes("showtimesSections") || html.includes("showDateCode")) {
        return {
          open: true,
          theaterName: "BookMyShow Theaters",
          bookableUrl: url,
        };
      }
    }
    return { open: false };
  } catch {
    return { open: false };
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN");

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    // Fetch all active alerts
    const { data: activeAlerts, error } = await supabaseAdmin
      .from("alerts")
      .select("*, profiles:user_id(telegram_chat_id, telegram_username)")
      .eq("is_active", true);

    if (error) throw error;

    let checkedCount = 0;
    let notifiedCount = 0;
    const results: any[] = [];

    for (const alert of activeAlerts || []) {
      checkedCount++;
      const chatId = alert.telegram_chat_id || (alert.profiles as any)?.telegram_chat_id;

      let bookingStatus = { open: false, theaterName: "", bookableUrl: "" };

      if (alert.source === "district") {
        bookingStatus = await checkDistrict(
          alert.source_movie_id || alert.movie_title,
          alert.city_code,
          alert.theater_name
        );
      } else {
        bookingStatus = await checkBookMyShow(
          alert.source_movie_id || alert.movie_title,
          alert.city_code,
          alert.theater_name
        );
      }

      const nowIso = new Date().toISOString();

      if (bookingStatus.open) {
        // Only notify if not already triggered in last 2 hours
        const lastNotified = alert.last_notified_at ? new Date(alert.last_notified_at).getTime() : 0;
        const hoursSinceLast = (Date.now() - lastNotified) / (1000 * 60 * 60);

        if (hoursSinceLast > 2 || alert.status !== "triggered") {
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

            await sendTelegramAlert(botToken, chatId, alertMsg);
            notifiedCount++;
          }

          // Mark as triggered
          await supabaseAdmin
            .from("alerts")
            .update({
              status: "triggered",
              last_notified_at: nowIso,
              last_checked_at: nowIso,
            })
            .eq("id", alert.id);

          results.push({ id: alert.id, movie: alert.movie_title, status: "triggered" });
          continue;
        }
      }

      // Update last checked
      await supabaseAdmin
        .from("alerts")
        .update({ last_checked_at: nowIso })
        .eq("id", alert.id);

      results.push({ id: alert.id, movie: alert.movie_title, status: "checked_not_open" });
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
