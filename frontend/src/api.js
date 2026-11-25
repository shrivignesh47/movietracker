import { createClient } from '@supabase/supabase-js';
import axios from 'axios';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://nnctxsaqjrmpxswhxxbn.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_N4VMUCUMFeTAB0PWN4FXXA_S4EAyp-Z';
const edgeFunctionsUrl = `${supabaseUrl}/functions/v1`;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

const EF = axios.create({ baseURL: edgeFunctionsUrl });

// Edge Functions require an Authorization header: use the user's JWT when
// signed in, otherwise fall back to the anon/publishable key.
EF.interceptors.request.use(async (config) => {
  let token = supabaseAnonKey;
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) token = session.access_token;
  } catch (_) { /* keep anon key */ }
  config.headers.Authorization = `Bearer ${token}`;
  config.headers.apikey = supabaseAnonKey;
  return config;
});

// ============================================
// Auth
// ============================================
export const auth = {
  signup: (email, password, name) =>
    supabase.auth.signUp({ email, password, options: { data: { name } } }),
  login: (email, password) =>
    supabase.auth.signInWithPassword({ email, password }),
  me: () => supabase.auth.getUser(),
  signOut: () => supabase.auth.signOut(),
  getSession: () => supabase.auth.getSession(),
};

// ============================================
// Telegram (OTP + Status + Direct Link)
// ============================================
const DEFAULT_BOT_NAME = 'Theatre_Movie_tracker_bot';

