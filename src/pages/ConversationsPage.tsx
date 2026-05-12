import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  collection, query, where, onSnapshot, doc, getDoc,
  setDoc, serverTimestamp, getDocs, orderBy, deleteDoc, writeBatch,
} from 'firebase/firestore';
import { db, auth } from '../services/firebase';
import { useAuth } from '../hooks/useAuth';
import { getAvatarColor, getInitials } from '../utils/avatar';
import { formatConversationTime } from '../utils/formatTime';
import { registerForWebPush, listenForForegroundMessages } from '../services/notifications';
import { loadPrivateKey } from '../services/keyStore';
import BottomNav from '../components/BottomNav';

type OtherUser = { uid: string; displayName: string; email: string };
type Conversation = {
  id: string;
  otherUser: OtherUser;
  lastMessage: { type: string; createdAt: number; senderId: string } | null;
  updatedAt: number;
};

function previewText(lm: Conversation['lastMessage']): string {
  if (!lm) return 'Tap to start chatting';
  if (lm.type === 'text') return '🔒 Encrypted message';
  if (lm.type === 'image') return '📷 Photo';
  if (lm.type === 'video') return '🎥 Video';
  return '🎤 Voice note';
}

// Avatar initials colors matching Figma palette
const AVATAR_COLORS = ['#adc6ff', '#ffb595', '#4b8eff', '#66BB6A', '#EC407A', '#AB47BC'];
function avatarTextColor(name: string) {
  return AVATAR_COLORS[name.charCodeAt(0) % AVATAR_COLORS.length];
}

