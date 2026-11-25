import { useState, useEffect, useRef } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import {
  Send, Bot, CheckCircle, ArrowRight, Copy, Check, ExternalLink,
  RefreshCw, AlertCircle, Sparkles, BellRing, ShieldCheck, Unlink
} from 'lucide-react';
import { supabase, telegram } from '../api';
import { toast } from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';

export default function Telegram() {
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from || '/dashboard';

  const [user, setUser] = useState(null);
  const [authChecking, setAuthChecking] = useState(true);
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [generatingOtp, setGeneratingOtp] = useState(false);
  const [otpData, setOtpData] = useState(null);
  const [copied, setCopied] = useState(false);
  const [testSending, setTestSending] = useState(false);
  const [showManual, setShowManual] = useState(false);
  const [manualChatId, setManualChatId] = useState('');
  const [manualUsername, setManualUsername] = useState('');

  const pollIntervalRef = useRef(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUser(data?.user || null);
      setAuthChecking(false);
      if (data?.user) checkStatus();
    });

    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, []);

  // Poll for connection while OTP is active and not yet connected
  useEffect(() => {
    if (otpData && !status?.connected) {
      pollIntervalRef.current = setInterval(async () => {
        try {
          const res = await telegram.status();
          if (res?.data?.connected) {
            setStatus(res.data);
            setOtpData(null);
            clearInterval(pollIntervalRef.current);
            toast.success('🎉 Telegram account linked successfully!');
          }
        } catch (_) {}
      }, 3000);
    }
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, [otpData, status?.connected]);

  const checkStatus = async () => {
    try {
      const res = await telegram.status();
      setStatus(res.data);
    } catch (err) {
      setStatus({ connected: false });
    }
  };

  const handleGenerateOtp = async () => {
    setGeneratingOtp(true);
    try {
      const data = await telegram.generateOtp();
      setOtpData(data);
      toast.success(`New OTP generated! Open @${data.bot_username || 'Theatre_Movie_tracker_bot'} in Telegram.`);
    } catch (err) {
      toast.error(err.message || 'Failed to generate OTP');
    } finally {
      setGeneratingOtp(false);
    }
  };

  const handleCopyOtp = () => {
    if (!otpData?.otp) return;
    navigator.clipboard.writeText(otpData.otp);
    setCopied(true);
    toast.success('OTP copied to clipboard!');
    setTimeout(() => setCopied(false), 2500);
  };

  const handleSendTestAlert = async () => {
    const chatId = status?.link?.telegram_chat_id;
    if (!chatId) return;
    setTestSending(true);
    try {
      await telegram.sendTestAlert(chatId);
      toast.success('🔔 Test alert sent! Check your Telegram.');
    } catch (err) {
      toast.error(err.response?.data?.error || err.message || 'Failed to send test alert');
    } finally {
      setTestSending(false);
    }
  };

  const handleDisconnect = async () => {
    if (!window.confirm('Disconnect your Telegram account? You will not receive ticket alerts until you reconnect.')) return;
    try {
      await telegram.disconnect();
      setStatus({ connected: false });
      setOtpData(null);
      toast.success('Telegram disconnected');
    } catch (err) {
      toast.error('Failed to disconnect');
    }
  };

  const handleManualConnect = async (e) => {
    e.preventDefault();
    if (!manualChatId) {
      toast.error('Please enter your numeric Telegram Chat ID');
      return;
    }
    setLoading(true);
    try {
      await telegram.connect({
        telegram_chat_id: manualChatId,
        telegram_username: manualUsername,
      });
      toast.success('Connected successfully!');
      checkStatus();
    } catch (err) {
      toast.error(err.message || 'Failed to connect');
    } finally {
      setLoading(false);
    }
  };

  const botName = otpData?.bot_username || status?.bot_username || 'Theatre_Movie_tracker_bot';

  if (authChecking) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <RefreshCw size={32} className="animate-spin text-accent-400" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link to={from} className="w-10 h-10 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10 transition-colors">
            <ArrowRight size={18} className="rotate-180" />
          </Link>
          <div>
            <h1 className="text-3xl font-bold tracking-tight font-display">Telegram Alerts</h1>
            <p className="text-white/50 text-sm">Connect with <strong className="text-white">@{botName}</strong> bot to receive instant booking notifications.</p>
          </div>
        </div>
        <button
          onClick={checkStatus}
          className="btn-outline text-xs px-3 py-2 hidden sm:flex items-center gap-1.5"
          title="Refresh connection status"
        >
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {/* Login requirement banner if signed out */}
      {!user && (
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-panel p-8 rounded-3xl border-accent-500/30 text-center"
        >
          <div className="w-16 h-16 rounded-2xl bg-accent-500/20 text-accent-400 flex items-center justify-center mx-auto mb-4 shadow-neon">
            <Bot size={32} />
          </div>
          <h2 className="text-xl font-bold text-white font-display mb-2">Sign in to connect Telegram</h2>
          <p className="text-white/60 text-sm max-w-md mx-auto mb-6">
            Linking your Telegram account allows MovieTracker to send instant booking alerts directly to your phone when tickets open.
          </p>
          <div className="flex flex-wrap gap-3 justify-center">
            <button onClick={() => navigate('/login')} className="btn-primary">
              Sign In
            </button>
            <button onClick={() => navigate('/login?mode=signup')} className="btn-outline">
              Create Free Account
            </button>
          </div>
        </motion.div>
      )}

      {user && (
        <>
          {/* STATE 1: ALREADY CONNECTED */}
          {status?.connected ? (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="glass-panel p-8 rounded-4xl border-green-500/30 space-y-6"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-white/10">
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 rounded-3xl bg-green-500/20 text-green-400 flex items-center justify-center shadow-neon shrink-0">
                    <CheckCircle size={32} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-2xl font-bold text-white font-display">Connected & Active</h2>
                      <span className="badge bg-green-500/20 text-green-400 border-green-500/30 text-xs">Live</span>
                    </div>
                    <p className="text-sm text-white/60 mt-1">
                      Linked to: <strong className="text-accent-400">{status.link?.telegram_username ? `@${status.link.telegram_username}` : 'Your Account'}</strong> (Chat ID: <span className="font-mono text-white/80">{status.link?.telegram_chat_id}</span>)
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2.5">
                  <button
                    onClick={handleSendTestAlert}
                    disabled={testSending}
                    className="btn-primary text-sm px-4 py-2.5 flex items-center gap-2"
                  >
                    {testSending ? <RefreshCw size={16} className="animate-spin" /> : <BellRing size={16} />}
                    Send Test Alert
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="glass-panel p-4 rounded-2xl bg-white/5">
                  <p className="text-xs text-white/40 uppercase tracking-wider font-semibold mb-1">Bot Name</p>
                  <p className="font-bold text-white font-mono">@{botName}</p>
                </div>
                <div className="glass-panel p-4 rounded-2xl bg-white/5">
                  <p className="text-xs text-white/40 uppercase tracking-wider font-semibold mb-1">Notification Speed</p>
                  <p className="font-bold text-green-400">&lt; 60 seconds</p>
                </div>
                <div className="glass-panel p-4 rounded-2xl bg-white/5">
                  <p className="text-xs text-white/40 uppercase tracking-wider font-semibold mb-1">Status</p>
                  <p className="font-bold text-accent-400">Ready for Alerts</p>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-4 pt-4">
                <Link to="/alerts" className="btn-outline flex items-center gap-2">
                  View Tracked Movies <ArrowRight size={16} />
                </Link>
                <button
                  onClick={handleDisconnect}
                  className="text-xs text-red-400/80 hover:text-red-400 hover:underline flex items-center gap-1.5 transition-colors"
                >
                  <Unlink size={14} /> Disconnect Telegram
                </button>
              </div>
            </motion.div>
          ) : (
            /* STATE 2: NOT CONNECTED (OTP FLOW) */
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="glass-panel p-6 sm:p-10 rounded-4xl space-y-8"
            >
              <div className="text-center max-w-lg mx-auto">
                <div className="w-16 h-16 rounded-3xl bg-gradient-to-br from-accent-500 to-cinema-600 flex items-center justify-center mx-auto mb-4 shadow-neon">
                  <Bot size={34} />
                </div>
                <h2 className="text-2xl sm:text-3xl font-black font-display text-white">
                  Connect Telegram Bot
                </h2>
                <p className="text-white/60 text-sm mt-2">
                  Get instant ticket notifications the moment bookings open at your favorite theater.
                </p>
              </div>

              {!otpData ? (
                <div className="text-center space-y-4 pt-2">
                  <button
                    onClick={handleGenerateOtp}
                    disabled={generatingOtp}
                    className="btn-primary text-base px-8 py-4 mx-auto flex items-center gap-3 shadow-neon"
                  >
                    {generatingOtp ? (
                      <RefreshCw size={20} className="animate-spin" />
                    ) : (
                      <>
                        <Sparkles size={20} />
                        Generate Connect OTP
                      </>
                    )}
                  </button>
                  <p className="text-xs text-white/40">
                    Generates a secure 6-digit code valid for 15 minutes.
                  </p>
                </div>
              ) : (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="space-y-6"
                >
                  {/* OTP Display Card */}
                  <div className="glass-panel p-6 sm:p-8 rounded-3xl bg-gradient-to-br from-dark-850 to-dark-900 border border-accent-500/30 text-center space-y-4">
                    <p className="text-xs uppercase tracking-widest text-white/50 font-bold">
                      Your One-Time Connection Code
                    </p>

                    <div className="flex items-center justify-center gap-3">
                      <div className="font-mono text-4xl sm:text-5xl font-black tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-accent-400 via-rose-300 to-cinema-400 px-6 py-3 rounded-2xl bg-white/5 border border-white/10 select-all">
                        {otpData.otp}
                      </div>
                      <button
                        onClick={handleCopyOtp}
                        className="btn-outline p-3.5 rounded-2xl shrink-0"
                        title="Copy OTP"
                      >
                        {copied ? <Check size={20} className="text-green-400" /> : <Copy size={20} />}
                      </button>
                    </div>

                    <div className="flex items-center justify-center gap-2 text-xs text-white/40">
                      <span className="w-2 h-2 rounded-full bg-accent-500 animate-ping" />
                      Listening for connection… Expires in 15 minutes
                    </div>

                    {/* Direct link button */}
                    <div className="pt-2">
                      <a
                        href={otpData.telegram_url || `https://t.me/${botName}?start=${otpData.otp}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn-primary w-full sm:w-auto inline-flex items-center justify-center gap-2.5 px-7 py-3.5 text-sm font-bold shadow-neon"
                      >
                        <Send size={18} />
                        Open @{botName} in Telegram
                        <ExternalLink size={15} />
                      </a>
                    </div>
                  </div>

                  {/* 3 Step Instructions */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
                    <div className="glass-panel p-5 rounded-2xl bg-white/5">
                      <div className="w-7 h-7 rounded-full bg-accent-500/20 text-accent-400 font-bold text-xs flex items-center justify-center mb-3">
                        1
                      </div>
                      <h4 className="font-bold text-sm text-white mb-1">Open Bot</h4>
                      <p className="text-xs text-white/50 leading-relaxed">
                        Click the button above or search <strong className="text-white">@{botName}</strong> in Telegram.
                      </p>
                    </div>

                    <div className="glass-panel p-5 rounded-2xl bg-white/5">
                      <div className="w-7 h-7 rounded-full bg-accent-500/20 text-accent-400 font-bold text-xs flex items-center justify-center mb-3">
                        2
                      </div>
                      <h4 className="font-bold text-sm text-white mb-1">Send OTP</h4>
                      <p className="text-xs text-white/50 leading-relaxed">
                        Tap <strong>Start</strong> or send your 6-digit code: <code className="font-mono text-accent-400">{otpData.otp}</code>.
                      </p>
                    </div>

                    <div className="glass-panel p-5 rounded-2xl bg-white/5">
                      <div className="w-7 h-7 rounded-full bg-accent-500/20 text-accent-400 font-bold text-xs flex items-center justify-center mb-3">
                        3
                      </div>
                      <h4 className="font-bold text-sm text-white mb-1">Automatic Link</h4>
                      <p className="text-xs text-white/50 leading-relaxed">
                        The bot will verify your code and link your account immediately!
                      </p>
                    </div>
                  </div>

                  <div className="flex justify-center pt-2">
                    <button
                      onClick={handleGenerateOtp}
                      className="text-xs text-white/40 hover:text-white transition-colors"
                    >
                      Need a different code? Click to regenerate
                    </button>
                  </div>
                </motion.div>
              )}

              {/* Manual Chat ID Fallback Option */}
              <div className="pt-4 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setShowManual(!showManual)}
                  className="text-xs text-white/40 hover:text-white transition-colors flex items-center gap-1.5 mx-auto"
                >
                  {showManual ? 'Hide manual options' : 'Advanced: Connect manually using Chat ID'}
                </button>

                <AnimatePresence>
                  {showManual && (
                    <motion.form
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      onSubmit={handleManualConnect}
                      className="space-y-4 pt-4 max-w-md mx-auto"
                    >
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-white/40 uppercase tracking-wider">Telegram Chat ID</label>
                        <input
                          type="number"
                          value={manualChatId}
                          onChange={(e) => setManualChatId(e.target.value)}
                          placeholder="e.g. 123456789"
                          className="glass-input"
                        />
                        <p className="text-[11px] text-white/40">
                          Message <a href="https://t.me/userinfobot" target="_blank" rel="noopener noreferrer" className="text-accent-400 hover:underline">@userinfobot</a> to find your numeric ID.
                        </p>
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-white/40 uppercase tracking-wider">Telegram Username (optional)</label>
                        <input
                          type="text"
                          value={manualUsername}
                          onChange={(e) => setManualUsername(e.target.value)}
                          placeholder="username"
                          className="glass-input"
                        />
                      </div>

                      <button type="submit" disabled={loading} className="btn-outline w-full text-sm">
                        {loading ? <RefreshCw size={16} className="animate-spin" /> : 'Connect with Chat ID'}
                      </button>
                    </motion.form>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          )}
        </>
      )}
    </div>
  );
}
