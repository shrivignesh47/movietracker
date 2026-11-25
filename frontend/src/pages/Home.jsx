import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bell, Zap, MapPin, Languages, Timer, Shield, ArrowRight,
  Send, Film, Ticket, CheckCircle2, Star, ChevronDown,
} from 'lucide-react';
import { motion } from 'framer-motion';
import TrackerSection from '../components/TrackerSection';

const TICKER_ITEMS = [
  'Live showtimes fetched straight from official District listings',
  '8 cities live — Hyderabad, Chennai, Bengaluru, Mumbai, Delhi, Pune, Kochi, Ahmedabad',
  'No login wall — search a movie and set an alert in seconds',
  'Telegram alert the moment bookings open at your theatre',
];

const STATS = [
  { icon: <Zap size={20} />, value: 'Live', label: 'Showtimes fetched on demand' },
  { icon: <Languages size={20} />, value: 'All', label: 'Indian languages covered' },
  { icon: <MapPin size={20} />, value: '8', label: 'Cities · District listings' },
  { icon: <Timer size={20} />, value: 'Instant', label: 'Telegram alert when shows open' },
];

const STEPS = [
  { n: '1', title: 'Pick movie & city', desc: 'Choose the platform, your city and the movie you are waiting for. Add a specific theatre if you want.' },
  { n: '2', title: 'We monitor listings', desc: 'We check public showtime listings every few minutes for new shows at your theatres.' },
  { n: '3', title: 'Instant Telegram alert', desc: 'Theatre, show time, prices and a direct booking link land in your Telegram the second tickets open.' },
  { n: '4', title: 'You book & pay', desc: 'Tap the link and book yourself on the official platform. We never touch your account or payment.' },
];

const FEATURES = [
  { icon: <Bell size={22} />, title: 'Instant alerts', desc: 'Theatre, showtime, price and a direct booking link — the moment bookings open.' },
  { icon: <Film size={22} />, title: 'Every language', desc: 'Telugu, Hindi, Tamil, Malayalam, Kannada, English and more, all in one tracker.' },
  { icon: <Shield size={22} />, title: 'Safe & transparent', desc: 'We never ask for your BookMyShow login or card. You book and pay on the official platform.' },
  { icon: <Ticket size={22} />, title: 'Theatre-level tracking', desc: 'Follow one specific theatre, or any theatre in your city — your choice.' },
  { icon: <Send size={22} />, title: 'Telegram first', desc: 'Alerts delivered to Telegram in seconds, built for first-day-first-show fans.' },
  { icon: <Star size={22} />, title: 'Free to start', desc: 'Track movies and get alerts for free. No card, no trial countdown.' },
];

