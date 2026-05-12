import { useEffect, useRef, useState, useCallback } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { collection, query, where, onSnapshot, doc, getDoc } from 'firebase/firestore';
import { ThemeProvider } from './context/ThemeContext';
import ProtectedRoute from './components/ProtectedRoute';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import ConversationsPage from './pages/ConversationsPage';
import ChatPage from './pages/ChatPage';
import GalleryPage from './pages/GalleryPage';
import GlobalGalleryPage from './pages/GlobalGalleryPage';
import SettingsPage from './pages/SettingsPage';
import { db } from './services/firebase';
import { useAuth } from './hooks/useAuth';
import { initKeyStore } from './services/keyStore';

function SWNavigationListener() {
  const navigate = useNavigate();
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (event.data?.type === 'NAVIGATE') navigate(event.data.url);
    };
    navigator.serviceWorker?.addEventListener('message', handler);
    return () => navigator.serviceWorker?.removeEventListener('message', handler);
  }, [navigate]);
  return null;
}

type InAppAlert = { title: string; body: string; convId: string; initials: string };

function playNotificationSound() {
  try {
    const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.12);
    gain.gain.setValueAtTime(0.18, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
    osc.start();
    osc.stop(ctx.currentTime + 0.35);
  } catch { /* ignore */ }
}

function updateAppBadge(count: number) {
  try {
    if ('setAppBadge' in navigator) {
      count > 0
        ? (navigator as unknown as { setAppBadge(n: number): void }).setAppBadge(count)
        : (navigator as unknown as { clearAppBadge(): void }).clearAppBadge();
    }
  } catch { /* ignore */ }
}

// Watches all conversations, shows an in-app banner + sound + vibration + app badge
// whenever a new message arrives outside the currently open conversation.
function GlobalNotifications() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const locationRef = useRef(location);
  const [alert, setAlert] = useState<InAppAlert | null>(null);
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { locationRef.current = location; }, [location]);

  const showAlert = useCallback((a: InAppAlert) => {
    setAlert(a);
    if (dismissTimer.current) clearTimeout(dismissTimer.current);
    dismissTimer.current = setTimeout(() => setAlert(null), 4500);
  }, []);

  useEffect(() => {
    if (!user) return;

    const namesCache: Record<string, string> = {};
    let initialDone = false;
    const lastSeen: Record<string, number> = {};

    const q = query(
      collection(db, 'conversations'),
      where('participants', 'array-contains', user.uid),
    );

    const unsub = onSnapshot(q, async (snap) => {
      const currentConvId = locationRef.current.pathname.match(/^\/chat\/([^/]+)/)?.[1];

      // Update app badge + tab title with total unread count
      let totalUnread = 0;
      for (const d of snap.docs) {
        totalUnread += (d.data().unreadCounts?.[user.uid] ?? 0);
      }
      updateAppBadge(totalUnread);
      document.title = totalUnread > 0 ? `(${totalUnread}) Chat` : 'Chat';

      for (const d of snap.docs) {
        const data = d.data();
        const convId = d.id;
        const updatedAt: number = data.updatedAt?.toMillis?.() ?? 0;
        const lastMsg = data.lastMessage;
        const prev = lastSeen[convId] ?? 0;

        if (
          initialDone &&
          updatedAt > prev &&
          lastMsg?.senderId !== user.uid &&
          convId !== currentConvId
        ) {
          const participants: string[] = data.participants ?? [];
          const otherUid = participants.find((p: string) => p !== user.uid);

          if (otherUid && !namesCache[otherUid]) {
            try {
              const uSnap = await getDoc(doc(db, 'users', otherUid));
              if (uSnap.exists()) namesCache[otherUid] = uSnap.data().displayName ?? 'Someone';
            } catch { /* ignore */ }
          }

          const senderName = (otherUid && namesCache[otherUid]) ? namesCache[otherUid] : 'New Message';
          const body =
            lastMsg?.type === 'image' ? '📷 Photo'
            : lastMsg?.type === 'video' ? '🎥 Video'
            : lastMsg?.type === 'audio' ? '🎤 Voice note'
            : '🔒 New encrypted message';

          // 1. In-app banner (always works, no permission needed)
          showAlert({
            title: senderName,
            body,
            convId,
            initials: senderName.slice(0, 2).toUpperCase(),
          });

          // 2. Sound + vibration
          playNotificationSound();
          try { navigator.vibrate?.([150]); } catch { /* ignore */ }

          // 3. OS push notification (best-effort, requires permission)
          if (Notification.permission === 'granted') {
            try {
              const reg = await navigator.serviceWorker.ready;
              await reg.showNotification(senderName, {
                body, icon: '/chatas.jpg', badge: '/chatas.jpg',
                tag: convId, data: { conversationId: convId },
              } as NotificationOptions);
            } catch {
              try { new Notification(senderName, { body, icon: '/chatas.jpg' }); } catch { /* ignore */ }
            }
          }
        }

        lastSeen[convId] = updatedAt;
      }

      initialDone = true;
    });

    return () => unsub();
  }, [user, showAlert]);

  if (!alert) return null;

  return (
    <div
      className="fixed top-0 left-0 right-0 z-[200] px-3 animate-slide-down pointer-events-none"
      style={{ paddingTop: 'max(env(safe-area-inset-top), 12px)' }}
    >
      <div className="pointer-events-auto flex items-center gap-3 bg-ch-card border border-ch-border rounded-2xl shadow-2xl px-3 py-3 mx-auto max-w-sm">
        {/* Avatar */}
        <div className="w-10 h-10 rounded-full bg-ch-surface flex items-center justify-center text-[13px] font-bold text-ch-blue flex-shrink-0">
          {alert.initials}
        </div>

        {/* Text — tap opens the chat */}
        <button
          className="flex-1 min-w-0 text-left"
          onClick={() => { navigate(`/chat/${alert.convId}`); setAlert(null); }}
        >
          <p className="text-[14px] font-semibold text-ch-text truncate leading-tight">{alert.title}</p>
          <p className="text-[13px] text-ch-sub truncate">{alert.body}</p>
        </button>

        {/* Dismiss */}
        <button
          className="p-1.5 flex-shrink-0"
          onClick={() => setAlert(null)}
          aria-label="Dismiss"
        >
          <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
            <path d="M1 1l9 9M10 1L1 10" stroke="#c1c6d7" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </div>
  );
}

export default function App() {
  // Start ready=true if key already in localStorage (avoids flash).
  // If localStorage was wiped (PWA reinstall), wait for IDB restore before rendering.
  const [keyReady, setKeyReady] = useState(() => !!localStorage.getItem('chatus_e2ee_private_key'));

  useEffect(() => {
    if (keyReady) return;
    initKeyStore().then(() => setKeyReady(true));
  }, []);

  if (!keyReady) {
    return (
      <div className="h-dvh bg-[#10131b] flex items-center justify-center">
        <div className="w-9 h-9 border-4 border-[#adc6ff] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <ThemeProvider>
      <BrowserRouter>
        <SWNavigationListener />
        <GlobalNotifications />
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route element={<ProtectedRoute />}>
            <Route path="/" element={<ConversationsPage />} />
            <Route path="/chat/:id" element={<ChatPage />} />
            <Route path="/chat/:id/gallery" element={<GalleryPage />} />
            <Route path="/gallery" element={<GlobalGalleryPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  );
}
