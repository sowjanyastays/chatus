import { signOut } from 'firebase/auth';
import { auth } from '../services/firebase';
import { useAuth } from '../hooks/useAuth';
import { useTheme } from '../context/ThemeContext';
import { getInitials, getAvatarColor } from '../utils/avatar';
import BottomNav from '../components/BottomNav';

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
};

function SettingsRow({ iconBg, icon, label, right, border = false }: RowProps) {
  return (
    <div className={`flex items-center px-4 py-4 gap-3 ${border ? 'border-t border-ch-border' : ''}`}>
      <div className="w-8 h-8 rounded-[8px] flex items-center justify-center flex-shrink-0"
        style={{ backgroundColor: iconBg }}>
        {icon}
      </div>
      <span className="flex-1 text-[17px] text-ch-text">{label}</span>
      {right ?? <ChevronRight />}
    </div>
  );
}

function Toggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
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

export default function SettingsPage() {
  const { user } = useAuth();
  const { theme, toggleTheme } = useTheme();

  const displayName = user?.displayName ?? 'User';
  const email = user?.email ?? '';
  const initials = getInitials(displayName);
  const color = getAvatarColor(displayName);

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
            />
            <SettingsRow
              iconBg="#adc6ff"
              icon={<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><rect x="1" y="3" width="12" height="9" rx="1.5" stroke="#10131b" strokeWidth="1.4" /><path d="M4 3V2a3 3 0 016 0v1" stroke="#10131b" strokeWidth="1.4" strokeLinecap="round" /></svg>}
              label="Linked Devices"
              border
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
            />
            <SettingsRow iconBg="#adc6ff"
              icon={<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="6" stroke="#10131b" strokeWidth="1.4" /><path d="M7 4v3l2 2" stroke="#10131b" strokeWidth="1.4" strokeLinecap="round" /></svg>}
              label="Block List"
              border
            />
            <SettingsRow iconBg="#adc6ff"
              icon={<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7 1l1.6 3.3 3.6.5-2.6 2.5.6 3.6L7 9.3 3.8 11l.6-3.6L2 4.8l3.6-.5L7 1z" stroke="#10131b" strokeWidth="1.3" strokeLinejoin="round" /></svg>}
              label="Notification Settings"
              border
            />
          </div>
        </div>

        {/* Data & Storage */}
        <div>
          <p className="text-[12px] font-medium text-ch-sub px-1 mb-2 tracking-wider">DATA & STORAGE</p>
          <div className="bg-ch-card rounded-[12px] overflow-hidden">
            <SettingsRow iconBg="#454749"
              icon={<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2 2h10v10H2V2z" stroke="white" strokeWidth="1.3" /><path d="M5 5h4M5 7.5h2.5" stroke="white" strokeWidth="1.3" strokeLinecap="round" /></svg>}
              label="Clear Cache"
              right={<div className="flex items-center gap-2"><span className="text-[12px] text-ch-sub">24 MB</span><ChevronRight /></div>}
            />
            <SettingsRow iconBg="#454749"
              icon={<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7 1v8M4 6l3 3 3-3M1 11h12v2H1z" stroke="white" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" /></svg>}
              label="Auto-Download Media"
              right={<Toggle on={false} onToggle={() => {}} />}
              border
            />
          </div>
        </div>

        {/* Logout */}
        <button
          onClick={() => signOut(auth)}
          className="w-full flex items-center justify-center gap-2 py-4 rounded-[12px] border"
          style={{ backgroundColor: '#1c2028', borderColor: '#ffb4ab' }}
        >
          <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
            <path d="M5 13H2a1 1 0 01-1-1V3a1 1 0 011-1h3M10 11l4-3.5L10 4M14 7.5H6" stroke="#ffb4ab" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="text-[17px] font-semibold" style={{ color: '#ffb4ab' }}>Logout</span>
        </button>

        {/* Version */}
        <p className="text-center text-[11px] text-ch-sub opacity-40 pb-2">
          VERSION 1.0.0 (BUILD 1)
        </p>
      </div>

      <BottomNav />
    </div>
  );
}
