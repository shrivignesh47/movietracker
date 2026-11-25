import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  X, Bell, Calendar, Send, CheckCircle, RefreshCw,
  ExternalLink, Sparkles, Bot
} from 'lucide-react';
import { alerts, telegram } from '../api';
import TheaterSelect from './TheaterSelect';
import CitySearch from './CitySearch';
import { toast } from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';

/**
 * Structured alert flow: pick theatre → pick date → connect Telegram →
 * "We'll check it for you". Used from the movie page (suggested theatres,
 * real show dates) and from the Alerts page (free-form custom alert).
 */
export default function AlertModal({
  open,
  onClose,
  tgStatus,
  refreshTg,
  initial = {},
  showCity = false,
  showPlatform = false,
  onSaved,
}) {
  const navigate = useNavigate();

  const [movieTitle, setMovieTitle] = useState('');
  const [source, setSource] = useState('bookmyshow');
  const [cityCode, setCityCode] = useState('');
  const [cityName, setCityName] = useState('');
  const [theater, setTheater] = useState('');
  const [targetDate, setTargetDate] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [otp, setOtp] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [checkingLink, setCheckingLink] = useState(false);

  // Re-initialise whenever the modal is (re)opened.
  useEffect(() => {
    if (!open) return;
    setMovieTitle(initial.movieTitle || '');
    setSource(initial.source || 'bookmyshow');
    setCityCode(initial.cityCode || '');
    setCityName(initial.cityName || '');
    setTheater(initial.theater || '');
    setTargetDate(initial.targetDate || '');
    setSaved(false);
    setOtp(null);
    setSaving(false);
    setGenerating(false);
    setCheckingLink(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const connected = !!tgStatus?.connected;
  const botName = tgStatus?.bot_username || 'Theatre_Movie_tracker_bot';
  const suggestions = Array.isArray(initial.suggestions) ? initial.suggestions : [];
  const showDates = Array.isArray(initial.showDates) ? initial.showDates : [];

  // While an OTP is on screen, listen for the bot linking the account.
  useEffect(() => {
    if (!open || !otp || connected) return;
    const id = setInterval(async () => {
      try {
        const res = await telegram.status();
        if (res?.data?.connected) {
          setOtp(null);
          refreshTg?.();
          toast.success('🎉 Telegram linked successfully!');
        }
      } catch (_) { /* keep listening */ }
    }, 3000);
    return () => clearInterval(id);
  }, [open, otp, connected, refreshTg]);

  const handleGenerateOtp = async () => {
    setGenerating(true);
    try {
      const data = await telegram.generateOtp();
      setOtp(data);
      toast.success(`Code generated — send it to @${data.bot_username || botName}`);
    } catch (err) {
      toast.error(err.message || 'Failed to generate OTP');
    } finally {
      setGenerating(false);
    }
  };

  const handleCheckLinked = async () => {
    setCheckingLink(true);
    try {
      const res = await telegram.status();
      if (res?.data?.connected) {
        setOtp(null);
        refreshTg?.();
        toast.success('🎉 Telegram linked successfully!');
      } else {
        toast.error('Not linked yet — send the code to the bot first.');
      }
    } catch (_) {
      toast.error('Could not check status, try again.');
    } finally {
      setCheckingLink(false);
    }
  };

  const handleConfirm = async (e) => {
    e?.preventDefault?.();
    if (!movieTitle.trim()) {
      toast.error('Please enter the movie title');
      return;
    }
    if (!connected) {
      toast.error('Connect Telegram first — that is where the alert is delivered.');
      return;
    }
    setSaving(true);
    try {
      const { error } = await alerts.create({
        movie_title: movieTitle.trim(),
        source,
        source_movie_id: initial.sourceMovieId || null,
        slug: initial.slug || null,
        alt_source_movie_id: initial.altSourceMovieId || null,
        city_code: cityCode || initial.cityCode || 'hyderabad',
        city_name: cityName || initial.cityName || null,
        theater_name: theater.trim() || null,
        language: initial.language || null,
        target_date: targetDate || null,
        is_active: true,
        status: 'pending',
      });
      if (error) throw error;
      setSaved(true);
      onSaved?.();
    } catch (err) {
      toast.error(err.message || 'Failed to save alert');
    } finally {
      setSaving(false);
    }
  };

  const stepLabel = (n, text) => (
    <div className="flex items-center gap-2 mb-2">
      <span className="w-5 h-5 rounded-full bg-accent-500/20 text-accent-400 text-[10px] font-black flex items-center justify-center">
        {n}
      </span>
      <span className="text-xs font-semibold text-white/50 uppercase tracking-wider">{text}</span>
    </div>
  );

  const cityLabel = cityName || (cityCode ? cityCode.charAt(0).toUpperCase() + cityCode.slice(1) : '');

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 12 }}
            className="glass-panel p-6 sm:p-8 rounded-4xl max-w-xl w-full max-h-[92vh] overflow-y-auto relative border border-white/15"
          >
            <button
              onClick={onClose}
              aria-label="Close"
              className="absolute top-5 right-5 text-white/50 hover:text-white p-2 rounded-xl hover:bg-white/5 transition-colors z-10"
            >
              <X size={20} />
            </button>

            {saved ? (
              <div className="text-center py-4">
                <div className="w-16 h-16 rounded-3xl bg-green-500/20 text-green-400 flex items-center justify-center mx-auto mb-5 shadow-neon">
                  <CheckCircle size={34} />
                </div>
                <h3 className="text-2xl font-bold font-display text-white mb-2">
                  We'll check it for you
                </h3>
                <p className="text-white/60 text-sm leading-relaxed mb-6">
                  Our scanner runs every minute. The second {theater ? (
                    <strong className="text-white">{theater}</strong>
                  ) : (
                    <>bookings in <strong className="text-white">{cityLabel || 'your city'}</strong></>
                  )} opens {movieTitle} tickets, you get a Telegram message — usually within a minute.
                </p>

                <div className="text-left bg-white/5 p-4 rounded-2xl border border-white/10 mb-6 space-y-1.5 text-sm">
                  <div className="flex justify-between gap-3">
                    <span className="text-white/40">Movie</span>
                    <span className="text-white font-semibold text-right">{movieTitle}</span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span className="text-white/40">Theatre</span>
                    <span className="text-white font-semibold text-right">
                      {theater || `All theatres in ${cityLabel}`}
                    </span>
                  </div>
                  {initial.language && (
                    <div className="flex justify-between gap-3">
                      <span className="text-white/40">Language</span>
                      <span className="text-white font-semibold">{initial.language}</span>
                    </div>
                  )}
                  <div className="flex justify-between gap-3">
                    <span className="text-white/40">Show date</span>
                    <span className="text-white font-semibold">
                      {targetDate || 'First date that opens'}
                    </span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span className="text-white/40">Platform</span>
                    <span className="text-white font-semibold">
                      {source === 'district' ? 'District' : 'BookMyShow'}
                      {initial.altSourceMovieId ? ' + other' : ''}
                    </span>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-3">
                  <button
                    onClick={() => { onClose(); navigate('/alerts'); }}
                    className="btn-primary flex-1 justify-center text-sm py-3.5 shadow-neon"
                  >
                    <Bell size={17} /> View my alerts
                  </button>
                  <button onClick={onClose} className="btn-outline flex-1 justify-center text-sm py-3.5">
                    Done
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleConfirm} className="space-y-5">
                <div className="flex items-center gap-3 mb-1 pr-8">
                  <div className="w-12 h-12 rounded-2xl bg-accent-500/20 text-accent-400 flex items-center justify-center shadow-neon shrink-0">
                    <Sparkles size={24} />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-xl font-bold font-display text-white leading-tight">
                      Set your alert
                    </h3>
                    <p className="text-xs text-white/50">
                      Theatre → date → Telegram. We watch, you get pinged.
                    </p>
                  </div>
                </div>

                {/* 1 — Movie */}
                <div>
                  {stepLabel(1, 'Movie')}
                  <input
                    type="text"
                    value={movieTitle}
                    onChange={(e) => setMovieTitle(e.target.value)}
                    placeholder="e.g. Avengers: Doomsday"
                    className="glass-input text-sm py-3.5"
                  />
                </div>

                {/* City + platform (custom alerts only) */}
                {(showCity || showPlatform) && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {showCity && (
                      <div>
                        {stepLabel(2, 'City')}
                        <CitySearch
                          source={source}
                          value={cityCode}
                          label={cityName}
                          onChange={(code, name) => { setCityCode(code); setCityName(name); }}
                          placeholder="Search any Indian city…"
                        />
                      </div>
                    )}
                    {showPlatform && (
                      <div>
                        {stepLabel(showCity ? 3 : 2, 'Platform to watch')}
                        <select
                          value={source}
                          onChange={(e) => setSource(e.target.value)}
                          className="glass-input text-sm py-3.5"
                        >
                          <option value="bookmyshow">BookMyShow</option>
                          <option value="district">District</option>
                        </select>
                      </div>
                    )}
                  </div>
                )}

                {/* Theatre */}
                <div>
                  {stepLabel(showCity && showPlatform ? 4 : showCity || showPlatform ? 3 : 2, 'Your theatre')}
                  <TheaterSelect
                    options={suggestions}
                    value={theater}
                    onChange={setTheater}
                    cityLabel={cityLabel}
                    placeholder={suggestions.length ? 'Search your theatre…' : 'Theatre name (e.g. Cinepolis)…'}
                  />
                  <p className="text-[11px] text-white/40 mt-1.5">
                    {suggestions.length
                      ? `${suggestions.length} theatre${suggestions.length !== 1 ? 's' : ''} found for this movie — pick yours, or leave blank to watch every theatre.`
                      : 'Leave blank to get notified as soon as ANY theatre opens booking.'}
                  </p>
                </div>

                {/* Date */}
                <div>
                  {stepLabel(showCity && showPlatform ? 5 : showCity || showPlatform ? 4 : 3, 'Show date')}
                  {showDates.length > 0 ? (
                    <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1">
                      <button
                        type="button"
                        onClick={() => setTargetDate('')}
                        className={`flex-shrink-0 px-4 py-2.5 rounded-xl text-xs font-bold border transition-all ${
                          !targetDate
                            ? 'bg-gradient-to-r from-accent-500 to-cinema-600 text-white border-transparent shadow-neon'
                            : 'bg-white/5 text-white/60 border-white/10 hover:bg-white/10'
                        }`}
                      >
                        Any date
                      </button>
                      {showDates.map((d) => {
                        const dt = new Date(`${d}T00:00:00`);
                        const active = targetDate === d;
                        return (
                          <button
                            key={d}
                            type="button"
                            onClick={() => setTargetDate(d)}
                            className={`flex-shrink-0 px-4 py-2.5 rounded-xl text-xs font-bold border transition-all ${
                              active
                                ? 'bg-gradient-to-r from-accent-500 to-cinema-600 text-white border-transparent shadow-neon'
                                : 'bg-white/5 text-white/60 border-white/10 hover:bg-white/10'
                            }`}
                          >
                            {dt.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}
                          </button>
                        );
                      })}
                    </div>
                  ) : null}

                  <div className="flex items-center gap-2.5 mt-1">
                    <Calendar size={16} className="text-white/40 shrink-0" />
                    <input
                      type="date"
                      value={targetDate}
                      onChange={(e) => setTargetDate(e.target.value)}
                      className="glass-input text-sm py-3 flex-1"
                    />
                  </div>
                  <p className="text-[11px] text-white/40 mt-1.5">
                    {targetDate
                      ? `Watching ${targetDate} specifically.`
                      : 'Blank = we alert you the moment ANY date opens.'}
                  </p>
                </div>

                {/* Telegram gate */}
                <div>
                  {stepLabel(showCity && showPlatform ? 6 : showCity || showPlatform ? 5 : 4, 'Telegram notification')}
                  {connected ? (
                    <div className="flex items-center gap-3 bg-green-500/10 border border-green-500/25 rounded-2xl p-4">
                      <div className="w-9 h-9 rounded-xl bg-green-500/20 text-green-400 flex items-center justify-center shrink-0">
                        <CheckCircle size={18} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-white">Telegram connected</p>
                        <p className="text-xs text-white/50 truncate">
                          Alerts go to{' '}
                          {tgStatus.link?.telegram_username
                            ? `@${tgStatus.link.telegram_username}`
                            : `chat ${tgStatus.link?.telegram_chat_id}`}
                          {' '}via @{botName}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="bg-amber-500/10 border border-amber-500/25 rounded-2xl p-4 space-y-3">
                      <div className="flex items-start gap-3">
                        <div className="w-9 h-9 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center shrink-0">
                          <Bot size={18} />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-white">Connect Telegram to continue</p>
                          <p className="text-xs text-white/50">
                            Alerts are delivered on Telegram — link @{botName} once with a 6-digit code.
                          </p>
                        </div>
                      </div>

                      {!otp ? (
                        <button
                          type="button"
                          onClick={handleGenerateOtp}
                          disabled={generating}
                          className="btn-primary w-full justify-center text-sm py-3 shadow-neon"
                        >
                          {generating
                            ? <RefreshCw size={16} className="animate-spin" />
                            : <><Send size={16} /> Generate connect code</>}
                        </button>
                      ) : (
                        <div className="space-y-3 bg-black/30 rounded-xl p-4 border border-white/10">
                          <div className="flex items-center justify-center gap-3">
                            <span className="font-mono text-3xl font-black tracking-widest text-accent-400 select-all">
                              {otp.otp}
                            </span>
                          </div>
                          <a
                            href={otp.telegram_url || `https://t.me/${botName}?start=${otp.otp}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="btn-primary w-full justify-center text-sm py-3 shadow-neon"
                          >
                            <Send size={16} /> Open @{botName} in Telegram <ExternalLink size={14} />
                          </a>
                          <div className="flex items-center gap-2 text-[11px] text-white/40 justify-center">
                            <span className="w-1.5 h-1.5 rounded-full bg-accent-500 animate-ping" />
                            Listening for the bot — expires in 15 minutes
                          </div>
                          <button
                            type="button"
                            onClick={handleCheckLinked}
                            disabled={checkingLink}
                            className="btn-outline w-full justify-center text-sm py-3"
                          >
                            {checkingLink
                              ? <RefreshCw size={15} className="animate-spin" />
                              : <><CheckCircle size={15} /> I've sent it — check now</>}
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Confirm */}
                <div className="pt-1 space-y-3">
                  <button
                    type="submit"
                    disabled={saving || !connected}
                    className="btn-primary w-full justify-center text-base py-4 shadow-neon"
                  >
                    {saving ? (
                      <RefreshCw size={18} className="animate-spin" />
                    ) : connected ? (
                      <><Bell size={18} /> We'll check it for you</>
                    ) : (
                      <><Bot size={18} /> Connect Telegram to continue</>
                    )}
                  </button>
                  <p className="text-[11px] text-white/40 text-center">
                    Scanned every minute · one alert per opening · pause or delete anytime
                  </p>
                </div>
              </form>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
