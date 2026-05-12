import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching';
import { clientsClaim } from 'workbox-core';
import { registerRoute } from 'workbox-routing';
import { NetworkFirst, StaleWhileRevalidate } from 'workbox-strategies';

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<{ url: string; revision: string | null }>;
};

self.skipWaiting();
clientsClaim();

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// Cache static assets with stale-while-revalidate
registerRoute(
  ({ request }) => request.destination === 'style' || request.destination === 'script',
  new StaleWhileRevalidate({ cacheName: 'static-assets' }),
);

// Cache Firestore reads when offline
registerRoute(
  ({ url }) => url.hostname.includes('firestore.googleapis.com'),
  new NetworkFirst({ cacheName: 'firestore', networkTimeoutSeconds: 5 }),
);

// Handle FCM push events
self.addEventListener('push', (event) => {
  if (!event.data) return;
  try {
    const payload = event.data.json();
    const notification = payload.notification ?? {};
    const data = payload.data ?? {};
    event.waitUntil(
      self.registration.showNotification(notification.title ?? 'Chatus', {
        body: notification.body ?? '🔒 New encrypted message',
        icon: '/chatas.jpg',
        badge: '/chatas.jpg',
        data,
        tag: data.conversationId ?? 'chatus-message',
        vibrate: [200, 100, 200],
      } as NotificationOptions),
    );
  } catch {
    // ignore malformed push
  }
});

// Navigate to conversation when notification is tapped
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const conversationId = (event.notification.data as { conversationId?: string })?.conversationId;
  const url = conversationId ? `/chat/${conversationId}` : '/';
  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clients) => {
        for (const client of clients) {
          if ('focus' in client) {
            (client as WindowClient).focus();
            client.postMessage({ type: 'NAVIGATE', url });
            return;
          }
        }
        return self.clients.openWindow(url);
      }),
  );
});
