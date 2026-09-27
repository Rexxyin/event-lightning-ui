'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

type Beat = { time: number; strength: number };
type Stats = { total: number; zones: Record<string, { total: number; rows: Record<string, number> }> };
type Color = { name: string; value: string; hot: string };

const COLORS: Color[] = [
  { name: 'Violet', value: '#8B5CF6', hot: '#E9D5FF' },
  { name: 'Magenta', value: '#EC4899', hot: '#FBCFE8' },
  { name: 'Pink', value: '#FF2D95', hot: '#FFD1E8' },
  { name: 'Orange', value: '#FF6B35', hot: '#FFE0D1' },
  { name: 'Gold', value: '#FFD43B', hot: '#FFF7C2' },
  { name: 'Cyan', value: '#00D9FF', hot: '#CCF9FF' },
  { name: 'Blue', value: '#3B82F6', hot: '#DBEAFE' },
  { name: 'Lime', value: '#B7F34A', hot: '#F0FFD1' },
];

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));
const natural = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
const formatTime = (s: number) => {
  const safe = Math.max(0, Number.isFinite(s) ? s : 0);
  return `${String(Math.floor(safe / 60)).padStart(2, '0')}:${String(Math.floor(safe % 60)).padStart(2, '0')}`;
};

export default function MusicControlPage() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const animationRef = useRef<number | null>(null);
  const beatRef = useRef<Beat[]>([]);
  const lastBeatRef = useRef(-1);
  const playingRef = useRef(false);
  const currentTimeRef = useRef(0);
  const selectedZonesRef = useRef<Set<string>>(new Set());
  const selectedRowsRef = useRef<Set<string>>(new Set());
  const colorRef = useRef(COLORS[0]);
  const beatDivisionRef = useRef(1);
  const strongBeatRef = useRef(true);

  const [stats, setStats] = useState<Stats | null>(null);
  const [selectedZones, setSelectedZones] = useState<Set<string>>(new Set());
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [color, setColor] = useState<Color>(COLORS[0]);
  const [fileName, setFileName] = useState('');
  const [audioUrl, setAudioUrl] = useState('');
  const [durationSeconds, setDurationSeconds] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const [beats, setBeats] = useState<Beat[]>([]);
  const [waveform, setWaveform] = useState<number[]>([]);
  const [bpm, setBpm] = useState<number | null>(null);
  const [beatDivision, setBeatDivision] = useState(1);
  const [strongBeat, setStrongBeat] = useState(true);
  const [intensity, setIntensity] = useState(78);
  const [error, setError] = useState<string | null>(null);
  const [lastSent, setLastSent] = useState(0);
  const [isDraggingTimeline, setIsDraggingTimeline] = useState(false);
  const timelineRef = useRef<HTMLDivElement | null>(null);

  const zones = useMemo(() => Object.keys(stats?.zones ?? {}).sort(natural), [stats]);
  const rows = useMemo(() => {
    const result = new Set<string>();
    for (const zone of zones) Object.keys(stats?.zones[zone]?.rows ?? {}).forEach((row) => result.add(row));
    return [...result].sort(natural);
  }, [stats, zones]);

  useEffect(() => { selectedZonesRef.current = selectedZones; }, [selectedZones]);
  useEffect(() => { selectedRowsRef.current = selectedRows; }, [selectedRows]);
  useEffect(() => { colorRef.current = color; }, [color]);
  useEffect(() => { beatDivisionRef.current = beatDivision; }, [beatDivision]);
  useEffect(() => { strongBeatRef.current = strongBeat; }, [strongBeat]);

  const loadStats = useCallback(async () => {
    try {
      const response = await fetch('/api/stats', { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || 'Unable to load audience stats');
      setStats(data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load audience stats');
    }
  }, []);

  useEffect(() => {
    void loadStats();
    const id = window.setInterval(loadStats, 5000);
    return () => window.clearInterval(id);
  }, [loadStats]);

  useEffect(() => {
    if (zones.length && selectedZones.size === 0) setSelectedZones(new Set(zones));
  }, [zones, selectedZones.size]);

  const toggleZone = (zone: string) => {
    setSelectedZones((prev) => {
      const next = new Set(prev);
      next.has(zone) ? next.delete(zone) : next.add(zone);
      return next;
    });
  };

  const toggleRow = (row: string) => {
    setSelectedRows((prev) => {
      const next = new Set(prev);
      next.has(row) ? next.delete(row) : next.add(row);
      return next;
    });
  };

  const sendBeat = useCallback(async (strength: number) => {
    const zonesNow = [...selectedZonesRef.current].sort(natural);
    if (!zonesNow.length) return;

    const rowsNow = selectedRowsRef.current.size ? [...selectedRowsRef.current].sort(natural) : [undefined];
    const c = colorRef.current;
    const intensityNow = clamp(intensity, 0, 100);
    const duration = clamp(Math.round(170 + intensityNow * 2.4 + (strongBeatRef.current && strength >= 1.7 ? 120 : 0)), 170, 520);

    try {
      const requests: Promise<Response>[] = [];
      for (const zone of zonesNow) {
        for (const row of rowsNow) {
          requests.push(fetch('/api/command', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ zone, ...(row ? { row } : {}), action: 'flash', color: c.value, duration }),
          }));
        }
      }
      await Promise.all(requests);
      setLastSent(Date.now());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Lighting command failed');
    }
  }, [intensity]);

  const ensureAudio = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio) return;
    const AudioCtor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtor) throw new Error('Web Audio is not supported in this browser');
    const ctx = audioContextRef.current ?? new AudioCtor();
    audioContextRef.current = ctx;
    if (!sourceRef.current) {
      const source = ctx.createMediaElementSource(audio);
      source.connect(ctx.destination);
      sourceRef.current = source;
    }
    if (ctx.state === 'suspended') await ctx.resume();
  }, []);

  const updatePlayback = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const time = audio.currentTime;
    currentTimeRef.current = time;
    setCurrentTime(time);

    const list = beatRef.current;
    let index = lastBeatRef.current;
    while (index + 1 < list.length && list[index + 1].time <= time + 0.018) index += 1;

    if (index !== lastBeatRef.current && index >= 0) {
      for (let i = lastBeatRef.current + 1; i <= index; i += 1) {
        if (i % beatDivisionRef.current === 0) void sendBeat(list[i].strength);
      }
      lastBeatRef.current = index;
    }

    if (playingRef.current) animationRef.current = requestAnimationFrame(updatePlayback);
  }, [sendBeat]);

  const togglePlayback = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio || !audioUrl || !isReady) return;
    try {
      await ensureAudio();
      if (audio.paused) {
        if (audio.currentTime >= audio.duration) {
          audio.currentTime = 0;
          lastBeatRef.current = -1;
        }
        await audio.play();
        playingRef.current = true;
        setIsPlaying(true);
        if (animationRef.current) cancelAnimationFrame(animationRef.current);
        animationRef.current = requestAnimationFrame(updatePlayback);
      } else {
        audio.pause();
        playingRef.current = false;
        setIsPlaying(false);
        if (animationRef.current) cancelAnimationFrame(animationRef.current);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to play track');
    }
  }, [audioUrl, ensureAudio, isReady, updatePlayback]);

  const resetTrack = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.pause();
    audio.currentTime = 0;
    playingRef.current = false;
    setIsPlaying(false);
    setCurrentTime(0);
    currentTimeRef.current = 0;
    lastBeatRef.current = -1;
    if (animationRef.current) cancelAnimationFrame(animationRef.current);
  }, []);

  const seekTo = useCallback((clientX: number) => {
    const audio = audioRef.current;
    const el = timelineRef.current;
    if (!audio || !el || !durationSeconds) return;
    const rect = el.getBoundingClientRect();
    const ratio = clamp((clientX - rect.left) / rect.width, 0, 1);
    audio.currentTime = ratio * durationSeconds;
    currentTimeRef.current = audio.currentTime;
    setCurrentTime(audio.currentTime);
    let idx = -1;
    for (let i = 0; i < beatRef.current.length; i += 1) {
      if (beatRef.current[i].time <= audio.currentTime) idx = i;
      else break;
    }
    lastBeatRef.current = idx;
  }, [durationSeconds]);

  const onTimelinePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    setIsDraggingTimeline(true);
    event.currentTarget.setPointerCapture(event.pointerId);
    seekTo(event.clientX);
  };

  const onTimelinePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (isDraggingTimeline) seekTo(event.clientX);
  };

  const onTimelinePointerUp = () => setIsDraggingTimeline(false);

  const handleFile = async (file: File) => {
    if (!file.type.startsWith('audio/')) {
      setError('Please choose an audio file.');
      return;
    }
    resetTrack();
    if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
    const url = URL.createObjectURL(file);
    audioUrlRef.current = url;
    setAudioUrl(url);
    setFileName(file.name);
    setDurationSeconds(0);
    setCurrentTime(0);
    setBeats([]);
    beatRef.current = [];
    setWaveform([]);
    setBpm(null);
    setIsReady(false);
    setError(null);
    setAnalysisProgress(0);
    await new Promise((resolve) => window.setTimeout(resolve, 20));
  };

  const analyze = async () => {
    if (!audioUrl) return;
    setIsAnalyzing(true);
    setError(null);
    setAnalysisProgress(5);
    try {
      const response = await fetch(audioUrl);
      const buffer = await response.arrayBuffer();
      const AudioCtor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtor) throw new Error('Web Audio is not supported in this browser');
      const ctx = audioContextRef.current ?? new AudioCtor();
      audioContextRef.current = ctx;
      const decoded = await ctx.decodeAudioData(buffer.slice(0));
      setDurationSeconds(decoded.duration);
      setAnalysisProgress(30);

      const channel = decoded.getChannelData(0);
      const sampleRate = decoded.sampleRate;
      const frame = Math.max(1024, Math.floor(sampleRate * 0.05));
      const energies: number[] = [];
      const times: number[] = [];

      for (let offset = 0; offset + frame < channel.length; offset += frame) {
        let sum = 0;
        for (let i = 0; i < frame; i += 1) {
          const s = channel[offset + i];
          sum += s * s;
        }
        energies.push(Math.sqrt(sum / frame));
        times.push(offset / sampleRate);
      }

      const waveformBars = 260;
      const waveformValues: number[] = [];
      const samplesPerBar = Math.max(1, Math.floor(channel.length / waveformBars));
      for (let b = 0; b < waveformBars; b += 1) {
        const start = b * samplesPerBar;
        const end = Math.min(channel.length, start + samplesPerBar);
        let peak = 0;
        for (let i = start; i < end; i += Math.max(1, Math.floor(samplesPerBar / 120))) peak = Math.max(peak, Math.abs(channel[i]));
        waveformValues.push(clamp(Math.pow(peak, 0.72), 0.04, 1));
      }
      setWaveform(waveformValues);
      setAnalysisProgress(50);

      const smooth = energies.map((_, i) => {
        let sum = 0;
        let count = 0;
        for (let j = Math.max(0, i - 2); j <= Math.min(energies.length - 1, i + 2); j += 1) {
          sum += energies[j];
          count += 1;
        }
        return sum / count;
      });

      const detected: Beat[] = [];
      let last = -Infinity;
      for (let i = 3; i < smooth.length - 3; i += 1) {
        const current = smooth[i];
        let avg = 0;
        let count = 0;
        for (let j = Math.max(0, i - 18); j <= Math.min(smooth.length - 1, i + 18); j += 1) {
          avg += smooth[j];
          count += 1;
        }
        avg /= Math.max(1, count);
        const threshold = Math.max(avg * 1.28, 0.006);
        const peak = current > smooth[i - 1] && current >= smooth[i + 1] && current > threshold;
        const time = times[i];
        if (peak && time - last >= 0.20) {
          detected.push({ time, strength: clamp(current / Math.max(avg, 0.0001), 1, 3) });
          last = time;
        }
      }

      const intervals = detected.slice(1).map((beat, i) => beat.time - detected[i].time).filter((v) => v >= 0.30 && v <= 1.10);
      let estimated: number | null = null;
      if (intervals.length >= 4) {
        const sorted = [...intervals].sort((a, b) => a - b);
        const median = sorted[Math.floor(sorted.length / 2)];
        estimated = clamp(Math.round(60 / median), 60, 180);
        while (estimated < 80) estimated *= 2;
        while (estimated > 160) estimated = Math.round(estimated / 2);
      }

      beatRef.current = detected;
      setBeats(detected);
      setBpm(estimated);
      setAnalysisProgress(100);
      setIsReady(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Track analysis failed');
    } finally {
      setIsAnalyzing(false);
    }
  };

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onLoaded = () => setDurationSeconds(audio.duration || 0);
    const onEnded = () => {
      playingRef.current = false;
      setIsPlaying(false);
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      setCurrentTime(audio.duration || 0);
    };
    audio.addEventListener('loadedmetadata', onLoaded);
    audio.addEventListener('ended', onEnded);
    return () => {
      audio.removeEventListener('loadedmetadata', onLoaded);
      audio.removeEventListener('ended', onEnded);
    };
  }, [audioUrl]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.matches('input, textarea, select, button')) return;
      if (event.code === 'Space') {
        event.preventDefault();
        if (!event.repeat) void togglePlayback();
      }
      if (event.key.toLowerCase() === 'r') {
        event.preventDefault();
        resetTrack();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [resetTrack, togglePlayback]);

  useEffect(() => () => {
    if (animationRef.current) cancelAnimationFrame(animationRef.current);
    if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
    audioContextRef.current?.close();
  }, []);

  const progress = durationSeconds ? clamp(currentTime / durationSeconds, 0, 1) : 0;
  const targetLabel = (() => {
    const zoneLabel =
      selectedZones.size === zones.length && zones.length
        ? 'ALL ZONES'
        : selectedZones.size
          ? `${selectedZones.size} ZONE${selectedZones.size > 1 ? 'S' : ''}`
          : 'NO TARGET';

    if (!selectedRows.size) return zoneLabel;

    const rowLabel =
      selectedRows.size === rows.length && rows.length
        ? 'ALL ROWS'
        : selectedRows.size === 1
          ? `ROW ${[...selectedRows][0]}`
          : `${selectedRows.size} ROWS`;

    return `${zoneLabel} · ${rowLabel}`;
  })();

  return (
    <main className="min-h-screen bg-[#05060a] text-zinc-100 selection:bg-violet-500/30">
      <audio ref={audioRef} src={audioUrl || undefined} preload="auto" />

      <header className="flex min-h-[72px] items-center justify-between border-b border-white/[0.07] bg-[#080a10]/95 px-5 backdrop-blur-xl md:px-7">
        <div className="flex min-w-0 items-center gap-4">
          <div className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] md:flex">←</div>
          <div className="min-w-0">
            <div className="font-semibold tracking-tight">MUSIC CONTROL</div>
            <div className="font-mono text-[9px] uppercase tracking-[0.18em] text-zinc-500">Beat synchronized lighting</div>
          </div>
          {fileName && <div className="hidden h-9 w-px bg-white/10 xl:block" />}
          {
            fileName && (
              <div className="hidden min-w-0 xl:block">
                <div className="max-w-[250px] truncate text-sm text-zinc-300">
                  {fileName}
                </div>
                <div className="font-mono text-[9px] text-zinc-600">
                  {formatTime(durationSeconds)} · {beats.length} beat markers
                </div>
              </div>
            )
          }
        </div>

        <div className="flex items-center gap-5">
          <div className="hidden text-right sm:block"><div className="font-mono text-[9px] uppercase text-zinc-600">BPM</div><div className="font-mono text-xl">{bpm ?? '—'}</div></div>
          <div className="flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1.5 font-mono text-[9px] uppercase tracking-[0.12em] text-emerald-300"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />{isReady ? 'Analyzed' : 'Waiting'}</div>
        </div>
      </header>

      <div className="grid min-h-[calc(100vh-72px)] grid-cols-1 lg:grid-cols-[minmax(0,1fr)_330px]">
        <section className="min-w-0">
          <div className="relative min-h-[420px] overflow-hidden border-b border-white/[0.07] bg-[radial-gradient(circle_at_50%_40%,rgba(139,92,246,.18),transparent_28%),radial-gradient(circle_at_25%_70%,rgba(236,72,153,.08),transparent_24%),#05060a]">
            <div className="absolute inset-0 opacity-60 [background-image:linear-gradient(rgba(255,255,255,.025)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.025)_1px,transparent_1px)] [background-size:48px_48px]" />
            <div className="absolute left-1/2 top-1/2 h-[270px] w-[270px] -translate-x-1/2 -translate-y-1/2 rounded-full blur-[100px]" style={{ background: color.value, opacity: isPlaying ? 0.20 : 0.10 }} />
            <div className="absolute left-1/2 top-1/2 h-[250px] w-[250px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/10 shadow-[0_0_100px_rgba(255,255,255,.08)]" style={{ boxShadow: `0 0 70px ${color.value}33, 0 0 180px ${color.value}18` }} />
            <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-[#05060a] to-transparent" />
            <div className="relative flex min-h-[420px] items-center justify-center">
              <div className="relative h-[230px] w-[230px] rounded-full" style={{ background: `radial-gradient(circle at 32% 28%, ${color.hot} 0 3%, ${color.value} 18%, #180d27 62%, #030308 100%)`, boxShadow: `0 0 25px ${color.value}99, 0 0 90px ${color.value}55, inset -30px -35px 70px #000` }}>
                <div className="absolute inset-[5px] rounded-full opacity-90 mix-blend-screen [background-image:repeating-linear-gradient(0deg,transparent_0_10px,rgba(255,255,255,.35)_11px_12px),repeating-linear-gradient(90deg,transparent_0_10px,rgba(255,255,255,.28)_11px_12px)]" />
                <div className="absolute inset-0 rounded-full opacity-80 [background:radial-gradient(circle_at_28%_25%,white_0_2%,transparent_10%),radial-gradient(circle_at_72%_35%,white_0_1.5%,transparent_8%),radial-gradient(circle_at_46%_62%,rgba(255,255,255,.8),transparent_14%)]" />
                <div className="absolute left-[18%] top-[16%] h-[22%] w-[20%] rounded-full bg-white/80 blur-md" />
                <div className="absolute inset-[-24%] -z-10 rounded-full opacity-80 blur-2xl" style={{ background: `conic-gradient(from 20deg, transparent, ${color.value}, transparent 18%, ${color.hot} 30%, transparent 43%, ${color.value} 62%, transparent 76%)` }} />
              </div>
            </div>
          </div>

          <section className="border-b border-white/[0.07] bg-[#070910] p-4 md:p-6">
            <div className="mb-3 flex items-center justify-between font-mono text-[10px] text-zinc-500"><span>{formatTime(currentTime)} / {formatTime(durationSeconds)}</span><span>{Math.round(progress * 100)}%</span></div>
            <div ref={timelineRef} className="relative h-24 cursor-pointer touch-none select-none overflow-hidden rounded-xl border border-white/[0.07] bg-black/40" onPointerDown={onTimelinePointerDown} onPointerMove={onTimelinePointerMove} onPointerUp={onTimelinePointerUp} onPointerCancel={onTimelinePointerUp}>
              <div className="absolute inset-0 flex items-center gap-[2px] px-2">
                {waveform.map((value, index) => <div key={index} className="min-w-0 flex-1 rounded-full" style={{ height: `${Math.max(8, value * 78)}%`, background: index / waveform.length <= progress ? color.value : 'rgba(255,255,255,.13)', opacity: index / waveform.length <= progress ? 0.95 : 0.7 }} />)}
              </div>
              {beats.map((beat, index) => <div key={`${beat.time}-${index}`} className="absolute top-2 bottom-2 w-px" style={{ left: `${(beat.time / Math.max(durationSeconds, 0.001)) * 100}%`, background: index === lastBeatRef.current ? color.hot : `${color.value}99`, opacity: beat.strength >= 1.7 ? 1 : 0.45 }} />)}
              <div className="absolute bottom-0 top-0 w-[2px] shadow-[0_0_12px_currentColor]" style={{ left: `${progress * 100}%`, color: color.hot, background: color.hot }} />
            </div>
            <div className="mt-3 flex items-center justify-between font-mono text-[9px] uppercase tracking-[0.13em] text-zinc-600">
              <span>Click / drag timeline to seek</span>
              <span>
                {isDraggingTimeline ? 'SEEKING' : 'SPACE · PLAY / PAUSE'}
              </span>
            </div>
          </section>

          <section className="flex flex-col gap-4 p-4 md:p-6 xl:flex-row xl:items-center xl:justify-center">
            <label className="flex cursor-pointer items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] px-5 py-3 font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-300 hover:bg-white/[0.07]"><input className="sr-only" type="file" accept="audio/*,.mp3,.wav,.m4a,.aac,.ogg" onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleFile(f); }} />{fileName ? 'Change track' : 'Choose track'}</label>
            <button type="button" disabled={!fileName || isAnalyzing} onClick={() => void analyze()} className="rounded-xl border border-violet-400/30 bg-violet-500/10 px-5 py-3 font-mono text-[10px] uppercase tracking-[0.14em] text-violet-200 hover:bg-violet-500/20 disabled:opacity-40">{isAnalyzing ? `Analyzing ${analysisProgress}%` : isReady ? 'Re-analyze' : 'Analyze track'}</button>
            <button type="button" disabled={!isReady} onClick={() => void togglePlayback()} className="min-w-[230px] rounded-2xl border px-8 py-4 font-mono text-[11px] font-semibold uppercase tracking-[0.18em] transition active:scale-[.99] disabled:opacity-30" style={{ borderColor: `${color.value}99`, background: `linear-gradient(135deg, ${color.value}20, rgba(255,255,255,.03))`, boxShadow: isPlaying ? `0 0 35px ${color.value}30` : undefined }}>{isPlaying ? 'SPACE TO PAUSE' : 'SPACE TO PLAY'}</button>
            <button
              type="button"
              onClick={resetTrack}
              className="rounded-xl border border-white/10 bg-white/[0.03] px-6 py-4 font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-400 hover:text-white"
            >
              Reset
            </button>
          </section>
        </section>

        <aside className="border-l border-white/[0.07] bg-[#080a10] p-5 md:p-6">
          <div className="mb-6">
            <div className="font-mono text-[9px] uppercase tracking-[0.18em] text-zinc-600">
              Lighting palette
            </div>
            <div className="mt-1 text-lg font-semibold">
              One disco ball. Any color.
            </div>
            <div className="mt-1 font-mono text-[8px] uppercase tracking-[0.12em] text-zinc-700">
              Every beat drives the same visual language
            </div>
          </div>

          <div className="grid grid-cols-4 gap-2">
            {COLORS.map((item) => <button key={item.value} type="button" onClick={() => setColor(item)} className={`group relative h-14 rounded-xl border transition ${color.value === item.value ? 'border-white' : 'border-white/10'}`} style={{ background: `radial-gradient(circle at 35% 30%, ${item.hot}, ${item.value} 42%, #09090d 100%)`, boxShadow: color.value === item.value ? `0 0 22px ${item.value}55` : undefined }}><span className="absolute inset-x-0 bottom-1 text-[8px] font-mono uppercase text-white/60">{item.name}</span></button>)}
          </div>

          <div className="mt-7 border-t border-white/[0.07] pt-6"><div className="mb-3 flex items-center justify-between"><span className="font-mono text-[9px] uppercase tracking-[0.16em] text-zinc-600">Beat density</span><span className="font-mono text-[10px] text-zinc-300">1/{beatDivision}</span></div><div className="grid grid-cols-3 gap-2">{[1, 2, 4].map((value) => <button key={value} type="button" onClick={() => setBeatDivision(value)} className={`rounded-lg border py-3 font-mono text-[10px] ${beatDivision === value ? 'border-white bg-white text-black' : 'border-white/10 bg-white/[0.03] text-zinc-500'}`}>1/{value}</button>)}</div></div>

          <div className="mt-7"><div className="mb-3 flex items-center justify-between"><span className="font-mono text-[9px] uppercase tracking-[0.16em] text-zinc-600">Hit intensity</span><span className="font-mono text-[10px] text-zinc-300">{intensity}%</span></div><input className="w-full accent-violet-400" type="range" min="20" max="100" value={intensity} onChange={(e) => setIntensity(Number(e.target.value))} /></div>

          <button type="button" onClick={() => setStrongBeat((v) => !v)} className="mt-6 flex w-full items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3"><span className="font-mono text-[9px] uppercase tracking-[0.14em] text-zinc-400">Strong beats</span><span className={strongBeat ? 'text-emerald-300' : 'text-zinc-600'}>{strongBeat ? 'BOOST' : 'OFF'}</span></button>

          <div className="mt-7 border-t border-white/[0.07] pt-6"><div className="mb-3 flex items-center justify-between"><div><div className="font-mono text-[9px] uppercase tracking-[0.16em] text-zinc-600">Target zones</div><div className="mt-1 text-sm text-zinc-300">{targetLabel}</div></div><button type="button" onClick={() => setSelectedZones(selectedZones.size === zones.length ? new Set() : new Set(zones))} className="font-mono text-[9px] uppercase text-zinc-500 hover:text-white">ALL</button></div><div className="grid grid-cols-4 gap-2">{zones.map((zone) => <button key={zone} type="button" onClick={() => toggleZone(zone)} className={`rounded-lg border py-3 font-mono text-[11px] ${selectedZones.has(zone) ? 'border-white bg-white text-black' : 'border-white/10 bg-white/[0.03] text-zinc-500'}`}>{zone}</button>)}</div></div>

          <div className="mt-7"><div className="mb-3 flex items-center justify-between"><span className="font-mono text-[9px] uppercase tracking-[0.16em] text-zinc-600">Rows</span><button type="button" onClick={() => setSelectedRows(selectedRows.size === rows.length ? new Set() : new Set(rows))} className="font-mono text-[9px] uppercase text-zinc-500 hover:text-white">ALL</button></div><div className="flex flex-wrap gap-2">{rows.map((row) => <button key={row} type="button" onClick={() => toggleRow(row)} className={`min-w-10 rounded-lg border px-3 py-2 font-mono text-[10px] ${selectedRows.has(row) ? 'border-white bg-white text-black' : 'border-white/10 bg-white/[0.03] text-zinc-500'}`}>{row}</button>)}</div></div>

          <div className="mt-7 rounded-xl border border-white/[0.07] bg-black/20 p-4"><div className="flex items-center justify-between"><span className="font-mono text-[9px] uppercase tracking-[0.14em] text-zinc-600">Audience</span><span className="font-mono text-sm text-zinc-300">{stats?.total ?? 0}</span></div><div className="mt-3 flex items-center justify-between"><span className="font-mono text-[9px] uppercase tracking-[0.14em] text-zinc-600">Last light hit</span><span className="font-mono text-[9px] text-emerald-300">{lastSent ? 'SENT' : '—'}</span></div></div>

          {error && <div className="mt-5 rounded-xl border border-red-400/20 bg-red-500/5 p-3 font-mono text-[9px] leading-relaxed text-red-300">{error}</div>}
        </aside>
      </div>
    </main>
  );
}
