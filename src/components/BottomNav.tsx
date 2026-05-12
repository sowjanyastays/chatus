import { useNavigate, useLocation } from 'react-router-dom';

function ChatIcon({ active }: { active: boolean }) {
  const c = active ? '#adc6ff' : '#c1c6d7';
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <path d="M10 2C5.6 2 2 5.1 2 9c0 1.9.8 3.6 2.2 4.9L3 17l3.5-1.2C7.6 16.6 8.8 17 10 17c4.4 0 8-3.1 8-7s-3.6-8-8-8z" fill={c} />
    </svg>
  );
}

function GalleryIcon({ active }: { active: boolean }) {
  const c = active ? '#adc6ff' : '#c1c6d7';
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <rect x="2" y="2" width="16" height="16" rx="3" stroke={c} strokeWidth="1.5" />
      <circle cx="7" cy="7.5" r="1.5" fill={c} />
      <path d="M2 13l4-4 3 3 3-3 6 6" stroke={c} strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

function SettingsIcon({ active }: { active: boolean }) {
  const c = active ? '#adc6ff' : '#c1c6d7';
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <circle cx="10" cy="10" r="2.5" stroke={c} strokeWidth="1.5" />
      <path d="M10 2v2M10 16v2M2 10h2M16 10h2M4.2 4.2l1.4 1.4M14.4 14.4l1.4 1.4M4.2 15.8l1.4-1.4M14.4 5.6l1.4-1.4" stroke={c} strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

const TABS = [
  { label: 'Chat',     path: '/',         Icon: ChatIcon },
  { label: 'Gallery',  path: '/gallery',  Icon: GalleryIcon },
  { label: 'Settings', path: '/settings', Icon: SettingsIcon },
];

export default function BottomNav() {
  const navigate = useNavigate();
  const { pathname } = useLocation();

  function isActive(path: string) {
    if (path === '/') return pathname === '/';
    return pathname.startsWith(path);
  }

  return (
    <div
      className="flex-shrink-0 bg-ch-bg border-t border-ch-border flex items-start justify-around px-6 pt-3"
      style={{ paddingBottom: 'max(var(--safe-bottom), 12px)' }}
    >
      {TABS.map(({ label, path, Icon }) => {
        const active = isActive(path);
        return (
          <button
            key={path}
            onClick={() => navigate(path)}
            className="flex flex-col items-center gap-1 min-w-[48px]"
          >
            <Icon active={active} />
            <span
              className="text-[12px] font-medium"
              style={{ color: active ? '#adc6ff' : '#c1c6d7' }}
            >
              {label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
