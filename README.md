# 🎬 MovieTracker — Smart Pre-Booking & Telegram Alert Engine

> **Never miss First-Day-First-Show tickets again.**  
> MovieTracker watches **BookMyShow** and **District** around the clock and sends instant **Telegram notifications** the exact minute bookings open for your favorite movies and theaters (e.g. *Avengers: Doomsday* at *Cinepolis*).

---

## 📑 Table of Contents
- [Architecture & Tech Stack](#-architecture--tech-stack)
- [Project Structure](#-project-structure)
- [How It Works](#-how-it-works)
  - [1. OTP Telegram Account Linking](#1-otp-telegram-account-linking)
  - [2. Pre-Booking & Theater-Specific Alerts (Cinepolis Scenario)](#2-pre-booking--theater-specific-alerts-cinepolis-scenario)
- [Complete Setup Guide](#-complete-setup-guide)
  - [Step 1: Telegram Bot Creation (@BotFather)](#step-1-telegram-bot-creation-botfather)
  - [Step 2: Supabase Project & Database Setup](#step-2-supabase-project--database-setup)
  - [Step 3: Environment Configuration](#step-3-environment-configuration)
  - [Step 4: Deploying Supabase Edge Functions](#step-4-deploying-supabase-edge-functions)
  - [Step 5: Running the Telegram Bot Service](#step-5-running-the-telegram-bot-service)
- [Running the Project](#-running-the-project)
  - [Local Development](#local-development)
  - [Docker Compose Deployment](#docker-compose-deployment)
- [API & Edge Functions Reference](#-api--edge-functions-reference)
- [Database Schema & Tables](#-database-schema--tables)
- [Troubleshooting & FAQ](#-troubleshooting--faq)

---

## 🏗 Architecture & Tech Stack

```
                              ┌─────────────────────────────────────────┐
                              │            React Frontend (SPA)         │
                              │    (Vite + TailwindCSS + Lucide Icons)   │
                              └───────────────────┬─────────────────────┘
                                                  │
                                                  ▼
                 ┌─────────────────────────────────────────────────────────────┐
                 │                  Supabase Cloud Platform                    │
                 │                                                             │
                 │   ┌─────────────────────┐       ┌───────────────────────┐   │
                 │   │ PostgreSQL Database │       │  Supabase Auth (JWT)  │   │
                 │   │ - profiles          │       │  - email / password   │   │
                 │   │ - alerts            │       │  - secure sessions    │   │
                 │   │ - telegram_otps     │       └───────────────────────┘   │
                 │   │ - telegram_links    │                                   │
                 │   └──────────┬──────────┘                                   │
                 │              │                                              │
                 │              ▼                                              │
                 │   ┌──────────────────────────────────────────────────────┐  │
                 │   │             Supabase Edge Functions (Deno)           │  │
                 │   │  • telegram-otp      • telegram-webhook              │  │
                 │   │  • check-alerts      • scrape-movies / theaters      │  │
                 │   │  • telegram-alerts   • admin-alerts                  │  │
                 │   └──────────────────────────┬───────────────────────────┘  │
                 └──────────────────────────────┼──────────────────────────────┘
                                                │
                 ┌──────────────────────────────┼──────────────────────────────┐
                 │                              │                              │
                 ▼                              ▼                              ▼
      ┌────────────────────┐         ┌────────────────────┐         ┌────────────────────┐
      │   Telegram Bot     │         │    BookMyShow      │         │      District      │
      │  (@movietracker)   │         │    (Public API &   │         │    (Showtimes v5   │
      │  Instant Alerts    │         │     JSON-LD Web)   │         │     Consumer API)  │
      └────────────────────┘         └────────────────────┘         └────────────────────┘
```

- **Frontend:** React 18, Vite, Tailwind CSS, Lucide React, React Router v6, Framer Motion, Axios.
- **Backend / Database:** Supabase (PostgreSQL with Row-Level Security, Auth, Realtime, Triggers).
- **Serverless Compute:** Supabase Edge Functions (Deno / TypeScript).
- **Telegram Bot Integration:** Dual-mode support:
  1. **Serverless Webhook:** Supabase Edge Function (`telegram-webhook`) — zero extra servers needed.
  2. **Daemon Bot Runner:** Node.js long-polling service (`telegram-bot/bot.js`) — ideal for local dev & Docker.
- **Containerization:** Docker & Docker Compose (`nginx:alpine` frontend + `node:20-alpine` bot).

---

## 📂 Project Structure

```
movietracker/
├── .env.example                     ← Template for all environment variables
├── .env                             ← Local secrets (Supabase keys, Bot token)
├── docker-compose.yml               ← Multi-container setup (Frontend + Bot daemon)
├── Dockerfile                       ← Production frontend container (Nginx)
├── Dockerfile.bot                   ← Telegram bot daemon container
├── README.md                        ← Full documentation
│
├── frontend/                        ← React + Vite frontend application
│   ├── src/
│   │   ├── api.js                   ← Supabase client, Telegram OTP API & Alert handlers
│   │   ├── App.jsx                  ← Application routing
│   │   ├── components/
│   │   │   ├── Layout.jsx           ← Main navigation & authenticated header
│   │   │   ├── TrackerSection.jsx   ← Movie search, platform filter & grid
│   │   │   └── CitySearch.jsx       ← Auto-suggest city search
│   │   └── pages/
│   │       ├── Home.jsx             ← Landing page & live tracker
│   │       ├── Telegram.jsx         ← OTP generation, status monitoring & direct bot link
│   │       ├── Alerts.jsx           ← Manage alerts, add pre-booking alert, check now
│   │       ├── MovieDetail.jsx      ← Live showtimes & theatre alert setter (Cinepolis)
│   │       ├── Dashboard.jsx        ← User analytics & alert metrics
│   │       ├── Login.jsx            ← Sign in / Sign up
│   │       └── Admin.jsx            ← Superadmin alert management
│   ├── nginx.conf                   ← Nginx proxy for frontend and API
│   └── package.json
│
├── telegram-bot/                    ← Standalone Telegram Bot daemon & alert monitor
│   ├── bot.js                       ← Long-polling listener & 60s alert checking loop
│   ├── set-webhook.js               ← One-command Telegram webhook registration tool
│   └── package.json
│
└── supabase/
    ├── schema.sql                   ← Database schema, OTP table, triggers, and RLS
    ├── config.toml                  ← Local Supabase CLI configuration
    └── functions/                   ← Serverless Edge Functions
        ├── telegram-otp/            ← Generates & verifies 6-digit OTPs
        ├── telegram-webhook/        ← Handles incoming Telegram bot messages
        ├── check-alerts/            ← Automated scanner for ticket openings
        ├── telegram-alerts/         ← Formatted Markdown alert sender
        ├── scrape-movies/           ← BMS & District movie scraping
        ├── scrape-theaters/         ← BMS & District showtimes & cinema fetching
        ├── scrape-cities/           ← City resolver for District & BMS
        └── admin-alerts/            ← Superadmin alert query handler
```

---

## 💡 How It Works

### 1. OTP Telegram Account Linking

Connecting your Telegram account is seamless, secure, and requires no complicated Chat ID lookup:

```
[ User on MovieTracker ]
        │
        ▼
Clicks "Generate Connect OTP"
        │
        ▼
System generates 6-digit OTP: e.g. "482910" (expires in 15 mins)
        │
        ▼
Website displays OTP + "Open @movietracker in Telegram" button
(https://t.me/movietracker_bot?start=482910)
        │
        ▼
[ User in Telegram App ]
        │
        ▼
User taps START (or sends /start 482910 or sends 482910)
        │
        ▼
Bot validates OTP in `telegram_otps` table:
• Valid & active? -> Links `telegram_chat_id` to user's profile
• Marks OTP as used
• Updates any pending alerts for this user
        │
        ▼
Bot replies on Telegram:
"🎉 Account Connected Successfully! You are now set to receive instant booking alerts."
        │
        ▼
Website auto-detects connection within 3 seconds -> Shows "Connected & Active ✅"
```

---

### 2. Pre-Booking & Theater-Specific Alerts (Cinepolis Scenario)

Here is how the system handles upcoming blockbuster releases (e.g. *Avengers: Doomsday*):

1. **Before Pre-Booking Starts:**
   - Pre-booking for *Avengers: Doomsday* has **not** started yet in *Cinepolis*.
   - On MovieTracker, the user navigates to the movie details or clicks **"Add Custom Alert"** on the **Alerts** page.
   - User configures:
     - **Movie Title:** `Avengers: Doomsday`
     - **Platform:** `BookMyShow` (or `District`)
     - **City:** `Hyderabad`
     - **Specific Theater:** `Cinepolis`
   - User clicks **"Start Monitoring"**.
   - The alert is saved to Supabase with status `pending` and `is_active = true`.

2. **Automated Monitoring:**
   - The monitoring engine (`check-alerts` Edge Function or `telegram-bot/bot.js` daemon) queries public listings every 60 seconds.
   - It checks whether showtimes have appeared for *Avengers: Doomsday* specifically containing *Cinepolis*.

3. **Booking Opens — Next Minute Notification:**
   - The second Cinepolis opens ticket bookings, the engine detects active show sessions.
   - Within **under 60 seconds**, the Telegram Bot dispatches a priority message to the user's phone:
     ```
     🚨 TICKETS OPEN NOW! 🚨

     🎬 Avengers: Doomsday
     🎭 Theater: Cinepolis, Nexus Mall
     📍 City: Hyderabad
     🎟️ Platform: BookMyShow
     ⚡ Status: Bookings are officially open!

     👉 Book your tickets immediately:
     https://in.bookmyshow.com/movies/hyderabad/avengers-doomsday/buytickets/ET001234
     ```
   - The alert status transitions to `triggered` to prevent notification spam.

---

## 🚀 Complete Setup Guide

### Step 1: Telegram Bot Creation (@BotFather)

1. Open Telegram and search for **[@BotFather](https://t.me/botfather)**.
2. Send `/newbot`.
3. Choose a display name: `MovieTracker`.
4. Choose a unique username ending in `bot`: e.g. `movietracker_bot` or `movietracker_alert_bot`.
5. BotFather will provide an **HTTP API Token** (e.g. `7891234567:AAFn9...`).
6. Copy this token.

---

### Step 2: Supabase Project & Database Setup

1. Create a free project at [supabase.com](https://supabase.com).
2. Go to **Project Settings → API** and copy:
   - **Project URL**
   - **anon public** key
   - **service_role** secret key
3. Open the **SQL Editor** in your Supabase Dashboard.
4. Copy the entire contents of [`supabase/schema.sql`](file:///c:/Users/stami/Desktop/movietracker/supabase/schema.sql) and click **Run**.
   - This sets up all required tables: `profiles`, `cities`, `movies`, `theaters`, `telegram_links`, `telegram_otps`, and `alerts`.
   - It also registers the automatic user profile trigger on `auth.users`.
5. *(Optional)* Make yourself superadmin:
   ```sql
   insert into public.profiles (id, email, name, role)
   values (
     (select id from auth.users where email = 'YOUR_EMAIL@example.com' limit 1),
     'YOUR_EMAIL@example.com', 'Admin', 'superadmin'
   )
   on conflict (id) do update set role = 'superadmin';
   ```

---

### Step 3: Environment Configuration

Create a `.env` file in the root directory:

```bash
cp .env.example .env
```

Fill in your `.env` values:

```env
# Supabase Configuration
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-secret-key

# Telegram Bot Credentials
TELEGRAM_BOT_TOKEN=7891234567:AAFn9...your-bot-token
TELEGRAM_BOT_USERNAME=movietracker_bot

# Alert checking frequency (seconds)
CHECK_INTERVAL_SECONDS=60
```

---

### Step 4: Deploying Supabase Edge Functions

Install the Supabase CLI if you haven't already:

```bash
npm install -g supabase
supabase login
supabase link --project-ref your-project-id
```

Set the secrets for your Edge Functions:

```bash
supabase secrets set TELEGRAM_BOT_TOKEN="your-bot-token"
supabase secrets set TELEGRAM_BOT_USERNAME="movietracker_bot"
supabase secrets set SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"
```

Deploy all Edge Functions:

```bash
supabase functions deploy telegram-otp
supabase functions deploy telegram-webhook
supabase functions deploy check-alerts
supabase functions deploy telegram-alerts
supabase functions deploy scrape-movies
supabase functions deploy scrape-theaters
supabase functions deploy scrape-cities
supabase functions deploy admin-alerts
```

---

### Step 5: Running the Telegram Bot Service

You have **two options** to run the bot:

#### Option A: Serverless Webhook (Cloud)
Telegram will send updates directly to your Supabase Edge Function:
```bash
cd telegram-bot
npm install
npm run set-webhook
```
*(This sets the Telegram Webhook to `https://<YOUR_PROJECT>.supabase.co/functions/v1/telegram-webhook`)*.

#### Option B: Standalone Node.js Daemon (Local or Docker)
Runs long-polling and automatically executes the 60-second alert checking loop:
```bash
cd telegram-bot
npm install
npm start
```

---

## 💻 Running the Project

### Local Development

1. **Frontend:**
   ```bash
   cd frontend
   npm install
   npm run dev
   # App running at: http://localhost:5173
   ```

2. **Telegram Bot Daemon:**
   ```bash
   cd telegram-bot
   npm start
   # Bot listening for Telegram messages and scanning alerts every 60s
   ```

---

### Docker Compose Deployment

Run the entire stack in isolated Docker containers with a single command:

```bash
docker-compose up --build -d
```

- **Frontend App:** `http://localhost:80`
- **Telegram Bot Daemon:** Running in background container `movietracker-bot` with automatic restarts.

To check bot logs:
```bash
docker logs -f movietracker-bot
```

---

## 📡 API & Edge Functions Reference

| Endpoint | Method | Description |
|---|---|---|
| `/telegram-otp` | `POST` | Generate or verify 6-digit link OTPs, check Telegram status, and disconnect. |
| `/telegram-webhook` | `POST` | Telegram bot webhook handler (`/start`, OTPs, `/alerts`, `/status`). |
| `/check-alerts` | `POST` | Scans all active alerts against BookMyShow & District; dispatches alerts when bookings open. |
| `/telegram-alerts` | `POST` | Sends formatted Telegram markdown messages or test pings. |
| `/scrape-movies` | `POST` | Fetches live movie listings for a given city and platform. |
| `/scrape-theaters`| `POST` | Fetches live showtimes, cinema lists, seat tiers, and availability. |
| `/scrape-cities` | `POST` | Resolves city queries across BookMyShow and District regions. |
| `/admin-alerts` | `GET` | Superadmin overview of all active platform alerts. |

---

## 🗄 Database Schema & Tables

1. **`profiles`**: User profiles extending `auth.users`, storing role (`user` or `superadmin`), `telegram_chat_id`, and `telegram_username`.
2. **`telegram_otps`**: Secure 6-digit OTP codes with 15-minute expiration timestamp and `is_used` flags.
3. **`telegram_links`**: Maps `user_id` to `telegram_chat_id` and bot metadata.
4. **`alerts`**: Tracks movie title, platform (`bookmyshow` / `district`), city, target theater (e.g. `Cinepolis`), active status, and `last_notified_at`.
5. **`cities`**: Indexed list of cities across ticketing platforms.
6. **`movies`**: Cached movie metadata and bookable status.
7. **`theaters`**: Cached theater locations and provider IDs.

---

## ❓ Troubleshooting & FAQ

#### 1. Why didn't I receive an OTP alert message?
- Ensure your bot token is set correctly in `.env` and in Supabase secrets (`supabase secrets set TELEGRAM_BOT_TOKEN=...`).
- Verify that you sent `/start <OTP>` or the 6-digit OTP to the correct bot username in Telegram.
- Check the **Telegram** page on the website to see if connection status changed to "Connected ✅".

#### 2. How fast does the alert arrive when Cinepolis opens bookings?
- The background checking engine queries public listings every **60 seconds**.
- As soon as Cinepolis adds show sessions to BookMyShow or District, the notification is dispatched immediately to your Telegram chat.

#### 3. Can I track multiple theaters or any theater in my city?
- **Yes!** When setting an alert, leaving the theater field blank tracks **all theaters** in your selected city. Entering a specific name (like `Cinepolis` or `PVR Forum`) monitors only that theater.

#### 4. Does the tracker work if I don't sign in?
- Yes, you can browse movies and live showtimes anonymously. However, to link your Telegram account and receive push notifications on your phone, signing in is required so alerts remain securely tied to your profile.

---

## 📄 License
MIT License. Built for movie fans who value First-Day-First-Show tickets.
