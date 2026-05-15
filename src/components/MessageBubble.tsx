import { useState, useRef, useEffect } from 'react';
import { Message } from '../hooks/useMessages';
import { decryptFile, unwrapFileKey } from '../services/crypto';
import { loadPrivateKey } from '../services/keyStore';
import { formatMessageTime } from '../utils/formatTime';
import { auth, storage } from '../services/firebase';
import { ref as storRef, getBlob } from 'firebase/storage';

type Props = {
  message: Message;
  isMine: boolean;
  partnerPublicKey: string;
  partnerName: string;
  searchTerm?: string;
  onLongPress?: () => void;
  onReply?: () => void;
};

function highlightText(text: string, term: string) {
  if (!term.trim()) return <>{text}</>;
  const parts = text.split(new RegExp(`(${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'));
  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === term.toLowerCase()
          ? <mark key={i} className="bg-yellow-300 text-gray-900 rounded px-0.5">{part}</mark>
          : part,
      )}
    </>
  );
}

function replyPreviewText(type: string, text?: string) {
  if (type === 'text') return text ?? '';
  if (type === 'image') return '📷 Photo';
  if (type === 'video') return '🎥 Video';
  return '🎤 Voice note';
}

const SWIPE_THRESHOLD = 64;

export default function MessageBubble({ message, isMine, partnerPublicKey, partnerName, searchTerm = '', onLongPress, onReply }: Props) {
  const [decryptedUrl, setDecryptedUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [swipeOffset, setSwipeOffset] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const directionLocked = useRef<'h' | 'v' | null>(null);

  // ── Long press ──────────────────────────────────────────────────────────────

  function startLongPress() {
    if (!onLongPress) return;
    longPressTimer.current = setTimeout(() => onLongPress(), 600);
  }

  function cancelLongPress() {
    if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; }
  }

  function handleContextMenu(e: React.MouseEvent) {
    if (!onLongPress) return;
    e.preventDefault();
    onLongPress();
  }

  // ── Swipe-right-to-reply ────────────────────────────────────────────────────

  function handleTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    directionLocked.current = null;
    startLongPress();
  }

  function handleTouchMove(e: React.TouchEvent) {
    const dx = e.touches[0].clientX - touchStartX.current;
    const dy = e.touches[0].clientY - touchStartY.current;

    if (!directionLocked.current && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) {
      directionLocked.current = Math.abs(dx) > Math.abs(dy) ? 'h' : 'v';
    }

    if (directionLocked.current === 'h') {
      cancelLongPress();
      if (dx > 0) {
        setSwipeOffset(Math.min(dx, SWIPE_THRESHOLD + 20));
      }
    }
  }

  function handleTouchEnd() {
    cancelLongPress();
    if (swipeOffset >= SWIPE_THRESHOLD) onReply?.();
    setSwipeOffset(0);
    directionLocked.current = null;
  }

  // ── Media decryption ────────────────────────────────────────────────────────

  async function decryptMedia(mimeOverride?: string): Promise<string | null> {
    if (decryptedUrl) return decryptedUrl;
    if (!message.mediaUrl || !message.wrappedKey) return null;
    setLoading(true);
    try {
      const mySecretKey = loadPrivateKey();
      if (!mySecretKey) throw new Error('No private key');
      const fileKey = unwrapFileKey(message.wrappedKey, message.keyNonce!, partnerPublicKey, mySecretKey);
      if (!fileKey) throw new Error('Could not unwrap file key');

      // mediaUrl is either a storage path (new messages) or a download URL (legacy).
      // storRef handles both transparently.
      const fileBlob = await getBlob(storRef(storage, message.mediaUrl));
      const encBytes = new Uint8Array(await fileBlob.arrayBuffer());
      const decBytes = decryptFile(encBytes, fileKey, message.fileNonce!);
      if (!decBytes) throw new Error('Decryption failed — key mismatch or corrupted data');

      const mime = mimeOverride ?? message.mimeType ?? (
        message.type === 'image' ? 'image/jpeg'
        : message.type === 'video' ? 'video/mp4'
        : 'audio/webm'
      );
      // Use slice() to ensure we get exactly the decrypted bytes, not the whole backing buffer.
      const blob = new Blob([decBytes.slice()], { type: mime });
      const url = URL.createObjectURL(blob);
      setDecryptedUrl(url);
      return url;
    } catch (e: unknown) {
      if (!decryptedUrl) alert('Cannot open: ' + (e instanceof Error ? e.message : String(e)));
      return null;
    } finally {
      setLoading(false);
    }
  }

  // Auto-decrypt images as soon as they appear — no "Tap to decrypt" required.
  useEffect(() => {
    if (message.type === 'image' && !decryptedUrl) {
      decryptMedia();
    }
  }, [message.id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function toggleAudio() {
    const url = decryptedUrl ?? await decryptMedia();
    if (!url) return;
    if (!audioRef.current) {
      const audio = new Audio(url);
      audio.ontimeupdate = () => { if (audio.duration) setProgress(audio.currentTime / audio.duration); };
      audio.onended = () => { setPlaying(false); setProgress(0); };
      audioRef.current = audio;
      await audio.play();
      setPlaying(true);
      return;
    }
    if (playing) { audioRef.current.pause(); setPlaying(false); }
    else { await audioRef.current.play(); setPlaying(true); }
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────

  const time = formatMessageTime(message.createdAt);
  const sentBg = '#007aff';
  const recvBg = '#31353d';
  const myUid = auth.currentUser?.uid;

  const swipeStyle = {
    transform: `translateX(${swipeOffset}px)`,
    transition: swipeOffset === 0 ? 'transform 0.2s ease-out' : 'none',
  };

  const replyIconOpacity = Math.min(swipeOffset / SWIPE_THRESHOLD, 1);

  // ── Shared touch props ───────────────────────────────────────────────────────

  const touchProps = {
    onTouchStart: handleTouchStart,
    onTouchMove: handleTouchMove,
    onTouchEnd: handleTouchEnd,
    onContextMenu: isMine ? handleContextMenu : undefined,
  };

  // ── Reply quote preview (shown inside bubble) ────────────────────────────────

  function ReplyQuote() {
    if (!message.replyTo) return null;
    const isFromMe = message.replyTo.senderId === myUid;
    return (
      <div
        className="mb-2 rounded-[8px] px-3 py-1.5 border-l-[3px]"
        style={{
          backgroundColor: isMine ? 'rgba(0,0,0,0.18)' : 'rgba(255,255,255,0.06)',
          borderColor: isMine ? 'rgba(255,255,255,0.55)' : '#adc6ff',
        }}
      >
        <p className="text-[11px] font-semibold mb-0.5"
          style={{ color: isMine ? 'rgba(255,255,255,0.75)' : '#adc6ff' }}>
          {isFromMe ? 'You' : partnerName}
        </p>
        <p className="text-[13px] truncate"
          style={{ color: isMine ? 'rgba(255,255,255,0.65)' : '#c1c6d7' }}>
          {replyPreviewText(message.replyTo.type, message.replyTo.text)}
        </p>
      </div>
    );
  }

  // ── Deleted ──────────────────────────────────────────────────────────────────

  if (message.isDeleted) {
    return (
      <div className={`flex mb-2 ${isMine ? 'justify-end' : 'justify-start'}`}>
        <div className="px-4 py-2 rounded-[12px] border border-ch-border" style={{ backgroundColor: '#1c2028' }}>
          <p className="text-[14px] italic text-ch-sub">Message deleted</p>
        </div>
      </div>
    );
  }

  // ── Text ─────────────────────────────────────────────────────────────────────

  if (message.type === 'text') {
    return (
      <div className={`flex mb-2 items-center ${isMine ? 'justify-end' : 'justify-start'}`}>
        {/* Reply hint icon — visible while swiping */}
        {onReply && (
          <div
            className={`flex-shrink-0 w-8 h-8 rounded-full bg-ch-input flex items-center justify-center ${isMine ? 'order-first mr-2' : 'order-last ml-2'}`}
            style={{ opacity: replyIconOpacity, transform: `scale(${0.6 + replyIconOpacity * 0.4})` }}
            aria-hidden
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M1 5h8a4 4 0 010 8H5M1 5l3-3M1 5l3 3" stroke="#adc6ff" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        )}

        <div
          className={`${isMine ? 'bubble-sent' : 'bubble-recv'} max-w-[78%] sm:max-w-[65%]`}
          style={{ backgroundColor: isMine ? sentBg : recvBg, padding: '8px 16px', ...swipeStyle }}
          {...touchProps}
        >
          <ReplyQuote />
          <p className="text-[15px] sm:text-[17px] leading-[1.4] whitespace-pre-wrap break-words"
            style={{ color: isMine ? '#ffffff' : '#e0e2ed' }}>
            {searchTerm ? highlightText(message.text ?? '', searchTerm) : message.text}
          </p>
          <div className="flex items-center justify-end gap-1 mt-1">
            {message.editedAt && (
              <span className="text-[10px] italic opacity-60"
                style={{ color: isMine ? 'rgba(255,255,255,0.6)' : '#c1c6d7' }}>edited</span>
            )}
            <p className="text-[11px]" style={{ color: isMine ? 'rgba(255,255,255,0.6)' : '#c1c6d7' }}>{time}</p>
          </div>
        </div>
      </div>
    );
  }

  // ── Image ─────────────────────────────────────────────────────────────────────

  if (message.type === 'image') {
    return (
      <div className={`flex mb-2 items-center ${isMine ? 'justify-end' : 'justify-start'}`}>
        {onReply && (
          <div
            className={`flex-shrink-0 w-8 h-8 rounded-full bg-ch-input flex items-center justify-center ${isMine ? 'order-first mr-2' : 'order-last ml-2'}`}
            style={{ opacity: replyIconOpacity, transform: `scale(${0.6 + replyIconOpacity * 0.4})` }}
            aria-hidden
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M1 5h8a4 4 0 010 8H5M1 5l3-3M1 5l3 3" stroke="#adc6ff" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        )}
        <div
          className="rounded-[20px] overflow-hidden relative"
          style={{ border: '1px solid #414755', width: 'min(208px, 60vw)', ...swipeStyle }}
          {...touchProps}
        >
          {message.replyTo && (
            <div className="px-3 pt-2 pb-0" style={{ backgroundColor: recvBg }}>
              <ReplyQuote />
            </div>
          )}
          {decryptedUrl ? (
            <img src={decryptedUrl} alt="photo" className="w-full object-cover" style={{ maxHeight: 260 }} />
          ) : (
            <div className="relative w-full" style={{ minHeight: 120, backgroundColor: recvBg }}>
              {message.thumbnail && (
                <img
                  src={message.thumbnail}
                  alt=""
                  className="w-full object-cover"
                  style={{ maxHeight: 260, filter: 'blur(8px)', transform: 'scale(1.06)' }}
                />
              )}
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-8 h-8 border-2 border-white border-t-transparent rounded-full animate-spin opacity-80" />
              </div>
            </div>
          )}
          <span className="absolute bottom-2 right-2 text-white text-[10px] px-2 py-0.5 rounded"
            style={{ backgroundColor: 'rgba(0,0,0,0.45)' }}>{time}</span>
        </div>
      </div>
    );
  }

  // ── Video ─────────────────────────────────────────────────────────────────────

  if (message.type === 'video') {
    return (
      <div className={`flex mb-2 items-center ${isMine ? 'justify-end' : 'justify-start'}`}>
        {onReply && (
          <div
            className={`flex-shrink-0 w-8 h-8 rounded-full bg-ch-input flex items-center justify-center ${isMine ? 'order-first mr-2' : 'order-last ml-2'}`}
            style={{ opacity: replyIconOpacity, transform: `scale(${0.6 + replyIconOpacity * 0.4})` }}
            aria-hidden
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M1 5h8a4 4 0 010 8H5M1 5l3-3M1 5l3 3" stroke="#adc6ff" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        )}
        <div
          className="rounded-[20px] overflow-hidden relative"
          style={{ border: '1px solid #414755', width: 'min(192px, 55vw)', ...swipeStyle }}
          {...touchProps}
        >
          {decryptedUrl ? (
            <video src={decryptedUrl} controls className="w-full" style={{ maxHeight: 280 }} />
          ) : (
            <button onClick={() => decryptMedia()}
              className="w-full flex flex-col items-center justify-center gap-2 relative py-12"
              style={{ backgroundColor: '#000' }}>
              <div className="w-12 h-12 rounded-full border border-white/40 flex items-center justify-center"
                style={{ backgroundColor: 'rgba(255,255,255,0.15)' }}>
                {loading ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  : <svg width="14" height="18" viewBox="0 0 14 18" fill="white"><path d="M2 1l11 8-11 8V1z" /></svg>}
              </div>
            </button>
          )}
          <span className="absolute bottom-2 right-2 text-white text-[10px] px-2 py-0.5 rounded"
            style={{ backgroundColor: 'rgba(0,0,0,0.45)' }}>{time}</span>
        </div>
      </div>
    );
  }

  // ── Audio ─────────────────────────────────────────────────────────────────────

  if (message.type === 'audio') {
    return (
      <div className={`flex mb-2 items-center ${isMine ? 'justify-end' : 'justify-start'}`}>
        {onReply && (
          <div
            className={`flex-shrink-0 w-8 h-8 rounded-full bg-ch-input flex items-center justify-center ${isMine ? 'order-first mr-2' : 'order-last ml-2'}`}
            style={{ opacity: replyIconOpacity, transform: `scale(${0.6 + replyIconOpacity * 0.4})` }}
            aria-hidden
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M1 5h8a4 4 0 010 8H5M1 5l3-3M1 5l3 3" stroke="#adc6ff" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        )}
        <div
          className={`flex items-center gap-3 px-4 py-3 ${isMine ? 'bubble-sent' : 'bubble-recv'}`}
          style={{
            backgroundColor: isMine ? sentBg : recvBg,
            minWidth: 'min(160px, 50vw)',
            maxWidth: 'min(75%, 320px)',
            ...swipeStyle,
          }}
          {...touchProps}
        >
          <button onClick={toggleAudio} className="flex-shrink-0 w-8 h-8 flex items-center justify-center">
            {loading ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              : playing
                ? <svg width="10" height="14" viewBox="0 0 10 14" fill="white"><rect x="0" y="0" width="3.5" height="14" rx="1" /><rect x="6.5" y="0" width="3.5" height="14" rx="1" /></svg>
                : <svg width="12" height="14" viewBox="0 0 12 14" fill="white"><path d="M1 1l10 6.5L1 14V1z" /></svg>}
          </button>
          <div className="flex items-center gap-0.5 flex-1" style={{ minWidth: 60 }}>
            {[8, 16, 20, 12, 24, 16, 8, 20, 12].map((h, i) => (
              <div key={i} className="rounded-full flex-1" style={{
                height: h,
                backgroundColor: isMine
                  ? (progress > i / 9 ? '#ffffff' : 'rgba(255,255,255,0.35)')
                  : (progress > i / 9 ? '#adc6ff' : '#414755'),
              }} />
            ))}
          </div>
          <span className="text-[11px] flex-shrink-0" style={{ color: 'rgba(255,255,255,0.7)' }}>
            {message.duration ? `0:${String(Math.round(message.duration)).padStart(2, '0')}` : '0:00'}
          </span>
        </div>
      </div>
    );
  }

  return null;
}
