import { useEffect, useRef } from 'react';
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

// Listens to all conversations via Firestore and fires a browser notification
// whenever a new message arrives in a conversation the user is not currently viewing.
function GlobalNotifications() {
  const { user } = useAuth();
  const location = useLocation();
  const locationRef = useRef(location);

  useEffect(() => {
    locationRef.current = location;
  }, [location]);

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
          convId !== currentConvId &&
          Notification.permission === 'granted'
        ) {
          const participants: string[] = data.participants ?? [];
          const otherUid = participants.find((p: string) => p !== user.uid);

          if (otherUid && !namesCache[otherUid]) {
            try {
              const uSnap = await getDoc(doc(db, 'users', otherUid));
              if (uSnap.exists()) namesCache[otherUid] = uSnap.data().displayName ?? 'Someone';
            } catch { /* ignore */ }
          }

          const title = (otherUid && namesCache[otherUid]) ? namesCache[otherUid] : 'New Message';
          const body =
            lastMsg?.type === 'image' ? '📷 Photo'
            : lastMsg?.type === 'video' ? '🎥 Video'
            : lastMsg?.type === 'audio' ? '🎤 Voice note'
            : '🔒 New encrypted message';

          try {
            const reg = await navigator.serviceWorker.ready;
            await reg.showNotification(title, {
              body,
              icon: '/chatas.jpg',
              badge: '/chatas.jpg',
              tag: convId,
              data: { conversationId: convId },
            } as NotificationOptions);
          } catch {
            try { new Notification(title, { body, icon: '/icon-192.png' }); } catch { /* ignore */ }
          }
        }

        lastSeen[convId] = updatedAt;
      }

      initialDone = true;
    });

    return () => unsub();
  }, [user]);

  return null;
}

// Restore private key from IndexedDB into localStorage if missing (runs once).
initKeyStore();

export default function App() {
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
