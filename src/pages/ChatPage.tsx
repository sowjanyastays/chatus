import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  doc, getDoc, collection, addDoc, updateDoc, serverTimestamp,
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage, auth } from '../services/firebase';
import { useMessages } from '../hooks/useMessages';
import { encryptMessage, encryptFile, wrapFileKey } from '../services/crypto';
import { loadPrivateKey } from '../services/keyStore';
import { uploadEncryptedFile } from '../services/cloudinary';
import MessageBubble from '../components/MessageBubble';
import VoiceRecorder from '../components/VoiceRecorder';
import EmojiPicker from '../components/EmojiPicker';
import { getInitials } from '../utils/avatar';
import { formatDateSeparator } from '../utils/formatTime';

type UserProfile = { uid: string; displayName: string; publicKey: string; email: string };

const AVATAR_COLORS = ['#adc6ff', '#ffb595', '#4b8eff', '#66BB6A', '#EC407A', '#AB47BC'];
function avatarColor(name: string) {
  return AVATAR_COLORS[name.charCodeAt(0) % AVATAR_COLORS.length];
}

export default function ChatPage() {
  const { id: conversationId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const me = auth.currentUser!;

  const [otherUser, setOtherUser] = useState<UserProfile | null>(null);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [showVoice, setShowVoice] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  const messages = useMessages(conversationId ?? '', otherUser?.publicKey ?? '');

  useEffect(() => {
    if (!conversationId) return;
    (async () => {
      const convDoc = await getDoc(doc(db, 'conversations', conversationId));
      if (!convDoc.exists()) return;
      const otherUid = (convDoc.data().participants as string[]).find(p => p !== me.uid)!;
      const userDoc = await getDoc(doc(db, 'users', otherUid));
      if (userDoc.exists()) setOtherUser(userDoc.data() as UserProfile);
    })();
  }, [conversationId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  function autoResize(el: HTMLTextAreaElement) {
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 100) + 'px';
  }

  function openSearch() {
    setShowSearch(true);
    setShowEmoji(false);
    setTimeout(() => searchInputRef.current?.focus(), 60);
  }

  function closeSearch() {
    setShowSearch(false);
    setSearchQuery('');
  }

  function toggleEmoji() {
    if (showEmoji) {
      setShowEmoji(false);
      inputRef.current?.focus();
    } else {
      inputRef.current?.blur();
      setShowEmoji(true);
    }
  }

  async function sendText() {
    if (!text.trim() || !otherUser) return;
    setSending(true);
    try {
      const mySecretKey = loadPrivateKey();
      if (!mySecretKey) throw new Error('Private key missing');
      const { ciphertext, nonce } = encryptMessage(text.trim(), otherUser.publicKey, mySecretKey);
      const now = Date.now();
      await addDoc(collection(db, 'conversations', conversationId!, 'messages'), {
        senderId: me.uid, type: 'text', ciphertext, nonce, createdAt: now, readBy: [me.uid],
      });
      await updateDoc(doc(db, 'conversations', conversationId!), {
        lastMessage: { type: 'text', createdAt: now, senderId: me.uid },
        updatedAt: serverTimestamp(),
      });
      setText('');
      if (inputRef.current) inputRef.current.style.height = 'auto';
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setSending(false);
    }
  }

  async function sendMedia(file: File, type: 'image' | 'video') {
    if (!otherUser) return;
    setSending(true);
    try {
      const mySecretKey = loadPrivateKey();
      if (!mySecretKey) throw new Error('Private key missing');
      const fileBytes = new Uint8Array(await file.arrayBuffer());
      const { encryptedBytes, fileKey, fileNonce } = encryptFile(fileBytes);
      const { wrappedKey, keyNonce } = wrapFileKey(fileKey, otherUser.publicKey, mySecretKey);
      const filename = `${me.uid}_${Date.now()}.enc`;
      let mediaUrl: string;
      if (type === 'image') {
        const storageRef = ref(storage, `media/${conversationId}/${filename}`);
        await uploadBytes(storageRef, encryptedBytes);
        mediaUrl = await getDownloadURL(storageRef);
      } else {
        mediaUrl = await uploadEncryptedFile(encryptedBytes, filename);
      }
      const { ciphertext, nonce } = encryptMessage(`[${type}]`, otherUser.publicKey, mySecretKey);
      const now = Date.now();
      await addDoc(collection(db, 'conversations', conversationId!, 'messages'), {
        senderId: me.uid, type, ciphertext, nonce,
        mediaUrl, wrappedKey, keyNonce, fileNonce, createdAt: now, readBy: [me.uid],
      });
      await updateDoc(doc(db, 'conversations', conversationId!), {
        lastMessage: { type, createdAt: now, senderId: me.uid },
        updatedAt: serverTimestamp(),
      });
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setSending(false);
    }
  }

  async function sendVoiceNote(blob: Blob, duration: number) {
    if (!otherUser) return;
    setSending(true);
    try {
      const mySecretKey = loadPrivateKey();
      if (!mySecretKey) throw new Error('Private key missing');
      const fileBytes = new Uint8Array(await blob.arrayBuffer());
      const { encryptedBytes, fileKey, fileNonce } = encryptFile(fileBytes);
      const { wrappedKey, keyNonce } = wrapFileKey(fileKey, otherUser.publicKey, mySecretKey);
      const storageRef = ref(storage, `media/${conversationId}/${me.uid}_${Date.now()}.voice.enc`);
      await uploadBytes(storageRef, encryptedBytes);
      const mediaUrl = await getDownloadURL(storageRef);
      const { ciphertext, nonce } = encryptMessage('[voice]', otherUser.publicKey, mySecretKey);
      const now = Date.now();
      await addDoc(collection(db, 'conversations', conversationId!, 'messages'), {
        senderId: me.uid, type: 'audio', ciphertext, nonce,
        mediaUrl, wrappedKey, keyNonce, fileNonce, duration,
        mimeType: blob.type || 'audio/webm',
        createdAt: now, readBy: [me.uid],
      });
      await updateDoc(doc(db, 'conversations', conversationId!), {
        lastMessage: { type: 'audio', createdAt: now, senderId: me.uid },
        updatedAt: serverTimestamp(),
      });
      setShowVoice(false);
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setSending(false);
    }
  }

  // Build message list with date separators (filtered by search)
  const trimmedSearch = searchQuery.trim().toLowerCase();
  const visibleMessages = trimmedSearch
    ? messages.filter(m => m.type === 'text' && m.text?.toLowerCase().includes(trimmedSearch))
    : messages;

  type ListItem =
    | { kind: 'separator'; date: string; key: string }
    | { kind: 'message'; data: typeof messages[0] };

  const listItems: ListItem[] = [];
  let lastDate = '';
  for (const msg of visibleMessages) {
    const dateStr = new Date(msg.createdAt).toDateString();
    if (dateStr !== lastDate) {
      listItems.push({ kind: 'separator', date: formatDateSeparator(msg.createdAt), key: `sep-${msg.createdAt}` });
      lastDate = dateStr;
    }
    listItems.push({ kind: 'message', data: msg });
  }

  if (!otherUser) {
    return (
      <div className="h-dvh flex items-center justify-center bg-ch-bg">
        <div className="w-9 h-9 border-4 border-ch-blue border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const color = avatarColor(otherUser.displayName);
  const initials = getInitials(otherUser.displayName);

  return (
    <div className="h-dvh flex flex-col overflow-hidden bg-ch-bg">
      {/* Header */}
      <div className="flex-shrink-0 bg-ch-bg border-b border-ch-border">
        <div
          className="flex items-center justify-between px-4 py-3"
          style={{ paddingTop: 'max(var(--safe-top), 12px)' }}
        >
          {/* Left: back + partner name */}
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <button
              onClick={() => navigate('/')}
              className="flex-shrink-0"
              aria-label="Back"
            >
              <svg width="10" height="17" viewBox="0 0 10 17" fill="none">
                <path d="M9 1L1 8.5 9 16" stroke="#adc6ff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <span className="text-[17px] font-semibold text-ch-text truncate">{otherUser.displayName}</span>
          </div>

          {/* Right: search + gallery + avatar */}
          <div className="flex items-center gap-3 flex-shrink-0">
            <button
              onClick={showSearch ? closeSearch : openSearch}
              aria-label="Search"
            >
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                <circle cx="7.5" cy="7.5" r="5.5" stroke={showSearch ? '#adc6ff' : '#c1c6d7'} strokeWidth="1.5" />
                <path d="M12 12l3.5 3.5" stroke={showSearch ? '#adc6ff' : '#c1c6d7'} strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
            <button
              onClick={() => navigate(`/chat/${conversationId}/gallery`)}
              aria-label="Media gallery"
            >
              <svg width="20" height="16" viewBox="0 0 20 16" fill="none">
                <rect x="1" y="1" width="18" height="14" rx="2" stroke="#c1c6d7" strokeWidth="1.5" />
                <circle cx="6.5" cy="5.5" r="1.5" fill="#c1c6d7" />
                <path d="M1 11l5-4 4 3.5 3-2.5 6 5" stroke="#c1c6d7" strokeWidth="1.5" strokeLinejoin="round" />
              </svg>
            </button>
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold border border-ch-border flex-shrink-0"
              style={{ backgroundColor: '#31353d', color }}
            >
              {initials}
            </div>
          </div>
        </div>

        {/* Search bar slide-in */}
        {showSearch && (
          <div className="px-4 pb-3 flex items-center gap-2">
            <input
              ref={searchInputRef}
              type="search"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search messages…"
              className="flex-1 bg-ch-input rounded-[12px] px-4 py-2.5 text-[15px] text-ch-text placeholder-ch-sub focus:outline-none focus:ring-2 focus:ring-ch-blue"
            />
            {trimmedSearch && (
              <span className="text-ch-sub text-xs whitespace-nowrap">
                {visibleMessages.length} result{visibleMessages.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto scrollbar-hidden bg-ch-bg px-4 py-3">
        {trimmedSearch && visibleMessages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-8">
            <span className="text-5xl mb-3">🔍</span>
            <p className="text-ch-sub text-sm">No messages match "{searchQuery.trim()}"</p>
          </div>
        ) : (
          listItems.map(item => {
            if (item.kind === 'separator') {
              return (
                <div key={item.key} className="flex items-center justify-center my-4">
                  <span className="text-ch-sub text-[12px] font-medium">
                    {item.date}
                  </span>
                </div>
              );
            }
            return (
              <MessageBubble
                key={item.data.id}
                message={item.data}
                isMine={item.data.senderId === me.uid}
                partnerPublicKey={otherUser.publicKey}
                searchTerm={trimmedSearch}
              />
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Emoji Picker */}
      <EmojiPicker
        open={showEmoji}
        onEmojiSelect={emoji => setText(t => t + emoji)}
      />

      {/* Composer footer */}
      <div
        className="flex-shrink-0 bg-ch-bg border-t border-ch-border"
        style={{ paddingBottom: 'max(var(--safe-bottom), 8px)' }}
      >
        {showVoice ? (
          <VoiceRecorder onSend={sendVoiceNote} onCancel={() => setShowVoice(false)} />
        ) : (
          <div className="flex items-center gap-3 px-4 py-2">
            {/* Hidden file inputs */}
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) sendMedia(f, 'image'); e.target.value = ''; }} />
            <input ref={videoInputRef} type="file" accept="video/*" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) sendMedia(f, 'video'); e.target.value = ''; }} />

            {/* Attach button */}
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex-shrink-0 w-6 h-6 flex items-center justify-center"
              aria-label="Attach"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M14 8l-5.5 5.5a4 4 0 01-5.66-5.66l6-6a2.5 2.5 0 013.54 3.54L6.5 11.5a1 1 0 01-1.41-1.41L11 4.5" stroke="#adc6ff" strokeWidth="1.4" strokeLinecap="round" />
              </svg>
            </button>

            {/* Input container */}
            <div className="flex-1 flex items-center gap-2 bg-ch-input border border-ch-border rounded-[20px] px-3 py-2 min-h-[44px]">
              {/* Emoji toggle */}
              <button onClick={toggleEmoji} className="flex-shrink-0" aria-label="Emoji">
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                  <circle cx="10" cy="10" r="8.5" stroke="#c1c6d7" strokeWidth="1.4" />
                  <circle cx="7.5" cy="8.5" r="1" fill="#c1c6d7" />
                  <circle cx="12.5" cy="8.5" r="1" fill="#c1c6d7" />
                  <path d="M7 12.5c.8 1 2 1.5 3 1.5s2.2-.5 3-1.5" stroke="#c1c6d7" strokeWidth="1.3" strokeLinecap="round" />
                </svg>
              </button>

              {/* Text area */}
              <textarea
                ref={inputRef}
                value={text}
                onChange={e => { setText(e.target.value); autoResize(e.target); }}
                onFocus={() => setShowEmoji(false)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendText(); } }}
                placeholder="Message"
                rows={1}
                className="flex-1 bg-transparent text-[17px] text-ch-text placeholder-ch-sub focus:outline-none"
                style={{ maxHeight: 100 }}
              />

              {/* Mic / video button */}
              <button
                onClick={() => text.trim() ? undefined : setShowVoice(true)}
                className="flex-shrink-0"
                aria-label="Voice note"
              >
                <svg width="14" height="19" viewBox="0 0 14 19" fill="none">
                  <rect x="3.5" y="1" width="7" height="12" rx="3.5" stroke="#c1c6d7" strokeWidth="1.4" />
                  <path d="M1 9.5c0 3.3 2.7 6 6 6s6-2.7 6-6" stroke="#c1c6d7" strokeWidth="1.4" strokeLinecap="round" />
                  <path d="M7 15.5V18" stroke="#c1c6d7" strokeWidth="1.4" strokeLinecap="round" />
                </svg>
              </button>
            </div>

            {/* Send button */}
            <button
              onClick={sendText}
              disabled={sending || !text.trim()}
              className="flex-shrink-0 w-8 h-8 rounded-full bg-ch-blue flex items-center justify-center disabled:opacity-40"
              aria-label="Send"
            >
              {sending
                ? <div className="w-4 h-4 border-2 border-[#002e69] border-t-transparent rounded-full animate-spin" />
                : (
                  <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                    <path d="M6.5 11.5V1.5M1.5 6.5l5-5 5 5" stroke="#002e69" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
