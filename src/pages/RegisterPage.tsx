import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../services/firebase';
import { generateKeyPair } from '../services/crypto';
import { savePrivateKey } from '../services/keyStore';

export default function RegisterPage() {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !email.trim() || !password) return;
    if (password.length < 6) { setError('Password must be at least 6 characters.'); return; }
    setLoading(true);
    setError('');
    try {
      const { user } = await createUserWithEmailAndPassword(auth, email.trim().toLowerCase(), password);
      await updateProfile(user, { displayName: name.trim() });

      const { publicKey, secretKey } = generateKeyPair();
      savePrivateKey(secretKey);

      await setDoc(doc(db, 'users', user.uid), {
        uid: user.uid,
        email: user.email,
        displayName: name.trim(),
        photoURL: null,
        publicKey,
        createdAt: serverTimestamp(),
        fcmWebToken: null,
      });

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
        className="absolute w-[280px] h-[280px] rounded-full opacity-30 pointer-events-none"
        style={{ background: '#adc6ff', filter: 'blur(80px)', top: '-40px', right: '-40px' }}
      />
      <div
        className="absolute w-[220px] h-[220px] rounded-full opacity-25 pointer-events-none"
        style={{ background: '#ffb595', filter: 'blur(80px)', bottom: '100px', left: '-60px' }}
      />

      {/* Content */}
      <div
        className="relative z-10 flex flex-col flex-1 px-4 overflow-y-auto"
        style={{ paddingTop: 'max(var(--safe-top), 44px)', paddingBottom: 34 }}
      >
        {/* Header */}
        <div className="mb-8">
          <div className="w-16 h-16 rounded-[12px] bg-ch-accent flex items-center justify-center mb-6">
            <svg width="27" height="35" viewBox="0 0 27 35" fill="none">
              <path d="M13.5 2C7.1 2 2 7.1 2 13.5c0 3.5 1.6 6.7 4.1 8.9L4 28l6.1-2.1c1.1.3 2.2.5 3.4.5 6.4 0 11.5-5.1 11.5-11.5S19.9 2 13.5 2z" fill="white" />
            </svg>
          </div>
          <h1 className="text-[34px] font-bold text-ch-text leading-tight">Create Account</h1>
          <p className="text-[17px] text-ch-sub mt-1">Join Chatus in seconds.</p>
        </div>

        {/* Form */}
        <form onSubmit={handleRegister} className="flex flex-col gap-4">
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Display name"
            autoComplete="name"
            required
            className="w-full h-14 bg-ch-input rounded-[12px] px-4 text-[17px] text-ch-text placeholder-ch-sub focus:outline-none focus:ring-2 focus:ring-ch-blue"
          />

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
              placeholder="Password (min 6 chars)"
              autoComplete="new-password"
              required
              className="w-full h-14 bg-ch-input rounded-[12px] px-4 pr-12 text-[17px] text-ch-text placeholder-ch-sub focus:outline-none focus:ring-2 focus:ring-ch-blue"
            />
            <button
              type="button"
              onClick={() => setShowPw(!showPw)}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-ch-sub text-lg"
              aria-label="Toggle password"
            >
              {showPw ? '🙈' : '👁'}
            </button>
          </div>

          {error && (
            <p className="text-[14px] text-ch-error bg-ch-card rounded-[12px] px-4 py-3">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full h-14 bg-ch-accent rounded-[12px] text-[17px] font-semibold text-[#00285c] disabled:opacity-50 mt-2 active:scale-[0.98] transition-transform"
          >
            {loading ? 'Creating account…' : 'Create Account'}
          </button>

          <p className="text-center text-[16px] text-ch-sub mt-1">
            Already have an account?{' '}
            <Link to="/login" className="text-ch-blue font-medium">Sign In</Link>
          </p>
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
        </div>
      </div>
    </div>
  );
}
