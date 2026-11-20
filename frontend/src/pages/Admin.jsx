import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { User, Shield, Bell, Users, AlertCircle, ChevronRight } from 'lucide-react';
import { supabase, admin } from '../api';
import { toast } from 'react-hot-toast';
import { motion } from 'framer-motion';

export default function AdminPage() {
  const [users, setUsers] = useState([]);
  const [allAlerts, setAllAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('users');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Check superadmin
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();
      if (profile?.role !== 'superadmin') {
        toast.error('Superadmin access required');
        return;
      }

      const [uRes, aRes] = await Promise.all([
        admin.users(),
        admin.alerts(),
      ]);
      setUsers(uRes.data || []);
      setAllAlerts(aRes.data?.alerts || aRes.data || []);
    } catch (err) {
      toast.error('Failed to load admin data');
    } finally {
      setLoading(false);
    }
  };

  const handleSetRole = async (id, role) => {
    try {
      const { error } = await admin.setRole(id, role);
      if (error) throw error;
      setUsers((list) => list.map((u) => (u.id === id ? { ...u, role } : u)));
      toast.success(`Role updated to ${role}`);
    } catch (err) {
      toast.error('Failed to update role');
    }
  };

  const handleToggleAdminAlert = async (id, current) => {
    try {
      const { error } = await admin.toggleAlert(id, !current);
      if (error) throw error;
      setAllAlerts((list) => list.map((a) => (a.id === id ? { ...a, is_active: !current ? 1 : 0 } : a)));
      toast.success(`Alert ${!current ? 'activated' : 'paused'}`);
    } catch (err) {
      toast.error('Failed to toggle alert');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-dark-980 p-6">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-accent-500 border-t-transparent rounded-full animate-spin mb-4"></div>
          <p className="text-white/50 text-sm">Loading admin panel…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight font-display mb-1">Superadmin</h1>
          <p className="text-white/50 text-sm">Manage users and all alerts.</p>
        </div>
        <Link to="/dashboard" className="btn-outline">
          <ChevronRight size={16} /> Back to dashboard
        </Link>
      </div>

      <div className="flex gap-1 border-b border-white/10 mb-8">
        <button
          onClick={() => setTab('users')}
          className={`px-5 py-3 text-sm font-medium transition-all border-b-2 ${
            tab === 'users'
              ? 'border-accent-500 text-accent-400'
              : 'text-white/50 border-transparent hover:text-white/70'
          }`}
        >
          <Users size={18} className="mr-2" /> Users ({users.length})
        </button>
        <button
          onClick={() => setTab('alerts')}
          className={`px-5 py-3 text-sm font-medium transition-all border-b-2 ${
            tab === 'alerts'
              ? 'border-accent-500 text-accent-400'
              : 'text-white/50 border-transparent hover:text-white/70'
          }`}
        >
          <Bell size={18} className="mr-2" /> All Alerts ({allAlerts.length})
        </button>
      </div>

      {tab === 'users' ? (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <UserList users={users} onSetRole={handleSetRole} />
        </motion.div>
      ) : (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <AlertList alerts={allAlerts} onToggle={handleToggleAdminAlert} />
        </motion.div>
      )}
    </div>
  );
}

