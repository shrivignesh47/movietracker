import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft, Ticket, Building2, Bell, Calendar, Film, MapPin, Clock,
  ExternalLink, Radio, Languages
} from 'lucide-react';
import { theaters, telegram } from '../api';
import TheaterSelect from '../components/TheaterSelect';
import AlertModal from '../components/AlertModal';
import { toast } from 'react-hot-toast';
import { motion } from 'framer-motion';

const prettyCity = (code) =>
  code ? code.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ') : '';

export default function MovieDetail() {
  const { source, movieId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const cityCode = searchParams.get('city_code') || '';
  const slug = searchParams.get('slug') || '';
  const altId = searchParams.get('alt_id') || '';
  const altSlug = searchParams.get('alt_slug') || '';

  const [movie, setMovie] = useState(null);
  const [theaterList, setTheaterList] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [languages, setLanguages] = useState([]);
  const [showDates, setShowDates] = useState([]);
  const [activeDate, setActiveDate] = useState('');
  const [blocked, setBlocked] = useState(false);
  const [notListed, setNotListed] = useState(false);
  const [note, setNote] = useState('');
  const [stats, setStats] = useState(null);
  const [sourceUsed, setSourceUsed] = useState(source);
  const [selectedTheater, setSelectedTheater] = useState('');
  const [theaterQuery, setTheaterQuery] = useState('');
  const [language, setLanguage] = useState('');
  const [langPicked, setLangPicked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [tgStatus, setTgStatus] = useState(null);
  const [showAlertModal, setShowAlertModal] = useState(false);

  // Pre-booking title fallback from slug if movie meta not returned
  const fallbackTitle = slug
    ? slug.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
    : 'Upcoming Movie';

  // Language lives in a ref so changing it never re-creates loadMovie
  // (which would otherwise loop through the effect below).
  const langRef = useRef('');

  const loadMovie = useCallback(async (date) => {
    setLoading(true);
    try {
      const res = await theaters(source, movieId, cityCode, {
        date: date || null,
        slug,
        language: langRef.current || null,
        altId,
        altSlug,
      });
      const data = res.data || {};
      setMovie(data.movie || null);
      setTheaterList(data.theaters || []);
      setSuggestions(data.suggestions || []);
      setLanguages(data.languages || []);
      setShowDates(data.showDates || []);
      setBlocked(!!data.blocked);
      setNotListed(!!data.notListed);
      setNote(data.note || '');
      setStats(data.stats || null);
      setSourceUsed(data.source_used || source);
      if (data.date && !date) setActiveDate(data.date);
      if (date) setActiveDate(date);
    } catch (err) {
      toast.error('Failed to load showtimes');
    } finally {
      setLoading(false);
    }
  }, [source, movieId, cityCode, slug, altId, altSlug]);

  useEffect(() => {
    loadMovie();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadMovie]);

  useEffect(() => {
    telegram.status().then((r) => setTgStatus(r?.data || null)).catch(() => {});
  }, []);

  const pickLanguage = (lang) => {
    langRef.current = lang;
    setLanguage(lang);
    setLangPicked(true);
    loadMovie(activeDate || null);
  };

  const cityLabel = prettyCity(cityCode);

  // Which ids the alert should watch: the platform that actually answered,
  // plus the other platform's id so openings on either side are caught.
  const alertSource = sourceUsed || source;
  const alertMovieId = movie?.source_movie_id || movieId;
  const alertAltId = alertMovieId && alertMovieId !== movieId ? movieId : (altId || null);

  const openAlertModal = () => setShowAlertModal(true);

  if (loading && !movie && !notListed) {
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
            {blocked ? 'BookMyShow Rate-Limited — Retry Soon' : 'Pre-Booking Not Started Yet'}
          </span>
          <h2 className="text-2xl font-bold text-white font-display mb-2">
            {fallbackTitle}
          </h2>
          <p className="text-white/60 text-sm leading-relaxed mb-6">
            {note || (blocked
              ? 'BookMyShow is temporarily limiting requests from our servers. It usually clears within a minute — set an alert and we keep watching for you.'
              : `Tickets haven't opened yet for this movie in ${cityLabel || 'your city'}. Set an alert and we'll ping you on Telegram the exact minute booking opens!`)}
          </p>

          <div className="space-y-3 text-left bg-white/5 p-5 rounded-2xl border border-white/10 mb-6">
            <p className="text-xs font-semibold text-white/50 uppercase tracking-wider">
              What happens next
            </p>
            <ol className="space-y-2 text-sm text-white/70">
              <li className="flex gap-2.5">
                <span className="text-accent-400 font-bold">1</span>
                Choose your theatre and a date
              </li>
              <li className="flex gap-2.5">
                <span className="text-accent-400 font-bold">2</span>
                Connect Telegram so we can reach you
              </li>
              <li className="flex gap-2.5">
                <span className="text-accent-400 font-bold">3</span>
                We check every minute and alert you the second it opens
              </li>
            </ol>
          </div>

          <div className="flex flex-col gap-3">
            <button
              onClick={openAlertModal}
              className="btn-primary w-full justify-center shadow-neon"
            >
              <Bell size={18} /> Set Telegram Alert for This Movie
            </button>
            <button onClick={() => navigate(-1)} className="btn-outline justify-center">
              Go Back
            </button>
          </div>
        </motion.div>

        <AlertModal
          open={showAlertModal}
          onClose={() => setShowAlertModal(false)}
          tgStatus={tgStatus}
          refreshTg={() => telegram.status().then((r) => setTgStatus(r?.data || null)).catch(() => {})}
          initial={{
            movieTitle: fallbackTitle,
            cityCode,
            cityName: cityLabel,
            source: alertSource,
            sourceMovieId: alertMovieId,
            slug,
            altSourceMovieId: alertAltId,
            language: language || null,
            showDates,
            suggestions,
            theater: '',
          }}
        />
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
  const needsLanguageChoice = languages.length > 1 && !language && !langPicked;
  const platformLabel = sourceUsed === 'district' ? 'District' : 'BookMyShow';

  const query = theaterQuery.trim().toLowerCase();
  const visibleTheaters = theaterList.filter((t) => {
    if (selectedTheater) return t.name === selectedTheater;
    if (query) return t.name.toLowerCase().includes(query) || String(t.chain || '').toLowerCase().includes(query);
    return true;
  });

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
                  <Radio size={11} /> Live from {platformLabel}
                </span>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-white/70 text-sm">
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
                  {language && (
                    <span className="flex items-center gap-1.5">
                      <Languages size={14} className="text-accent-400" />
                      {language}
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

      {/* Language chooser — multi-language movies (Ramayana: Hindi / Tamil / Telugu) */}
      {needsLanguageChoice ? (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-panel p-7 sm:p-9 rounded-3xl border border-accent-500/30 text-center"
        >
          <div className="w-14 h-14 rounded-2xl bg-accent-500/15 text-accent-400 flex items-center justify-center mx-auto mb-4">
            <Languages size={26} />
          </div>
          <h2 className="text-xl sm:text-2xl font-bold font-display text-white mb-2">
            Which language do you want to watch?
          </h2>
          <p className="text-white/60 text-sm max-w-md mx-auto mb-6">
            {movie.title} plays in <strong className="text-white">{languages.join(', ')}</strong>{' '}
            {cityLabel ? `in ${cityLabel}` : 'here'}. Pick one to see its showtimes.
          </p>
          <div className="flex flex-wrap justify-center gap-3 mb-5">
            {languages.map((lang) => (
              <button
                key={lang}
                onClick={() => pickLanguage(lang)}
                className="px-6 py-3.5 rounded-2xl text-sm font-bold bg-white/5 border border-white/10 text-white hover:bg-white/10 hover:border-accent-500/50 transition-all shadow-neon"
              >
                {lang}
              </button>
            ))}
          </div>
          <button
            onClick={() => { setLangPicked(true); loadMovie(); }}
            className="text-xs text-white/40 hover:text-white transition-colors underline underline-offset-4"
          >
            Show all languages
          </button>
        </motion.div>
      ) : (
        <>
          {/* Language chips (after a choice, still switchable) */}
          {languages.length > 1 && (
            <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
              <label className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-3 block">
                Language
              </label>
              <div className="flex flex-wrap gap-2.5">
                <button
                  onClick={() => { langRef.current = ''; setLanguage(''); setLangPicked(true); loadMovie(activeDate || null); }}
                  className={`px-4 py-2.5 rounded-xl text-xs font-bold border transition-all ${
                    !language
                      ? 'bg-gradient-to-r from-accent-500 to-cinema-600 text-white border-transparent shadow-neon'
                      : 'bg-white/5 text-white/60 border-white/10 hover:bg-white/10'
                  }`}
                >
                  All languages
                </button>
                {languages.map((lang) => (
                  <button
                    key={lang}
                    onClick={() => pickLanguage(lang)}
                    className={`px-4 py-2.5 rounded-xl text-xs font-bold border transition-all ${
                      language === lang
                        ? 'bg-gradient-to-r from-accent-500 to-cinema-600 text-white border-transparent shadow-neon'
                        : 'bg-white/5 text-white/60 border-white/10 hover:bg-white/10'
                    }`}
                  >
                    {lang}
                  </button>
                ))}
              </div>
            </motion.div>
          )}

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

          {/* Your theatre — suggested dropdown */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
            <div>
              <label className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-2 block">
                Your theatre
              </label>
              <TheaterSelect
                options={[...suggestions, ...theaterList]}
                value={selectedTheater}
                onChange={setSelectedTheater}
                onQuery={setTheaterQuery}
                cityLabel={cityLabel}
              />
              <p className="text-[11px] text-white/40 mt-2">
                {suggestions.length
                  ? `${suggestions.length} theatre${suggestions.length !== 1 ? 's' : ''} showing this movie in ${cityLabel || 'your city'} — pick yours to filter, or leave blank for all.`
                  : 'Pick a theatre to filter, or leave blank to see everything.'}
              </p>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-bold text-lg font-display">
                Showtimes {loading && <span className="text-white/40 text-sm font-normal">…updating</span>}
              </h2>
              <p className="text-xs text-white/40">
                {visibleTheaters.length} theatre{visibleTheaters.length !== 1 ? 's' : ''} · {totalSessions} shows
              </p>
            </div>

            {theaterList.length === 0 ? (
              /* Missing your theatre? It hasn't opened yet — offer the alert flow. */
              <div className="glass-panel p-8 sm:p-10 text-center rounded-3xl border border-accent-500/30">
                <div className="w-14 h-14 rounded-2xl bg-accent-500/15 text-accent-400 flex items-center justify-center mx-auto mb-4 shadow-neon">
                  <Bell size={26} />
                </div>
                <h3 className="text-lg sm:text-xl font-bold text-white font-display mb-2">
                  {selectedTheater
                    ? `${selectedTheater} hasn't opened bookings yet`
                    : "Bookings aren't open yet"}
                </h3>
                <p className="text-white/60 text-sm max-w-lg mx-auto mb-2">
                  Missing your theatre? Don't worry —{' '}
                  {note || "we couldn't find live shows here right now."}
                </p>
                <p className="text-white/50 text-sm max-w-lg mx-auto mb-6">
                  Choose your theatre, a date and confirm — we'll check every minute and message your
                  Telegram the second tickets go live.
                </p>
                <button
                  onClick={openAlertModal}
                  className="btn-primary justify-center shadow-neon mx-auto"
                >
                  <Bell size={18} /> Click here to set an alert
                </button>
              </div>
            ) : visibleTheaters.length === 0 ? (
              <div className="glass-panel p-10 text-center rounded-3xl">
                <Building2 size={40} className="mx-auto mb-4 text-white/20" />
                <h3 className="font-bold text-white mb-2">No theatre matches “{theaterQuery || selectedTheater}”</h3>
                <p className="text-white/50 text-sm mb-5">
                  Clear the filter to see all {theaterList.length} theatres, or set an alert for it.
                </p>
                <button onClick={() => { setSelectedTheater(''); setTheaterQuery(''); }} className="btn-outline justify-center mx-auto">
                  Clear filter
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {visibleTheaters.map((t, i) => (
                  <TheaterCard key={t.id || i} theater={t} />
                ))}
              </div>
            )}

            {/* Alert Button */}
            <button
              onClick={openAlertModal}
              className="btn-primary w-full py-4 text-base justify-center shadow-neon mt-2"
            >
              <Bell size={20} />
              Alert me on Telegram for {movie.title}
              {selectedTheater ? ` @ ${selectedTheater}` : ''}
            </button>
          </motion.div>
        </>
      )}

      <AlertModal
        open={showAlertModal}
        onClose={() => setShowAlertModal(false)}
        tgStatus={tgStatus}
        refreshTg={() => telegram.status().then((r) => setTgStatus(r?.data || null)).catch(() => {})}
        initial={{
          movieTitle: movie.title || fallbackTitle,
          cityCode,
          cityName: cityLabel,
          source: alertSource,
          sourceMovieId: alertMovieId,
          slug,
          altSourceMovieId: alertAltId,
          language: language || null,
          showDates,
          suggestions,
          theater: selectedTheater,
        }}
      />
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
                {s.language && <span className="truncate font-semibold">{s.language}</span>}
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
