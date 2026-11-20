import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Ticket, Building2, Bell, Calendar, Film, MapPin, Clock, ExternalLink, Radio, Sparkles } from 'lucide-react';
import { theaters, alerts } from '../api';
import { toast } from 'react-hot-toast';
import { motion } from 'framer-motion';

export default function MovieDetail() {
  const { source, movieId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const cityCode = searchParams.get('city_code') || '';
  const slug = searchParams.get('slug') || '';

  const [movie, setMovie] = useState(null);
  const [theaterList, setTheaterList] = useState([]);
  const [showDates, setShowDates] = useState([]);
  const [activeDate, setActiveDate] = useState('');
  const [blocked, setBlocked] = useState(false);
  const [notListed, setNotListed] = useState(false);
  const [note, setNote] = useState('');
  const [stats, setStats] = useState(null);
  const [selectedTheater, setSelectedTheater] = useState('');
  const [customTheater, setCustomTheater] = useState('');
  const [loading, setLoading] = useState(true);
  const [setting, setSetting] = useState(false);

  // Pre-booking title fallback from slug if movie meta not returned
  const fallbackTitle = slug
    ? slug.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
    : 'Upcoming Movie';

  const loadMovie = useCallback(async (date) => {
    setLoading(true);
    try {
      const res = await theaters(source, movieId, cityCode, { date: date || null, slug });
      const data = res.data || {};
      setMovie(data.movie || null);
      setTheaterList(data.theaters || []);
      setShowDates(data.showDates || []);
      setBlocked(!!data.blocked);
      setNotListed(!!data.notListed);
      setNote(data.note || '');
      setStats(data.stats || null);
      if (data.date && !date) setActiveDate(data.date);
      if (date) setActiveDate(date);
    } catch (err) {
      toast.error('Failed to load showtimes');
    } finally {
      setLoading(false);
    }
  }, [source, movieId, cityCode, slug]);

  useEffect(() => {
    loadMovie();
  }, [loadMovie]);

  const handleSetAlert = async (theaterNameToUse) => {
    const titleToUse = movie?.title || fallbackTitle;
    const finalTheater = theaterNameToUse !== undefined ? theaterNameToUse : (customTheater.trim() || selectedTheater || null);

    setSetting(true);
    try {
      const { error } = await alerts.create({
        telegram_chat_id: null,
        movie_title: titleToUse,
        source_movie_id: movieId,
        slug: slug || null,
        city_code: movie?.city_code || cityCode,
        source,
        theater_name: finalTheater,
        is_active: true,
      });
      if (error) throw error;
      toast.success(`Alert set for "${titleToUse}"${finalTheater ? ` @ ${finalTheater}` : ''}!`);
      navigate('/alerts');
    } catch (err) {
      toast.error(err.message || 'Failed to set alert');
    } finally {
      setSetting(false);
    }
  };

  if (loading && !movie) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-accent-500 border-t-transparent rounded-full animate-spin mb-4 mx-auto"></div>
          <p className="text-white/50 text-sm">Fetching live showtimes…</p>
        </div>
      </div>
    );
  }

  // Not listed yet or pre-booking hasn't opened (e.g. Avengers: Doomsday at Cinepolis)
  if (!movie && (notListed || blocked)) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center p-6">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="glass-panel p-8 sm:p-12 text-center rounded-4xl max-w-lg w-full border border-accent-500/30"
        >
          <div className="w-16 h-16 rounded-3xl bg-accent-500/20 text-accent-400 flex items-center justify-center mx-auto mb-5 shadow-neon">
            <Bell size={32} />
          </div>
          <span className="badge bg-accent-500/20 text-accent-400 border-accent-500/40 text-xs mb-3">
            Pre-Booking Not Started Yet
          </span>
          <h2 className="text-2xl font-bold text-white font-display mb-2">
            {fallbackTitle}
          </h2>
          <p className="text-white/60 text-sm leading-relaxed mb-6">
            {note || `Tickets haven't opened yet for this movie in ${cityCode || 'your city'}. Set an alert and we'll ping you on Telegram the exact minute booking opens!`}
          </p>

          <div className="space-y-4 text-left bg-white/5 p-5 rounded-2xl border border-white/10 mb-6">
            <label className="text-xs font-semibold text-white/50 uppercase tracking-wider block">
              Watch Specific Theater (e.g. Cinepolis)
            </label>
            <input
              type="text"
              value={customTheater}
              onChange={(e) => setCustomTheater(e.target.value)}
              placeholder="e.g. Cinepolis, PVR Forum, INOX (or leave blank for all)"
              className="glass-input text-sm"
            />
            <p className="text-[11px] text-white/40">
              When Cinepolis or your chosen cinema opens booking, MovieTracker alerts your Telegram immediately.
            </p>
          </div>

          <div className="flex flex-col gap-3">
            <button
              onClick={() => handleSetAlert(customTheater.trim() || null)}
              disabled={setting}
              className="btn-primary w-full justify-center shadow-neon"
            >
              {setting ? <Bell size={18} className="animate-spin" /> : <><Bell size={18} /> Set Telegram Alert for This Movie</>}
            </button>
            <button onClick={() => navigate(-1)} className="btn-outline justify-center">
              Go Back
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  if (!movie) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="glass-panel p-10 text-center rounded-3xl">
          <Film size={56} className="mx-auto mb-5 text-white/20" />
          <h3 className="font-bold text-white mb-2">Movie not found</h3>
          <p className="text-white/50 text-sm">Please go back and select a movie.</p>
          <button onClick={() => navigate(-1)} className="mt-5 btn-outline">Go back</button>
        </div>
      </div>
    );
  }

  const totalSessions = theaterList.reduce((n, t) => n + (t.sessions?.length || 0), 0);

  return (
    <div className="space-y-8 pb-10">
      {/* Back + title */}
      <div className="flex items-center gap-3 pt-4">
        <button
          onClick={() => navigate(-1)}
          className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 transition-colors"
          aria-label="Back"
        >
          <ArrowLeft size={18} />
        </button>
        <div className="min-w-0">
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight font-display truncate">{movie.title}</h1>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-white/50 mt-1">
            {movie.language && <span>{movie.language}</span>}
            {movie.genre && <><span>•</span><span>{movie.genre}</span></>}
            {movie.duration && <><span>•</span><span>{movie.duration}</span></>}
            {movie.censor && <><span>•</span><span>{movie.censor}</span></>}
            {movie.release_date && <><span>•</span><span>{movie.release_date}</span></>}
          </div>
        </div>
      </div>

      {/* Hero */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-panel rounded-3xl overflow-hidden relative"
      >
        <div className="relative h-56 lg:h-80">
          {movie.poster_url ? (
            <img src={movie.poster_url} alt={movie.title} className="w-full h-full object-cover" loading="lazy" />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-dark-900 to-dark-950 flex items-center justify-center">
              <Film size={72} className="text-white/20" />
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/50 to-transparent" />
          <div className="absolute bottom-0 left-0 right-0 p-6 md:p-8">
            <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
              <div>
                <span className="badge bg-accent-500/20 text-accent-400 border-accent-500/40 mb-3">
                  <Radio size={11} /> Live from {source === 'district' ? 'District' : 'BookMyShow'}
                </span>
                <div className="flex flex-wrap items-center gap-3 text-white/70 text-sm">
                  {stats && (
                    <span className="flex items-center gap-1.5">
                      <Building2 size={14} className="text-accent-400" />
                      {stats.cinemaCount} theatres
                    </span>
                  )}
                  {stats && (
                    <span className="flex items-center gap-1.5">
                      <Clock size={14} className="text-accent-400" />
                      {stats.sessionCount} showtimes
                    </span>
                  )}
                  {activeDate && (
                    <span className="flex items-center gap-1.5">
                      <Calendar size={14} className="text-accent-400" />
                      {activeDate}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex gap-3">
                {movie.bookable_url && (
                  <a
                    href={movie.bookable_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-primary flex-1 lg:flex-none justify-center"
                  >
                    <Ticket size={18} /> Book now <ExternalLink size={14} />
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Date selector */}
      {showDates.length > 1 && (
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
          <label className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-3 block">
            Show date
          </label>
          <div className="flex gap-2.5 overflow-x-auto pb-2 -mx-1 px-1">
            {showDates.map((d) => {
              const active = d === activeDate;
              const dt = new Date(`${d}T00:00:00`);
              return (
                <button
                  key={d}
                  onClick={() => loadMovie(d)}
                  className={`flex-shrink-0 px-5 py-3 rounded-2xl text-sm font-bold transition-all duration-300 border ${
                    active
                      ? 'bg-gradient-to-r from-accent-500 to-cinema-600 text-white border-transparent shadow-neon'
                      : 'bg-white/5 text-white/60 border-white/10 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  <span className="block text-[10px] uppercase tracking-wider opacity-70">
                    {dt.toLocaleDateString('en-IN', { weekday: 'short' })}
                  </span>
                  <span className="block">
                    {dt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                  </span>
                </button>
              );
            })}
          </div>
        </motion.div>
      )}

      {/* Theaters + showtimes */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-bold text-lg font-display">
            Showtimes {loading && <span className="text-white/40 text-sm font-normal">…updating</span>}
          </h2>
          <p className="text-xs text-white/40">
            {theaterList.length} theatre{theaterList.length !== 1 ? 's' : ''} · {totalSessions} shows
          </p>
        </div>

        {/* Theater filter & Custom target input */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-1.5 block">
              Filter Listed Theaters
            </label>
            <select
              value={selectedTheater}
              onChange={(e) => { setSelectedTheater(e.target.value); setCustomTheater(''); }}
              className="glass-input"
            >
              <option value="">All theatres for this movie</option>
              {theaterList.map((t) => (
                <option key={t.id} value={t.name}>{t.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-1.5 block">
              Or Custom Theater (e.g. Cinepolis)
            </label>
            <input
              type="text"
              value={customTheater}
              onChange={(e) => { setCustomTheater(e.target.value); setSelectedTheater(''); }}
              placeholder="e.g. Cinepolis, PVR Forum Mall"
              className="glass-input"
            />
          </div>
        </div>

        {theaterList.length === 0 ? (
          <div className="glass-panel p-12 text-center rounded-3xl">
            <Clock size={44} className="mx-auto mb-4 text-white/20" />
            <h3 className="font-bold text-white mb-2">No shows for this date</h3>
            <p className="text-white/50 text-sm max-w-md mx-auto mb-4">
              {showDates.length > 0
                ? 'Pick another date above — bookings are open for those days.'
                : 'Bookings haven’t opened yet at this theater. Set an alert and we’ll notify you on Telegram the moment they do!'}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {theaterList
              .filter((t) => {
                if (selectedTheater) return t.name === selectedTheater;
                if (customTheater.trim()) return t.name.toLowerCase().includes(customTheater.toLowerCase().trim());
                return true;
              })
              .map((t, i) => (
                <TheaterCard key={t.id || i} theater={t} />
              ))}
          </div>
        )}

        {/* Alert Button */}
        <button
          onClick={() => handleSetAlert()}
          disabled={setting}
          className="btn-primary w-full py-4 text-base justify-center shadow-neon mt-4"
        >
          {setting ? (
            <Bell size={20} className="animate-spin" />
          ) : (
            <>
              <Bell size={20} />
              Alert me on Telegram for {movie.title}
              {customTheater ? ` @ ${customTheater}` : selectedTheater ? ` @ ${selectedTheater}` : ''}
            </>
          )}
        </button>
      </motion.div>
    </div>
  );
}

function TheaterCard({ theater }) {
  return (
    <div className="glass-panel p-5 rounded-3xl">
      <div className="flex items-start gap-3 mb-4">
        <div className="w-10 h-10 rounded-2xl bg-accent-500/15 text-accent-400 flex items-center justify-center flex-shrink-0">
          <Building2 size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-bold text-white text-sm leading-tight">{theater.name}</h3>
            {theater.chain && (
              <span className="badge bg-white/5 text-white/50 border-white/10">{theater.chain}</span>
            )}
          </div>
          {theater.address && (
            <p className="text-xs text-white/40 mt-1 flex items-start gap-1">
              <MapPin size={11} className="mt-0.5 flex-shrink-0" />
              <span className="line-clamp-2">{theater.address}</span>
            </p>
          )}
        </div>
        {typeof theater.distance === 'number' && (
          <span className="text-[10px] font-bold text-white/40 bg-white/5 rounded-full px-2.5 py-1 flex-shrink-0">
            {theater.distance.toFixed(1)} km
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
        {theater.sessions.map((s) => {
          const soldOut = s.avail === 0;
          return (
            <div
              key={s.sid}
              className={`rounded-2xl border px-3 py-2.5 transition-colors ${
                soldOut
                  ? 'bg-white/[0.03] border-white/10 opacity-60'
                  : 'bg-green-500/5 border-green-500/25 hover:bg-green-500/10'
              }`}
            >
              <div className="flex items-center justify-between gap-1.5">
                <span className={`text-sm font-bold ${soldOut ? 'text-white/50' : 'text-white'}`}>
                  {s.time}
                </span>
                {s.total != null && (
                  <span
                    className={`text-[9px] font-black px-1.5 py-0.5 rounded ${
                      soldOut
                        ? 'bg-red-500/20 text-red-400'
                        : s.avail <= 10
                        ? 'bg-amber-500/20 text-amber-400'
                        : 'bg-green-500/20 text-green-400'
                    }`}
                  >
                    {soldOut ? 'SOLD OUT' : `${s.avail} left`}
                  </span>
                )}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-white/45">
                {s.price != null && <span className="text-accent-400 font-bold">₹{s.price}+</span>}
                {s.format && <span className="truncate">{s.format}</span>}
                {s.audi && <span className="truncate">{s.audi}</span>}
              </div>
              {s.tiers && (
                <div className="mt-1 text-[9px] text-white/35 leading-snug line-clamp-2">{s.tiers}</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
