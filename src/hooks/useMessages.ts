import { useState, useEffect } from 'react';
import { collection, query, orderBy, onSnapshot, DocumentData } from 'firebase/firestore';
import { db } from '../services/firebase';
import { decryptMessage } from '../services/crypto';
import { loadPrivateKey } from '../services/keyStore';

export type MessageType = 'text' | 'image' | 'video' | 'audio';

export type Message = {
  id: string;
  senderId: string;
  type: MessageType;
  text?: string;
  mediaUrl?: string;
  wrappedKey?: string;
  keyNonce?: string;
  fileNonce?: string;
  thumbnail?: string;
  duration?: number;
  mimeType?: string;
  createdAt: number;
  readBy: string[];
  ciphertext: string;
  nonce: string;
  editedAt?: number;
  isDeleted?: boolean;
  replyTo?: {
    id: string;
    senderId: string;
    type: MessageType;
    text?: string;
  };
};

export function useMessages(conversationId: string, otherPublicKey: string) {
  const [messages, setMessages] = useState<Message[]>([]);

  useEffect(() => {
    if (!conversationId || !otherPublicKey) return;

    const q = query(
      collection(db, 'conversations', conversationId, 'messages'),
      orderBy('createdAt', 'asc'),
    );

    return onSnapshot(q, (snap) => {
      const mySecretKey = loadPrivateKey();
      if (!mySecretKey) return;

      const decrypted: Message[] = snap.docs.map((d) => {
        const data = d.data() as DocumentData;
        let text: string | undefined;
        if (data.type === 'text' && data.ciphertext && data.nonce) {
          text = decryptMessage(data.ciphertext, data.nonce, otherPublicKey, mySecretKey) ?? '[encrypted]';
        }
        return {
          id: d.id,
          senderId: data.senderId,
          type: data.type,
          text,
          mediaUrl: data.mediaUrl,
          wrappedKey: data.wrappedKey,
          keyNonce: data.keyNonce,
          fileNonce: data.fileNonce,
          duration: data.duration,
          mimeType: data.mimeType,
          thumbnail: data.thumbnail,
          createdAt: data.createdAt,
          readBy: data.readBy ?? [],
          ciphertext: data.ciphertext,
          nonce: data.nonce,
          editedAt: data.editedAt,
          isDeleted: data.isDeleted ?? false,
          replyTo: data.replyTo,
        };
      });

      setMessages(decrypted);
    });
  }, [conversationId, otherPublicKey]);

  return messages;
}
