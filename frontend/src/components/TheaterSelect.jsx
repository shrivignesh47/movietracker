import { useState, useEffect, useRef } from 'react';
import { Building2, Search, X, ChevronDown, MapPin } from 'lucide-react';

/**
 * Suggested-theater dropdown. Suggests the real theatres we know for this
 * movie/city, always offers "All theatres", and still accepts a typed name
 * when a cinema isn't in the list yet.
 *
 * value      — committed theatre name ("" = all theatres)
 * onChange    — committed selection changed
 * onQuery     — live text as the user types (optional, for list filtering)
 */
export default function TheaterSelect({
  options = [],
  value = '',
  onChange,
  onQuery,
  cityLabel = '',
  placeholder = 'Search your theatre…',
  allowCustom = true,
}) {
  const [query, setQuery] = useState(value || '');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const wrapRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    setQuery(value || '');
  }, [value]);

  useEffect(() => {
    const onDoc = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const normalized = options
    .filter((o) => o && o.name)
    .filter((o, i, arr) => arr.findIndex((x) => x.name === o.name) === i);

  const q = query.trim().toLowerCase();
  const matches = q
    ? normalized.filter(
        (o) =>
          o.name.toLowerCase().includes(q) ||
          String(o.address || '').toLowerCase().includes(q) ||
          String(o.chain || '').toLowerCase().includes(q)
      )
    : normalized;

  const typedIsExact = normalized.some((o) => o.name.toLowerCase() === q);
  const showCustom =
    allowCustom && q.length > 1 && !typedIsExact && !matches.some((o) => o.name.toLowerCase() === q);

  const pick = (name) => {
    onChange?.(name);
    onQuery?.(name);
    setQuery(name);
    setOpen(false);
    setActive(-1);
    inputRef.current?.blur();
  };

  const clear = (e) => {
    e.stopPropagation();
    setQuery('');
    onChange?.('');
    onQuery?.('');
    inputRef.current?.focus();
    setOpen(true);
  };

  const onKeyDown = (e) => {
    const rows = matches.length + (showCustom ? 1 : 0);
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setActive((i) => Math.min(i + 1, rows - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (open && active >= 0) {
        if (showCustom && active === matches.length) pick(query.trim());
        else if (matches[active]) pick(matches[active].name);
      } else if (showCustom) {
        pick(query.trim());
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  const rowClass = (i) =>
    `w-full text-left px-4 py-2.5 flex items-center gap-3 transition-colors ${
      i === active ? 'bg-accent-500/15' : 'hover:bg-white/5'
    }`;

  return (
    <div ref={wrapRef} className="relative">
      <div className="relative">
        <Building2
          size={17}
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
            onQuery?.(e.target.value);
            if (value) onChange?.('');
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          autoComplete="off"
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
          className="glass-input pl-11 pr-16 text-sm py-3.5"
        />
        <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
          {query && (
            <button
              type="button"
              onClick={clear}
              aria-label="Clear theatre"
              className="text-white/40 hover:text-white transition-colors"
            >
              <X size={15} />
            </button>
          )}
          <ChevronDown size={15} className="text-white/30" />
        </div>
      </div>

      {open && (
        <div
          role="listbox"
          className="absolute left-0 right-0 top-full mt-2 z-50 max-h-72 overflow-y-auto rounded-2xl border border-white/10 bg-dark-900/98 backdrop-blur-xl shadow-2xl py-2"
        >
          {/* Always-on "all theatres" option */}
          <button
            type="button"
            role="option"
            aria-selected={!value}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => pick('')}
            onMouseEnter={() => setActive(-1)}
            className={rowClass(-1)}
          >
            <span className="w-7 h-7 rounded-lg bg-white/5 flex items-center justify-center shrink-0">
              <Building2 size={14} className="text-white/50" />
            </span>
            <span className={`text-sm font-semibold ${!value ? 'text-accent-400' : 'text-white'}`}>
              {cityLabel ? `All theatres in ${cityLabel}` : 'All theatres'}
            </span>
          </button>

          {matches.map((o, i) => (
            <button
              key={o.id || o.name}
              type="button"
              role="option"
              aria-selected={value === o.name}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(o.name)}
              onMouseEnter={() => setActive(i)}
              className={rowClass(i)}
            >
              <span className="w-7 h-7 rounded-lg bg-accent-500/15 flex items-center justify-center shrink-0">
                <Building2 size={14} className="text-accent-400" />
              </span>
              <span className="min-w-0 flex-1">
                <span
                  className={`block text-sm font-semibold truncate ${
                    value === o.name ? 'text-accent-400' : 'text-white'
                  }`}
                >
                  {o.name}
                </span>
                {(o.address || o.chain) && (
                  <span className="block text-[11px] text-white/40 truncate">
                    {[o.chain, o.address].filter(Boolean).join(' · ')}
                  </span>
                )}
              </span>
              {o.distance != null && (
                <span className="text-[10px] font-bold text-white/40 bg-white/5 rounded-full px-2 py-0.5 shrink-0">
                  {Number(o.distance).toFixed(1)} km
                </span>
              )}
            </button>
          ))}

          {showCustom && (
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(query.trim())}
              onMouseEnter={() => setActive(matches.length)}
              className={rowClass(matches.length)}
            >
              <span className="w-7 h-7 rounded-lg bg-white/5 flex items-center justify-center shrink-0">
                <Search size={14} className="text-white/50" />
              </span>
              <span className="text-sm text-white/70">
                Watch <strong className="text-white">“{query.trim()}”</strong>
                <span className="block text-[11px] text-white/40">
                  Not in our list yet — we'll still match it when bookings open.
                </span>
              </span>
            </button>
          )}

          {!matches.length && !showCustom && (
            <div className="px-4 py-3 text-sm text-white/40 flex items-center gap-2">
              <MapPin size={14} /> No theatre matches. Keep typing to use your own.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
