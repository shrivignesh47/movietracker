import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Film, Ticket, RefreshCw, ArrowRight, Layers } from 'lucide-react';
import { movies } from '../api';
import { motion } from 'framer-motion';
import CitySearch from './CitySearch';

const SOURCE_LABEL = { bookmyshow: 'BMS', district: 'District' };
const STATUS_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'now_showing', label: 'Now showing' },
  { key: 'upcoming', label: 'Upcoming' },
];

export default function TrackerSection({ id = 'tracker' }) {
  const [cityCode, setCityCode] = useState('');
  const [cityName, setCityName] = useState('');
  const [movieList, setMovieList] = useState([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [touched, setTouched] = useState(false);
  const [loadNote, setLoadNote] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const navigate = useNavigate();

  const handleCityChange = (code, name) => {
    setCityCode(code);
    setCityName(name);
    setMovieList([]);
    setTouched(false);
  };

  const loadMovies = async () => {
    if (!cityCode) return;
    setLoading(true);
    setTouched(true);
    setLoadNote('');
    try {
      // Both platforms at once — BookMyShow and District merged, tagged per card.
      const res = await movies('both', cityCode);
      const data = res.data?.movies || res.data || [];
      setMovieList(Array.isArray(data) ? data : []);
      if (!Array.isArray(data) || data.length === 0) {
        setLoadNote(
          res.data?.note ||
          (res.data?.blocked
            ? 'Both platforms are rate-limiting right now. Try again in a minute.'
            : '')
        );
      }
    } catch (_) {
      setMovieList([]);
      setLoadNote('');
    } finally {
      setLoading(false);
    }
  };

  const searched = movieList.filter((m) =>
    m.title.toLowerCase().includes(query.trim().toLowerCase())
  );
  // "Now showing" also carries untagged movies — they aren't on any upcoming list.
  const filtered = searched.filter((m) =>
    statusFilter === 'all'
      ? true
      : statusFilter === 'upcoming'
        ? m.release_status === 'upcoming'
        : m.release_status !== 'upcoming'
  );

  return (
    <section id={id} className="scroll-mt-24">
      <div className="glass-panel p-6 md:p-8 rounded-4xl">
        <div className="flex flex-col lg:flex-row lg:items-end gap-5">
          {/* City */}
          <div className="flex-1">
            <label className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-3 block">
              Your city
            </label>
            <CitySearch
              source="both"
              value={cityCode}
              onChange={handleCityChange}
            />
          </div>

          {/* Search */}
          <div className="flex-1">
            <label className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-3 block">
              Movie name
            </label>
            <div className="relative">
              <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-white/40 pointer-events-none" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search movies…"
                className="glass-input pl-11"
              />
            </div>
          </div>

          {/* Action */}
          <button
            onClick={loadMovies}
            disabled={!cityCode || loading}
            className="btn-primary lg:w-auto w-full justify-center disabled:opacity-40"
          >
            {loading ? (
              <RefreshCw size={20} className="animate-spin" />
            ) : (
              <><Film size={20} /> Track movies</>
            )}
          </button>
        </div>

        <p className="flex items-center gap-2 text-[11px] text-white/40 mt-4">
          <Layers size={13} className="text-accent-400" />
          Searches BookMyShow and District together — upcoming and now-showing listed together, each card tagged with its platform and release status.
        </p>
      </div>

      {/* Results */}
      {touched && (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-8"
        >
          <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
            <h3 className="font-bold text-lg font-display">
              {loading
                ? 'Finding movies…'
                : `${filtered.length} movie${filtered.length !== 1 ? 's' : ''}${cityName ? ` in ${cityName}` : ''}`}
            </h3>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                {STATUS_FILTERS.map((f) => (
                  <button
                    key={f.key}
                    onClick={() => setStatusFilter(f.key)}
                    className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-all ${
                      statusFilter === f.key
                        ? 'bg-gradient-to-r from-accent-500 to-cinema-600 text-white border-transparent shadow-neon'
                        : 'bg-white/5 text-white/60 border-white/10 hover:bg-white/10'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
              <p className="text-xs text-white/40 hidden sm:block">Tap a movie to view theaters & set an alert</p>
            </div>
          </div>

          {loading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-5">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="movie-card p-4 animate-pulse">
                  <div className="aspect-[2/3] rounded-2xl bg-white/5 mb-4" />
                  <div className="h-4 bg-white/5 rounded-lg w-3/4 mb-2" />
                  <div className="h-3 bg-white/5 rounded-lg w-1/2" />
                </div>
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="glass-panel p-14 text-center rounded-4xl">
              <Film size={48} className="mx-auto mb-4 text-white/20" />
              <h4 className="font-bold text-white mb-2">No movies found</h4>
              <p className="text-white/50 text-sm">
                {movieList.length > 0
                  ? 'No movies match the selected filter.'
                  : loadNote || 'Try a different city or search term.'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-5">
              {filtered.map((m, i) => (
                <MovieCard
                  key={m.id || m.source_movie_id || i}
                  movie={m}
                  index={i}
                  onSelect={() => navigate(
                    `/movies/${m.source}/${m.source_movie_id}?city_code=${cityCode}` +
                    `&slug=${encodeURIComponent(m.slug || '')}` +
                    (m.alt_movie_id
                      ? `&alt_id=${encodeURIComponent(m.alt_movie_id)}&alt_slug=${encodeURIComponent(m.alt_slug || '')}`
                      : '')
                  )}
                />
              ))}
            </div>
          )}
        </motion.div>
      )}
    </section>
  );
}

function MovieCard({ movie, index, onSelect }) {
  const letter = (movie.title || '?').replace(/[^A-Za-z0-9]/g, '').charAt(0).toUpperCase() || 'M';
  const sources = Array.isArray(movie.sources) && movie.sources.length
    ? movie.sources
    : [movie.source];
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.04, 0.4) }}
      onClick={onSelect}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onSelect()}
      className="group movie-card p-4 focus:outline-none focus:ring-2 focus:ring-accent-500"
    >
      <div className="aspect-[2/3] rounded-2xl bg-gradient-to-br from-dark-850 to-dark-950 overflow-hidden relative mb-4 border border-white/10">
        {movie.poster_url ? (
          <img
            src={movie.poster_url}
            alt={movie.title}
            loading="lazy"
            className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <span className="text-6xl font-black font-display text-white/15 group-hover:text-accent-500/40 transition-colors">
              {letter}
            </span>
          </div>
        )}
        {movie.release_status && (
          <div className="absolute top-2.5 left-2.5">
            <span
              className={`bg-black/70 backdrop-blur-sm px-2 py-0.5 rounded-lg text-[10px] font-bold border uppercase ${
                movie.release_status === 'upcoming'
                  ? 'text-amber-300 border-amber-400/40'
                  : 'text-emerald-300 border-emerald-400/40'
              }`}
            >
              {movie.release_status === 'upcoming' ? 'Upcoming' : 'Now showing'}
            </span>
          </div>
        )}
        <div className="absolute top-2.5 right-2.5 flex flex-col items-end gap-1">
          {sources.map((s) => (
            <span
              key={s}
              className={`bg-black/70 backdrop-blur-sm px-2 py-0.5 rounded-lg text-[10px] font-bold border uppercase ${
                s === 'bookmyshow'
                  ? 'text-blue-300 border-blue-400/30'
                  : 'text-purple-300 border-purple-400/30'
              }`}
            >
              {SOURCE_LABEL[s] || s}
            </span>
          ))}
        </div>
        {movie.is_bookable && (
          <div className="absolute bottom-2.5 left-2.5 bg-green-500 px-2.5 py-1 rounded-xl text-[10px] font-bold text-white shadow-neon">
            Bookable now
          </div>
        )}
      </div>
      <h4 className="font-bold text-white text-sm leading-tight mb-1.5 group-hover:text-accent-400 transition-colors line-clamp-2">
        {movie.title}
      </h4>
      <div className="flex items-center gap-1 text-xs text-white/50 mb-3 line-clamp-1">
        {movie.language && <span>{movie.language}</span>}
        {movie.genre && <> <span className="mx-0.5">•</span> <span>{movie.genre}</span></>}
        {movie.duration && <> <span className="mx-0.5">•</span> <span>{movie.duration}</span></>}
      </div>
      <div className="flex items-center justify-between text-xs font-semibold text-accent-400">
        <span className="flex items-center gap-1">
          <Ticket size={13} /> Set alert
        </span>
        <ArrowRight size={14} className="text-white/40 group-hover:text-accent-400 group-hover:translate-x-1 transition-all" />
      </div>
    </motion.div>
  );
}
