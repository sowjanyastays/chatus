import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';

initializeApp();

// Fires whenever a new message is created in any conversation.
// Sends push notifications to the recipient via:
//   - FCM Web Push (fcmWebToken)  → PWA on Android / iOS
//   - Expo Push (expoPushToken)   → native iOS / Android app
export const onMessageCreated = onDocumentCreated(
  'conversations/{conversationId}/messages/{messageId}',
  async (event) => {
    const data = event.data?.data();
    if (!data) return;

    const { senderId, type } = data as { senderId: string; type: string };
    const { conversationId } = event.params;

    const db = getFirestore();

    const [convDoc, senderDoc] = await Promise.all([
      db.doc(`conversations/${conversationId}`).get(),
      db.doc(`users/${senderId}`).get(),
    ]);

    const participants: string[] = convDoc.data()?.participants ?? [];
    const recipientId = participants.find(p => p !== senderId);
    if (!recipientId) return;

    const senderName: string = senderDoc.data()?.displayName ?? 'Someone';

    const recipientDoc = await db.doc(`users/${recipientId}`).get();
    const { fcmWebToken, expoPushToken } = (recipientDoc.data() ?? {}) as {
      fcmWebToken?: string;
      expoPushToken?: string;
    };

    const messageBody =
      type === 'image' ? '📷 Photo'
      : type === 'video' ? '🎥 Video'
      : type === 'audio' ? '🎤 Voice note'
      : '🔒 New encrypted message';

    const promises: Promise<unknown>[] = [];

    // FCM for web PWA — icon/vibration handled by the service worker push handler
    if (fcmWebToken) {
      promises.push(
        getMessaging().send({
          token: fcmWebToken,
          notification: { title: senderName, body: messageBody },
          data: { conversationId },
          webpush: {
            headers: { Urgency: 'high' },
          },
        }).catch(e => console.warn('[FCM] Web push failed:', e)),
      );
    }

    // Expo push for native apps
    if (expoPushToken) {
      promises.push(
        fetch('https://exp.host/--/api/v2/push/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({
            to: expoPushToken,
            title: senderName,
            body: messageBody,
            data: { conversationId },
            sound: 'default',
            priority: 'high',
            channelId: 'messages',
          }),
        }).catch(e => console.warn('[Expo] Push failed:', e)),
      );
    }

    await Promise.allSettled(promises);
  },
);
