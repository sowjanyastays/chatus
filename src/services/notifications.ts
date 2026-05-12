import { getToken, onMessage } from 'firebase/messaging';
import { doc, updateDoc } from 'firebase/firestore';
import { db, getMessagingInstance } from './firebase';

export async function registerForWebPush(userId: string): Promise<boolean> {
  if (!('Notification' in window) || !('serviceWorker' in navigator)) return false;

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return false;

  const messaging = await getMessagingInstance();
  if (!messaging) return false;

  const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY;
  if (!vapidKey || vapidKey === 'YOUR_VAPID_KEY_HERE') {
    console.warn('[Push] VAPID key not configured — skipping token registration.');
    return false;
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    const token = await getToken(messaging, { vapidKey, serviceWorkerRegistration: registration });
    if (token) {
      await updateDoc(doc(db, 'users', userId), { fcmWebToken: token });
    }
    return !!token;
  } catch (e) {
    console.warn('[Push] FCM token registration failed:', e);
    return false;
  }
}

export async function listenForForegroundMessages(
  onNotification: (title: string, body: string, conversationId?: string) => void,
): Promise<() => void> {
  const messaging = await getMessagingInstance();
  if (!messaging) return () => {};
  return onMessage(messaging, (payload) => {
    onNotification(
      payload.notification?.title ?? 'Chatus',
      payload.notification?.body ?? '🔒 New message',
      (payload.data as { conversationId?: string })?.conversationId,
    );
  });
}
