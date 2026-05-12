import { useState } from 'react';
import { signOut, updateProfile } from 'firebase/auth';
import { doc, updateDoc } from 'firebase/firestore';
import { auth, db } from '../services/firebase';
import { useAuth } from '../hooks/useAuth';
import { useTheme } from '../context/ThemeContext';
import { getInitials, getAvatarColor } from '../utils/avatar';
import { loadPrivateKey } from '../services/keyStore';
import BottomNav from '../components/BottomNav';

// ── Shared UI primitives ─────────────────────────────────────────────────────

function ChevronRight() {
  return (
    <svg width="6" height="10" viewBox="0 0 6 10" fill="none">
      <path d="M1 1l4 4-4 4" stroke="#c1c6d7" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

type RowProps = {
  iconBg: string;
  icon: React.ReactNode;
  label: string;
  right?: React.ReactNode;
  border?: boolean;
  onClick?: () => void;
};

function SettingsRow({ iconBg, icon, label, right, border = false, onClick }: RowProps) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center px-4 py-4 gap-3 active:bg-ch-input transition-colors text-left ${border ? 'border-t border-ch-border' : ''}`}
    >
      <div className="w-8 h-8 rounded-[8px] flex items-center justify-center flex-shrink-0"
        style={{ backgroundColor: iconBg }}>
        {icon}
      </div>
      <span className="flex-1 text-[17px] text-ch-text">{label}</span>
      {right ?? <ChevronRight />}
    </button>
  );
}

function Toggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={e => { e.stopPropagation(); onToggle(); }}
      className="w-12 h-7 rounded-full flex items-center px-0.5 transition-colors"
      style={{ backgroundColor: on ? '#adc6ff' : '#31353d' }}
      aria-label="Toggle"
    >
      <div
        className="w-6 h-6 rounded-full bg-white shadow transition-transform"
        style={{ transform: on ? 'translateX(20px)' : 'translateX(0)' }}
      />
    </button>
  );
}

// ── Modal wrapper ────────────────────────────────────────────────────────────

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60" />
      <div
        className="relative bg-ch-card rounded-t-[28px] px-6 pt-4 max-h-[85dvh] overflow-y-auto"
        style={{ paddingBottom: 'max(var(--safe-bottom), 32px)' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="w-10 h-1 bg-ch-border rounded-full mx-auto mb-4" />
        <h2 className="text-[18px] font-semibold text-ch-text mb-5">{title}</h2>
        {children}
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

type ModalState =
  | 'none'
  | 'profile'
  | 'encryption'
  | 'blocklist'
  | 'notifications';

export default function SettingsPage() {
  const { user } = useAuth();
  const { theme, toggleTheme } = useTheme();

  const [modal, setModal] = useState<ModalState>('none');
  const [newName, setNewName] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [clearingCache, setClearingCache] = useState(false);
  const [autoDownload, setAutoDownload] = useState(
    () => localStorage.getItem('chatus-auto-download') === 'true',
  );
  const [notifPermission, setNotifPermission] = useState<NotificationPermission>(
    () => ('Notification' in window ? Notification.permission : 'denied'),
  );

  const displayName = user?.displayName ?? 'User';
  const email = user?.email ?? '';
  const initials = getInitials(displayName);
  const color = getAvatarColor(displayName);

  async function saveDisplayName() {
    if (!newName.trim() || !user) return;
    setSavingName(true);
    try {
      await updateProfile(auth.currentUser!, { displayName: newName.trim() });
      await updateDoc(doc(db, 'users', user.uid), { displayName: newName.trim() });
      setModal('none');
      setNewName('');
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setSavingName(false);
    }
  }

  async function requestNotifications() {
    if (!('Notification' in window)) return;
    const perm = await Notification.requestPermission();
    setNotifPermission(perm);
  }

  async function clearCache() {
    setClearingCache(true);
    try {
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map(k => caches.delete(k)));
      }
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map(r => r.unregister()));
      }
      window.location.reload();
    } catch (e: unknown) {
      alert('Failed to clear cache: ' + (e instanceof Error ? e.message : String(e)));
      setClearingCache(false);
    }
  }

  function toggleAutoDownload() {
    const next = !autoDownload;
    setAutoDownload(next);
    localStorage.setItem('chatus-auto-download', next ? 'true' : 'false');
  }

  const pubKey = loadPrivateKey() ? user?.uid : null; // just a presence check

  return (
    <div className="h-dvh flex flex-col bg-ch-bg overflow-hidden">
      {/* Header */}
      <div
        className="flex-shrink-0 flex items-center justify-between px-4 py-3 bg-ch-bg border-b border-ch-border"
        style={{ paddingTop: 'max(var(--safe-top), 12px)' }}
      >
        <div className="w-9" />
        <h1 className="text-[17px] font-semibold text-ch-text">Settings</h1>
        <div className="w-9" />
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto scrollbar-hidden px-4 py-6 space-y-6">

        {/* Profile */}
        <div className="flex flex-col items-center gap-2">
          <div
            className="w-20 h-20 rounded-full flex items-center justify-center text-[24px] font-bold border-2 border-ch-blue"
            style={{ backgroundColor: '#31353d', color }}
          >
            {initials}
          </div>
          <p className="text-[24px] text-ch-text">{displayName}</p>
          <p className="text-[12px] text-ch-sub">{email}</p>
        </div>

        {/* Account */}
        <div>
          <p className="text-[12px] font-medium text-ch-sub px-1 mb-2 tracking-wider">ACCOUNT</p>
          <div className="bg-ch-card rounded-[12px] overflow-hidden">
            <SettingsRow
              iconBg="#adc6ff"
              icon={<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="5" r="3" stroke="#10131b" strokeWidth="1.4" /><path d="M1 13c0-3.3 2.7-5 6-5s6 1.7 6 5" stroke="#10131b" strokeWidth="1.4" strokeLinecap="round" /></svg>}
              label="Profile Settings"
              onClick={() => { setNewName(displayName); setModal('profile'); }}
            />
            <SettingsRow
              iconBg="#adc6ff"
              icon={<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><rect x="1" y="3" width="12" height="9" rx="1.5" stroke="#10131b" strokeWidth="1.4" /><path d="M4 3V2a3 3 0 016 0v1" stroke="#10131b" strokeWidth="1.4" strokeLinecap="round" /></svg>}
              label="Linked Devices"
              border
              onClick={() => setModal('encryption')}
            />
          </div>
        </div>

        {/* Appearance */}
        <div>
          <p className="text-[12px] font-medium text-ch-sub px-1 mb-2 tracking-wider">APPEARANCE</p>
          <div className="bg-ch-card rounded-[12px] overflow-hidden">
            <SettingsRow
              iconBg="#ef6719"
              icon={<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="3.5" fill="white" /><path d="M7 1V2.5M7 11.5V13M1 7h1.5M11.5 7H13M3 3l1 1M10 10l1 1M3 11l1-1M10 4l1-1" stroke="white" strokeWidth="1.3" strokeLinecap="round" /></svg>}
              label="Dark Mode"
              right={<Toggle on={theme === 'dark'} onToggle={toggleTheme} />}
              onClick={toggleTheme}
            />
          </div>
        </div>

        {/* Privacy & Security */}
        <div>
          <p className="text-[12px] font-medium text-ch-sub px-1 mb-2 tracking-wider">PRIVACY & SECURITY</p>
          <div className="bg-ch-card rounded-[12px] overflow-hidden">
            <SettingsRow
              iconBg="#adc6ff"
              icon={<svg width="12" height="15" viewBox="0 0 12 15" fill="none"><rect x="1" y="6" width="10" height="8" rx="2" stroke="#10131b" strokeWidth="1.4" /><path d="M3.5 6V4.5a2.5 2.5 0 015 0V6" stroke="#10131b" strokeWidth="1.4" strokeLinecap="round" /></svg>}
              label="E2E Encryption"
              onClick={() => setModal('encryption')}
            />
            <SettingsRow
              iconBg="#adc6ff"
              icon={<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="6" stroke="#10131b" strokeWidth="1.4" /><path d="M7 4v3l2 2" stroke="#10131b" strokeWidth="1.4" strokeLinecap="round" /></svg>}
              label="Block List"
              border
              onClick={() => setModal('blocklist')}
            />
            <SettingsRow
              iconBg="#adc6ff"
              icon={<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7 1l1.6 3.3 3.6.5-2.6 2.5.6 3.6L7 9.3 3.8 11l.6-3.6L2 4.8l3.6-.5L7 1z" stroke="#10131b" strokeWidth="1.3" strokeLinejoin="round" /></svg>}
              label="Notification Settings"
              border
              onClick={() => setModal('notifications')}
            />
          </div>
        </div>

        {/* Data & Storage */}
        <div>
          <p className="text-[12px] font-medium text-ch-sub px-1 mb-2 tracking-wider">DATA & STORAGE</p>
          <div className="bg-ch-card rounded-[12px] overflow-hidden">
            <SettingsRow
              iconBg="#454749"
              icon={<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2 2h10v10H2V2z" stroke="white" strokeWidth="1.3" /><path d="M5 5h4M5 7.5h2.5" stroke="white" strokeWidth="1.3" strokeLinecap="round" /></svg>}
              label={clearingCache ? 'Clearing…' : 'Clear Cache'}
              right={<span className="text-[12px] text-ch-sub"><ChevronRight /></span>}
              onClick={clearingCache ? undefined : clearCache}
            />
            <SettingsRow
              iconBg="#454749"
              icon={<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7 1v8M4 6l3 3 3-3M1 11h12v2H1z" stroke="white" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" /></svg>}
              label="Auto-Download Media"
              right={<Toggle on={autoDownload} onToggle={toggleAutoDownload} />}
              border
              onClick={toggleAutoDownload}
            />
          </div>
        </div>

        {/* Logout */}
        <button
          onClick={() => signOut(auth)}
          className="w-full flex items-center justify-center gap-2 py-4 rounded-[12px] border active:opacity-70"
          style={{ backgroundColor: '#1c2028', borderColor: '#ffb4ab' }}
        >
          <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
            <path d="M5 13H2a1 1 0 01-1-1V3a1 1 0 011-1h3M10 11l4-3.5L10 4M14 7.5H6" stroke="#ffb4ab" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="text-[17px] font-semibold" style={{ color: '#ffb4ab' }}>Logout</span>
        </button>

        <p className="text-center text-[11px] text-ch-sub opacity-40 pb-2">
          VERSION 1.0.0 (BUILD 1)
        </p>
      </div>

      <BottomNav />

      {/* ── Profile Settings Modal ── */}
      {modal === 'profile' && (
        <Modal title="Profile Settings" onClose={() => setModal('none')}>
          <div className="flex flex-col items-center mb-6">
            <div
              className="w-16 h-16 rounded-full flex items-center justify-center text-[20px] font-bold border-2 border-ch-blue mb-3"
              style={{ backgroundColor: '#31353d', color }}
            >
              {initials}
            </div>
          </div>

          <label className="block text-[13px] font-medium text-ch-sub mb-2">Display Name</label>
          <input
            type="text"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && saveDisplayName()}
            className="w-full bg-ch-input rounded-[12px] px-4 py-3 text-[17px] text-ch-text placeholder-ch-sub focus:outline-none focus:ring-2 focus:ring-ch-blue mb-2"
            placeholder="Your name"
          />
          <p className="text-[12px] text-ch-sub mb-6">Email: {email}</p>

          <div className="flex gap-3">
            <button
              onClick={() => setModal('none')}
              className="flex-1 py-3 rounded-[12px] bg-ch-input text-ch-sub text-[17px]"
            >
              Cancel
            </button>
            <button
              onClick={saveDisplayName}
              disabled={savingName || !newName.trim() || newName.trim() === displayName}
              className="flex-1 py-3 rounded-[12px] bg-ch-blue text-[#002e69] font-semibold text-[17px] disabled:opacity-40"
            >
              {savingName ? 'Saving…' : 'Save'}
            </button>
          </div>
        </Modal>
      )}

      {/* ── E2E Encryption Modal ── */}
      {modal === 'encryption' && (
        <Modal title="End-to-End Encryption" onClose={() => setModal('none')}>
          <div className="bg-ch-input rounded-[12px] p-4 mb-4 flex items-start gap-3">
            <svg width="20" height="20" className="flex-shrink-0 mt-0.5" viewBox="0 0 20 20" fill="none">
              <circle cx="10" cy="10" r="9" stroke="#66BB6A" strokeWidth="1.5" />
              <path d="M6 10l3 3 5-5" stroke="#66BB6A" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <div>
              <p className="text-[15px] font-semibold text-ch-text mb-1">Encryption Active</p>
              <p className="text-[13px] text-ch-sub leading-relaxed">
                All messages are encrypted end-to-end using X25519 key exchange and XSalsa20-Poly1305.
                Only you and your chat partner can read them.
              </p>
            </div>
          </div>

          <div className="bg-ch-input rounded-[12px] p-4 mb-4">
            <p className="text-[13px] font-medium text-ch-sub mb-1">Your Key Status</p>
            <p className="text-[15px] text-ch-text">
              {pubKey ? '🔐 Private key present on this device' : '⚠️ No private key found'}
            </p>
            {user?.uid && (
              <p className="text-[11px] text-ch-sub mt-2 font-mono break-all">UID: {user.uid}</p>
            )}
          </div>

          <div className="bg-ch-input rounded-[12px] p-4 mb-6">
            <p className="text-[13px] font-medium text-ch-sub mb-2">About Linked Devices</p>
            <p className="text-[13px] text-ch-sub leading-relaxed">
              Your private key is stored only on this device. Logging in on another device will
              generate a new key pair — existing messages won't be readable on the new device.
            </p>
          </div>

          <button
            onClick={() => setModal('none')}
            className="w-full py-3 rounded-[12px] bg-ch-input text-ch-text text-[17px]"
          >
            Close
          </button>
        </Modal>
      )}

      {/* ── Block List Modal ── */}
      {modal === 'blocklist' && (
        <Modal title="Block List" onClose={() => setModal('none')}>
          <div className="flex flex-col items-center py-8 gap-3">
            <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
              <circle cx="24" cy="24" r="22" stroke="#414755" strokeWidth="1.5" />
              <circle cx="24" cy="18" r="8" stroke="#414755" strokeWidth="1.5" />
              <path d="M4 44c0-11 9-18 20-18s20 7 20 18" stroke="#414755" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <p className="text-[16px] font-semibold text-ch-text">No blocked users</p>
            <p className="text-[13px] text-ch-sub text-center">
              You haven't blocked anyone. Blocked users won't be able to send you messages.
            </p>
          </div>
          <button
            onClick={() => setModal('none')}
            className="w-full py-3 rounded-[12px] bg-ch-input text-ch-text text-[17px]"
          >
            Close
          </button>
        </Modal>
      )}

      {/* ── Notification Settings Modal ── */}
      {modal === 'notifications' && (
        <Modal title="Notification Settings" onClose={() => setModal('none')}>
          <div className="bg-ch-input rounded-[12px] p-4 mb-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[15px] font-semibold text-ch-text">Push Notifications</p>
                <p className="text-[12px] text-ch-sub mt-0.5 capitalize">{notifPermission}</p>
              </div>
              {notifPermission === 'granted' ? (
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                  <circle cx="10" cy="10" r="9" stroke="#66BB6A" strokeWidth="1.5" />
                  <path d="M6 10l3 3 5-5" stroke="#66BB6A" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              ) : (
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                  <circle cx="10" cy="10" r="9" stroke="#ffb4ab" strokeWidth="1.5" />
                  <path d="M7 7l6 6M13 7l-6 6" stroke="#ffb4ab" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              )}
            </div>
          </div>

          {notifPermission === 'default' && (
            <button
              onClick={requestNotifications}
              className="w-full py-3 rounded-[12px] bg-ch-blue text-[#002e69] font-semibold text-[17px] mb-4"
            >
              Enable Notifications
            </button>
          )}

          {notifPermission === 'denied' && (
            <div className="bg-ch-input rounded-[12px] p-4 mb-4">
              <p className="text-[13px] text-ch-sub leading-relaxed">
                Notifications are blocked by your browser. To enable them, open your browser
                settings and allow notifications for this site.
              </p>
            </div>
          )}

          {notifPermission === 'granted' && (
            <div className="bg-ch-input rounded-[12px] p-4 mb-4">
              <p className="text-[13px] text-ch-sub leading-relaxed">
                You'll receive notifications for new messages when the app is in the background or
                another conversation is active.
              </p>
            </div>
          )}

          <button
            onClick={() => setModal('none')}
            className="w-full py-3 rounded-[12px] bg-ch-input text-ch-text text-[17px]"
          >
            Close
          </button>
        </Modal>
      )}
    </div>
  );
}
