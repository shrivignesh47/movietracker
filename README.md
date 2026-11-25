# 🎬 MovieTracker

**Instant Telegram alerts the minute movie tickets open on BookMyShow & District.**

Track any movie, in any Indian city, at any theater. When bookings open — even for
advance/pre-booking windows that open for a future date — MovieTracker pings your
Telegram within ~60 seconds.

**What you get:**

- **Merged search** — one search hits BookMyShow *and* District, listing
  **upcoming and now-showing films together**; every card is tagged with the
  platform(s) it's listed on plus an **UPCOMING / NOW SHOWING** release-status
  badge, with All / Now showing / Upcoming filter pills. No manual toggle.
- **Language picker** — multi-language movies (Ramayana → Telugu / Hindi) ask
  which language you want before showing showtimes.
- **Suggested theatres** — the alert flow suggests the real theatres we know for
  that movie + city (a dropdown), then the show date, then Telegram.
- **Structured confirm flow** — theatre → date → connect Telegram →
  *"We'll check it for you"*, and the scanner pings you the minute it opens.

> Premium dark cinema UI, no login required to browse, superadmin panel,
> single-container Docker deploy.

---

## Table of contents

- [Architecture](#architecture)
- [Stack](#stack)
- [Project structure](#project-structure)
- [Setup](#setup)
  - [1. Prerequisites](#1-prerequisites)
  - [2. Environment](#2-environment)
  - [3. Database schema](#3-database-schema)
  - [4. Supabase secrets](#4-supabase-secrets)
  - [5. Deploy Edge Functions](#5-deploy-edge-functions)
  - [6. Schedule the every-minute scanner](#6-schedule-the-every-minute-scanner)
  - [7. Register the Telegram webhook](#7-register-the-telegram-webhook)
  - [8. Build & run the website](#8-build--run-the-website)
- [How the Telegram OTP link works](#how-the-telegram-otp-link-works)
- [How alerts work (Cinepolis example)]#how-alerts-work-cinepolis-example)
- [Bot commands](#bot-commands)
- [Edge Functions reference](#edge-functions-reference)
- [Database schema](#database-schema)
- [Frontend routes](#frontend-routes)
- [Observability / troubleshooting](#observability--troubleshooting)
- [Cleanup of test data](#cleanup-of-test-data)

---

## Architecture

```
┌────────────────────────────┐
│  Docker: nginx container   │  serves prebuilt frontend/dist (port 80)
│  (single service)          │  SPA routing + /api proxy → Supabase
└─────────────┬──────────────┘
              │ HTTPS
┌─────────────▼──────────────────────────────────────────────┐
│  Supabase (hosted)                                          │
│                                                             │
│  Postgres ── profiles · alerts · telegram_links ·           │
│              telegram_otps · cities · movies · theaters ·   │
│              movie_theaters                                 │
│  pg_cron ── every minute ──┐                                │
│  pg_net  ──────────────────┼── POST /check-alerts           │
│                            │                                │
│  Edge Functions:                                          │   Telegram
│    check-alerts     ← scanner (BMS chip-walk + District) ──┼── sendMessage
│    telegram-webhook ← bot /start OTP + commands          ◄─┤── setWebhook
│    telegram-otp     ← generate / status / disconnect         │
│    telegram-alerts  ← one-off / test message sender          │
│    scrape-movies / scrape-theaters / scrape-cities          │
│    admin-alerts     ← superadmin panel                      │
└─────────────────────────────────────────────────────────────┘
```

Key properties:

- **No separate backend server.** All logic lives in Supabase Edge Functions.
- **No long-polling bot daemon.** The bot runs in **webhook mode**; the old
  `telegram-bot/` Node service and `Dockerfile.bot` were removed (a running
  daemon would call `deleteWebhook` and kill the live webhook).
- **No login gate.** Browsing, city search, movie lists and showtimes are fully
  public. Login is only needed to persist alerts and link Telegram.
- **No demo/mock data.** Empty states are honest and surface the real backend
  reason (rate-limit, not-listed, not-on-sale).

## Stack

| Layer | Tech |
|---|---|
| Frontend | React 18 · Vite 5 · Tailwind CSS 3 · framer-motion · lucide-react · react-hot-toast |
| Backend | Supabase Edge Functions (Deno) |
| Database | Postgres + RLS, `pg_cron`, `pg_net`, `pgcrypto` |
| Auth | Supabase Auth (email/password, optional) |
| Bot | Telegram Bot API, **webhook mode** → `telegram-webhook` |
| Deploy | Single nginx container serving prebuilt `frontend/dist` |

## Project structure

```
movietracker/
├── .env                     # local build secrets (git-ignored)
├── .env.example             # frontend env template
├── Dockerfile               # nginx:alpine → copies frontend/dist
├── docker-compose.yml       # single service: movietracker (port 80)
├── README.md
├── frontend/
│   ├── dist/                # prebuilt output (committed; Docker copies it)
│   ├── nginx.conf           # SPA routing + /api proxy → Supabase
│   ├── package.json
│   └── src/
│       ├── api.js           # supabase client + all API wrappers
│       ├── App.jsx          # routes (no login wall)
│       ├── components/      # Layout, TrackerSection, CitySearch, …
│       └── pages/           # Home, MovieDetail, Alerts, Telegram, Admin, Login
└── supabase/
    ├── config.toml
    ├── schema.sql           # THE schema (apply to hosted DB)
    ├── schedule.sql         # pg_cron + pg_net setup (apply once)
    └── functions/
        ├── admin-alerts/
        ├── check-alerts/    # the alert engine (runs every minute)
        ├── scrape-cities/
        ├── scrape-movies/
        ├── scrape-theaters/
        ├── telegram-alerts/
        ├── telegram-otp/
        └── telegram-webhook/
```

---

## Setup

### 1. Prerequisites

- Node.js 20+
- Docker + Docker Compose
- A [Supabase](https://supabase.com) project
- A Telegram bot token from [@BotFather](https://t.me/BotFather)
- Supabase CLI (`npx supabase …`) — use a **personal access token (PAT)**,
  no interactive login / credential store needed

> **Bot identity:** the bot username is `@Theatre_Movie_tracker_bot`
> (`TELEGRAM_BOT_USERNAME=Theatre_Movie_tracker_bot`). Usernames
> `@movietracker` and `@movietracker_bot` are already taken by others.
> To make the bot **display** as *movietracker*, run `/setname` in BotFather
> and set the name to `movietracker` — the username/link stays the same.

### 2. Environment

```bash
cp .env.example .env
```

`.env` only needs the **frontend** values:

```
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_...
```

Backend secrets never live in `.env` — they are Supabase secrets (step 4).

### 3. Database schema

Apply `supabase/schema.sql` once. Easiest is the Dashboard → SQL Editor, or
via the Management API with a PAT:

```powershell
$pat = "<YOUR_SUPABASE_ACCESS_TOKEN>"
$sql = [string](Get-Content supabase/schema.sql -Raw)
$sqlJson = ConvertTo-Json -InputObject $sql -Compress
'{"query":' + $sqlJson + '}' | Set-Content q.json -Encoding UTF8
curl.exe -s -X POST "https://api.supabase.com/v1/projects/<PROJECT_REF>/database/query" `
  -H "Authorization: Bearer $pat" -H "Content-Type: application/json" -d "@q.json"
```

Creates: `profiles`, `alerts`, `telegram_links`, `telegram_otps`, `cities`,
`movies`, `theaters`, `movie_theaters`, plus the `is_superadmin()` SECURITY
DEFINER helper (a self-referencing policy on `profiles` causes PostgREST
error `42P17` infinite recursion — always use the helper).

### 4. Supabase secrets

```bash
export SUPABASE_ACCESS_TOKEN="<PAT>"

npx supabase secrets set \
  TELEGRAM_BOT_TOKEN="<bot-token-from-botfather>" \
  TELEGRAM_BOT_USERNAME="Theatre_Movie_tracker_bot" \
  CRON_SECRET="<long-random-string>" \
  --yes
```

| Secret | Purpose |
|---|---|
| `TELEGRAM_BOT_TOKEN` | Bot API calls (`sendMessage`, webhook) |
| `TELEGRAM_BOT_USERNAME` | Shown in the OTP deep link `https://t.me/<bot>?start=<otp>` |
| `CRON_SECRET` | Shared by (a) pg_cron → `x-cron-secret` on `check-alerts`, and (b) Telegram webhook `secret_token` → `x-telegram-bot-api-secret-token` |

`SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` are injected automatically.

### 5. Deploy Edge Functions

```bash
export SUPABASE_ACCESS_TOKEN="<PAT>"

npx supabase functions deploy \
  check-alerts telegram-webhook telegram-otp telegram-alerts \
  scrape-movies scrape-theaters scrape-cities admin-alerts \
  --yes --no-verify-jwt
```

> `--no-verify-jwt` is required for `check-alerts` (called by cron with only
> the cron secret) and `telegram-webhook` (called by Telegram). Both functions
> do their **own** auth: cron secret / webhook secret / real user JWT.

### 6. Schedule the every-minute scanner

Edit `supabase/schedule.sql`, replace `REPLACE_WITH_CRON_SECRET` with your
`CRON_SECRET`, then run it once (SQL Editor or the Management API).

It enables `pg_cron` + `pg_net` and schedules:

```
jobname : check-alerts-every-minute
schedule: * * * * *        (every minute)
action  : net.http_post → /functions/v1/check-alerts
          headers: apikey + x-cron-secret
```

This is what makes alerts fire **within ~60 seconds** of bookings opening —
there is no bot container to keep alive.

### 7. Register the Telegram webhook

One-time call to Telegram (needs `TELEGRAM_BOT_TOKEN`):

```bash
curl -X POST "https://api.telegram.org/bot<TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://<project-ref>.supabase.co/functions/v1/telegram-webhook",
    "secret_token": "<same as CRON_SECRET>",
    "allowed_updates": ["message"]
  }'
```

Verify with `getWebhookInfo` — `url` should be set and `pending_update_count` 0.
The webhook handler rejects any request whose
`x-telegram-bot-api-secret-token` doesn't match `CRON_SECRET` (403).

> ⚠️ Never run the old long-polling daemon — it calls `deleteWebhook` and
> would silently disable the bot.

### 8. Build & run the website

```bash
cd frontend
npm install
npm run build          # → frontend/dist  (build OUTSIDE Docker)
cd ..

docker compose build --no-cache
docker compose up -d   # → http://localhost  (port 80)
```

The Dockerfile only copies the **prebuilt** `frontend/dist` into nginx —
never npm-build inside the container.

---

## How the Telegram OTP link works

1. User signs up / logs in (optional — browsing needs no account) and opens
   **/telegram**.
2. Website calls `telegram-otp {action:'generate'}` → returns a 6-digit OTP
   (15 min expiry) and a deep link:
   `https://t.me/Theatre_Movie_tracker_bot?start=258693`
3. User clicks the link (or opens the bot and pastes the OTP).
4. Telegram hits `telegram-webhook` with `/start 258693`; the handler validates
   the OTP, marks it used, and writes:
   - `telegram_links` (user ↔ chat id, unique on both sides)
   - `profiles.telegram_chat_id` / `telegram_username`
   - back-fills `alerts.telegram_chat_id` where NULL
5. Website polls `telegram-otp {action:'status'}` every 3 s → shows
   **Connected**, the chat id, and a **Send Test Alert** button.
6. From then on, `check-alerts` resolves the chat id as:
   `alert.telegram_chat_id → profiles → telegram_links`.

Disconnect is available both on the website (`action:'disconnect'`) and in the
bot (`/disconnect`).

---

## How alerts work (Cinepolis example)

**Scenario:** *Avengers: Doomsday* pre-booking hasn't opened at Cinepolis yet.

1. Open the movie → the panel honestly shows **“Pre-Booking Not Started Yet”**
   (or **“BookMyShow Rate-Limited — Retry Soon”** when BMS throttles us), or a
   **“Missing your theatre? … Click here to set an alert”** panel when the
   movie has no live shows in that city yet.
2. The structured modal walks you through it: **movie → theatre (suggested
   dropdown of every theatre we know for that movie/city) → show date (chips
   or free date) → Telegram OTP gate → “We'll check it for you”**.
   Multi-language movies also pin a `language` (Telugu vs Hindi).
3. The `alerts` row lands with `status='pending'`, `is_active=true`,
   `theater_name='Cinepolis'`, plus `language` / `target_date` /
   `alt_source_movie_id` when chosen.
4. Every minute `check-alerts` runs for that alert:
   - resolves the BMS **region** from the free-text city (any Indian city),
   - resolves the movie's `ET…` id + slug from the city listing if missing,
   - loads the buytickets page and **walks every date chip** (up to 4 pages) —
     unless `target_date` narrows it to one date — because advance bookings
     often open for a *future* date while today has no shows,
   - parses venue cards → `{name, sessions}`, filtered by `language`
     (format string `Hindi • 2D | BARCO…` → first segment),
   - matches the target theater by name,
   - **checks the alt platform too** (`alt_source_movie_id`) before giving up —
     bookings often open on District before BMS, or vice versa.
5. The moment a matching venue has sessions:
   - sends `🚨 TICKETS OPEN NOW!` to the linked chat (incl. language + show date),
   - sets `status='triggered'`, `last_notified_at=now()`,
   - **one notification per alert** — reruns return `already_triggered`
     (no spam).
6. If not open yet → `status='watching'` with a note such as
   `target theater not on sale yet`, and only `last_checked_at` updates.

**Three alert flavors:**

| Kind | `theater_name` | Triggers when |
|---|---|---|
| Movie-level | `NULL` | *any* theater in the city has sessions |
| Theater-level | e.g. `Cinepolis` | that specific theater (name substring match) has sessions |
| Language/date-scoped | either | additionally filtered by `language` and/or `target_date` |

**Chat id resolution order:** `alerts.telegram_chat_id` → `profiles` →
`telegram_links`. Alerts created before linking are back-filled on connect.

---

## Bot commands

| Command | Effect |
|---|---|
| `/start <otp>` | Link this chat to the website account that generated the OTP |
| `/start` | Welcome + instructions |
| `/status` | Link status for this chat |
| `/alerts` | List this user's alerts with status |
| `/help` | Command list |
| `/disconnect` | Unlink this chat |

---

## Edge Functions reference

| Function | Method / auth | Purpose |
|---|---|---|
| `check-alerts` | POST · `x-cron-secret` **or** user JWT | Scans all `is_active` alerts; BMS region resolver + buytickets date-chip walk + venue session parsing + theater match + language/date filter; District cinema/session check with Language-bucket filter; second pass on the alt platform (`alt_source_movie_id`) before giving up; sends Telegram on first open. Returns `{ok, checked, notified, results:[{id, movie, theater, status: watching\|triggered\|already_triggered, note}]}` |
| `telegram-webhook` | POST · `x-telegram-bot-api-secret-token` must equal `CRON_SECRET` | Telegram updates: `/start <otp>` linking, `/status`, `/alerts`, `/help`, `/disconnect`, bare OTP |
| `telegram-otp` | POST · user JWT | `action`: `generate` \| `status` \| `disconnect` \| `connect_manual` |
| `telegram-alerts` | POST | Sends a message (incl. `is_test:true`) to a given `telegram_chat_id` |
| `scrape-movies` | POST | `{source: 'bookmyshow'\|'district'\|'both', city_code}` → live movie listings (ET ids, posters, language, genre, slug, `release_status`, `release_date`). BookMyShow reads **two lists** — `discover/movies` (→ `now_showing`) and `discover/upcoming-movies-<slug>` (→ `upcoming`, region-slug pattern verified across regions) — with `discover/home` as fallback; District parses grid cards + inline links + JSON-LD and `MovieData` `release_date` epochs (future date → `upcoming`). `both` merges both platforms into one card per movie with `sources[]` + `alt_movie_id`/`alt_slug` (cross-platform id), statuses folded (`upcoming` wins when platforms disagree) and a `counts` breakdown (`now_showing`/`upcoming`/`untagged`). Honest `{blocked, notListed, note}` states |
| `scrape-theaters` | POST | `{source, movie_id, city_code, date?, slug?, language?, alt_id?, alt_slug?}` → show dates (date chips), venue cards with sessions/price tiers, `languages[]`, `suggestions[]` (every known theatre incl. 0-session ones), `source_used`. `language` filters sessions; `alt_id` cross-platform fallback when the requested platform has nothing |
| `scrape-cities` | POST | `{q}` → city suggestions (free text, any Indian city) |
| `admin-alerts` | GET · superadmin JWT | All alerts with profile info for the admin panel |

---

## Database schema

| Table | Purpose |
|---|---|
| `profiles` | 1:1 with `auth.users`; `role` (`user`/`superadmin`), `telegram_chat_id`, `telegram_username`. Auto-created by trigger on signup |
| `alerts` | The core row: `movie_title`, `source` (`bookmyshow`/`district`), `city_code`, `city_name`, `source_movie_id`, `slug`, `theater_name`, `language`, `target_date`, `alt_source_movie_id`, `is_active`, `status` (`pending`/`triggered`/`error`), `last_checked_at`, `last_notified_at` |
| `telegram_links` | `user_id` ↔ `telegram_chat_id` (both unique) + username |
| `telegram_otps` | 6-digit codes, `expires_at` (15 min), `is_used` |
| `cities` / `movies` / `theaters` / `movie_theaters` | Scraping caches |

**RLS:** owner-only CRUD on `alerts` / `telegram_links` / `telegram_otps`;
superadmin access via `public.is_superadmin()` (SECURITY DEFINER — never inline
a `profiles` subquery in a `profiles` policy).

---

## Frontend routes

| Path | Page | Notes |
|---|---|---|
| `/`, `/movies`, `/dashboard` | `Home` | Tracker: free-text city search → **merged BookMyShow + District** movie grid — upcoming and now-showing listed together, each card tagged with its platform(s) and an **UPCOMING / NOW SHOWING** badge, plus All / Now showing / Upcoming filter pills |
| `/movies/:source/:movieId` | `MovieDetail` | **Language chooser** for multi-language movies (Ramayana → Telugu/Hindi) with an "All languages" escape, date chips, suggested-theatre combobox (`TheaterSelect`), showtimes, and a "Missing your theatre? … Click here to set an alert" panel when nothing is on sale |
| `/alerts` | `AlertsPage` | Alert list with language/date/both-platform badges, **structured Add Alert modal** (`AlertModal`: movie → city → platform → theatre → date → Telegram OTP gate → "We'll check it for you"), Check Now, Telegram banner |
| `/telegram` | `Telegram` | OTP generation, deep link, status polling, test alert, disconnect, manual connect |
| `/admin` | `AdminPage` | Superadmin: users, alerts, roles |
| `/login` | `Login` | Optional sign in / sign up (`?mode=signup`) |

**No login wall anywhere for browsing.** Signed-out users keep alerts in
`localStorage` (`mt_alerts`) — those are local-only and never checked by the
scanner; sign in to get server-side monitoring.

---

## Observability / troubleshooting

**Is the scanner running?**

```sql
-- last cron runs
select runid, status, start_time, end_time
from cron.job_run_details where jobid = 1 order by runid desc limit 5;

-- actual function responses (200 + JSON)
select id, status_code, created, left(content::text, 400)
from net._http_response order by id desc limit 5;
```

**Is the webhook healthy?**

```
curl https://api.telegram.org/bot<TOKEN>/getWebhookInfo
```

Check `url`, `pending_update_count`, `last_error_message`.

**Common issues**

| Symptom | Fix |
|---|---|
| `check-alerts` returns 401 | `x-cron-secret` ≠ `CRON_SECRET` secret, or caller sent no JWT |
| Webhook returns 403 | `secret_token` set at `setWebhook` ≠ `CRON_SECRET` |
| Alerts stay `watching` with `bms regions unavailable` | BMS `/discover/regions` unreachable — transient, retries next minute |
| `bms does not cover <city>` | City not in BMS's region list (District-only city) |
| `42P17 infinite recursion` on profiles | Use `public.is_superadmin()` in policies (already in `schema.sql`) |
| Login returns `unexpected_failure` | `auth.users` row has NULLs in `email_change` / `recovery_token` etc. — set them to `''` |
| Bot does nothing | Webhook not registered, or a long-polling daemon deleted it |
| Movie list empty with a note | Backend `note` is surfaced in the UI (rate-limit / not-listed) — honest state, retry |

**Deploy commands (agent/PAT mode)**

```bash
export SUPABASE_ACCESS_TOKEN="<PAT>"
npx supabase functions deploy <fn> --yes --no-verify-jwt
npx supabase secrets set K=V --yes
npx supabase functions delete <fn> --yes
```

---

## Cleanup of test data

Verification left behind test rows — remove when no longer needed:

```sql
-- test alerts + fake chat link + test user
delete from public.alerts where id in (4, 5, 6);
delete from public.telegram_links where telegram_chat_id = 888888888;
delete from public.telegram_otps where user_id =
  (select id from auth.users where email = 'otp-test@movietracker.dev');
delete from public.profiles where email = 'otp-test@movietracker.dev';
delete from auth.identities where user_id =
  (select id from auth.users where email = 'otp-test@movietracker.dev');
delete from auth.users where email = 'otp-test@movietracker.dev';
```

Test login (if still needed): `otp-test@movietracker.dev` / `MovieTest123!`

---

## License

Private / all rights reserved.
