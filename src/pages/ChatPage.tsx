import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  doc, getDoc, collection, addDoc, updateDoc, deleteDoc,
  getDocs, serverTimestamp, writeBatch,
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

type Message = ReturnType<typeof useMessages>[0];

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
  const [showOptions, setShowOptions] = useState(false);
  const [deleteConvConfirm, setDeleteConvConfirm] = useState(false);
  const [actionMenu, setActionMenu] = useState<Message | null>(null);
  const [editingMsg, setEditingMsg] = useState<Message | null>(null);
  const [editText, setEditText] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const editInputRef = useRef<HTMLTextAreaElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  const messages = useMessages(conversationId ?? '', otherUser?.publicKey ?? '');

  const CAN_EDIT_MS = 15 * 60 * 1000;

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

  useEffect(() => {
    if (editingMsg && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.setSelectionRange(editText.length, editText.length);
    }
  }, [editingMsg]);

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

  async function saveEdit() {
    if (!editingMsg || !editText.trim() || !otherUser) return;
    try {
      const mySecretKey = loadPrivateKey();
      if (!mySecretKey) throw new Error('Private key missing');
      const { ciphertext, nonce } = encryptMessage(editText.trim(), otherUser.publicKey, mySecretKey);
      await updateDoc(doc(db, 'conversations', conversationId!, 'messages', editingMsg.id), {
        ciphertext, nonce, editedAt: Date.now(),
      });
      setEditingMsg(null);
      setEditText('');
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : String(e));
    }
  }

  async function deleteMessage(msgId: string) {
    try {
      await updateDoc(doc(db, 'conversations', conversationId!, 'messages', msgId), {
        isDeleted: true, ciphertext: '', nonce: '',
      });
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : String(e));
    }
  }

  async function deleteConversation() {
    try {
      const messagesSnap = await getDocs(collection(db, 'conversations', conversationId!, 'messages'));
      if (messagesSnap.docs.length > 0) {
        const batch = writeBatch(db);
        messagesSnap.docs.forEach(d => batch.delete(d.ref));
        await batch.commit();
      }
      await deleteDoc(doc(db, 'conversations', conversationId!));
      navigate('/');
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : String(e));
    }
  }

  function openActionMenu(msg: Message) {
    if (msg.senderId === me.uid && !msg.isDeleted) setActionMenu(msg);
  }

  // Build message list with date separators (filtered by search)
  const trimmedSearch = searchQuery.trim().toLowerCase();
  const visibleMessages = trimmedSearch
    ? messages.filter(m => m.type === 'text' && !m.isDeleted && m.text?.toLowerCase().includes(trimmedSearch))
    : messages;

  type ListItem =
    | { kind: 'separator'; date: string; key: string }
    | { kind: 'message'; data: Message };

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
    <div className="h-dvh bg-ch-bg flex justify-center">
      <div className="w-full max-w-2xl flex flex-col overflow-hidden">

        {/* ── Header ── */}
        <div className="flex-shrink-0 bg-ch-bg border-b border-ch-border">
          <div
            className="flex items-center gap-3 px-4 py-3"
            style={{ paddingTop: 'max(var(--safe-top), 12px)' }}
          >
            {/* Back */}
            <button
              onClick={() => navigate('/')}
              className="flex-shrink-0 p-1 -ml-1"
              aria-label="Back"
            >
              <svg width="10" height="17" viewBox="0 0 10 17" fill="none">
                <path d="M9 1L1 8.5 9 16" stroke="#adc6ff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>

            {/* Avatar */}
            <div
              className="w-9 h-9 rounded-full flex-shrink-0 flex items-center justify-center text-[11px] font-bold"
              style={{ backgroundColor: '#31353d', color }}
            >
              {initials}
            </div>

            {/* Name + subtitle */}
            <div className="flex-1 min-w-0">
              <p className="text-[16px] font-semibold text-ch-text truncate leading-tight">
                {otherUser.displayName}
              </p>
              <p className="text-[11px] text-ch-sub truncate">{otherUser.email}</p>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-1 flex-shrink-0">
              <button
                onClick={showSearch ? closeSearch : openSearch}
                className="p-2"
                aria-label="Search"
              >
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                  <circle cx="7.5" cy="7.5" r="5.5" stroke={showSearch ? '#adc6ff' : '#c1c6d7'} strokeWidth="1.5" />
                  <path d="M12 12l3.5 3.5" stroke={showSearch ? '#adc6ff' : '#c1c6d7'} strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </button>
              <button
                onClick={() => navigate(`/chat/${conversationId}/gallery`)}
                className="p-2"
                aria-label="Media gallery"
              >
                <svg width="20" height="16" viewBox="0 0 20 16" fill="none">
                  <rect x="1" y="1" width="18" height="14" rx="2" stroke="#c1c6d7" strokeWidth="1.5" />
                  <circle cx="6.5" cy="5.5" r="1.5" fill="#c1c6d7" />
                  <path d="M1 11l5-4 4 3.5 3-2.5 6 5" stroke="#c1c6d7" strokeWidth="1.5" strokeLinejoin="round" />
                </svg>
              </button>
              <button
                onClick={() => setShowOptions(o => !o)}
                className="p-2"
                aria-label="More options"
              >
                <svg width="4" height="18" viewBox="0 0 4 18" fill="none">
                  <circle cx="2" cy="2" r="1.5" fill="#c1c6d7" />
                  <circle cx="2" cy="9" r="1.5" fill="#c1c6d7" />
                  <circle cx="2" cy="16" r="1.5" fill="#c1c6d7" />
                </svg>
              </button>
            </div>
          </div>

          {/* Search bar */}
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

          {/* Options dropdown */}
          {showOptions && (
            <div className="absolute right-4 top-16 z-30 bg-ch-card border border-ch-border rounded-[12px] shadow-lg overflow-hidden min-w-[180px]"
                 style={{ marginRight: 'max(var(--safe-right), 0px)' }}>
              <button
                onClick={() => { setShowOptions(false); setDeleteConvConfirm(true); }}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-ch-input active:bg-ch-input text-left"
              >
                <svg width="14" height="15" viewBox="0 0 14 15" fill="none">
                  <path d="M1 3.5h12M5 3.5V2h4v1.5M2 3.5l1 10h8l1-10" stroke="#ffb4ab" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span className="text-[15px]" style={{ color: '#ffb4ab' }}>Delete Conversation</span>
              </button>
            </div>
          )}
        </div>

        {/* ── Messages ── */}
        <div
          className="flex-1 overflow-y-auto scrollbar-hidden bg-ch-bg px-4 py-3"
          onClick={() => { setShowOptions(false); setActionMenu(null); }}
        >
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
                    <span className="text-ch-sub text-[12px] font-medium">{item.date}</span>
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
                  onLongPress={() => openActionMenu(item.data)}
                />
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* ── Emoji Picker ── */}
        <EmojiPicker
          open={showEmoji}
          onEmojiSelect={emoji => setText(t => t + emoji)}
        />

        {/* ── Composer ── */}
        <div
          className="flex-shrink-0 bg-ch-bg border-t border-ch-border"
          style={{ paddingBottom: 'max(var(--safe-bottom), 8px)' }}
        >
          {showVoice ? (
            <VoiceRecorder onSend={sendVoiceNote} onCancel={() => setShowVoice(false)} />
          ) : (
            <div className="flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-2">
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) sendMedia(f, 'image'); e.target.value = ''; }} />
              <input ref={videoInputRef} type="file" accept="video/*" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) sendMedia(f, 'video'); e.target.value = ''; }} />

              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex-shrink-0 w-8 h-8 flex items-center justify-center"
                aria-label="Attach"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M14 8l-5.5 5.5a4 4 0 01-5.66-5.66l6-6a2.5 2.5 0 013.54 3.54L6.5 11.5a1 1 0 01-1.41-1.41L11 4.5" stroke="#adc6ff" strokeWidth="1.4" strokeLinecap="round" />
                </svg>
              </button>

              <div className="flex-1 flex items-center gap-2 bg-ch-input border border-ch-border rounded-[20px] px-3 py-2 min-h-[44px]">
                <button onClick={toggleEmoji} className="flex-shrink-0" aria-label="Emoji">
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                    <circle cx="10" cy="10" r="8.5" stroke="#c1c6d7" strokeWidth="1.4" />
                    <circle cx="7.5" cy="8.5" r="1" fill="#c1c6d7" />
                    <circle cx="12.5" cy="8.5" r="1" fill="#c1c6d7" />
                    <path d="M7 12.5c.8 1 2 1.5 3 1.5s2.2-.5 3-1.5" stroke="#c1c6d7" strokeWidth="1.3" strokeLinecap="round" />
                  </svg>
                </button>

                <textarea
                  ref={inputRef}
                  value={text}
                  onChange={e => { setText(e.target.value); autoResize(e.target); }}
                  onFocus={() => setShowEmoji(false)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendText(); } }}
                  placeholder="Message"
                  rows={1}
                  className="flex-1 bg-transparent text-[15px] sm:text-[17px] text-ch-text placeholder-ch-sub focus:outline-none"
                  style={{ maxHeight: 100 }}
                />

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

      {/* ── Message action menu ── */}
      {actionMenu && (
        <div className="fixed inset-0 z-40 flex items-end justify-center" onClick={() => setActionMenu(null)}>
          <div className="absolute inset-0 bg-black/50" />
          <div
            className="relative w-full max-w-2xl bg-ch-card rounded-t-[28px] px-4 pt-3"
            style={{ paddingBottom: 'max(var(--safe-bottom), 24px)' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="w-10 h-1 bg-ch-border rounded-full mx-auto mb-4" />

            {actionMenu.type === 'text' && !actionMenu.isDeleted &&
              Date.now() - actionMenu.createdAt < CAN_EDIT_MS && (
              <button
                onClick={() => {
                  setEditText(actionMenu.text ?? '');
                  setEditingMsg(actionMenu);
                  setActionMenu(null);
                }}
                className="w-full flex items-center gap-3 px-4 py-4 rounded-[12px] hover:bg-ch-input active:bg-ch-input mb-2"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M11.5 2.5a2 2 0 012.83 2.83L5 14.5H2v-3L11.5 2.5z" stroke="#adc6ff" strokeWidth="1.4" strokeLinejoin="round" />
                </svg>
                <span className="text-[17px] text-ch-text">Edit Message</span>
              </button>
            )}

            <button
              onClick={() => { deleteMessage(actionMenu.id); setActionMenu(null); }}
              className="w-full flex items-center gap-3 px-4 py-4 rounded-[12px] hover:bg-ch-input active:bg-ch-input mb-2"
            >
              <svg width="14" height="15" viewBox="0 0 14 15" fill="none">
                <path d="M1 3.5h12M5 3.5V2h4v1.5M2 3.5l1 10h8l1-10" stroke="#ffb4ab" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span className="text-[17px]" style={{ color: '#ffb4ab' }}>Delete Message</span>
            </button>

            <button
              onClick={() => setActionMenu(null)}
              className="w-full flex items-center justify-center px-4 py-4 rounded-[12px] bg-ch-input"
            >
              <span className="text-[17px] text-ch-sub">Cancel</span>
            </button>
          </div>
        </div>
      )}

      {/* ── Edit message modal ── */}
      {editingMsg && (
        <div className="fixed inset-0 z-40 flex items-end justify-center" onClick={() => setEditingMsg(null)}>
          <div className="absolute inset-0 bg-black/50" />
          <div
            className="relative w-full max-w-2xl bg-ch-card rounded-t-[28px] px-4 pt-4"
            style={{ paddingBottom: 'max(var(--safe-bottom), 24px)' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="w-10 h-1 bg-ch-border rounded-full mx-auto mb-4" />
            <p className="text-[13px] font-medium text-ch-sub mb-2 px-1">Edit Message</p>
            <textarea
              ref={editInputRef}
              value={editText}
              onChange={e => setEditText(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveEdit(); } }}
              className="w-full bg-ch-input rounded-[12px] px-4 py-3 text-[17px] text-ch-text placeholder-ch-sub focus:outline-none focus:ring-2 focus:ring-ch-blue mb-4 resize-none"
              rows={3}
            />
            <div className="flex gap-3">
              <button
                onClick={() => setEditingMsg(null)}
                className="flex-1 py-3 rounded-[12px] bg-ch-input text-ch-sub text-[17px]"
              >
                Cancel
              </button>
              <button
                onClick={saveEdit}
                disabled={!editText.trim() || editText === editingMsg.text}
                className="flex-1 py-3 rounded-[12px] bg-ch-blue text-[#002e69] font-semibold text-[17px] disabled:opacity-40"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete conversation confirm ── */}
      {deleteConvConfirm && (
        <div className="fixed inset-0 z-40 flex items-end justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setDeleteConvConfirm(false)} />
          <div
            className="relative w-full max-w-2xl bg-ch-card rounded-t-[28px] px-4 pt-4"
            style={{ paddingBottom: 'max(var(--safe-bottom), 24px)' }}
          >
            <div className="w-10 h-1 bg-ch-border rounded-full mx-auto mb-4" />
            <p className="text-[18px] font-semibold text-ch-text text-center mb-1">Delete Conversation?</p>
            <p className="text-[14px] text-ch-sub text-center mb-6">All messages will be permanently deleted.</p>
            <button
              onClick={deleteConversation}
              className="w-full py-4 rounded-[12px] mb-3 font-semibold text-[17px]"
              style={{ backgroundColor: 'rgba(255,75,75,0.15)', color: '#ff4b4b' }}
            >
              Delete
            </button>
            <button
              onClick={() => setDeleteConvConfirm(false)}
              className="w-full py-4 rounded-[12px] bg-ch-input text-ch-text text-[17px]"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