function UserList({ users, onSetRole }) {
  return (
    <div className="glass-panel rounded-3xl overflow-hidden">
      <table className="w-full text-left">
        <thead>
          <tr className="border-b border-white/10 bg-white/5">
            <th className="px-6 py-4 text-xs font-semibold text-white/40 uppercase tracking-wider">Name</th>
            <th className="px-6 py-4 text-xs font-semibold text-white/40 uppercase tracking-wider">Email</th>
            <th className="px-6 py-4 text-xs font-semibold text-white/40 uppercase tracking-wider">Role</th>
            <th className="px-6 py-4 text-xs font-semibold text-white/40 uppercase tracking-wider">Telegram</th>
            <th className="px-6 py-4 text-xs font-semibold text-white/40 uppercase tracking-wider">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/10">
          {users.map((u) => (
            <tr key={u.id} className="hover:bg-white/5 transition-colors">
              <td className="px-6 py-4">
                <div className="text-white font-medium">{u.name || 'Unnamed'}</div>
              </td>
              <td className="px-6 py-4 text-white/70 text-sm">{u.email}</td>
              <td className="px-6 py-4">
                <select
                  value={u.role || 'user'}
                  onChange={(e) => onSetRole(u.id, e.target.value)}
                  className="bg-transparent border border-white/10 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-accent-500 focus:ring-1 focus:ring-accent-500"
                >
                  <option value="user">User</option>
                  <option value="superadmin">Superadmin</option>
                </select>
              </td>
              <td className="px-6 py-4 text-white/70 text-sm">
                {u.telegram_chat_id ? `✅ ${u.telegram_chat_id}` : '—'}
              </td>
              <td className="px-6 py-4">
                <span className={`px-3 py-1 rounded-full text-[10px] font-bold border ${
                  u.role === 'superadmin'
                    ? 'bg-accent-500/20 text-accent-400 border-accent-500/30'
                    : 'bg-white/10 text-white/40 border-white/10'
                }`}>
                  {u.role || 'user'}
                </span>
              </td>
            </tr>
          ))}
          {users.length === 0 && (
            <tr>
              <td colSpan={5} className="px-6 py-12 text-center text-white/50">No users found</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function AlertList({ alerts, onToggle }) {
  return (
    <div className="glass-panel rounded-3xl overflow-hidden">
      <table className="w-full text-left">
        <thead>
          <tr className="border-b border-white/10 bg-white/5">
            <th className="px-6 py-4 text-xs font-semibold text-white/40 uppercase tracking-wider">Movie</th>
            <th className="px-6 py-4 text-xs font-semibold text-white/40 uppercase tracking-wider">User</th>
            <th className="px-6 py-4 text-xs font-semibold text-white/40 uppercase tracking-wider">City / Source</th>
            <th className="px-6 py-4 text-xs font-semibold text-white/40 uppercase tracking-wider">Theater</th>
            <th className="px-6 py-4 text-xs font-semibold text-white/40 uppercase tracking-wider">Status</th>
            <th className="px-6 py-4 text-xs font-semibold text-white/40 uppercase tracking-wider">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/10">
          {alerts.map((a) => {
            const active = a.is_active === 1;
            return (
              <tr key={a.id} className="hover:bg-white/5 transition-colors">
                <td className="px-6 py-4">
                  <div className="text-white font-medium text-sm">{a.movie_title}</div>
                </td>
                <td className="px-6 py-4 text-white/70 text-sm">
                  {(a.profiles?.email || 'Unknown')}
                </td>
                <td className="px-6 py-4 text-white/70 text-sm">
                  {a.city_code} • {a.source}
                </td>
                <td className="px-6 py-4 text-white/70 text-sm truncation max-w-[160px]">
                  {a.theater_name || 'All theaters'}
                </td>
                <td className="px-6 py-4">
                  <span className={`px-3 py-1 rounded-full text-[10px] font-bold border ${
                    active ? 'bg-green-500/20 text-green-400 border-green-500/30' : 'bg-accent-500/20 text-accent-400 border-accent-500/30'
                  }`}>
                    {active ? 'Active' : 'Paused'}
                  </span>
                </td>
                <td className="px-6 py-4">
                  <button
                    onClick={() => onToggle(a.id, active)}
                    className={`p-2.5 rounded-xl transition-colors ${
                      active ? 'bg-accent-500/10 text-accent-400 hover:bg-accent-500/20' : 'bg-green-500/10 text-green-400 hover:bg-green-500/20'
                    }`}
                  >
                    {active ? <AlertCircle size={16} /> : <Bell size={16} />}
                  </button>
                </td>
              </tr>
            );
          })}
          {alerts.length === 0 && (
            <tr>
              <td colSpan={6} className="px-6 py-12 text-center text-white/50">No alerts found</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