export default function Home() {
  const navigate = useNavigate();
  const [tickerIndex, setTickerIndex] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setTickerIndex((i) => (i + 1) % TICKER_ITEMS.length), 3000);
    return () => clearInterval(t);
  }, []);

  const scrollToTracker = () => {
    document.getElementById('tracker')?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen">
      {/* ================= HERO ================= */}
      <section className="relative overflow-hidden pt-12 md:pt-20 pb-14">
        {/* ambient glows */}
        <div className="absolute -top-32 -left-32 w-[480px] h-[480px] bg-accent-600/20 blur-[130px] rounded-full pointer-events-none" />
        <div className="absolute -top-20 right-0 w-[420px] h-[420px] bg-cinema-600/20 blur-[130px] rounded-full pointer-events-none" />

        <div className="max-w-7xl mx-auto px-4 relative">
          {/* live ticker */}
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="inline-flex items-center gap-3 bg-white/5 border border-white/10 rounded-full pl-3 pr-5 py-2 mb-8 backdrop-blur-xl"
          >
            <span className="flex items-center gap-2 bg-red-500/20 text-red-400 border border-red-500/30 rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-widest">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" /> Live
            </span>
            <motion.span
              key={tickerIndex}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-sm text-white/70 font-medium"
            >
              {TICKER_ITEMS[tickerIndex]}
            </motion.span>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="text-4xl sm:text-6xl lg:text-7xl font-black font-display tracking-tight leading-[1.05] max-w-4xl"
          >
            Be first when{' '}
            <span className="bg-gradient-to-r from-accent-400 via-rose-400 to-cinema-500 bg-clip-text text-transparent">
              bookings open.
            </span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.12 }}
            className="mt-6 text-lg md:text-xl text-white/60 max-w-2xl leading-relaxed"
          >
            MovieTracker watches <strong className="text-white/90">BookMyShow</strong> and{' '}
            <strong className="text-white/90">District</strong> around the clock and pings you on
            Telegram the second tickets open for your movie — at your theatre, in your city.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.22 }}
            className="mt-9 flex flex-wrap items-center gap-4"
          >
            <button onClick={scrollToTracker} className="btn-primary">
              Start tracking free <ArrowRight size={20} />
            </button>
            <button onClick={() => document.getElementById('how')?.scrollIntoView({ behavior: 'smooth' })} className="btn-outline">
              How it works <ChevronDown size={18} />
            </button>
            <span className="text-sm text-white/40">Free · no card needed</span>
          </motion.div>

          {/* stats strip */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.32 }}
            className="mt-14 grid grid-cols-2 lg:grid-cols-4 gap-4"
          >
            {STATS.map((s) => (
              <div key={s.label} className="glass-panel p-5 rounded-3xl flex items-start gap-3.5">
                <div className="w-10 h-10 rounded-2xl bg-accent-500/15 text-accent-400 flex items-center justify-center flex-shrink-0">
                  {s.icon}
                </div>
                <div className="min-w-0">
                  <p className="text-xl font-black font-display text-white leading-tight">{s.value}</p>
                  <p className="text-xs text-white/50 mt-0.5 leading-snug">{s.label}</p>
                </div>
              </div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ================= TRACKER ================= */}
      <section className="py-10 md:py-16">
        <div className="max-w-7xl mx-auto px-4">
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="mb-8"
          >
            <span className="badge bg-accent-500/10 text-accent-400 border-accent-500/30 mb-4">
              <Ticket size={12} /> The tracker
            </span>
            <h2 className="text-3xl md:text-4xl font-black font-display tracking-tight">
              Pick a movie. We’ll watch it.
            </h2>
            <p className="text-white/50 mt-2 max-w-xl">
              BookMyShow and District in one search — upcoming and now-showing, no sign-up wall.
            </p>
          </motion.div>

          <TrackerSection id="tracker" />
        </div>
      </section>

      {/* ================= HOW IT WORKS ================= */}
      <section id="how" className="py-14 md:py-20 scroll-mt-20">
        <div className="max-w-7xl mx-auto px-4">
          <motion.div initial={{ opacity: 0, y: 18 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}>
            <span className="badge bg-white/5 text-white/60 border-white/10 mb-4">
              <Zap size={12} /> How it works
            </span>
            <h2 className="text-3xl md:text-4xl font-black font-display tracking-tight mb-10">
              From bookings open to you holding a ticket.
            </h2>
          </motion.div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {STEPS.map((s, i) => (
              <motion.div
                key={s.n}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.08 }}
                className="glass-panel p-6 rounded-3xl relative"
              >
                <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-accent-500 to-cinema-600 text-white font-black font-display flex items-center justify-center text-lg shadow-neon mb-4">
                  {s.n}
                </div>
                <h3 className="font-bold text-white mb-2 font-display">{s.title}</h3>
                <p className="text-white/50 text-sm leading-relaxed">{s.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ================= FEATURES ================= */}
      <section className="py-14 md:py-20">
        <div className="max-w-7xl mx-auto px-4">
          <motion.div initial={{ opacity: 0, y: 18 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="mb-10">
            <span className="badge bg-white/5 text-white/60 border-white/10 mb-4">
              <Star size={12} /> Features
            </span>
            <h2 className="text-3xl md:text-4xl font-black font-display tracking-tight">
              Everything a first-day fan needs.
            </h2>
          </motion.div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {FEATURES.map((f, i) => (
              <motion.div
                key={f.title}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: (i % 3) * 0.07 }}
                className="glass-panel p-6 rounded-3xl hover:border-accent-500/40 transition-colors group"
              >
                <div className="w-12 h-12 rounded-2xl bg-accent-500/15 text-accent-400 flex items-center justify-center mb-4 group-hover:bg-accent-500 group-hover:text-white transition-all">
                  {f.icon}
                </div>
                <h3 className="font-bold text-white mb-1.5 font-display">{f.title}</h3>
                <p className="text-white/50 text-sm leading-relaxed">{f.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ================= CTA ================= */}
      <section className="py-14 md:py-20">
        <div className="max-w-7xl mx-auto px-4">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="glass-panel p-10 md:p-16 text-center rounded-4xl relative overflow-hidden"
          >
            <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-[500px] h-[300px] bg-accent-600/25 blur-[110px] rounded-full pointer-events-none" />
            <div className="relative">
              <h2 className="text-3xl md:text-5xl font-black font-display tracking-tight mb-4">
                Never miss a first-day-first-show again.
              </h2>
              <p className="text-white/50 max-w-xl mx-auto mb-8">
                Set your movie once. MovieTracker keeps watching in the background, so you don’t have to keep refreshing.
              </p>
              <div className="flex flex-wrap justify-center gap-4">
                <button onClick={scrollToTracker} className="btn-primary">
                  Get free alerts <Bell size={20} />
                </button>
                <button onClick={() => navigate('/telegram')} className="btn-outline">
                  <Send size={18} /> Connect Telegram
                </button>
              </div>
              <p className="text-xs text-white/40 mt-6 flex items-center justify-center gap-1.5">
                <CheckCircle2 size={14} className="text-green-400" /> Free forever plan · no card required
              </p>
            </div>
          </motion.div>
        </div>
      </section>
    </div>
  );
}
