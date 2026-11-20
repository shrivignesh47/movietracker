import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Simple .env parser to avoid requiring external dotenv
function loadEnv() {
  const envPaths = [join(__dirname, '.env'), join(__dirname, '..', '.env')];
  for (const envPath of envPaths) {
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf8');
      content.split(/\r?\n/).forEach((line) => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) return;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx !== -1) {
          const key = trimmed.slice(0, eqIdx).trim();
          const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
          if (!process.env[key]) process.env[key] = val;
        }
      });
    }
  }
}
loadEnv();

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const CHECK_INTERVAL = parseInt(process.env.CHECK_INTERVAL_SECONDS || '60', 10) * 1000;

if (!BOT_TOKEN) {
  console.error('❌ Error: TELEGRAM_BOT_TOKEN is missing in environment variables.');
  console.error('👉 Please set TELEGRAM_BOT_TOKEN in .env (get it from @BotFather)');
  process.exit(1);
}

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ Error: SUPABASE_URL / VITE_SUPABASE_URL or SUPABASE_KEY is missing.');
  process.exit(1);
}

// ----------------------------------------------------
// Zero-Dependency Supabase REST Client
// ----------------------------------------------------
const supabase = {
  headers: {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json',
  },

  async get(table, query = '') {
    const url = `${SUPABASE_URL}/rest/v1/${table}${query ? `?${query}` : ''}`;
    const res = await fetch(url, { headers: this.headers });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Supabase GET ${table} failed (${res.status}): ${text}`);
    }
    return await res.json();
  },

  async post(table, data, prefer = 'return=representation') {
    const url = `${SUPABASE_URL}/rest/v1/${table}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { ...this.headers, Prefer: prefer },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Supabase POST ${table} failed: ${text}`);
    }
    return await res.json().catch(() => null);
  },

  async patch(table, filterQuery, data) {
    const url = `${SUPABASE_URL}/rest/v1/${table}?${filterQuery}`;
    const res = await fetch(url, {
      method: 'PATCH',
      headers: { ...this.headers, Prefer: 'return=minimal' },
      body: JSON.stringify(data),
    });
    return res.ok;
  },

  async delete(table, filterQuery) {
    const url = `${SUPABASE_URL}/rest/v1/${table}?${filterQuery}`;
    const res = await fetch(url, {
      method: 'DELETE',
      headers: { ...this.headers, Prefer: 'return=minimal' },
    });
    return res.ok;
  },
};

console.log('====================================================');
console.log('🤖 MovieTracker Telegram Bot (@movietracker)');
console.log('⚡ Connected to Supabase:', SUPABASE_URL);
console.log(`⏱️ Alert Monitor Interval: ${CHECK_INTERVAL / 1000}s`);
console.log('====================================================\n');

// ----------------------------------------------------
// Telegram API Helper
// ----------------------------------------------------
async function telegramApi(method, payload = {}) {
  try {
    const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return await res.json();
  } catch (err) {
    console.error(`Telegram API error [${method}]:`, err.message);
    return null;
  }
}

async function sendMessage(chatId, text, extra = {}) {
  return await telegramApi('sendMessage', {
    chat_id: chatId,
    text,
    parse_mode: 'Markdown',
    ...extra,
  });
}

// ----------------------------------------------------
// OTP Verification & Account Linking
// ----------------------------------------------------
async function verifyAndLinkOtp(chatId, username, firstName, otpCode) {
  const cleanCode = otpCode.replace(/[^0-9]/g, '');
  if (cleanCode.length !== 6) return { status: 'invalid_format' };

  try {
    // Look up OTP
    const otps = await supabase.get(
      'telegram_otps',
      `otp_code=eq.${cleanCode}&order=created_at.desc&limit=1`
    );

    const record = otps?.[0];
    if (!record) return { status: 'not_found' };
    if (record.is_used) return { status: 'already_used' };

    if (Date.now() > new Date(record.expires_at).getTime()) {
      return { status: 'expired' };
    }

    const userId = record.user_id;

    // Mark OTP used
    await supabase.patch('telegram_otps', `id=eq.${record.id}`, { is_used: true });

    // Link in telegram_links (upsert)
    await supabase.post(
      'telegram_links',
      {
        user_id: userId,
        telegram_chat_id: chatId,
        telegram_username: username || null,
        updated_at: new Date().toISOString(),
      },
      'resolution=merge-duplicates'
    );

    // Update profile
    await supabase.patch('profiles', `id=eq.${userId}`, {
      telegram_chat_id: chatId,
      telegram_username: username || null,
    });

    // Update pending alerts
    await supabase.patch('alerts', `user_id=eq.${userId}&telegram_chat_id=is.null`, {
      telegram_chat_id: chatId,
    });

    return { status: 'success' };
  } catch (err) {
    console.error('verifyAndLinkOtp error:', err.message);
    return { status: 'error', error: err.message };
  }
}

// ----------------------------------------------------
// Message Handler
// ----------------------------------------------------
async function handleMessage(msg) {
  const chatId = msg.chat?.id;
  const fromUser = msg.from;
  const text = (msg.text || '').trim();
  const username = fromUser?.username || '';
  const firstName = fromUser?.first_name || 'Movie Fan';

  if (!chatId || !text) return;

  console.log(`📩 [Msg from @${username || chatId}]: ${text}`);

  // 1. /start command
  if (text.startsWith('/start')) {
    const parts = text.split(/\s+/);
    const possibleOtp = parts[1] ? parts[1].replace('otp_', '').trim() : null;

    if (possibleOtp && possibleOtp.length === 6 && /^\d{6}$/.test(possibleOtp)) {
      const res = await verifyAndLinkOtp(chatId, username, firstName, possibleOtp);
      if (res.status === 'success') {
        await sendMessage(
          chatId,
          `🎉 *Account Connected Successfully!*\n\nHello *${firstName}* (@${username || 'user'}), your Telegram is now linked to **MovieTracker**!\n\n🍿 *What happens now?*\n• Set alerts for any movie & theater on the website (e.g. *Avengers: Doomsday* at *Cinepolis*).\n• The second bookings open, you will receive an instant alert right here with the direct booking link!\n\n📋 *Helpful commands:*\n/alerts — View your tracked movies\n/status — Check account connection\n/help — Show commands`
        );
        return;
      } else if (res.status === 'expired') {
        await sendMessage(
          chatId,
          `⚠️ *OTP Expired*\n\nThis OTP has expired. Please go back to the MovieTracker website and generate a fresh one.`
        );
        return;
      }
    }

    // Default /start guide
    await sendMessage(
      chatId,
      `👋 *Welcome to MovieTracker Bot!* 🎬\n\nI monitor **BookMyShow** and **District** ticket listings and alert you the exact minute bookings open for your favorite movies & theaters!\n\n🔑 *How to connect your account:*\n1. Log in to the **MovieTracker** website\n2. Go to **Telegram** or click **Set Alert**\n3. Click **Connect Telegram** to generate your 6-digit OTP\n4. Send your 6-digit OTP code directly here!\n\n💡 Example: \`482910\``
    );
    return;
  }

  // 2. Direct 6-digit OTP code
  if (/^\d{6}$/.test(text)) {
    const res = await verifyAndLinkOtp(chatId, username, firstName, text);
    if (res.status === 'success') {
      await sendMessage(
        chatId,
        `🎉 *Account Connected Successfully!*\n\nHello *${firstName}* (@${username || 'user'}), your Telegram is now linked to **MovieTracker**!\n\n🍿 You're ready to receive instant ticket alerts!\n\nTry /alerts to check your tracked movies.`
      );
    } else if (res.status === 'already_used') {
      await sendMessage(
        chatId,
        `⚠️ *OTP Already Used*\n\nThis code has already been claimed. Please generate a fresh OTP on the MovieTracker website.`
      );
    } else if (res.status === 'expired') {
      await sendMessage(
        chatId,
        `⏱️ *OTP Expired*\n\nThis OTP has expired. Please generate a fresh OTP on the MovieTracker website.`
      );
    } else {
      await sendMessage(
        chatId,
        `❌ *Invalid OTP*\n\nWe could not find an active connection request for code \`${text}\`.\nPlease copy the 6-digit OTP generated from the website and try again.`
      );
    }
    return;
  }

  // 3. /status
  if (text === '/status') {
    try {
      const links = await supabase.get(
        'telegram_links',
        `telegram_chat_id=eq.${chatId}&select=*,profiles:user_id(email,name)&limit=1`
      );
      const link = links?.[0];

      if (!link) {
        await sendMessage(
          chatId,
          `ℹ️ *Status: Not Connected*\n\nThis Telegram account is not yet linked to MovieTracker.\n\nSend your 6-digit OTP from the website to connect!`
        );
      } else {
        const alertsList = await supabase.get(
          'alerts',
          `user_id=eq.${link.user_id}&is_active=eq.true&select=id`
        );
        const email = link.profiles?.email || 'Linked user';
        await sendMessage(
          chatId,
          `✅ *Account Connected*\n\n👤 *User:* ${email}\n💬 *Chat ID:* \`${chatId}\`\n🔔 *Active Alerts:* ${alertsList?.length ?? 0}\n\nWe're actively watching ticket openings for you!`
        );
      }
    } catch (err) {
      await sendMessage(chatId, `⚠️ Could not fetch status: ${err.message}`);
    }
    return;
  }

  // 4. /alerts
  if (text === '/alerts') {
    try {
      const links = await supabase.get(
        'telegram_links',
        `telegram_chat_id=eq.${chatId}&select=user_id&limit=1`
      );
      const link = links?.[0];

      if (!link) {
        await sendMessage(
          chatId,
          `⚠️ Please connect your account first by sending your 6-digit OTP from the website.`
        );
        return;
      }

      const userAlerts = await supabase.get(
        'alerts',
        `user_id=eq.${link.user_id}&order=created_at.desc`
      );

      if (!userAlerts || userAlerts.length === 0) {
        await sendMessage(
          chatId,
          `🔔 *No Active Alerts*\n\nYou haven't set any movie alerts yet. Visit the website to track your first movie!`
        );
      } else {
        let msgText = `🔔 *Your Tracked Movie Alerts (${userAlerts.length}):*\n\n`;
        userAlerts.forEach((a, i) => {
          const status = a.is_active ? '🟢 Watching' : '⏸️ Paused';
          msgText += `${i + 1}. *${a.movie_title}*\n`;
          msgText += `   📍 City: ${a.city_name || a.city_code} | Platform: ${a.source}\n`;
          if (a.theater_name) msgText += `   🎭 Theater: ${a.theater_name}\n`;
          msgText += `   ⚡ Status: ${status}\n\n`;
        });
        await sendMessage(chatId, msgText);
      }
    } catch (err) {
      await sendMessage(chatId, `⚠️ Error loading alerts: ${err.message}`);
    }
    return;
  }

  // 5. /check (manual check)
  if (text === '/check') {
    await sendMessage(chatId, '🔍 Checking ticket listings right now…');
    await runAlertCheck();
    await sendMessage(chatId, '✅ Ticket check complete!');
    return;
  }

  // 6. /help
  if (text === '/help') {
    await sendMessage(
      chatId,
      `🤖 *MovieTracker Bot Commands:*\n\n• Send \`123456\` (6-digit OTP) to link your account\n• /status — Check account connection\n• /alerts — List all your active alerts\n• /check — Trigger an immediate ticket check\n• /help — Show this help message\n\nNeed to disconnect? Send /disconnect or unlink from website settings.`
    );
    return;
  }

  // 7. /disconnect
  if (text === '/disconnect') {
    try {
      await supabase.delete('telegram_links', `telegram_chat_id=eq.${chatId}`);
      await supabase.patch('profiles', `telegram_chat_id=eq.${chatId}`, {
        telegram_chat_id: null,
        telegram_username: null,
      });

      await sendMessage(
        chatId,
        `🔌 *Account Disconnected*\n\nYour Telegram account has been unlinked from MovieTracker. You will not receive further alerts until you connect again.`
      );
    } catch (err) {
      await sendMessage(chatId, `⚠️ Error disconnecting: ${err.message}`);
    }
    return;
  }

  // Default response
  await sendMessage(
    chatId,
    `👋 Hi *${firstName}*! Send your 6-digit OTP from the website to connect, or send /help for commands.`
  );
}

