import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function sendTelegram(botToken: string, chatId: number | string, text: string, extra: any = {}) {
  try {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "Markdown",
        ...extra,
      }),
    });
    return await res.json();
  } catch (e) {
    console.error("sendTelegram error:", e);
    return null;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN");
    if (!botToken) {
      return new Response(JSON.stringify({ ok: false, error: "TELEGRAM_BOT_TOKEN missing" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Only accept updates signed with our webhook secret (set via setWebhook).
    const expectedSecret = Deno.env.get("CRON_SECRET");
    const providedSecret = req.headers.get("x-telegram-bot-api-secret-token");
    if (expectedSecret && providedSecret !== expectedSecret) {
      return new Response(JSON.stringify({ ok: false, error: "invalid webhook secret" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    const body = await req.json().catch(() => null);
    if (!body || !body.message) {
      return new Response(JSON.stringify({ ok: true, note: "No message in update" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const msg = body.message;
    const chatId = msg.chat?.id;
    const fromUser = msg.from;
    const text = (msg.text || "").trim();
    const username = fromUser?.username || "";
    const firstName = fromUser?.first_name || "Movie Fan";

    if (!chatId || !text) {
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Helper: attempt OTP verification
    const tryVerifyOtp = async (code: string) => {
      const cleanCode = code.replace(/[^0-9]/g, "");
      if (cleanCode.length !== 6) return null;

      const { data: otpRecord, error } = await supabaseAdmin
        .from("telegram_otps")
        .select("*, profiles:user_id(id, email, name)")
        .eq("otp_code", cleanCode)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error || !otpRecord) {
        return { status: "not_found" };
      }

      if (otpRecord.is_used) {
        return { status: "already_used" };
      }

      const expires = new Date(otpRecord.expires_at).getTime();
      if (Date.now() > expires) {
        return { status: "expired" };
      }

      // Valid OTP!
      const userId = otpRecord.user_id;

      // Mark OTP used
      await supabaseAdmin
        .from("telegram_otps")
        .update({ is_used: true })
        .eq("id", otpRecord.id);

      // Link in telegram_links
      await supabaseAdmin.from("telegram_links").upsert({
        user_id: userId,
        telegram_chat_id: chatId,
        telegram_username: username || null,
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id" });

      // Link in profiles
      await supabaseAdmin.from("profiles").update({
        telegram_chat_id: chatId,
        telegram_username: username || null,
      }).eq("id", userId);

      // Update any pending alerts of this user with missing chat ID
      await supabaseAdmin.from("alerts").update({
        telegram_chat_id: chatId,
      }).eq("user_id", userId).is("telegram_chat_id", null);

      return { status: "success", profile: otpRecord.profiles };
    };

    // 1) /start command (may include OTP e.g. /start 123456)
    if (text.startsWith("/start")) {
      const parts = text.split(/\s+/);
      const possibleOtp = parts[1] ? parts[1].replace("otp_", "").trim() : null;

      if (possibleOtp && possibleOtp.length === 6 && /^\d{6}$/.test(possibleOtp)) {
        const res = await tryVerifyOtp(possibleOtp);
        if (res?.status === "success") {
          await sendTelegram(
            botToken,
            chatId,
            `🎉 *Account Connected Successfully!*\n\nHello *${firstName}* (@${username || "user"}), your Telegram is now linked to **MovieTracker**!\n\n🍿 *What happens now?*\n• Set alerts for any movie & theater on the website (e.g. *Avengers: Doomsday* at *Cinepolis*).\n• The second bookings open, you will receive an instant alert right here with the direct booking link!\n\n📋 *Helpful commands:*\n/alerts — View your tracked movies\n/status — Check account connection\n/help — Show commands`
          );
          return new Response(JSON.stringify({ ok: true }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        } else if (res?.status === "expired") {
          await sendTelegram(
            botToken,
            chatId,
            `⚠️ *OTP Expired*\n\nThis OTP has expired. Please go back to the website and generate a new one.`
          );
          return new Response(JSON.stringify({ ok: true }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }

      // Default /start welcome message
      await sendTelegram(
        botToken,
        chatId,
        `👋 *Welcome to MovieTracker Bot!* 🎬\n\nI monitor **BookMyShow** and **District** ticket listings and alert you the exact minute bookings open for your favorite movies & theaters!\n\n🔑 *How to connect your account:*\n1. Log in to the **MovieTracker** website\n2. Go to **Telegram** or click **Set Alert**\n3. Click **Connect Telegram** to generate your 6-digit OTP\n4. Send your 6-digit OTP code directly here!\n\n💡 Example: \`482910\``
      );
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2) 6-digit OTP direct message
    if (/^\d{6}$/.test(text)) {
      const res = await tryVerifyOtp(text);
      if (res?.status === "success") {
        await sendTelegram(
          botToken,
          chatId,
          `🎉 *Account Connected Successfully!*\n\nHello *${firstName}* (@${username || "user"}), your Telegram is now linked to **MovieTracker**!\n\n🍿 You're ready to receive instant ticket alerts!\n\nTry /alerts to check your tracked movies.`
        );
      } else if (res?.status === "already_used") {
        await sendTelegram(
          botToken,
          chatId,
          `⚠️ *OTP Already Used*\n\nThis code has already been claimed. Please generate a fresh OTP on the MovieTracker website.`
        );
      } else if (res?.status === "expired") {
        await sendTelegram(
          botToken,
          chatId,
          `⏱️ *OTP Expired*\n\nThis OTP has expired. Please generate a fresh OTP on the MovieTracker website.`
        );
      } else {
        await sendTelegram(
          botToken,
          chatId,
          `❌ *Invalid OTP*\n\nWe could not find an active connection request for code \`${text}\`.\nPlease copy the 6-digit OTP generated from the website and try again.`
        );
      }
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 3) /status command
    if (text === "/status") {
      const { data: link } = await supabaseAdmin
        .from("telegram_links")
        .select("*, profiles:user_id(email, name)")
        .eq("telegram_chat_id", chatId)
        .maybeSingle();

      if (!link) {
        await sendTelegram(
          botToken,
          chatId,
          `ℹ️ *Status: Not Connected*\n\nThis Telegram account is not yet linked to MovieTracker.\n\nSend your 6-digit OTP from the website to connect!`
        );
      } else {
        const { count } = await supabaseAdmin
          .from("alerts")
          .select("id", { count: "exact", head: true })
          .eq("user_id", link.user_id)
          .eq("is_active", true);

        const email = (link.profiles as any)?.email || "Linked user";
        await sendTelegram(
          botToken,
          chatId,
          `✅ *Account Connected*\n\n👤 *User:* ${email}\n💬 *Chat ID:* \`${chatId}\`\n🔔 *Active Alerts:* ${count ?? 0}\n\nWe're actively watching ticket openings for you!`
        );
      }
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 4) /alerts command
    if (text === "/alerts") {
      const { data: link } = await supabaseAdmin
        .from("telegram_links")
        .select("user_id")
        .eq("telegram_chat_id", chatId)
        .maybeSingle();

      if (!link) {
        await sendTelegram(
          botToken,
          chatId,
          `⚠️ Please connect your account first by sending your 6-digit OTP from the website.`
        );
        return new Response(JSON.stringify({ ok: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: userAlerts } = await supabaseAdmin
        .from("alerts")
        .select("*")
        .eq("user_id", link.user_id)
        .order("created_at", { ascending: false });

      if (!userAlerts || userAlerts.length === 0) {
        await sendTelegram(
          botToken,
          chatId,
          `🔔 *No Active Alerts*\n\nYou haven't set any movie alerts yet. Visit the website to track your first movie!`
        );
      } else {
        let msgText = `🔔 *Your Tracked Movie Alerts (${userAlerts.length}):*\n\n`;
        userAlerts.forEach((a, i) => {
          const status = a.is_active ? "🟢 Watching" : "⏸️ Paused";
          msgText += `${i + 1}. *${a.movie_title}*\n`;
          msgText += `   📍 City: ${a.city_name || a.city_code} | Platform: ${a.source}\n`;
          if (a.theater_name) msgText += `   🎭 Theater: ${a.theater_name}\n`;
          msgText += `   ⚡ Status: ${status}\n\n`;
        });
        await sendTelegram(botToken, chatId, msgText);
      }
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 5) /help command
    if (text === "/help") {
      await sendTelegram(
        botToken,
        chatId,
        `🤖 *MovieTracker Bot Commands:*\n\n• Send \`123456\` (6-digit OTP) to link your account\n• /status — Check account connection\n• /alerts — List all your active alerts\n• /help — Show this help message\n\nNeed to disconnect? You can disconnect anytime from the website or send /disconnect here.`
      );
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 6) /disconnect command
    if (text === "/disconnect") {
      await supabaseAdmin.from("telegram_links").delete().eq("telegram_chat_id", chatId);
      await supabaseAdmin
        .from("profiles")
        .update({ telegram_chat_id: null, telegram_username: null })
        .eq("telegram_chat_id", chatId);

      await sendTelegram(
        botToken,
        chatId,
        `🔌 *Account Disconnected*\n\nYour Telegram account has been unlinked from MovieTracker. You will not receive further alerts until you connect again.`
      );
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Default response for unhandled text
    await sendTelegram(
      botToken,
      chatId,
      `👋 Hi *${firstName}*! Send your 6-digit OTP code from the MovieTracker website to connect, or type /help for commands.`
    );

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("webhook error:", err);
    return new Response(JSON.stringify({ ok: false, error: err?.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
