import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { Mail, Lock, ArrowRight, ChevronRight, Ticket } from 'lucide-react';
import { auth, supabase } from '../api';
import { toast } from 'react-hot-toast';
import { motion } from 'framer-motion';

export default function Login() {
  const [searchParams] = useSearchParams();
  const [mode, setMode] = useState(searchParams.get('mode') === 'signup' ? 'signup' : 'login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    // Already signed in? Go straight to the tracker
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) navigate('/', { replace: true });
    });
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email || !password) {
      toast.error('Email and password are required');
      return;
    }
    if (mode === 'signup' && !name) {
      toast.error('Please enter your name');
      return;
    }
    setLoading(true);
    try {
      if (mode === 'login') {
        const { error } = await auth.login(email, password);
        if (error) throw error;
        toast.success('Welcome back!');
        navigate('/', { replace: true });
      } else {
        const { error } = await auth.signup(email, password, name);
        if (error) throw error;
        toast.success('Account created! You can sign in now.');
        setMode('login');
      }
    } catch (err) {
      toast.error(err.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-dark-980 flex items-center justify-center px-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-md w-full"
      >
        <div className="glass-panel p-8 sm:p-12 mx-auto animate-fade-in relative">
          <button
            onClick={() => navigate('/')}
            className="absolute top-5 right-5 text-xs font-semibold text-white/40 hover:text-accent-400 transition-colors bg-white/5 border border-white/10 rounded-full px-3.5 py-1.5"
          >
            Skip → Tracker
          </button>
          <div className="text-center mb-10">
            <div className="w-16 h-16 rounded-3xl bg-gradient-to-br from-accent-500 to-cinema-600 flex items-center justify-center mx-auto mb-5 shadow-neon">
              <Mail size={34} stroke={2.5} />
            </div>
            <h1 className="text-3xl font-bold tracking-tight font-display mb-2">
              {mode === 'login' ? 'Welcome back' : 'Create account'}
            </h1>
            <p className="text-white/50 text-sm">
              {mode === 'login'
                ? 'Sign in to sync your alerts across devices'
                : 'Optional — the tracker works without an account'}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {mode === 'signup' && (
              <div className="space-y-2">
                <label className="text-xs font-semibold text-white/40 uppercase tracking-wider">Full name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="John Doe"
                  className="glass-input"
                />
              </div>
            )}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-white/40 uppercase tracking-wider">Email address</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="glass-input"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-semibold text-white/40 uppercase tracking-wider">Password</label>
              <div className="relative">
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="glass-input pr-12"
                />
                <Lock size={18} className="absolute right-4 top-4 text-white/40" />
              </div>
            </div>

            <button type="submit" disabled={loading} className="btn-primary w-full">
              {loading ? (
                <ArrowRight size={20} className="animate-spin" />
              ) : mode === 'login' ? (
                <><ArrowRight size={20} /> Sign in</>
              ) : (
                <><ChevronRight size={20} /> Create account</>
              )}
            </button>
          </form>

          <p className="text-center text-sm text-white/50 mt-8">
            {mode === 'login'
              ? "Don't have an account? "
              : 'Already have an account? '}
            <button
              onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}
              className="text-accent-400 font-semibold hover:text-accent-300 transition-colors ml-1"
            >
              {mode === 'login' ? 'Sign up' : 'Sign in'}
            </button>
          </p>
        </div>
      </motion.div>
    </div>
  );
}
