import { useState, useRef } from 'react';
import { Message } from '../hooks/useMessages';
import { decryptFile, unwrapFileKey } from '../services/crypto';
import { loadPrivateKey } from '../services/keyStore';
import { formatMessageTime } from '../utils/formatTime';

type Props = {
  message: Message;
  isMine: boolean;
  partnerPublicKey: string;
  searchTerm?: string;
  onLongPress?: () => void;
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

export default function MessageBubble({ message, isMine, partnerPublicKey, searchTerm = '', onLongPress }: Props) {
  const [decryptedUrl, setDecryptedUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function startLongPress() {
    if (!onLongPress) return;
    longPressTimer.current = setTimeout(() => { onLongPress(); }, 600);
  }

  function cancelLongPress() {
    if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; }
  }

  function handleContextMenu(e: React.MouseEvent) {
    if (!onLongPress) return;
    e.preventDefault();
    onLongPress();
  }

  async function decryptMedia(mimeType: string): Promise<string | null> {
    if (decryptedUrl) return decryptedUrl;
    if (!message.mediaUrl || !message.wrappedKey) return null;
    setLoading(true);
    try {
      const mySecretKey = loadPrivateKey();
      if (!mySecretKey) throw new Error('No private key');
      const fileKey = unwrapFileKey(message.wrappedKey, message.keyNonce!, partnerPublicKey, mySecretKey);
      if (!fileKey) throw new Error('Could not unwrap key');
      const res = await fetch(message.mediaUrl);
      const encBytes = new Uint8Array(await res.arrayBuffer());
      const decBytes = decryptFile(encBytes, fileKey, message.fileNonce!);
      if (!decBytes) throw new Error('Decryption failed');
      const blob = new Blob([(decBytes as Uint8Array<ArrayBuffer>).buffer], { type: mimeType });
      const url = URL.createObjectURL(blob);
      setDecryptedUrl(url);
      return url;
    } catch (e: unknown) {
      alert('Cannot open: ' + (e instanceof Error ? e.message : String(e)));
      return null;
    } finally {
      setLoading(false);
    }
  }

  async function toggleAudio() {
    const url = decryptedUrl ?? await decryptMedia(message.mimeType ?? 'audio/webm');
    if (!url) return;

    if (!audioRef.current) {
      const audio = new Audio(url);
      audio.ontimeupdate = () => {
        if (audio.duration) setProgress(audio.currentTime / audio.duration);
      };
      audio.onended = () => { setPlaying(false); setProgress(0); };
      audioRef.current = audio;
      await audio.play();
      setPlaying(true);
      return;
    }

    if (playing) {
      audioRef.current.pause();
      setPlaying(false);
    } else {
      await audioRef.current.play();
      setPlaying(true);
    }
  }

  const time = formatMessageTime(message.createdAt);
  const sentBg = '#007aff';
  const recvBg = '#31353d';

  // Deleted message
  if (message.isDeleted) {
    return (
      <div className={`flex mb-2 ${isMine ? 'justify-end' : 'justify-start'}`}>
        <div
          className="px-4 py-2 rounded-[12px] border border-ch-border"
          style={{ backgroundColor: '#1c2028' }}
        >
          <p className="text-[14px] italic text-ch-sub">Message deleted</p>
        </div>
      </div>
    );
  }

  if (message.type === 'text') {
    return (
      <div className={`flex mb-2 ${isMine ? 'justify-end' : 'justify-start'}`}>
        <div
          className={`${isMine ? 'bubble-sent' : 'bubble-recv'} max-w-[78%] sm:max-w-[65%]`}
          style={{
            backgroundColor: isMine ? sentBg : recvBg,
            padding: '8px 16px',
          }}
          onTouchStart={isMine ? startLongPress : undefined}
          onTouchEnd={isMine ? cancelLongPress : undefined}
          onTouchMove={isMine ? cancelLongPress : undefined}
          onContextMenu={isMine ? handleContextMenu : undefined}
        >
          <p className="text-[15px] sm:text-[17px] leading-[1.4] whitespace-pre-wrap break-words"
            style={{ color: isMine ? '#ffffff' : '#e0e2ed' }}>
            {searchTerm ? highlightText(message.text ?? '', searchTerm) : message.text}
          </p>
          <div className="flex items-center justify-end gap-1 mt-1">
            {message.editedAt && (
              <span className="text-[10px] italic opacity-60"
                style={{ color: isMine ? 'rgba(255,255,255,0.6)' : '#c1c6d7' }}>
                edited
              </span>
            )}
            <p className="text-[11px]"
              style={{ color: isMine ? 'rgba(255,255,255,0.6)' : '#c1c6d7' }}>
              {time}
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (message.type === 'image') {
    return (
      <div className={`flex mb-2 ${isMine ? 'justify-end' : 'justify-start'}`}>
        <div className="rounded-[20px] overflow-hidden relative"
          style={{ border: '1px solid #414755', width: 'min(208px, 60vw)' }}>
          {decryptedUrl ? (
            <img src={decryptedUrl} alt="photo" className="w-full object-cover" style={{ maxHeight: 260 }} />
          ) : (
            <button
              onClick={() => decryptMedia('image/jpeg')}
              className="w-full flex flex-col items-center justify-center gap-2 py-10"
              style={{ backgroundColor: recvBg }}
            >
              {loading
                ? <div className="w-7 h-7 border-2 border-ch-blue border-t-transparent rounded-full animate-spin" />
                : <span className="text-4xl">📷</span>}
              <span className="text-[12px]" style={{ color: '#c1c6d7' }}>Tap to decrypt</span>
            </button>
          )}
          <span
            className="absolute bottom-2 right-2 text-white text-[10px] px-2 py-0.5 rounded"
            style={{ backgroundColor: 'rgba(0,0,0,0.45)' }}
          >{time}</span>
        </div>
      </div>
    );
  }

  if (message.type === 'video') {
    return (
      <div className={`flex mb-2 ${isMine ? 'justify-end' : 'justify-start'}`}>
        <div className="rounded-[20px] overflow-hidden relative"
          style={{ border: '1px solid #414755', width: 'min(192px, 55vw)' }}>
          {decryptedUrl ? (
            <video src={decryptedUrl} controls className="w-full" style={{ maxHeight: 280 }} />
          ) : (
            <button
              onClick={() => decryptMedia('video/mp4')}
              className="w-full flex flex-col items-center justify-center gap-2 relative py-12"
              style={{ backgroundColor: '#000' }}
            >
              <div className="w-12 h-12 rounded-full border border-white/40 flex items-center justify-center"
                style={{ backgroundColor: 'rgba(255,255,255,0.15)' }}>
                {loading
                  ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  : <svg width="14" height="18" viewBox="0 0 14 18" fill="white"><path d="M2 1l11 8-11 8V1z" /></svg>}
              </div>
            </button>
          )}
          <span
            className="absolute bottom-2 right-2 text-white text-[10px] px-2 py-0.5 rounded"
            style={{ backgroundColor: 'rgba(0,0,0,0.45)' }}
          >{time}</span>
        </div>
      </div>
    );
  }

  if (message.type === 'audio') {
    return (
      <div className={`flex mb-2 ${isMine ? 'justify-end' : 'justify-start'}`}>
        <div
          className={`flex items-center gap-3 px-4 py-3 ${isMine ? 'bubble-sent' : 'bubble-recv'}`}
          style={{
            backgroundColor: isMine ? sentBg : recvBg,
            minWidth: 'min(160px, 50vw)',
            maxWidth: 'min(75%, 320px)',
          }}
        >
          <button onClick={toggleAudio} className="flex-shrink-0 w-8 h-8 flex items-center justify-center">
            {loading
              ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              : playing
                ? <svg width="10" height="14" viewBox="0 0 10 14" fill="white"><rect x="0" y="0" width="3.5" height="14" rx="1" /><rect x="6.5" y="0" width="3.5" height="14" rx="1" /></svg>
                : <svg width="12" height="14" viewBox="0 0 12 14" fill="white"><path d="M1 1l10 6.5L1 14V1z" /></svg>}
          </button>

          <div className="flex items-center gap-0.5 flex-1" style={{ minWidth: 60 }}>
            {[8, 16, 20, 12, 24, 16, 8, 20, 12].map((h, i) => (
              <div
                key={i}
                className="rounded-full flex-1"
                style={{
                  height: h,
                  backgroundColor: isMine
                    ? (progress > i / 9 ? '#ffffff' : 'rgba(255,255,255,0.35)')
                    : (progress > i / 9 ? '#adc6ff' : '#414755'),
                }}
              />
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