export default function ConversationsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const [searchEmail, setSearchEmail] = useState('');
  const [searching, setSearching] = useState(false);
  const [listSearch, setListSearch] = useState('');
  const [toast, setToast] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const noKey = !loadPrivateKey();
  const inputRef = useRef<HTMLInputElement>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const me = auth.currentUser;

  useEffect(() => {
    if (!user) return;
    registerForWebPush(user.uid);
    let unsub = () => {};
    listenForForegroundMessages((title, body) => {
      setToast(`${title}: ${body}`);
      setTimeout(() => setToast(null), 4000);
    }).then(fn => { unsub = fn; });
    return () => unsub();
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, 'conversations'),
      where('participants', 'array-contains', user.uid),
      orderBy('updatedAt', 'desc'),
    );
    return onSnapshot(q, async (snap) => {
      const convos: Conversation[] = [];
      for (const d of snap.docs) {
        const data = d.data();
        const otherUid = data.participants.find((p: string) => p !== user.uid);
        const otherDoc = await getDoc(doc(db, 'users', otherUid));
        if (!otherDoc.exists()) continue;
        convos.push({
          id: d.id,
          otherUser: otherDoc.data() as OtherUser,
          lastMessage: data.lastMessage ?? null,
          updatedAt: data.updatedAt?.toMillis?.() ?? 0,
        });
      }
      setConversations(convos);
      setLoading(false);
    });
  }, [user]);

  function startLongPress(convId: string) {
    longPressTimer.current = setTimeout(() => setDeleteConfirm(convId), 600);
  }

  function cancelLongPress() {
    if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; }
  }

  async function deleteConversation(convId: string) {
    try {
      const msgsSnap = await getDocs(collection(db, 'conversations', convId, 'messages'));
      if (msgsSnap.docs.length > 0) {
        const batch = writeBatch(db);
        msgsSnap.docs.forEach(d => batch.delete(d.ref));
        await batch.commit();
      }
      await deleteDoc(doc(db, 'conversations', convId));
    } catch {
      alert('Could not delete conversation.');
    } finally {
      setDeleteConfirm(null);
    }
  }

  function openModal() {
    setModalOpen(true);
    setClosing(false);
    setTimeout(() => inputRef.current?.focus(), 60);
  }

  function closeModal() {
    setClosing(true);
    setTimeout(() => { setModalOpen(false); setSearchEmail(''); setClosing(false); }, 280);
  }

  async function startConversation() {
    if (!searchEmail.trim() || !user) return;
    setSearching(true);
    try {
      const snap = await getDocs(
        query(collection(db, 'users'), where('email', '==', searchEmail.trim().toLowerCase())),
      );
      if (snap.empty) { alert('No account with that email.'); return; }
      const other = snap.docs[0].data() as OtherUser;
      if (other.uid === user.uid) { alert("That's your own email."); return; }

      const existing = (await getDocs(
        query(collection(db, 'conversations'), where('participants', 'array-contains', user.uid)),
      )).docs.find(d => d.data().participants.includes(other.uid));

      let convId: string;
      if (existing) {
        convId = existing.id;
      } else {
        const ref = doc(collection(db, 'conversations'));
        await setDoc(ref, {
          participants: [user.uid, other.uid],
          lastMessage: null,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        convId = ref.id;
      }
      closeModal();
      navigate(`/chat/${convId}`);
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setSearching(false);
    }
  }

  const filtered = listSearch.trim()
    ? conversations.filter(c =>
        c.otherUser.displayName.toLowerCase().includes(listSearch.toLowerCase()) ||
        c.otherUser.email.toLowerCase().includes(listSearch.toLowerCase()),
      )
    : conversations;

  const myInitials = me?.displayName ? getInitials(me.displayName) : '?';
  const myColor = me?.displayName ? getAvatarColor(me.displayName) : '#31353d';

  return (
    <div className="h-dvh flex flex-col bg-ch-bg overflow-hidden">
      {/* Toast */}
      {toast && (
        <div className="fixed top-4 left-4 right-4 z-50 bg-ch-surface text-ch-text px-4 py-3 rounded-2xl shadow-xl text-sm font-medium">
          {toast}
        </div>
      )}

      {/* Missing key warning */}
      {noKey && (
        <div className="flex-shrink-0 flex items-start gap-3 px-4 py-3 bg-yellow-900/30 border-b border-yellow-700/40"
             style={{ paddingTop: 'max(var(--safe-top), 12px)' }}>
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" className="flex-shrink-0 mt-0.5">
            <path d="M9 1L1 16h16L9 1z" stroke="#facc15" strokeWidth="1.5" strokeLinejoin="round" />
            <path d="M9 7v4M9 13v.5" stroke="#facc15" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-semibold text-yellow-300">Encryption key missing</p>
            <p className="text-[12px] text-yellow-200/70 mt-0.5">
              Your private key was lost (browser storage cleared or app reinstalled).
              Messages can't be decrypted. Go to <span className="font-semibold">Settings → E2E Encryption → Import Key</span> to restore from your backup.
            </p>
          </div>
        </div>
      )}

      {/* Header */}
      <div
        className="flex-shrink-0 flex items-center justify-between px-4 bg-ch-bg border-b border-ch-border"
        style={{ paddingTop: 'max(var(--safe-top), 12px)', paddingBottom: 12 }}
      >
        {/* Compose icon */}
        <button onClick={openModal} className="p-1" aria-label="New conversation">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path d="M14.5 2.5a2.12 2.12 0 013 3L6 17l-4 1 1-4L14.5 2.5z" stroke="#adc6ff" strokeWidth="1.5" strokeLinejoin="round" />
          </svg>
        </button>

        <h1 className="text-[17px] font-semibold text-ch-text">Chat</h1>

        {/* Current user avatar */}
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center text-[12px] font-bold"
          style={{ backgroundColor: myColor, color: '#10131b' }}
        >
          {myInitials}
        </div>
      </div>

      {/* Search bar */}
      <div className="flex-shrink-0 px-4 py-3 bg-ch-bg">
        <div className="flex items-center gap-2 bg-ch-input rounded-[12px] px-3 h-9">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <circle cx="6" cy="6" r="4.5" stroke="#c1c6d7" strokeWidth="1.4" />
            <path d="M10 10l2.5 2.5" stroke="#c1c6d7" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
          <input
            type="search"
            value={listSearch}
            onChange={e => setListSearch(e.target.value)}
            placeholder="Search"
            className="flex-1 bg-transparent text-[12px] text-ch-text placeholder-ch-sub focus:outline-none"
          />
        </div>
      </div>

      {/* Conversation list */}
      <div className="flex-1 overflow-y-auto scrollbar-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-48">
            <div className="w-9 h-9 border-4 border-ch-blue border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full px-10 text-center">
            <div className="w-20 h-20 rounded-[24px] bg-ch-input border border-ch-border flex items-center justify-center mb-4">
              <svg width="30" height="30" viewBox="0 0 30 30" fill="none">
                <path d="M15 5C9 5 4 9.5 4 15c0 2.8 1.3 5.4 3.4 7.1L6 24l2.5-.9C9.9 23.7 11.4 24 13 24h2c6 0 11-4.5 11-10S21 5 15 5z" stroke="#414755" strokeWidth="1.5" />
              </svg>
            </div>
            <h2 className="text-[17px] font-semibold text-ch-text mb-2">No chats available</h2>
            <p className="text-[14px] text-ch-sub leading-relaxed mb-5">
              Your conversations are hidden or haven't started yet. Your privacy is protected.
            </p>
            <button
              onClick={openModal}
              className="bg-ch-accent text-[#00285c] text-[12px] font-medium px-6 py-2.5 rounded-[12px]"
            >
              Start a New Message
            </button>
          </div>
        ) : (
          <ul>
            {filtered.map(item => {
              const textColor = avatarTextColor(item.otherUser.displayName);
              const initials = getInitials(item.otherUser.displayName);
              return (
                <li key={item.id}>
                  <button
                    onClick={() => navigate(`/chat/${item.id}`)}
                    onTouchStart={() => startLongPress(item.id)}
                    onTouchEnd={cancelLongPress}
                    onTouchMove={cancelLongPress}
                    onContextMenu={(e) => { e.preventDefault(); setDeleteConfirm(item.id); }}
                    className="w-full flex items-center px-4 py-3 border-b border-ch-border active:bg-ch-input transition-colors"
                    style={{ minHeight: 80 }}
                  >
                    {/* Avatar */}
                    <div
                      className="w-14 h-14 rounded-full flex items-center justify-center flex-shrink-0 mr-3 text-[16px] font-bold bg-ch-surface"
                      style={{ color: textColor }}
                    >
                      {initials}
                    </div>
                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="text-[16px] font-semibold text-ch-text truncate">
                          {item.otherUser.displayName}
                        </span>
                        {item.lastMessage && (
                          <span className="text-[12px] text-ch-sub ml-2 flex-shrink-0">
                            {formatConversationTime(item.lastMessage.createdAt)}
                          </span>
                        )}
                      </div>
                      <p className="text-[14px] text-ch-sub truncate text-left">
                        {previewText(item.lastMessage)}
                      </p>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <BottomNav />

      {/* New conversation bottom sheet */}
      {modalOpen && (
        <div className="fixed inset-0 z-40 flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/60" onClick={closeModal} />
          <div
            className={`relative bg-ch-card rounded-t-[28px] px-6 pt-3 transition-transform duration-300 ${closing ? 'translate-y-full' : 'translate-y-0'}`}
            style={{ paddingBottom: 'max(var(--safe-bottom), 40px)' }}
          >
            <div className="w-10 h-1 bg-ch-border rounded-full mx-auto mb-5" />
            <h2 className="text-[17px] font-semibold text-ch-text mb-5">New Conversation</h2>
            <label className="block text-[14px] font-medium text-ch-sub mb-2">Search by email</label>
            <input
              ref={inputRef}
              type="email"
              value={searchEmail}
              onChange={e => setSearchEmail(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && startConversation()}
              placeholder="friend@example.com"
              className="w-full bg-ch-input rounded-[12px] px-4 py-4 text-ch-text placeholder-ch-sub focus:outline-none focus:ring-2 focus:ring-ch-blue text-[17px] mb-5"
            />
            <button
              onClick={startConversation}
              disabled={searching || !searchEmail.trim()}
              className="w-full bg-ch-accent disabled:opacity-50 text-[#00285c] font-semibold text-[17px] py-4 rounded-[12px] active:scale-[0.98] transition-transform"
            >
              {searching ? 'Searching…' : 'Start Chat'}
            </button>
          </div>
        </div>
      )}

      {/* Delete conversation confirmation */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/60" onClick={() => setDeleteConfirm(null)} />
          <div
            className="relative bg-ch-card rounded-t-[28px] px-6 pt-4"
            style={{ paddingBottom: 'max(var(--safe-bottom), 32px)' }}
          >
            <div className="w-10 h-1 bg-ch-border rounded-full mx-auto mb-4" />
            <p className="text-[18px] font-semibold text-ch-text text-center mb-1">Delete Conversation?</p>
            <p className="text-[14px] text-ch-sub text-center mb-6">All messages will be permanently deleted and cannot be recovered.</p>
            <button
              onClick={() => deleteConversation(deleteConfirm)}
              className="w-full py-4 rounded-[12px] font-semibold text-[17px] mb-3"
              style={{ backgroundColor: 'rgba(255,75,75,0.15)', color: '#ff4b4b' }}
            >
              Delete
            </button>
            <button
              onClick={() => setDeleteConfirm(null)}
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