export const telegram = {
  // Generate OTP for connecting Telegram bot
  generateOtp: async () => {
    try {
      const res = await EF.post('/telegram-otp', { action: 'generate' });
      if (res.data?.ok) return res.data;
    } catch (_) {
      // Fallback: direct Supabase insert if Edge Function is offline
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Please sign in to connect Telegram');

    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

    await supabase
      .from('telegram_otps')
      .update({ is_used: true })
      .eq('user_id', user.id)
      .eq('is_used', false);

    const { error } = await supabase.from('telegram_otps').insert({
      user_id: user.id,
      otp_code: otpCode,
      expires_at: expiresAt,
      is_used: false,
    });

    if (error) throw error;

    return {
      ok: true,
      otp: otpCode,
      expires_at: expiresAt,
      bot_username: DEFAULT_BOT_NAME,
      telegram_url: `https://t.me/${DEFAULT_BOT_NAME}?start=${otpCode}`,
    };
  },

  // Check connection status
  status: async () => {
    try {
      const res = await EF.post('/telegram-otp', { action: 'status' });
      if (res.data) return res;
    } catch (_) {
      // Fallback: direct Supabase check
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return { data: { connected: false } };

      const { data: link } = await supabase
        .from('telegram_links')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      const { data: profile } = await supabase
        .from('profiles')
        .select('telegram_chat_id, telegram_username')
        .eq('id', user.id)
        .maybeSingle();

      const chatId = link?.telegram_chat_id || profile?.telegram_chat_id;
      const tgUsername = link?.telegram_username || profile?.telegram_username;

      return {
        data: {
          connected: !!chatId,
          bot_username: DEFAULT_BOT_NAME,
          link: chatId
            ? {
                telegram_chat_id: chatId,
                telegram_username: tgUsername,
                connected_at: link?.connected_at || null,
              }
            : null,
        },
      };
    } catch (_) {
      return { data: { connected: false } };
    }
  },

  // Disconnect Telegram
  disconnect: async () => {
    try {
      const res = await EF.post('/telegram-otp', { action: 'disconnect' });
      if (res.data) return res;
    } catch (_) {}

    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase.from('telegram_links').delete().eq('user_id', user.id);
      await supabase.from('profiles').update({
        telegram_chat_id: null,
        telegram_username: null,
      }).eq('id', user.id);
    }
    return { data: { ok: true } };
  },

  // Manual chat ID connection
  connect: async (data) => {
    try {
      const res = await EF.post('/telegram-otp', { action: 'connect_manual', ...data });
      if (res.data) return res;
    } catch (_) {}

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Sign in required');

    const chatId = Number(data.telegram_chat_id);
    const username = data.telegram_username ? String(data.telegram_username).replace('@', '') : null;

    await supabase.from('telegram_links').upsert({
      user_id: user.id,
      telegram_chat_id: chatId,
      telegram_username: username,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' });

    await supabase.from('profiles').update({
      telegram_chat_id: chatId,
      telegram_username: username,
    }).eq('id', user.id);

    return { data: { ok: true, connected: true } };
  },

  // Send a test alert
  sendTestAlert: (telegram_chat_id) =>
    EF.post('/telegram-alerts', { telegram_chat_id, is_test: true }),

  sendAlert: (data) => EF.post('/telegram-alerts', data),
};

// ============================================
// Movies / Cities / Theaters
// ============================================
export const cities = (source, q) =>
  EF.post('/scrape-cities', { source, q: q || '' });

export const movies = (source, cityCode) =>
  EF.post('/scrape-movies', { source, city_code: cityCode });

export const theaters = (source, movieId, cityCode, opts = {}) =>
  EF.post('/scrape-theaters', {
    source,
    movie_id: movieId,
    city_code: cityCode,
    date: opts.date || null,
    slug: opts.slug || null,
  });

// ============================================
// Alerts — Works with or without login
// Syncs to Supabase when signed in
// ============================================
const LS_ALERTS = 'mt_alerts';

function lsAlerts() {
  try { return JSON.parse(localStorage.getItem(LS_ALERTS) || '[]'); } catch { return []; }
}
function saveLsAlerts(list) {
  localStorage.setItem(LS_ALERTS, JSON.stringify(list));
}

async function currentUser() {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    return user || null;
  } catch { return null; }
}

export const alerts = {
  list: async () => {
    const user = await currentUser();
    if (user) {
      const { data, error } = await supabase
        .from('alerts')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      if (!error) return { data, error: null };
    }
    // Signed out: local alerts
    const local = lsAlerts();
    return { data: local, error: null };
  },

  create: async (payload) => {
    const user = await currentUser();
    if (user) {
      // Find user's telegram chat id if not provided
      let chatId = payload.telegram_chat_id;
      if (!chatId) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('telegram_chat_id')
          .eq('id', user.id)
          .maybeSingle();
        chatId = profile?.telegram_chat_id || null;
      }

      const { data, error } = await supabase
        .from('alerts')
        .insert({
          ...payload,
          user_id: user.id,
          telegram_chat_id: chatId,
          status: 'pending',
        })
        .select()
        .single();
      if (!error) return { data, error: null };
    }

    const list = lsAlerts();
    const item = {
      id: `local_${Date.now()}`,
      ...payload,
      user_id: null,
      is_active: true,
      status: 'pending',
      created_at: new Date().toISOString(),
    };
    list.unshift(item);
    saveLsAlerts(list);
    return { data: item, error: null };
  },

  remove: async (id) => {
    if (String(id).startsWith('local_')) {
      saveLsAlerts(lsAlerts().filter((a) => String(a.id) !== String(id)));
      return { error: null };
    }
    const user = await currentUser();
    if (user) {
      const { error } = await supabase.from('alerts').delete().eq('id', id);
      return { error };
    }
    saveLsAlerts(lsAlerts().filter((a) => String(a.id) !== String(id)));
    return { error: null };
  },

  toggle: async (id, isActive) => {
    if (String(id).startsWith('local_')) {
      saveLsAlerts(lsAlerts().map((a) =>
        String(a.id) === String(id) ? { ...a, is_active: isActive } : a
      ));
      return { error: null };
    }
    const user = await currentUser();
    if (user) {
      const { error } = await supabase
        .from('alerts')
        .update({ is_active: isActive })
        .eq('id', id);
      return { error };
    }
    saveLsAlerts(lsAlerts().map((a) =>
      String(a.id) === String(id) ? { ...a, is_active: isActive } : a
    ));
    return { error: null };
  },

  check: () => EF.post('/check-alerts'),
};

// ============================================
// Admin (via Edge Function)
// ============================================
export const admin = {
  users: () => supabase.from('profiles').select('*').order('created_at', { ascending: false }),
  setRole: (id, role) => supabase.from('profiles').update({ role }).eq('id', id),
  alerts: () => EF.get('/admin-alerts'),
  toggleAlert: (id, isActive) =>
    supabase.from('alerts').update({ is_active: isActive }).eq('id', id),
};

export default EF;
