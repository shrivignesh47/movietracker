import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Film, Ticket, RefreshCw, ArrowRight } from 'lucide-react';
import { movies } from '../api';
import { motion } from 'framer-motion';
import CitySearch from './CitySearch';

const SOURCES = [
  { value: 'bookmyshow', label: 'BookMyShow', color: 'text-blue-400', bg: 'bg-blue-500/10' },
  { value: 'district', label: 'District', color: 'text-purple-400', bg: 'bg-purple-500/10' },
];

export default function TrackerSection({ id = 'tracker' }) {
  const [source, setSource] = useState('bookmyshow');
  const [cityCode, setCityCode] = useState('');
  const [cityName, setCityName] = useState('');
  const [movieList, setMovieList] = useState([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [touched, setTouched] = useState(false);
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
    try {
      const res = await movies(source, cityCode);
      const data = res.data?.movies || res.data || [];
      setMovieList(Array.isArray(data) ? data : []);
    } catch (_) {
      setMovieList([]);
    } finally {
      setLoading(false);
    }
  };

  const filtered = movieList.filter((m) =>
    m.title.toLowerCase().includes(query.trim().toLowerCase())
  );

  return (
    <section id={id} className="scroll-mt-24">
      <div className="glass-panel p-6 md:p-8 rounded-4xl">
        <div className="flex flex-col lg:flex-row lg:items-end gap-5">
          {/* Platform */}
          <div className="lg:w-56">
            <label className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-3 block">
              Platform
            </label>
            <div className="flex gap-3">
              {SOURCES.map((s) => (
                <button
                  key={s.value}
                  onClick={() => { setSource(s.value); setCityCode(''); setCityName(''); setMovieList([]); setTouched(false); }}
                  className={`flex-1 px-5 py-3.5 rounded-2xl text-sm font-bold transition-all duration-300 ${
                    source === s.value
                      ? 'bg-gradient-to-r from-accent-500 to-cinema-600 text-white shadow-neon'
                      : `${s.bg} text-white/60 border border-white/10 hover:bg-white/10 hover:text-white`
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* City */}
          <div className="flex-1">
            <label className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-3 block">
              Your city
            </label>
            <CitySearch
              key={source}
              source={source}
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
              {filtered.length} movie{filtered.length !== 1 ? 's' : ''}
              {cityName ? ` in ${cityName}` : ''}
            </h3>
            <div className="flex items-center gap-3">
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
              <p className="text-white/50 text-sm">Try a different city, platform or search term.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-5">
              {filtered.map((m, i) => (
                <MovieCard
                  key={m.id || m.source_movie_id || i}
                  movie={m}
                  source={source}
                  index={i}
                  onSelect={() => navigate(`/movies/${source}/${m.source_movie_id}?city_code=${cityCode}&slug=${encodeURIComponent(m.slug || '')}`)}
                />
              ))}
            </div>
          )}
        </motion.div>
      )}
    </section>
  );
}

function MovieCard({ movie, source, index, onSelect }) {
  const letter = (movie.title || '?').replace(/[^A-Za-z0-9]/g, '').charAt(0).toUpperCase() || 'M';
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
        <div className="absolute top-2.5 right-2.5 bg-black/70 backdrop-blur-sm px-2 py-0.5 rounded-lg text-[10px] font-bold text-white/80 border border-white/15 uppercase">
          {source === 'bookmyshow' ? 'BMS' : 'District'}
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