// ----------------------------------------------------
// Telegram Long Polling Loop
// ----------------------------------------------------
let lastUpdateId = 0;

async function pollUpdates() {
  while (true) {
    try {
      const data = await telegramApi('getUpdates', {
        offset: lastUpdateId + 1,
        timeout: 25,
        allowed_updates: ['message'],
      });

      if (data?.ok && Array.isArray(data.result)) {
        for (const update of data.result) {
          lastUpdateId = update.update_id;
          if (update.message) {
            await handleMessage(update.message).catch(console.error);
          }
        }
      }
    } catch (err) {
      console.error('Polling error:', err.message);
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
}

// ----------------------------------------------------
// Alert Checking Logic
// ----------------------------------------------------
const UA = 'Mozilla/5.0 (Linux; Android 15; Pixel 9) Chrome/130.0.0.0 Mobile Safari/537.36';

function guestToken() {
  let digits = '';
  for (let i = 0; i < 18; i++) digits += Math.floor(Math.random() * 10);
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let suffix = '';
  for (let i = 0; i < 11; i++) suffix += alphabet[Math.floor(Math.random() * alphabet.length)];
  return `${Date.now()}_${digits}_${suffix}`;
}

async function checkBookingDistrict(movieId, cityKey, targetTheater) {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const contentId = movieId.replace(/^MV/i, '');
    const q = new URLSearchParams({
      version: '3',
      site_id: '1',
      channel: 'mweb',
      child_site_id: '1',
      platform: 'district',
      movieCode: '',
      city_key: cityKey,
      content_id: contentId,
      date: today,
      latitude: '0',
      longitude: '0',
      cinemaOrderLogic: '3',
    });

    const res = await fetch(`https://www.district.in/gw/consumer/movies/v5/movie?${q}`, {
      headers: {
        accept: '*/*',
        api_source: 'district',
        'x-app-type': 'ed_mweb',
        'x-guest-token': guestToken(),
        'user-agent': UA,
      },
      signal: AbortSignal.timeout(15000),
    });

    if (res.status === 204 || res.status === 400 || !res.ok) return { open: false };
    const data = await res.json().catch(() => null);
    const cinemas = [
      ...(Array.isArray(data?.pageData?.nearbyCinemas) ? data.pageData.nearbyCinemas : []),
      ...(Array.isArray(data?.pageData?.farCinemas) ? data.pageData.farCinemas : []),
    ];

    if (!cinemas.length) return { open: false };

    const matching = cinemas.filter((c) => {
      const name = c?.cinemaInfo?.name || '';
      const hasSessions = Array.isArray(c?.sessions) && c.sessions.length > 0;
      if (!hasSessions) return false;
      if (!targetTheater) return true;
      return name.toLowerCase().includes(targetTheater.toLowerCase().trim());
    });

    if (matching.length > 0) {
      return {
        open: true,
        theaterName: matching[0]?.cinemaInfo?.name || targetTheater,
        bookableUrl: `https://www.district.in/movies/${data?.meta?.movie?.slug || 'movie'}-tickets-MV${contentId}`,
      };
    }
    return { open: false };
  } catch {
    return { open: false };
  }
}

async function checkBookingBookMyShow(movieId, cityKey, targetTheater) {
  try {
    const url = `https://in.bookmyshow.com/movies/${cityKey}/any/buytickets/${movieId}`;
    const res = await fetch(url, {
      headers: {
        accept: 'text/html,application/xhtml+xml',
        'user-agent': UA,
        referer: 'https://in.bookmyshow.com/',
        'x-app-code': 'WEBV2',
      },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return { open: false };
    const html = await res.text();

    if (html.includes('window.__INITIAL_STATE__')) {
      if (targetTheater) {
        if (html.toLowerCase().includes(targetTheater.toLowerCase().trim())) {
          return { open: true, theaterName: targetTheater, bookableUrl: url };
        }
      } else if (html.includes('showtimesSections') || html.includes('showDateCode')) {
        return { open: true, theaterName: 'BookMyShow Theaters', bookableUrl: url };
      }
    }
    return { open: false };
  } catch {
    return { open: false };
  }
}

async function runAlertCheck() {
  try {
    const activeAlerts = await supabase.get(
      'alerts',
      'is_active=eq.true&select=*,profiles:user_id(telegram_chat_id,telegram_username)'
    );

    if (!activeAlerts || !activeAlerts.length) return;

    for (const alert of activeAlerts) {
      const chatId = alert.telegram_chat_id || alert.profiles?.telegram_chat_id;
      if (!chatId) continue;

      let result = { open: false, theaterName: '', bookableUrl: '' };
      if (alert.source === 'district') {
        result = await checkBookingDistrict(
          alert.source_movie_id || alert.movie_title,
          alert.city_code,
          alert.theater_name
        );
      } else {
        result = await checkBookingBookMyShow(
          alert.source_movie_id || alert.movie_title,
          alert.city_code,
          alert.theater_name
        );
      }

      const nowIso = new Date().toISOString();

      if (result.open) {
        const lastNotified = alert.last_notified_at ? new Date(alert.last_notified_at).getTime() : 0;
        const hoursSince = (Date.now() - lastNotified) / (1000 * 60 * 60);

        if (hoursSince > 2 || alert.status !== 'triggered') {
          console.log(`🚨 TICKETS OPEN for "${alert.movie_title}" at "${alert.theater_name || 'All'}"! Sending alert to chat ${chatId}`);

          const theaterDisplay = result.theaterName || alert.theater_name || 'All Theaters';
          const alertMsg =
            `🚨 *TICKETS OPEN NOW!* 🚨\n\n` +
            `🎬 *${alert.movie_title}*\n` +
            `🎭 Theater: *${theaterDisplay}*\n` +
            `📍 City: *${alert.city_name || alert.city_code}*\n` +
            `🎟️ Platform: *${alert.source === 'district' ? 'District' : 'BookMyShow'}*\n` +
            `⚡ Status: *Bookings are officially open!*\n\n` +
            `👉 *Book your tickets immediately:*\n${result.bookableUrl || 'Open official app'}`;

          await sendMessage(chatId, alertMsg);

          await supabase.patch('alerts', `id=eq.${alert.id}`, {
            status: 'triggered',
            last_notified_at: nowIso,
            last_checked_at: nowIso,
          });
          continue;
        }
      }

      await supabase.patch('alerts', `id=eq.${alert.id}`, {
        last_checked_at: nowIso,
      });
    }
  } catch (err) {
    console.error('runAlertCheck error:', err.message);
  }
}

// ----------------------------------------------------
// Start Everything
// ----------------------------------------------------
// 1. Delete any existing webhook so long polling can run
telegramApi('deleteWebhook', { drop_pending_updates: false }).then(() => {
  console.log('✅ Polling listener started. Waiting for Telegram messages...');
  pollUpdates();
});

// 2. Start Alert Checking Interval
setInterval(runAlertCheck, CHECK_INTERVAL);
// Run initial check after 5 seconds
setTimeout(runAlertCheck, 5000);
