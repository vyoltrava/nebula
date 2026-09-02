"use client";
import { createContext, useContext, useRef, useState, useEffect, useCallback } from "react";
import { Play, Pause, X, Rewind, FastForward } from "lucide-react";

export interface TrackInfo {
  id: string | number;
  type: "audio" | "video_note";
  src: string;
  title: string;
}

interface Ctx {
  track: TrackInfo | null;
  playing: boolean;
  currentTime: number;
  duration: number;
  rate: number;
  playTrack: (t: TrackInfo) => void;
  toggle: () => void;
  close: () => void;
  seekBy: (sec: number) => void;
  seekTo: (ratio: number) => void;
  cycleRate: () => void;
  /** ������� <video>?������� ����������� (���� 3: ���� ������ � ���, � �� �� �������� muted?�����). */
  registerVideoPlayer: (el: HTMLVideoElement | null) => void;
  /** AnalyserNode ��� ������������ ����� (���� 4). */
  analyserRef: React.RefObject<AnalyserNode>;
}

const GlobalPlayerContext = createContext<Ctx | null>(null);

export function useGlobalPlayer() {
  const ctx = useContext(GlobalPlayerContext);
  if (!ctx) throw new Error("GlobalPlayerProvider missing");
  return ctx;
}

export function GlobalPlayerProvider({ children }: { children: React.ReactNode }) {
  const [track, setTrack] = useState<TrackInfo | null>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [rate, setRate] = useState(1);

  // ? ���������� �����-�������� � ������� �� ���������������
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  // ���� 3/4: Web Audio � ����� ���������� ��������� ��� ����� + �������� �����
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);

  // ������ ������� �������� �� ���������� ��������� (play/pause/time/duration).
  const wire = useCallback((el: HTMLMediaElement | null) => {
    if (!el) return;
    el.ontimeupdate = () => setCurrentTime(el.currentTime);
    el.onloadedmetadata = () => {
      if (el.duration === Infinity || isNaN(el.duration)) {
        const fix = () => {
          setDuration(el.duration);
          el.currentTime = 0;
          el.removeEventListener("timeupdate", fix);
        };
        el.addEventListener("timeupdate", fix);
        el.currentTime = 1e7;
      } else {
        setDuration(el.duration || 0);
      }
    };
    el.onended = () => { setPlaying(false); setCurrentTime(0); };
    el.onplay = () => setPlaying(true);
    el.onpause = () => setPlaying(false);
  }, []);

  // �������� �����?�������� + �������� AnalyserNode (���� ���).
  const bindGlobal = useCallback((el: HTMLAudioElement | null) => {
    audioRef.current = el;
    if (!el) return;
    wire(el);
    if (typeof window === "undefined") return;
    const AC =
      (window as any).AudioContext ?? (window as any).webkitAudioContext;
    if (AC && !audioCtxRef.current) {
      const ctx = new AC();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.85;
      audioCtxRef.current = ctx;
      analyserRef.current = analyser;
    }
    const ctx = audioCtxRef.current;
    const analyser = analyserRef.current;
    // createMediaElementSource ����� ������� ���� ��� �� ������� � ������
    // ������ � ���������� � ������� �� ����� (����� ����� ����������).
    if (
      ctx &&
      analyser &&
      typeof (ctx as any).createMediaElementSource === "function"
    ) {
      try {
        const source = ctx.createMediaElementSource(el);
        if (!source) throw 0;
        source.connect(analyser);
        analyser.connect(ctx.destination);
      } catch {
        /* ���������� ���������� � ����� ������ �������� ��� ����� */
      }
    }
  }, [wire]);

  // ����������� ������������ ������� <video> ��� ���������� ����� � gp ������ ���
  // (�� ������, � ����� ������������). ���� ������� ������ �������� muted?�����.
  const registerVideoPlayer = useCallback((el: HTMLVideoElement | null) => {
    videoRef.current = el;
    if (el) wire(el);
  }, [wire]);

  const activeEl = () =>
    track?.type === "video_note" ? videoRef.current : audioRef.current;

  // ��� ����� �����: ������ src � ������
  useEffect(() => {
    const a = audioRef.current;
    const v = videoRef.current;
    if (!track) {
      a?.pause();
      v?.pause();
      return;
    }
    const el = track.type === "video_note" ? v : a;
    const other = track.type === "video_note" ? a : v;
    other?.pause();
    if (!el) return;
    // БЛОК 3: звук включаем (не muted) — пользователь уже кликнул (жест)
    (el as HTMLMediaElement).muted = false;
    if (el.getAttribute("src") !== track.src) el.src = track.src;
    el.playbackRate = rate;
    audioCtxRef.current?.resume(); // БЛОК 4: анализатор получит сигнал
    el.play().catch(() => {});
  }, [track, rate]);

  const playTrack = useCallback((t: TrackInfo) => {
    setTrack((prev) => {
      if (prev && prev.id === t.id && prev.type === t.type) {
        const el = prev.type === "video_note" ? videoRef.current : audioRef.current;
        if (el) (el.paused ? el.play() : el.pause());
        return prev;
      }
      setCurrentTime(0);
      setDuration(0);
      return t;
    });
  }, []);

  const toggle = useCallback(() => {
    const el = activeEl();
    if (!el) return;
    if (el.paused) el.play();
    else el.pause();
  }, [track]);

  const close = useCallback(() => {
    setTrack(null);
    setCurrentTime(0);
    setDuration(0);
    setPlaying(false);
  }, []);

  const seekBy = useCallback((sec: number) => {
    const el = activeEl();
    if (!el) return;
    const max = isFinite(el.duration) ? el.duration : 0;
    el.currentTime = Math.min(Math.max(0, el.currentTime + sec), max || el.currentTime + sec);
  }, [track]);

  const seekTo = useCallback((ratio: number) => {
    const el = activeEl();
    if (!el || !duration) return;
    el.currentTime = ratio * duration;
  }, [track, duration]);

  const cycleRate = useCallback(() => {
    const next = rate === 1 ? 1.5 : rate === 1.5 ? 2 : 1;
    setRate(next);
    const el = activeEl();
    if (el) el.playbackRate = next;
  }, [rate, track]);

  function fmt(s: number) {
    if (!isFinite(s) || isNaN(s)) return "0:00";
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  }

  const progress = duration ? (currentTime / duration) * 100 : 0;

  return (
    <GlobalPlayerContext.Provider
      value={{ track, playing, currentTime, duration, rate, playTrack, toggle, close, seekBy, seekTo, cycleRate, registerVideoPlayer, analyserRef }}
    >
      {/* ? ���������� ������� �������� � ������������� ���� ��� */}
            {/* ✅ Скрытый аудио‑элемент: источник для AnalyserNode + воспроизведение. preload="auto" — БЛОК 3: аудио буферизуется заранее, затем держится на паузе. */}
      <audio ref={bindGlobal} preload="auto" className="hidden" />
      {/* Видеокружок регистрирует видимый <video> через registerVideoPlayer — один элемент для кадров И звука (БЛОК 3), без дублирования. */}

{track && (
  <div className="fixed top-[70px] right-3 sm:right-5 z-[150] w-[calc(100vw-24px)] max-w-[420px] animate-in slide-in-from-top-2 duration-200">
    <div className="bg-white/5 backdrop-blur-xl border border-line dark:border-white/10 rounded-2xl shadow-lg shadow-black/30">
      <div className="px-3 py-2">
        <div className="flex items-center gap-2 sm:gap-3">
          {/* ��������� � play */}
          <div className="flex items-center gap-1 shrink-0">
            <button onClick={() => seekBy(-10)} className="p-1.5 rounded-lg text-gray-600 dark:text-white/50 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-white/10 active:scale-90 transition-all" title="-10 ���">
              <Rewind size={16} />
            </button>
            <button onClick={toggle} className="w-9 h-9 rounded-full bg-[#8b5cf6] hover:bg-[#7c3aed] text-white flex items-center justify-center active:scale-90 transition-all">
              {playing ? <Pause size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" className="ml-0.5" />}
            </button>
            <button onClick={() => seekBy(10)} className="p-1.5 rounded-lg text-gray-600 dark:text-white/50 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-white/10 active:scale-90 transition-all" title="+10 ���">
              <FastForward size={16} />
            </button>
          </div>

          {/* �������� */}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{track.title}</p>
            <p className="text-[10px] text-gray-500 dark:text-white/40 font-mono">{fmt(currentTime)} / {fmt(duration)}</p>
          </div>

          {/* �������� */}
          <button onClick={cycleRate} className="shrink-0 px-2 py-1 rounded-lg bg-gray-100 dark:bg-white/5 border border-line dark:border-white/10 text-[11px] font-bold text-gray-800 dark:text-white/70 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-white/10 active:scale-95 transition-all" title="��������">
            {rate}X
          </button>

          {/* ������� */}
          <button onClick={close} className="shrink-0 p-1.5 rounded-lg text-gray-500 dark:text-white/50 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-500/10 active:scale-90 transition-all" title="�������">
            <X size={18} />
          </button>
        </div>

        {/* ��������-��� */}
        <div className="mt-1.5 h-1 rounded-full bg-gray-100 dark:bg-white/10 cursor-pointer" onClick={(e) => { const rect = e.currentTarget.getBoundingClientRect(); seekTo(Math.min(Math.max((e.clientX - rect.left) / rect.width, 0), 1)); }}>
          <div className="h-full rounded-full bg-gradient-to-r from-[#8b5cf6] to-[#a78bfa] transition-all duration-200" style={{ width: `${progress}%` }} />
        </div>
      </div>
    </div>
  </div>
)}

      {children}
    </GlobalPlayerContext.Provider>
  );
}
