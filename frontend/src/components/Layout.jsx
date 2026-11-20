import { useState, useEffect } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { Menu, X, Bell, Film, Ticket, LogOut, Send, Shield, User } from 'lucide-react';
import { auth, supabase } from '../api';
import { motion } from 'framer-motion';
import { toast } from 'react-hot-toast';

export default function Layout() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [user, setUser] = useState(null);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user || null);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user || null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const handleLogout = async () => {
    try { await auth.signOut(); } catch (_) {}
    setUser(null);
    toast.success('Signed out');
    navigate('/');
  };

  const isHome = location.pathname === '/';

  return (
    <div className="min-h-screen bg-dark-980 text-white">
      {/* ============ DESKTOP NAV ============ */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-dark-980/85 backdrop-blur-xl border-b border-white/10">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5 cursor-pointer shrink-0" onClick={() => navigate('/')}>
            <div className="w-9 h-9 rounded-2xl bg-gradient-to-br from-accent-500 to-cinema-600 flex items-center justify-center font-bold text-lg shadow-neon">
              <Ticket size={20} />
            </div>
            <span className="font-bold text-lg tracking-tight font-display hidden sm:inline">
              Movie<span className="text-accent-400">Tracker</span>
            </span>
          </div>

          <div className="hidden md:flex items-center gap-1.5">
            <navLink to="/" label="Tracker" icon={<Film size={17} />} active={isHome || location.pathname.startsWith('/movies')} />
            <navLink to="/alerts" label="My Alerts" icon={<Bell size={17} />} active={location.pathname === '/alerts'} />
            <navLink to="/telegram" label="Telegram" icon={<Send size={17} />} active={location.pathname === '/telegram'} />
          </div>

          <div className="flex items-center gap-2.5">
            {user ? (
              <>
                <div className="hidden sm:flex items-center gap-2 text-xs font-medium text-white/60 bg-white/5 border border-white/10 rounded-full pl-3 pr-4 py-2">
                  <User size={14} className="text-accent-400" />
                  <span className="max-w-[140px] truncate">{user.email}</span>
                </div>
                <button
                  onClick={handleLogout}
                  className="flex items-center gap-1.5 text-sm font-medium text-white/60 hover:text-white transition-colors px-3 py-2 rounded-xl hover:bg-white/5"
                >
                  <LogOut size={15} /> <span className="hidden sm:inline">Sign out</span>
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => navigate('/login')}
                  className="text-sm font-semibold text-white/70 hover:text-white transition-colors px-4 py-2.5 rounded-xl hover:bg-white/5"
                >
                  Sign in
                </button>
                <button
                  onClick={() => navigate('/login?mode=signup')}
                  className="text-sm font-bold bg-gradient-to-r from-accent-500 to-cinema-600 hover:from-accent-400 hover:to-cinema-700 text-white px-5 py-2.5 rounded-xl transition-all shadow-neon active:scale-95"
                >
                  Sign up free
                </button>
              </>
            )}
          </div>
        </div>
      </nav>

      {/* ============ MOBILE TOP BAR ============ */}
      <header className="md:hidden fixed top-0 left-0 right-0 z-50 bg-dark-980/90 backdrop-blur-xl border-b border-white/10">
        <div className="h-16 flex items-center justify-between px-4">
          <button
            onClick={() => setMobileMenuOpen(true)}
            className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center text-white hover:bg-white/10 transition-colors"
            aria-label="Open menu"
          >
            <Menu size={20} />
          </button>
          <div className="flex items-center gap-2.5 cursor-pointer" onClick={() => navigate('/')}>
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-accent-500 to-cinema-600 flex items-center justify-center shadow-neon">
              <Ticket size={17} />
            </div>
            <span className="font-bold text-lg tracking-tight font-display">
              Movie<span className="text-accent-400">Tracker</span>
            </span>
          </div>
          <button
            onClick={() => navigate('/login')}
            className="text-xs font-bold bg-gradient-to-r from-accent-500 to-cinema-600 text-white px-4 py-2.5 rounded-xl shadow-neon active:scale-95"
          >
            {user ? 'Account' : 'Sign in'}
          </button>
        </div>
      </header>

      {/* ============ MOBILE MENU ============ */}
      {mobileMenuOpen && (
        <motion.div
          initial={{ opacity: 0, x: '100%' }}
          animate={{ opacity: 1, x: 0 }}
          className="fixed inset-0 z-60 bg-dark-950/97 backdrop-blur-sm flex flex-col md:hidden"
        >
          <div className="p-4 border-b border-white/10 flex items-center justify-between">
            <span className="font-bold text-lg font-display">Menu</span>
            <button onClick={() => setMobileMenuOpen(false)} className="text-white/60 hover:text-white p-2" aria-label="Close menu">
              <X size={22} />
            </button>
          </div>
          <nav className="flex-1 px-5 space-y-1.5 pt-4">
            <mobileLink to="/" icon={<Film size={20} />} onClick={setMobileMenuOpen}>Tracker</mobileLink>
            <mobileLink to="/alerts" icon={<Bell size={20} />} onClick={setMobileMenuOpen}>My Alerts</mobileLink>
            <mobileLink to="/telegram" icon={<Send size={20} />} onClick={setMobileMenuOpen}>Telegram</mobileLink>
            <mobileLink to="/admin" icon={<Shield size={20} />} onClick={setMobileMenuOpen}>Admin</mobileLink>
          </nav>
          <div className="p-5 border-t border-white/10 space-y-2">
            {user ? (
              <button
                onClick={() => { setMobileMenuOpen(false); handleLogout(); }}
                className="w-full flex items-center gap-3 py-3 px-4 text-left font-medium text-white/70 hover:bg-white/5 rounded-2xl transition-colors"
              >
                <LogOut size={18} /> Sign out
              </button>
            ) : (
              <button
                onClick={() => { setMobileMenuOpen(false); navigate('/login'); }}
                className="w-full btn-primary justify-center"
              >
                Sign in / Sign up
              </button>
            )}
          </div>
        </motion.div>
      )}

      <main className="pt-16 md:pt-16 px-4 pb-16 max-w-7xl mx-auto w-full">
        <Outlet />
      </main>

      {/* ============ FOOTER ============ */}
      <footer className="border-t border-white/10 mt-8">
        <div className="max-w-7xl mx-auto px-4 py-10 grid grid-cols-1 md:grid-cols-3 gap-8">
          <div>
            <div className="flex items-center gap-2.5 mb-3">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-accent-500 to-cinema-600 flex items-center justify-center shadow-neon">
                <Ticket size={17} />
              </div>
              <span className="font-bold text-lg font-display">Movie<span className="text-accent-400">Tracker</span></span>
            </div>
            <p className="text-white/40 text-sm leading-relaxed">
              First-day-first-show booking alerts for every fan. We watch BookMyShow & District so you don’t have to.
            </p>
          </div>
          <div className="text-sm">
            <p className="font-bold text-white mb-3 font-display">Product</p>
            <ul className="space-y-2 text-white/50">
              <li><a onClick={() => navigate('/')} className="hover:text-accent-400 cursor-pointer transition-colors">Tracker</a></li>
              <li><a onClick={() => navigate('/alerts')} className="hover:text-accent-400 cursor-pointer transition-colors">My Alerts</a></li>
              <li><a onClick={() => navigate('/telegram')} className="hover:text-accent-400 cursor-pointer transition-colors">Telegram setup</a></li>
            </ul>
          </div>
          <div className="text-sm">
            <p className="font-bold text-white mb-3 font-display">Account</p>
            <ul className="space-y-2 text-white/50">
              <li><a onClick={() => navigate('/login')} className="hover:text-accent-400 cursor-pointer transition-colors">Sign in / Sign up</a></li>
              <li><a onClick={() => navigate('/admin')} className="hover:text-accent-400 cursor-pointer transition-colors">Superadmin</a></li>
            </ul>
          </div>
        </div>
        <div className="border-t border-white/5 py-5 text-center text-xs text-white/30 px-4">
          © {new Date().getFullYear()} MovieTracker · Not affiliated with BookMyShow or District. We don’t sell tickets or hold seats.
        </div>
      </footer>
    </div>
  );
}

function navLink({ to, label, icon, active }) {
  const navigate = useNavigate();
  return (
    <a
      onClick={(e) => { e.preventDefault(); navigate(to); }}
      className={`nav-link ${active ? 'bg-white/10 text-white' : ''}`}
    >
      {icon}
      <span>{label}</span>
    </a>
  );
}

function mobileLink({ to, icon, children, onClick }) {
  const navigate = useNavigate();
  return (
    <a
      onClick={(e) => {
        e.preventDefault();
        onClick?.(false);
        navigate(to);
      }}
      className="flex items-center gap-3 px-4 py-3.5 rounded-2xl text-sm font-medium text-white/80 hover:bg-white/5 transition-colors"
    >
      {icon}
      <span>{children}</span>
    </a>
  );
}
