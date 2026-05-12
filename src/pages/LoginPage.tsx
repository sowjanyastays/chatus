import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../services/firebase';

export default function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || !password) return;
    setLoading(true);
    setError('');
    try {
      await signInWithEmailAndPassword(auth, email.trim().toLowerCase(), password);
      navigate('/', { replace: true });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg.replace('Firebase: ', '').replace(/\s*\(auth\/[^)]+\)\.?/, '').trim());
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-dvh bg-ch-bg flex flex-col overflow-hidden relative">
      {/* Glassmorphism blobs */}
      <div
        className="absolute w-[300px] h-[300px] rounded-full opacity-30 pointer-events-none"
        style={{ background: '#adc6ff', filter: 'blur(80px)', top: '-60px', right: '-60px' }}
      />
      <div
        className="absolute w-[250px] h-[250px] rounded-full opacity-25 pointer-events-none"
        style={{ background: '#ffb595', filter: 'blur(80px)', top: '120px', left: '-80px' }}
      />

      {/* Content */}
      <div
        className="relative z-10 flex flex-col flex-1 px-4"
        style={{ paddingTop: 'max(var(--safe-top), 44px)', paddingBottom: 34 }}
      >
        {/* Header section */}
        <div className="mb-10">
          <div className="w-16 h-16 rounded-[12px] bg-ch-accent flex items-center justify-center mb-6">
            <svg width="27" height="35" viewBox="0 0 27 35" fill="none">
              <path d="M13.5 2C7.1 2 2 7.1 2 13.5c0 3.5 1.6 6.7 4.1 8.9L4 28l6.1-2.1c1.1.3 2.2.5 3.4.5 6.4 0 11.5-5.1 11.5-11.5S19.9 2 13.5 2z" fill="white" />
            </svg>
          </div>
          <h1 className="text-[34px] font-bold text-ch-text leading-tight">Welcome</h1>
          <p className="text-[17px] text-ch-sub mt-1">Sign in to your private sanctuary.</p>
        </div>

        {/* Form */}
        <form onSubmit={handleLogin} className="flex flex-col gap-4">
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="Email"
            autoComplete="email"
            required
            className="w-full h-14 bg-ch-input rounded-[12px] px-4 text-[17px] text-ch-text placeholder-ch-sub focus:outline-none focus:ring-2 focus:ring-ch-blue"
          />

          <div className="relative">
            <input
              type={showPw ? 'text' : 'password'}
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Password"
              autoComplete="current-password"
              required
              className="w-full h-14 bg-ch-input rounded-[12px] px-4 pr-12 text-[17px] text-ch-text placeholder-ch-sub focus:outline-none focus:ring-2 focus:ring-ch-blue"
            />
            <button
              type="button"
              onClick={() => setShowPw(!showPw)}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-ch-sub text-lg"
              aria-label="Toggle password visibility"
            >
              {showPw ? '🙈' : '👁'}
            </button>
          </div>

          {/* Auto-login toggle row */}
          <div className="flex items-center justify-between px-1 py-2">
            <span className="text-[17px] text-ch-sub">Auto-login</span>
            <div className="w-12 h-7 bg-ch-blue rounded-full relative flex items-center px-0.5">
              <div className="w-6 h-6 bg-white rounded-full ml-auto shadow" />
            </div>
          </div>

          {error && (
            <p className="text-[14px] text-ch-error bg-ch-card rounded-[12px] px-4 py-3">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full h-14 bg-ch-accent rounded-[12px] text-[17px] font-semibold text-[#00285c] disabled:opacity-50 mt-2 active:scale-[0.98] transition-transform"
          >
            {loading ? 'Signing in…' : 'Sign In'}
          </button>

          <div className="flex items-center justify-between mt-1">
            <Link to="/register" className="text-ch-blue text-[16px]">
              Forgot Password?
            </Link>
            <div className="flex items-center gap-1 text-[16px]">
              <span className="text-ch-sub">New here?</span>
              <Link to="/register" className="text-ch-blue font-medium">Sign Up</Link>
            </div>
          </div>
        </form>

        {/* Privacy footer */}
        <div className="mt-auto pt-8 flex flex-col items-center gap-3">
          <div className="flex items-center gap-2 bg-ch-badge border border-ch-border rounded-full px-4 py-2">
            <svg width="12" height="15" viewBox="0 0 12 15" fill="none">
              <rect x="1" y="6" width="10" height="8" rx="2" stroke="#adc6ff" strokeWidth="1.5" />
              <path d="M3.5 6V4.5a2.5 2.5 0 015 0V6" stroke="#adc6ff" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <span className="text-[12px] text-ch-sub tracking-wider">END-TO-END ENCRYPTED</span>
          </div>
          <div className="flex items-center gap-6 text-[12px] text-ch-sub">
            <span className="cursor-pointer">Privacy Policy</span>
            <span className="cursor-pointer">Terms of Service</span>
          </div>
        </div>
      </div>
    </div>
  );
}
