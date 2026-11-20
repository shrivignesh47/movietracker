import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Film, Ticket, RefreshCw } from 'lucide-react';
import { movies } from '../api';
import { toast } from 'react-hot-toast';
import { motion } from 'framer-motion';
import CitySearch from '../components/CitySearch';

const SOURCES = [
  { value: 'bookmyshow', label: 'BookMyShow', color: 'text-blue-400', bg: 'bg-blue-500/10' },
  { value: 'district', label: 'District', color: 'text-purple-400', bg: 'bg-purple-500/10' },
];

export default function MoviesPage() {
  const [source, setSource] = useState('bookmyshow');
  const [cityCode, setCityCode] = useState('');
  const [cityName, setCityName] = useState('');
  const [movieList, setMovieList] = useState([]);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleCityChange = (code, name) => {
    setCityCode(code);
    setCityName(name);
    setMovieList([]);
  };

  const loadMovies = async () => {
    if (!cityCode) return;
    setLoading(true);
    try {
      const res = await movies(source, cityCode);
      const data = res.data?.movies || res.data || [];
      setMovieList(data);
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
          <p className="text-white/50 text-sm">Select a city to see movies and set tracking alerts.</p>
        </div>
      </div>

      <div className="glass-panel p-6 md:p-8 rounded-3xl">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 items-end">
          <div>
            <label className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-3 block">Platform</label>
            <div className="flex gap-3">
              {SOURCES.map((s) => (
                <button
                  key={s.value}
                  onClick={() => { setSource(s.value); setCityCode(''); setCityName(''); setMovieList([]); }}
                  className={`px-5 py-3 rounded-2xl text-sm font-bold transition-all duration-300 ${
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
          <div>
            <label className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-3 block">City</label>
            <CitySearch
              key={source}
              source={source}
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
      </div>

      {cityCode && !loading && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="space-y-5"
        >
          <div className="flex items-center justify-between mb-2">
            <h2 className="font-bold text-lg font-display">{movieList.length} movie{(movieList.length !== 1 ? 's' : '')} in {cityName}</h2>
            <p className="text-xs text-white/40">Tap a movie to view theaters & set alert</p>
          </div>

          {movieList.length === 0 ? (
            <div className="glass-panel p-16 text-center rounded-3xl">
              <Film size={56} className="mx-auto mb-5 text-white/20" />
              <h3 className="font-bold text-white mb-2">No movies found</h3>
              <p className="text-white/50 text-sm">Try another city or platform.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
              {movieList.map((m) => (
                <MovieCard key={m.source_movie_id} movie={m} source={source} cityCode={cityCode} onSelect={() => navigate(`/movies/${source}/${m.source_movie_id}?city_code=${cityCode}&slug=${encodeURIComponent(m.slug || '')}`)} />
              ))}
            </div>
          )}
        </motion.div>
      )}
    </div>
  );
}

function MovieCard({ movie, source, cityCode, onSelect }) {
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
        <div className="absolute top-3 right-3 bg-black/60 backdrop-blur-sm px-2.5 py-1 rounded-xl text-xs font-bold text-white border border-white/20">
          {source}
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
