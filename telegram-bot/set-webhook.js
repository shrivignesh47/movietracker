import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '.env') });
dotenv.config({ path: join(__dirname, '..', '.env') });

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;

if (!BOT_TOKEN) {
  console.error('❌ Error: TELEGRAM_BOT_TOKEN not found in .env');
  process.exit(1);
}

if (!SUPABASE_URL) {
  console.error('❌ Error: SUPABASE_URL / VITE_SUPABASE_URL not found in .env');
  process.exit(1);
}

const webhookUrl = `${SUPABASE_URL}/functions/v1/telegram-webhook`;

console.log(`Setting Telegram webhook for @movietracker bot...`);
console.log(`Target URL: ${webhookUrl}`);

try {
  const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/setWebhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url: webhookUrl,
      drop_pending_updates: false,
    }),
  });

  const data = await res.json();
  if (data.ok) {
    console.log('✅ Webhook successfully configured with Telegram!');
    console.log('Your Supabase Edge Function "telegram-webhook" will now handle all bot messages directly.');
  } else {
    console.error('❌ Telegram error:', data.description);
  }
} catch (err) {
  console.error('❌ Failed to set webhook:', err.message);
}
