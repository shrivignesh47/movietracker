import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Film, Ticket, RefreshCw, Layers } from 'lucide-react';
import { movies } from '../api';
import { toast } from 'react-hot-toast';
import { motion } from 'framer-motion';
import CitySearch from '../components/CitySearch';

const SOURCE_LABEL = { bookmyshow: 'BMS', district: 'District' };
const STATUS_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'now_showing', label: 'Now showing' },
  { key: 'upcoming', label: 'Upcoming' },
];

export default function MoviesPage() {
  const [cityCode, setCityCode] = useState('');
  const [cityName, setCityName] = useState('');
  const [movieList, setMovieList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState('all');
  const navigate = useNavigate();

  // "Now showing" also carries untagged movies — they aren't on any upcoming list.
  const filtered = movieList.filter((m) =>
    statusFilter === 'all'
      ? true
      : statusFilter === 'upcoming'
        ? m.release_status === 'upcoming'
        : m.release_status !== 'upcoming'
  );

  const handleCityChange = (code, name) => {
    setCityCode(code);
    setCityName(name);
    setMovieList([]);
  };

  const loadMovies = async () => {
    if (!cityCode) return;
    setLoading(true);
    try {
      const res = await movies('both', cityCode);
      const data = res.data?.movies || res.data || [];
      setMovieList(Array.isArray(data) ? data : []);
    } catch (err) {
      toast.error('Failed to load movies');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight font-display mb-1">Browse Movies</h1>
          <p className="text-white/50 text-sm">Select a city to see movies from BookMyShow & District together.</p>
        </div>
      </div>

      <div className="glass-panel p-6 md:p-8 rounded-3xl">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 items-end">
          <div className="sm:col-span-2">
            <label className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-3 block">City</label>
            <CitySearch
              source="both"
              value={cityCode}
              onChange={handleCityChange}
            />
          </div>
          {cityCode && (
            <button
              onClick={loadMovies}
              disabled={loading}
              className="btn-primary w-full"
            >
              {loading ? <Film size={20} className="animate-spin" /> : <><Film size={20} /> Show movies in {cityName}</>}
            </button>
          )}
        </div>
        <p className="flex items-center gap-2 text-[11px] text-white/40 mt-4">
          <Layers size={13} className="text-accent-400" />
          BookMyShow and District are searched together — upcoming and now-showing listed together, each card tagged with its platform and release status.
        </p>
      </div>

      {cityCode && !loading && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="space-y-5"
        >
          <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
            <h2 className="font-bold text-lg font-display">{filtered.length} movie{(filtered.length !== 1 ? 's' : '')} in {cityName}</h2>
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
              <p className="text-xs text-white/40 hidden sm:block">Tap a movie to view theaters & set alert</p>
            </div>
          </div>

          {movieList.length === 0 ? (
            <div className="glass-panel p-16 text-center rounded-3xl">
              <Film size={56} className="mx-auto mb-5 text-white/20" />
              <h3 className="font-bold text-white mb-2">No movies found</h3>
              <p className="text-white/50 text-sm">Try another city.</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="glass-panel p-16 text-center rounded-3xl">
              <Film size={56} className="mx-auto mb-5 text-white/20" />
              <h3 className="font-bold text-white mb-2">No movies match this filter</h3>
              <p className="text-white/50 text-sm">Try the All filter to see every movie.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
              {filtered.map((m) => (
                <MovieCard
                  key={m.source_movie_id}
                  movie={m}
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
    </div>
  );
}

function MovieCard({ movie, onSelect }) {
  const sources = Array.isArray(movie.sources) && movie.sources.length
    ? movie.sources
    : [movie.source];
  return (
    <div
      onClick={onSelect}
      role="button"
      tabIndex={0}
      className="group movie-card p-5"
    >
      <div className="aspect-[2/3] rounded-2xl bg-white/10 overflow-hidden relative mb-4">
        {movie.poster_url ? (
          <img
            src={movie.poster_url}
            alt={movie.title}
            className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-white/20">
            <Film size={40} />
          </div>
        )}
        {movie.release_status && (
          <div className="absolute top-3 left-3">
            <span
              className={`bg-black/70 backdrop-blur-sm px-2.5 py-1 rounded-xl text-[10px] font-bold border uppercase ${
                movie.release_status === 'upcoming'
                  ? 'text-amber-300 border-amber-400/40'
                  : 'text-emerald-300 border-emerald-400/40'
              }`}
            >
              {movie.release_status === 'upcoming' ? 'Upcoming' : 'Now showing'}
            </span>
          </div>
        )}
        <div className="absolute top-3 right-3 flex flex-col items-end gap-1">
          {sources.map((s) => (
            <span
              key={s}
              className={`bg-black/70 backdrop-blur-sm px-2.5 py-1 rounded-xl text-xs font-bold border ${
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
          <div className="absolute bottom-3 left-3 bg-green-500 px-3 py-1 rounded-xl text-xs font-bold text-white shadow-neon">
            🎟️ Bookable
          </div>
        )}
      </div>
      <h3 className="font-bold text-white text-sm leading-tight mb-2 group-hover:text-accent-400 transition-colors">{movie.title}</h3>
      <div className="flex items-center gap-1 text-xs text-white/50 mb-4">
        {movie.language && <span>{movie.language}</span>}
        {movie.genre && <> <span className="mx-0.5">•</span> <span>{movie.genre}</span> </>}
        {movie.duration && <> <span className="mx-0.5">•</span> <span>{movie.duration}</span> </>}
      </div>
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-accent-400">
          {movie.is_bookable ? '🎟️ Bookable' : 'Coming soon'}
        </span>
        <Ticket size={16} className="text-white/40" />
      </div>
    </div>
  );
}
