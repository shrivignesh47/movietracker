import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const { telegram_chat_id, movie, city, source, theater, bookableUrl, is_test } = body;

    const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN");
    if (!botToken) {
      throw new Error("TELEGRAM_BOT_TOKEN not configured in Edge Function environment variables");
    }

    if (!telegram_chat_id) {
      throw new Error("telegram_chat_id is required");
    }

    let text = "";
    if (is_test) {
      text =
        `🔔 *MovieTracker Test Alert* 🔔\n\n` +
        `✅ Your Telegram account is successfully connected to **MovieTracker**!\n\n` +
        `Whenever tickets open for your tracked movies at your chosen theaters, you will receive an instant alert right here! 🎬🍿`;
    } else {
      text =
        `🚨 *Movie Tickets Open!* 🚨\n\n` +
        `🎬 *${movie || "Movie"}*\n` +
        `🎭 Theater: *${theater || "All theaters"}*\n` +
        `📍 City: *${city || "Your City"}*\n` +
        `🎟️ Platform: *${source === "district" ? "District" : "BookMyShow"}*\n\n` +
        `👉 *Book now:* ${bookableUrl || "Open BookMyShow / District"}`;
    }

    const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: telegram_chat_id,
        text,
        parse_mode: "Markdown",
      }),
    });

    const result = await res.json();
    if (!result.ok) {
      throw new Error(result.description || "Telegram API failed to send message");
    }

    return new Response(
      JSON.stringify({ ok: true, messageId: result.result?.message_id }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ ok: false, error: err.message || "Failed to send alert" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
