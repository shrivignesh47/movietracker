import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Film, Ticket, Bell, Bot, TrendingUp, AlertCircle, CheckCircle, Clock } from 'lucide-react';
import { telegram, alerts } from '../api';
import { toast } from 'react-hot-toast';
import { motion } from 'framer-motion';

export default function Dashboard() {
  const [tgStatus, setTgStatus] = useState(null);
  const [myAlerts, setMyAlerts] = useState([]);
  const [stats, setStats] = useState({ total: 0, active: 0, paused: 0 });
  const navigate = useNavigate();

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [tgRes, alertsRes] = await Promise.all([
        telegram.status(),
        alerts.list(),
      ]);

      if (tgRes.data) setTgStatus(tgRes.data);

      if (alertsRes.data) {
        setMyAlerts(alertsRes.data || []);
        const total = (alertsRes.data || []).length;
        const active = (alertsRes.data || []).filter((a) => a.is_active).length;
        setStats({ total, active, paused: total - active });
      }
    } catch (err) {
      // silently fail
    }
  };

  const handleCheckNow = async () => {
    try {
      const res = await alerts.check();
      toast.success(`Checked alerts, ${res.data?.sent || 0} new notification(s) sent`);
      loadData();
    } catch (err) {
      toast.error('Failed to check alerts');
    }
  };

  const statCards = [
    { label: 'Total Alerts', value: stats.total, icon: <Film size={22} />, color: 'text-white', bg: 'bg-white/5' },
    { label: 'Active', value: stats.active, icon: <CheckCircle size={22} />, color: 'text-green-400', bg: 'bg-green-500/10' },
    { label: 'Paused', value: stats.paused, icon: <AlertCircle size={22} />, color: 'text-amber-400', bg: 'bg-amber-500/10' },
    { label: 'Telegram', value: tgStatus?.connected ? 'Connected' : 'Not connected', icon: <Bot size={22} />, color: tgStatus?.connected ? 'text-green-400' : 'text-white/60', bg: 'bg-white/5' },
  ];

  return (
    <div className="space-y-8">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between"
      >
        <div>
          <h1 className="text-3xl font-bold tracking-tight font-display mb-1">Dashboard</h1>
          <p className="text-white/50 text-sm">Track movies and manage your booking alerts.</p>
        </div>
        <button onClick={handleCheckNow} className="btn-outline flex items-center gap-2">
          <Clock size={18} /> Check Now
        </button>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5"
      >
        {statCards.map((card) => (
          <StatCard key={card.label} {...card} />
        ))}
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5"
      >
        <QuickAction
          title="Track a movie"
          desc="Browse BookMyShow & District movies and set alerts"
          icon={<Ticket size={24} />}
          onClick={() => navigate('/movies')}
        />
        <QuickAction
          title="My Alerts"
          desc="View and manage all your movie alerts"
          icon={<Bell size={24} />}
          onClick={() => navigate('/alerts')}
        />
        <QuickAction
          title="Check now"
          desc="Manually check all active alerts for open bookings"
          icon={<TrendingUp size={24} />}
          onClick={handleCheckNow}
          primary
        />
      </motion.div>

      {!tgStatus?.connected && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="glass-panel p-6 md:p-8 rounded-3xl border-l-4 border-accent-500 animate-fade-in"
        >
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-2xl bg-accent-500/20 flex items-center justify-center text-accent-400 flex-shrink-0 shadow-neon">
              <Bot size={24} />
            </div>
            <div>
              <h3 className="font-bold text-white mb-1 font-display">Connect Telegram to receive alerts</h3>
              <p className="text-white/60 text-sm leading-relaxed">
                Link your Telegram chat so MovieTracker can send you instant notifications when tickets open for your tracked movies.
              </p>
            </div>
          </div>
          <div className="mt-6 flex gap-3">
            <button
              onClick={() => navigate('/telegram', { state: { from: '/dashboard' } })}
              className="btn-primary flex-1"
            >
              Connect Telegram
            </button>
          </div>
        </motion.div>
      )}

      {myAlerts.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
        >
          <div className="flex items-center justify-between mb-5">
            <h2 className="font-bold text-lg font-display">Recent Alerts</h2>
            <Link to="/alerts" className="text-sm text-accent-400 hover:underline font-medium">View all</Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {myAlerts.slice(0, 6).map((a) => (
              <RecentAlertCard key={a.id} alert={a} />
            ))}
          </div>
        </motion.div>
      )}
    </div>
  );
}

function StatCard({ label, value, icon, color, bg }) {
  return (
    <div className={['glass-panel p-6 rounded-3xl', bg].join(' ')}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-1">{label}</p>
          <p className="text-2xl font-bold {color} font-display mt-1">{value}</p>
        </div>
        <div className="w-11 h-11 rounded-2xl bg-white/5 flex items-center justify-center text-white/50">
          {icon}
        </div>
      </div>
    </div>
  );
}

function QuickAction({ title, desc, icon, onClick, primary = false }) {
  return (
    <div
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onClick()}
      className={`glass-panel p-6 rounded-3xl cursor-pointer transition-all duration-300 hover:bg-white/10 hover:border-white/20 group ${primary ? 'border-accent-500/50' : ''}`}
    >
      <div className="w-13 h-13 rounded-2xl bg-white/10 flex items-center justify-center mb-5 group-hover:bg-accent-500 group-hover:text-white transition-colors">
        {icon}
      </div>
      <h3 className="font-bold text-white mb-1 font-display">{title}</h3>
      <p className="text-white/50 text-sm">{desc}</p>
    </div>
  );
}

function RecentAlertCard({ alert }) {
  const active = alert.is_active === 1;
  return (
    <div className="glass-panel p-5 rounded-2xl">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <p className="font-bold text-white text-sm truncation">{alert.movie_title}</p>
          <p className="text-xs text-white/50 mt-1">
            {alert.source} • {alert.city_code}{alert.theater_name ? ` @ ${alert.theater_name}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full border ${
            active ? 'bg-green-500/20 text-green-400 border-green-500/30' : 'bg-accent-500/20 text-accent-400 border-accent-500/30'
          }`}>
            {active ? 'Active' : 'Paused'}
          </span>
        </div>
      </div>
    </div>
  );
}
