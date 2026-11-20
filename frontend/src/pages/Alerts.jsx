import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Bell, Clock, Ticket, Trash2, Pause, Play, ChevronRight, Plus,
  Bot, AlertTriangle, CheckCircle, RefreshCw, X, Shield, Sparkles
} from 'lucide-react';
import { supabase, alerts, telegram } from '../api';
import { toast } from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';

const POPULAR_CITIES = [
  { code: 'hyderabad', name: 'Hyderabad' },
  { code: 'mumbai', name: 'Mumbai' },
  { code: 'delhi', name: 'Delhi NCR' },
  { code: 'bengaluru', name: 'Bengaluru' },
  { code: 'chennai', name: 'Chennai' },
  { code: 'pune', name: 'Pune' },
  { code: 'kochi', name: 'Kochi' },
  { code: 'ahmedabad', name: 'Ahmedabad' },
  { code: 'kolkata', name: 'Kolkata' },
  { code: 'chandigarh', name: 'Chandigarh' },
];

export default function AlertsPage() {
  const navigate = useNavigate();
  const [alertList, setAlertList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [checkingNow, setCheckingNow] = useState(false);
  const [tgStatus, setTgStatus] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);

  // New alert form state
  const [formMovie, setFormMovie] = useState('');
  const [formSource, setFormSource] = useState('bookmyshow');
  const [formCity, setFormCity] = useState('hyderabad');
  const [formTheater, setFormTheater] = useState('');
  const [savingAlert, setSavingAlert] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [alertsRes, tgRes] = await Promise.all([
        alerts.list(),
        telegram.status(),
      ]);
      setAlertList(alertsRes.data || []);
      setTgStatus(tgRes?.data || null);
    } catch (err) {
      toast.error('Failed to load alerts');
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = async (id, current) => {
    try {
      const { error } = await alerts.toggle(id, !current);
      if (error) throw error;
      setAlertList((list) =>
        list.map((a) => (a.id === id ? { ...a, is_active: !current ? 1 : 0 } : a))
      );
      toast.success(`Alert ${!current ? 'activated' : 'paused'}`);
    } catch (err) {
      toast.error('Failed to toggle alert');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete and stop tracking this alert?')) return;
    try {
      const { error } = await alerts.remove(id);
      if (error) throw error;
      setAlertList((list) => list.filter((a) => a.id !== id));
      toast.success('Alert deleted');
    } catch (err) {
      toast.error('Failed to delete alert');
    }
  };

  const handleCheckNow = async () => {
    setCheckingNow(true);
    try {
      const res = await alerts.check();
      const notified = res?.data?.notified || 0;
      toast.success(`Check complete! ${notified} notification(s) sent.`);
      const updated = await alerts.list();
      setAlertList(updated.data || []);
    } catch (err) {
      toast.error('Alert check failed or Edge Function not deployed');
    } finally {
      setCheckingNow(false);
    }
  };

  const handleCreateAlert = async (e) => {
    e.preventDefault();
    if (!formMovie.trim()) {
      toast.error('Please enter the movie title');
      return;
    }
    setSavingAlert(true);
    try {
      const cityName = POPULAR_CITIES.find((c) => c.code === formCity)?.name || formCity;
      const { data, error } = await alerts.create({
        movie_title: formMovie.trim(),
        source: formSource,
        city_code: formCity,
        city_name: cityName,
        theater_name: formTheater.trim() || null,
        is_active: true,
        status: 'pending',
      });

      if (error) throw error;
      toast.success(`Tracking set for "${formMovie.trim()}"!`);
      setShowAddModal(false);
      setFormMovie('');
      setFormTheater('');
      const updated = await alerts.list();
      setAlertList(updated.data || []);

      // If telegram not connected, guide user
      if (!tgStatus?.connected) {
        toast((t) => (
          <span className="flex items-center gap-2">
            Link Telegram to get alerts on your phone!
            <button
              onClick={() => { toast.dismiss(t.id); navigate('/telegram'); }}
              className="px-2.5 py-1 bg-accent-500 text-white rounded-lg text-xs font-bold"
            >
              Connect
            </button>
          </span>
        ), { duration: 6000 });
      }
    } catch (err) {
      toast.error(err.message || 'Failed to save alert');
    } finally {
      setSavingAlert(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-accent-500 border-t-transparent rounded-full animate-spin mb-4 mx-auto"></div>
          <p className="text-white/50 text-sm">Loading your alerts…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Top Banner: Telegram Status */}
      {tgStatus?.connected ? (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-panel p-4 rounded-2xl bg-green-500/10 border-green-500/20 flex flex-wrap items-center justify-between gap-3"
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-green-500/20 text-green-400 flex items-center justify-center shrink-0">
              <CheckCircle size={18} />
            </div>
            <div>
              <p className="text-sm font-bold text-white">
                Telegram Alerts Active <span className="text-xs text-green-400 font-normal">(@movietracker bot linked)</span>
              </p>
              <p className="text-xs text-white/50">
                Alerts will be delivered instantly to {tgStatus.link?.telegram_username ? `@${tgStatus.link.telegram_username}` : `Chat ID: ${tgStatus.link?.telegram_chat_id}`}
              </p>
            </div>
          </div>
          <Link to="/telegram" className="text-xs font-semibold text-accent-400 hover:underline">
            Manage Bot Settings →
          </Link>
        </motion.div>
      ) : (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-panel p-4 rounded-2xl bg-amber-500/10 border-amber-500/25 flex flex-wrap items-center justify-between gap-3"
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center shrink-0">
              <AlertTriangle size={18} />
            </div>
            <div>
              <p className="text-sm font-bold text-white">Telegram Not Linked</p>
              <p className="text-xs text-white/50">
                Connect with our @movietracker bot using a 6-digit OTP to receive instant alerts the second bookings open.
              </p>
            </div>
          </div>
          <Link to="/telegram" className="btn-primary text-xs px-3.5 py-2 flex items-center gap-1.5 shadow-neon">
            <Bot size={14} /> Connect Telegram
          </Link>
        </motion.div>
      )}

      {/* Title & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight font-display mb-1">Movie Alerts</h1>
          <p className="text-white/50 text-sm">
            Watching BookMyShow & District 24/7. When bookings open, we alert you within the minute.
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <button
            onClick={handleCheckNow}
            disabled={checkingNow || alertList.length === 0}
            className="btn-outline text-xs px-3 py-2.5 flex items-center gap-1.5"
            title="Scan ticket listings immediately"
          >
            <RefreshCw size={14} className={checkingNow ? 'animate-spin' : ''} />
            Check Now
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            className="btn-primary text-sm px-4 py-2.5 flex items-center gap-2 shadow-neon"
          >
            <Plus size={16} /> Add Custom Alert
          </button>
        </div>
      </div>

      {/* Alerts list */}
      {alertList.length === 0 ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="glass-panel p-16 text-center rounded-4xl"
        >
          <div className="w-16 h-16 rounded-3xl bg-white/5 flex items-center justify-center mx-auto mb-5 text-white/30">
            <Bell size={36} />
          </div>
          <h3 className="font-bold text-xl text-white mb-2 font-display">No alerts set yet</h3>
          <p className="text-white/50 text-sm max-w-md mx-auto mb-7">
            Waiting for an upcoming movie like <strong className="text-white">Avengers: Doomsday</strong> at <strong className="text-white">Cinepolis</strong>? Set an alert and we will notify your Telegram the second tickets go live!
          </p>
          <div className="flex flex-wrap gap-3 justify-center">
            <button onClick={() => setShowAddModal(true)} className="btn-primary flex items-center gap-2">
              <Plus size={18} /> Set Pre-Booking Alert
            </button>
            <Link to="/movies" className="btn-outline flex items-center gap-2">
              <Ticket size={18} /> Browse Live Movies
            </Link>
          </div>
        </motion.div>
      ) : (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
          {alertList.map((a) => (
            <AlertCard
              key={a.id}
              alert={a}
              onToggle={handleToggle}
              onDelete={handleDelete}
            />
          ))}
        </motion.div>
      )}

      {/* ADD ALERT MODAL */}
      <AnimatePresence>
        {showAddModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="glass-panel p-6 sm:p-8 rounded-4xl max-w-lg w-full relative border border-white/15"
            >
              <button
                onClick={() => setShowAddModal(false)}
                className="absolute top-5 right-5 text-white/50 hover:text-white p-2 rounded-xl hover:bg-white/5 transition-colors"
              >
                <X size={20} />
              </button>

              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 rounded-2xl bg-accent-500/20 text-accent-400 flex items-center justify-center shadow-neon">
                  <Sparkles size={24} />
                </div>
                <div>
                  <h3 className="text-xl font-bold font-display text-white">Add Booking Alert</h3>
                  <p className="text-xs text-white/50">Pre-book alert for any movie & theater</p>
                </div>
              </div>

              <form onSubmit={handleCreateAlert} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-white/60 uppercase tracking-wider">
                    Movie Title *
                  </label>
                  <input
                    type="text"
                    value={formMovie}
                    onChange={(e) => setFormMovie(e.target.value)}
                    placeholder="e.g. Avengers: Doomsday"
                    required
                    className="glass-input"
                  />
                  <p className="text-[11px] text-white/40">
                    Works for any announced, upcoming, or current movie.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-white/60 uppercase tracking-wider">
                      Platform
                    </label>
                    <select
                      value={formSource}
                      onChange={(e) => setFormSource(e.target.value)}
                      className="glass-input"
                    >
                      <option value="bookmyshow">BookMyShow</option>
                      <option value="district">District</option>
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-white/60 uppercase tracking-wider">
                      City
                    </label>
                    <select
                      value={formCity}
                      onChange={(e) => setFormCity(e.target.value)}
                      className="glass-input"
                    >
                      {POPULAR_CITIES.map((c) => (
                        <option key={c.code} value={c.code}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-white/60 uppercase tracking-wider">
                    Specific Theater (Optional)
                  </label>
                  <input
                    type="text"
                    value={formTheater}
                    onChange={(e) => setFormTheater(e.target.value)}
                    placeholder="e.g. Cinepolis, PVR Forum, INOX (or leave blank for all)"
                    className="glass-input"
                  />
                  <p className="text-[11px] text-white/40">
                    Leave blank to get notified when ANY theater in {formCity} opens booking.
                  </p>
                </div>

                <div className="pt-3">
                  <button
                    type="submit"
                    disabled={savingAlert}
                    className="btn-primary w-full justify-center text-sm py-3.5 shadow-neon"
                  >
                    {savingAlert ? <RefreshCw size={18} className="animate-spin" /> : <><Bell size={18} /> Start Monitoring</>}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function AlertCard({ alert, onToggle, onDelete }) {
  const active = alert.is_active === 1 || alert.is_active === true;
  const isTriggered = alert.status === 'triggered';

  return (
    <motion.div
      layout
      className={`glass-panel p-5 rounded-3xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 border ${
        isTriggered ? 'border-green-500/40 bg-green-500/5' : active ? 'border-white/10' : 'border-white/5 opacity-60'
      }`}
    >
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2.5 mb-1.5">
          <h3 className="font-bold text-white text-base truncate">{alert.movie_title}</h3>
          <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${
            isTriggered
              ? 'bg-green-500/20 text-green-400 border-green-500/40'
              : active
              ? 'bg-accent-500/20 text-accent-400 border-accent-500/40'
              : 'bg-white/10 text-white/50 border-white/10'
          }`}>
            {isTriggered ? '🚨 Tickets Open!' : active ? '🟢 Watching' : '⏸️ Paused'}
          </span>
          <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-lg bg-white/5 text-white/50 border border-white/10">
            {alert.source === 'district' ? 'District' : 'BookMyShow'}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-white/60">
          <span>📍 {alert.city_name || alert.city_code}</span>
          <span>•</span>
          <span>🎭 {alert.theater_name ? alert.theater_name : 'All theaters in city'}</span>
          {alert.last_checked_at && (
            <>
              <span>•</span>
              <span className="text-[11px] text-white/40">
                Last checked: {new Date(alert.last_checked_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 self-end sm:self-center">
        <button
          onClick={() => onToggle(alert.id, active)}
          className={`p-2.5 rounded-2xl transition-all ${
            active
              ? 'bg-amber-500/15 text-amber-400 hover:bg-amber-500/25'
              : 'bg-green-500/15 text-green-400 hover:bg-green-500/25'
          }`}
          title={active ? 'Pause monitoring' : 'Resume monitoring'}
        >
          {active ? <Pause size={18} /> : <Play size={18} />}
        </button>
        <button
          onClick={() => onDelete(alert.id)}
          className="p-2.5 rounded-2xl text-white/40 hover:text-red-400 hover:bg-red-500/10 transition-colors"
          title="Delete alert"
        >
          <Trash2 size={18} />
        </button>
      </div>
    </motion.div>
  );
}
