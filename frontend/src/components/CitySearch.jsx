import { useState, useEffect, useRef, useCallback } from 'react';
import { MapPin, Search, RefreshCw, X } from 'lucide-react';
import { cities } from '../api';

/**
 * Searchable city picker — type any Indian city.
 * Queries District's live location search via /scrape-cities, with an
 * instant static list as the first-load fallback. Fully keyboard driven.
 */
export default function CitySearch({ source, value, onChange, placeholder = 'Search any Indian city…', label = '' }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(-1);
  const wrapRef = useRef(null);
  const inputRef = useRef(null);
  const debounceRef = useRef(null);
  const reqIdRef = useRef(0);

  // Keep the input text in sync with the committed selection (or cleared)
  useEffect(() => {
    if (!value) setQuery('');
    else if (label) setQuery(label);
  }, [value, label]);

  const fetchCities = useCallback(async (q) => {
    const reqId = ++reqIdRef.current;
    setLoading(true);
    try {
      const res = await cities(source, q);
      if (reqId !== reqIdRef.current) return; // stale response
      const data = res.data?.cities || [];
      setResults(Array.isArray(data) ? data : []);
    } catch (_) {
      if (reqId === reqIdRef.current) setResults((prev) => (q ? [] : prev));
    } finally {
      if (reqId === reqIdRef.current) setLoading(false);
    }
  }, [source]);

  // Load the full list when the source changes or on first mount
  useEffect(() => {
    fetchCities('');
    setActive(-1);
  }, [fetchCities]);

  // Debounced live search while typing
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = query.trim();
    if (!q) {
      fetchCities('');
      return;
    }
    debounceRef.current = setTimeout(() => fetchCities(q), 300);
    return () => clearTimeout(debounceRef.current);
  }, [query, fetchCities]);

  // Close when clicking outside
  useEffect(() => {
    const onDoc = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const pick = (c) => {
    onChange(c.code, c.name);
    setQuery(c.name);
    setOpen(false);
    setActive(-1);
    inputRef.current?.blur();
  };

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setActive((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (open && active >= 0 && results[active]) pick(results[active]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  const clear = (e) => {
    e.stopPropagation();
    setQuery('');
    onChange('', '');
    setResults([]);
    inputRef.current?.focus();
    fetchCities('');
  };

  const showList = open && (results.length > 0 || loading);

  return (
    <div ref={wrapRef} className="relative">
      <MapPin
        size={18}
        className="absolute left-4 top-1/2 -translate-y-1/2 text-white/40 pointer-events-none z-10"
      />
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          setActive(-1);
          // Typing invalidates the previous selection
          if (value) onChange('', '');
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        autoComplete="off"
        role="combobox"
        aria-expanded={showList}
        aria-autocomplete="list"
        className="glass-input pl-11 pr-20"
      />
      <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
        {loading && <RefreshCw size={15} className="animate-spin text-accent-500" />}
        {query && !loading && (
          <button
            type="button"
            onClick={clear}
            aria-label="Clear city"
            className="text-white/40 hover:text-white transition-colors"
          >
            <X size={15} />
          </button>
        )}
        {!query && !loading && <Search size={15} className="text-white/30" />}
      </div>

      {showList && (
        <div
          role="listbox"
          className="absolute left-0 right-0 top-full mt-2 z-50 max-h-72 overflow-y-auto rounded-2xl border border-white/10 bg-dark-900/95 backdrop-blur-xl shadow-2xl py-2"
        >
          {loading && results.length === 0 && (
            <div className="px-4 py-3 text-sm text-white/40 flex items-center gap-2">
              <RefreshCw size={14} className="animate-spin" /> Searching cities…
            </div>
          )}
          {!loading && results.length === 0 && (
            <div className="px-4 py-3 text-sm text-white/40">No city found. Try another spelling.</div>
          )}
          {results.map((c, i) => (
            <button
              key={c.code}
              type="button"
              role="option"
              aria-selected={c.code === value}
              onMouseDown={(e) => e.preventDefault()} // keep focus, let onClick fire
              onClick={() => pick(c)}
              onMouseEnter={() => setActive(i)}
              className={`w-full text-left px-4 py-2.5 flex items-center justify-between gap-3 transition-colors ${
                i === active ? 'bg-accent-500/15' : 'hover:bg-white/5'
              } ${c.code === value ? 'text-accent-400' : 'text-white'}`}
            >
              <span className="text-sm font-semibold truncate">{c.name}</span>
              {c.subtitle && (
                <span className="text-xs text-white/40 truncate flex-shrink-0 max-w-[55%]">{c.subtitle}</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
