import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const botUsername = Deno.env.get("TELEGRAM_BOT_USERNAME") || "movietracker_bot";

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    // Extract authorization token
    const authHeader = req.headers.get("Authorization");
    const token = authHeader?.replace("Bearer ", "");

    let user: any = null;
    if (token) {
      const { data } = await supabaseAdmin.auth.getUser(token);
      user = data?.user || null;
    }

    const url = new URL(req.url);
    const method = req.method;
    let body: any = {};
    if (method === "POST") {
      try {
        body = await req.json();
      } catch (_) {
        body = {};
      }
    }

    const action = body.action || url.searchParams.get("action") || "status";

    // Action 1: Get Telegram status for user
    if (action === "status" || method === "GET") {
      if (!user) {
        return new Response(JSON.stringify({ ok: true, connected: false, reason: "unauthenticated" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: link } = await supabaseAdmin
        .from("telegram_links")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();

      const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("telegram_chat_id, telegram_username")
        .eq("id", user.id)
        .maybeSingle();

      const chatId = link?.telegram_chat_id || profile?.telegram_chat_id;
      const tgUsername = link?.telegram_username || profile?.telegram_username;

      return new Response(
        JSON.stringify({
          ok: true,
          connected: !!chatId,
          bot_username: botUsername,
          link: chatId
            ? {
                telegram_chat_id: chatId,
                telegram_username: tgUsername,
                connected_at: link?.connected_at || null,
              }
            : null,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Action 2: Generate OTP
    if (action === "generate") {
      if (!user) {
        return new Response(
          JSON.stringify({ ok: false, error: "Please log in to link your Telegram account" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Generate a clean 6-digit numeric OTP
      const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString(); // 15 mins

      // Invalidate any existing unused OTPs for this user
      await supabaseAdmin
        .from("telegram_otps")
        .update({ is_used: true })
        .eq("user_id", user.id)
        .eq("is_used", false);

      // Insert new OTP
      const { error: insertError } = await supabaseAdmin.from("telegram_otps").insert({
        user_id: user.id,
        otp_code: otpCode,
        expires_at: expiresAt,
        is_used: false,
      });

      if (insertError) {
        throw new Error(insertError.message);
      }

      const botUrl = `https://t.me/${botUsername}?start=${otpCode}`;

      return new Response(
        JSON.stringify({
          ok: true,
          otp: otpCode,
          expires_at: expiresAt,
          bot_username: botUsername,
          telegram_url: botUrl,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Action 3: Disconnect Telegram
    if (action === "disconnect") {
      if (!user) {
        return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      await supabaseAdmin.from("telegram_links").delete().eq("user_id", user.id);
      await supabaseAdmin
        .from("profiles")
        .update({ telegram_chat_id: null, telegram_username: null })
        .eq("id", user.id);

      return new Response(JSON.stringify({ ok: true, message: "Telegram unlinked" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Action 4: Manual link or verify
    if (action === "connect_manual" || action === "connect") {
      if (!user) {
        return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const chatId = Number(body.telegram_chat_id);
      if (!chatId || Number.isNaN(chatId)) {
        return new Response(JSON.stringify({ ok: false, error: "Invalid Telegram Chat ID" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const tgUser = body.telegram_username ? String(body.telegram_username).replace("@", "") : null;

      // Upsert telegram_links
      await supabaseAdmin.from("telegram_links").upsert({
        user_id: user.id,
        telegram_chat_id: chatId,
        telegram_username: tgUser,
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id" });

      // Update profile
      await supabaseAdmin.from("profiles").update({
        telegram_chat_id: chatId,
        telegram_username: tgUser,
      }).eq("id", user.id);

      // Also update any pending alerts of this user with missing chat ID
      await supabaseAdmin.from("alerts").update({
        telegram_chat_id: chatId,
      }).eq("user_id", user.id).is("telegram_chat_id", null);

      return new Response(
        JSON.stringify({
          ok: true,
          connected: true,
          link: { telegram_chat_id: chatId, telegram_username: tgUser },
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify({ ok: false, error: `Unknown action: ${action}` }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(
      JSON.stringify({ ok: false, error: err?.message || "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
