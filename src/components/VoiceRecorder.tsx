import { useState, useRef, useEffect } from 'react';

type Props = {
  onSend: (blob: Blob, duration: number) => void;
  onCancel: () => void;
};

export default function VoiceRecorder({ onSend, onCancel }: Props) {
  const [isRecording, setIsRecording] = useState(false);
  const [duration, setDuration] = useState(0);
  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const cancelledRef = useRef(false);
  const durationRef = useRef(0);

  useEffect(() => () => stopStream(), []);

  function stopStream() {
    streamRef.current?.getTracks().forEach(t => t.stop());
    if (timerRef.current) clearInterval(timerRef.current);
  }

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus', 'audio/webm']
        .find(t => MediaRecorder.isTypeSupported(t)) ?? '';
      const mr = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      chunks.current = [];
      cancelledRef.current = false;

      mr.ondataavailable = (e) => { if (e.data.size > 0) chunks.current.push(e.data); };
      mr.onstop = () => {
        if (cancelledRef.current) { stopStream(); return; }
        const blob = new Blob(chunks.current, { type: mimeType || 'audio/webm' });
        onSend(blob, durationRef.current);
        stopStream();
      };

      mr.start();
      mediaRecorder.current = mr;
      setIsRecording(true);
      setDuration(0);
      durationRef.current = 0;
      timerRef.current = setInterval(() => {
        setDuration(d => { durationRef.current = d + 1; return d + 1; });
      }, 1000);
    } catch {
      onCancel();
    }
  }

  function stopAndSend() {
    if (timerRef.current) clearInterval(timerRef.current);
    mediaRecorder.current?.stop();
    setIsRecording(false);
  }

  function cancel() {
    cancelledRef.current = true;
    if (timerRef.current) clearInterval(timerRef.current);
    mediaRecorder.current?.stop();
    setIsRecording(false);
    onCancel();
  }

  function fmt(s: number) {
    return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  }

  return (
    <div className="flex items-center gap-3 bg-ch-bg border-t border-ch-border px-4 py-3">
      <button
        onClick={cancel}
        className="text-ch-sub text-sm font-medium px-2 py-2"
      >
        Cancel
      </button>

      {!isRecording ? (
        <button
          onClick={startRecording}
          className="flex-1 flex items-center justify-center gap-2 bg-ch-input rounded-[20px] py-3 font-semibold text-ch-blue"
        >
          <svg width="14" height="19" viewBox="0 0 14 19" fill="none">
            <rect x="3.5" y="1" width="7" height="12" rx="3.5" fill="#adc6ff" />
            <path d="M1 9.5c0 3.3 2.7 6 6 6s6-2.7 6-6" stroke="#adc6ff" strokeWidth="1.4" strokeLinecap="round" />
            <path d="M7 15.5V18" stroke="#adc6ff" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
          <span className="text-[17px]">Tap to record</span>
        </button>
      ) : (
        <div className="flex-1 flex items-center justify-center gap-3">
          <span className="relative flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500" />
          </span>
          <span className="text-lg font-bold text-ch-text tabular-nums">{fmt(duration)}</span>
          <span className="text-xs text-ch-sub">Recording…</span>
        </div>
      )}

      {isRecording && (
        <button
          onClick={stopAndSend}
          className="w-8 h-8 rounded-full bg-ch-blue flex items-center justify-center flex-shrink-0"
        >
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
            <path d="M6.5 11.5V1.5M1.5 6.5l5-5 5 5" stroke="#002e69" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      )}
    </div>
  );
}
