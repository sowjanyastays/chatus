import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { db, auth } from '../services/firebase';
import { decryptFile, unwrapFileKey } from '../services/crypto';
import { loadPrivateKey } from '../services/keyStore';
import { formatDateSeparator, formatMessageTime } from '../utils/formatTime';

type MediaMsg = {
  id: string;
  type: 'image' | 'video';
  mediaUrl: string;
  wrappedKey: string;
  keyNonce: string;
  fileNonce: string;
  createdAt: number;
  senderId: string;
};

type UserProfile = { uid: string; publicKey: string; displayName: string };

export default function GalleryPage() {
  const { id: conversationId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const me = auth.currentUser!;

  const [otherUser, setOtherUser] = useState<UserProfile | null>(null);
  const [items, setItems] = useState<MediaMsg[]>([]);
  const [decryptedUrls, setDecryptedUrls] = useState<Record<string, string>>({});
  const [decryptingIds, setDecryptingIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [viewIndex, setViewIndex] = useState<number | null>(null);
  const [viewLoading, setViewLoading] = useState(false);

  useEffect(() => {
    if (!conversationId) return;
    (async () => {
      const convDoc = await getDoc(doc(db, 'conversations', conversationId));
      if (!convDoc.exists()) { navigate('/'); return; }
      const otherUid = (convDoc.data().participants as string[]).find(p => p !== me.uid)!;
      const userDoc = await getDoc(doc(db, 'users', otherUid));
      if (userDoc.exists()) setOtherUser(userDoc.data() as UserProfile);

      const snap = await getDocs(
        query(collection(db, 'conversations', conversationId, 'messages'),
          where('type', 'in', ['image', 'video'])),
      );
      const msgs = snap.docs
        .map(d => ({ id: d.id, ...d.data() } as MediaMsg))
        .filter(m => m.mediaUrl && m.wrappedKey)
        .sort((a, b) => b.createdAt - a.createdAt);
      setItems(msgs);
      setLoading(false);
    })();
  }, [conversationId]);

  useEffect(() => {
    if (!otherUser || items.length === 0) return;
    items.filter(m => m.type === 'image').forEach(m => decryptItem(m));
  }, [items, otherUser]);

  async function decryptItem(msg: MediaMsg): Promise<string | null> {
    if (decryptedUrls[msg.id]) return decryptedUrls[msg.id];
    if (!otherUser) return null;
    const mySecretKey = loadPrivateKey();
    if (!mySecretKey) return null;
    setDecryptingIds(prev => new Set(prev).add(msg.id));
    try {
      const fileKey = unwrapFileKey(msg.wrappedKey, msg.keyNonce, otherUser.publicKey, mySecretKey);
      if (!fileKey) return null;
      const res = await fetch(msg.mediaUrl);
      const encBytes = new Uint8Array(await res.arrayBuffer());
      const decBytes = decryptFile(encBytes, fileKey, msg.fileNonce);
      if (!decBytes) return null;
      const mimeType = msg.type === 'image' ? 'image/jpeg' : 'video/mp4';
      const blob = new Blob([(decBytes as Uint8Array<ArrayBuffer>).buffer], { type: mimeType });
      const url = URL.createObjectURL(blob);
      setDecryptedUrls(prev => ({ ...prev, [msg.id]: url }));
      return url;
    } catch {
      return null;
    } finally {
      setDecryptingIds(prev => { const s = new Set(prev); s.delete(msg.id); return s; });
    }
  }

  async function openViewer(index: number) {
    setViewIndex(index);
    const msg = items[index];
    if (!decryptedUrls[msg.id]) {
      setViewLoading(true);
      await decryptItem(msg);
      setViewLoading(false);
    }
  }

  async function shiftViewer(delta: number) {
    if (viewIndex === null) return;
    const next = viewIndex + delta;
    if (next < 0 || next >= items.length) return;
    await openViewer(next);
  }

  // Group items by date
  const groups: { label: string; items: (MediaMsg & { index: number })[] }[] = [];
  items.forEach((item, index) => {
    const label = formatDateSeparator(item.createdAt).toUpperCase();
    const last = groups[groups.length - 1];
    if (last?.label === label) {
      last.items.push({ ...item, index });
    } else {
      groups.push({ label, items: [{ ...item, index }] });
    }
  });

  const selected = viewIndex !== null ? items[viewIndex] : null;

  return (
    <div className="h-dvh flex flex-col bg-ch-bg overflow-hidden">
      {/* Header */}
      <div
        className="flex-shrink-0 flex items-center justify-between px-4 py-3 bg-ch-bg border-b border-ch-border"
        style={{ paddingTop: 'max(var(--safe-top), 12px)' }}
      >
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1.5"
          aria-label="Back"
        >
          <svg width="7" height="12" viewBox="0 0 7 12" fill="none">
            <path d="M6 1L1 6l5 5" stroke="#adc6ff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="text-[17px] font-semibold text-ch-blue">Chat</span>
        </button>

        <h1 className="text-[17px] font-semibold text-ch-text">Media Gallery</h1>

        <button className="text-[17px] font-semibold text-ch-blue opacity-0 pointer-events-none">
          Select
        </button>
      </div>

      {/* Grid grouped by date */}
      <div className="flex-1 overflow-y-auto scrollbar-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-48">
            <div className="w-9 h-9 border-4 border-ch-blue border-t-transparent rounded-full animate-spin" />
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full px-10 text-center">
            <span className="text-6xl mb-4">🖼️</span>
            <h2 className="text-[17px] font-semibold text-ch-text mb-2">No media yet</h2>
            <p className="text-[14px] text-ch-sub leading-relaxed">
              Photos and videos shared in this conversation will appear here.
            </p>
          </div>
        ) : (
          <div className="px-4 py-4 space-y-5">
            {groups.map(group => (
              <div key={group.label}>
                <p className="text-[12px] font-medium text-ch-sub mb-3">{group.label}</p>
                <div className="grid grid-cols-3 gap-px bg-ch-border rounded-[12px] overflow-hidden">
                  {group.items.map(item => (
                    <button
                      key={item.id}
                      onClick={() => openViewer(item.index)}
                      className="aspect-square bg-ch-surface relative overflow-hidden"
                    >
                      {decryptedUrls[item.id] ? (
                        item.type === 'image' ? (
                          <img src={decryptedUrls[item.id]} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <>
                            <video src={decryptedUrls[item.id]} className="w-full h-full object-cover" muted preload="metadata" />
                            <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                              <div className="w-8 h-8 rounded-full bg-black/40 border border-white/30 flex items-center justify-center">
                                <svg width="8" height="10" viewBox="0 0 8 10" fill="white"><path d="M1 1l6 4-6 4V1z" /></svg>
                              </div>
                            </div>
                          </>
                        )
                      ) : decryptingIds.has(item.id) ? (
                        <div className="w-full h-full flex items-center justify-center">
                          <div className="w-5 h-5 border-2 border-ch-blue border-t-transparent rounded-full animate-spin" />
                        </div>
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <span className="text-3xl">{item.type === 'image' ? '📷' : '🎥'}</span>
                        </div>
                      )}
                      {/* Video duration indicator overlay */}
                      {item.type === 'video' && !decryptedUrls[item.id] && (
                        <div className="absolute bottom-1 left-1 bg-black/60 rounded px-1 py-0.5">
                          <span className="text-[10px] text-white">Video</span>
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Lightbox */}
      {selected && (
        <div className="fixed inset-0 z-50 bg-black flex flex-col">
          <div
            className="flex items-center justify-between px-4 py-3 flex-shrink-0"
            style={{ paddingTop: 'max(var(--safe-top), 12px)' }}
          >
            <button
              onClick={() => setViewIndex(null)}
              className="w-9 h-9 flex items-center justify-center rounded-full bg-white/10 text-white text-xl"
            >
              ✕
            </button>
            <div className="text-center">
              <p className="text-white/80 text-sm font-medium">{viewIndex! + 1} / {items.length}</p>
              <p className="text-white/40 text-xs">{formatDateSeparator(selected.createdAt)} · {formatMessageTime(selected.createdAt)}</p>
            </div>
            <div className="w-9" />
          </div>

          <div className="flex-1 flex items-center justify-center relative px-2">
            {viewIndex! > 0 && (
              <button onClick={() => shiftViewer(-1)}
                className="absolute left-2 z-10 w-10 h-10 rounded-full bg-white/15 flex items-center justify-center text-white text-2xl">
                ‹
              </button>
            )}
            {viewLoading ? (
              <div className="w-12 h-12 border-4 border-white border-t-transparent rounded-full animate-spin" />
            ) : decryptedUrls[selected.id] ? (
              selected.type === 'image' ? (
                <img src={decryptedUrls[selected.id]} alt="" className="max-w-full max-h-full object-contain rounded-[12px]" />
              ) : (
                <video src={decryptedUrls[selected.id]} controls autoPlay className="max-w-full max-h-full rounded-[12px]" />
              )
            ) : (
              <div className="flex flex-col items-center gap-3">
                <span className="text-6xl">{selected.type === 'image' ? '📷' : '🎥'}</span>
                <p className="text-white/50 text-sm">Decrypting…</p>
              </div>
            )}
            {viewIndex! < items.length - 1 && (
              <button onClick={() => shiftViewer(1)}
                className="absolute right-2 z-10 w-10 h-10 rounded-full bg-white/15 flex items-center justify-center text-white text-2xl">
                ›
              </button>
            )}
          </div>

          <div className="flex-shrink-0" style={{ height: 'max(var(--safe-bottom), 20px)' }} />
        </div>
      )}
    </div>
  );
}
