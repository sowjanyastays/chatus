import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { db, auth } from '../services/firebase';
import { formatDateSeparator } from '../utils/formatTime';
import BottomNav from '../components/BottomNav';

type MediaItem = {
  id: string;
  type: 'image' | 'video';
  createdAt: number;
  conversationId: string;
  senderId: string;
};

export default function GlobalGalleryPage() {
  const navigate = useNavigate();
  const me = auth.currentUser!;
  const [items, setItems] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      // Fetch all conversations for this user
      const convSnap = await getDocs(
        query(collection(db, 'conversations'), where('participants', 'array-contains', me.uid)),
      );

      const allItems: MediaItem[] = [];
      await Promise.all(
        convSnap.docs.map(async (convDoc) => {
          const msgSnap = await getDocs(
            query(
              collection(db, 'conversations', convDoc.id, 'messages'),
              where('type', 'in', ['image', 'video']),
            ),
          );
          msgSnap.docs.forEach(d => {
            const data = d.data();
            if (data.mediaUrl && data.wrappedKey) {
              allItems.push({
                id: d.id,
                type: data.type,
                createdAt: data.createdAt,
                conversationId: convDoc.id,
                senderId: data.senderId,
              });
            }
          });
        }),
      );

      allItems.sort((a, b) => b.createdAt - a.createdAt);
      setItems(allItems);
      setLoading(false);
    })();
  }, []);

  // Group by date
  const groups: { label: string; items: MediaItem[] }[] = [];
  items.forEach(item => {
    const label = formatDateSeparator(item.createdAt).toUpperCase();
    const last = groups[groups.length - 1];
    if (last?.label === label) {
      last.items.push(item);
    } else {
      groups.push({ label, items: [item] });
    }
  });

  return (
    <div className="h-dvh flex flex-col bg-ch-bg overflow-hidden">
      {/* Header */}
      <div
        className="flex-shrink-0 flex items-center justify-between px-4 py-3 bg-ch-bg border-b border-ch-border"
        style={{ paddingTop: 'max(var(--safe-top), 12px)' }}
      >
        <div className="w-12" />
        <h1 className="text-[17px] font-semibold text-ch-text">Media Gallery</h1>
        <button className="text-[17px] font-semibold text-ch-blue">Select</button>
      </div>

      {/* Content */}
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
              Photos and videos you share in conversations will appear here.
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
                      key={`${item.conversationId}-${item.id}`}
                      onClick={() => navigate(`/chat/${item.conversationId}/gallery`)}
                      className="aspect-square bg-ch-surface relative overflow-hidden flex items-center justify-center"
                    >
                      <span className="text-3xl">{item.type === 'image' ? '📷' : '🎥'}</span>

                      {/* Lock icon — encrypted, tap to open */}
                      <div className="absolute bottom-1 right-1 bg-black/50 rounded-full w-5 h-5 flex items-center justify-center">
                        <svg width="8" height="10" viewBox="0 0 8 10" fill="none">
                          <rect x="0.5" y="4" width="7" height="5.5" rx="1.2" stroke="white" strokeWidth="1" />
                          <path d="M2 4V3a2 2 0 014 0v1" stroke="white" strokeWidth="1" strokeLinecap="round" />
                        </svg>
                      </div>

                      {item.senderId === me.uid && (
                        <div className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-ch-blue" />
                      )}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <BottomNav />
    </div>
  );
}
