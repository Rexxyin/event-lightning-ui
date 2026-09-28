'use client';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
const COLORS = [
  { key: 'R', name: 'RED', value: '#FF1744' },
  { key: 'B', name: 'BLUE', value: '#2979FF' },
  { key: 'G', name: 'GREEN', value: '#00E676' },
  { key: 'P', name: 'PURPLE', value: '#D500F9' },
  { key: 'W', name: 'WHITE', value: '#FFFFFF' },
  { key: 'Y', name: 'YELLOW', value: '#FFD600' },
  { key: 'C', name: 'CYAN', value: '#00E5FF' },
];
const PATTERNS = [
  { type: 'pulse', label: 'PULSE', description: 'Center expands and breathes.' },
  { type: 'wave', label: 'WAVE', description: 'Rotating bands sweep the screen.' },
  { type: 'ripple', label: 'RIPPLE', description: 'Concentric rings spread outward.' },
  { type: 'chase', label: 'CHASE', description: 'Directional beams circle the screen.' },
  { type: 'spark', label: 'SPARK', description: 'Fast scattered hits.' },
  { type: 'comet', label: 'COMET', description: 'One bright diagonal sweep.' },
  { type: 'finale', label: 'FINALE', description: 'Dense high-energy radial hit.' },
] as const;
type Action = 'solid' | 'flash' | 'off';
type PatternType = (typeof PATTERNS)[number]['type'];
type ZoneStats = {
  total: number;
  rows: Record<string, number>;
};
type CrowdStats = {
  totalTaps: number;
  tapsLastSecond: number;
  tapsLast5Seconds: number;
  tapsLast10Seconds: number;
  energy: number;
  activeConnections: number;
  updatedAt: number;
};
type Stats = {
  status: string;
  serverTime: number;
  total: number;
  zones: Record<string, ZoneStats>;
  crowd: CrowdStats;
};
type CommandResponse = {
  success?: boolean;
  recipients?: number;
  target?: { zone: string; row?: string };
  command?: {
    action: Action;
    color: string;
    duration: number;
    timestamp: number;
    sequence: number;
    pattern?: {
      type: PatternType;
      intensity: number;
      seed: number;
    };
  };
  error?: string;
};
type LastFire = {
  recipients: number;
  timestamp: number;
  label: string;
  action: Action;
  color: string;
  pattern?: PatternType;
};
const DEFAULT_COLOR = COLORS[0].value;
const DEFAULT_PATTERN: PatternType = 'pulse';
const REQUEST_TIMEOUT_MS = 5000;
function natural(a: string, b: string) {
  return a.localeCompare(b, undefined, {
    numeric: true,
    sensitivity: 'base',
  });
}
function requestWithTimeout(input: RequestInfo | URL, init?: RequestInit) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  return fetch(input, { ...init, signal: controller.signal }).finally(() => {
    window.clearTimeout(timer);
  });
}
export default function AdminPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [selectedZones, setSelectedZones] = useState<Set<string>>(new Set());
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [color, setColor] = useState(DEFAULT_COLOR);
  const [action, setAction] = useState<Action>('flash');
  const [duration, setDuration] = useState(500);
  const [patternType, setPatternType] = useState<PatternType>(DEFAULT_PATTERN);
  const [patternEnabled, setPatternEnabled] = useState(true);
  const [patternIntensity, setPatternIntensity] = useState(0.85);
  const [loading, setLoading] = useState(true);
  const [firing, setFiring] = useState(false);
  const [lastFire, setLastFire] = useState<LastFire | null>(null);
  const [error, setError] = useState<string | null>(null);
  const lastFireRef = useRef(0);
  const zones = useMemo(
    () => Object.keys(stats?.zones ?? {}).sort(natural),
    [stats],
  );
  const rows = useMemo(() => {
    const result = new Set<string>();
    for (const zone of zones) {
      Object.keys(stats?.zones[zone]?.rows ?? {}).forEach(row => result.add(row));
    }
    return [...result].sort(natural);
  }, [stats, zones]);
  const selectedZoneLabel = useMemo(() => {
    if (!selectedZones.size) return 'NO ZONE';
    if (selectedZones.size === zones.length && zones.length) return 'ALL ZONES';
    if (selectedZones.size === 1) return `ZONE ${[...selectedZones][0]}`;
    return `${selectedZones.size} ZONES`;
  }, [selectedZones, zones.length]);
  const targetLabel = useMemo(() => {
    const zoneLabel = selectedZoneLabel;
    if (!selectedRows.size) return zoneLabel;
    if (selectedRows.size === rows.length && rows.length) return `${zoneLabel} · ALL ROWS`;
    if (selectedRows.size === 1) return `${zoneLabel} · ROW ${[...selectedRows][0]}`;
    return `${zoneLabel} · ${selectedRows.size} ROWS`;
  }, [rows.length, selectedRows, selectedZoneLabel]);
  const loadStats = useCallback(async () => {
    try {
      const response = await requestWithTimeout('/api/stats', { cache: 'no-store' });
      const data = (await response.json()) as Stats & { error?: string };
      if (!response.ok) throw new Error(data.error || 'Unable to load event stats');
      setStats(data);
      setError(null);
    } catch (err) {
      setError(
        err instanceof Error && err.name === 'AbortError'
          ? 'Realtime server timed out'
          : err instanceof Error
            ? err.message
            : 'Unable to load event stats',
      );
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void loadStats();
    const id = window.setInterval(() => void loadStats(), 1200);
    return () => window.clearInterval(id);
  }, [loadStats]);
  useEffect(() => {
    if (!zones.length) return;
    setSelectedZones(previous => {
      const valid = new Set([...previous].filter(zone => zones.includes(zone)));
      return valid.size ? valid : new Set(zones);
    });
  }, [zones]);
  useEffect(() => {
    setSelectedRows(previous => new Set([...previous].filter(row => rows.includes(row))));
  }, [rows]);
  const toggleZone = useCallback((zone: string) => {
    setSelectedZones(previous => {
      const next = new Set(previous);
      next.has(zone) ? next.delete(zone) : next.add(zone);
      return next;
    });
  }, []);
  const toggleRow = useCallback((row: string) => {
    setSelectedRows(previous => {
      const next = new Set(previous);
      next.has(row) ? next.delete(row) : next.add(row);
      return next;
    });
  }, []);
  const selectAllZones = useCallback(() => {
    setSelectedZones(previous =>
      previous.size === zones.length ? new Set() : new Set(zones),
    );
  }, [zones]);
  const selectAllRows = useCallback(() => {
    setSelectedRows(previous =>
      previous.size === rows.length ? new Set() : new Set(rows),
    );
  }, [rows]);
  const fire = useCallback(
    async (overrideAction?: Action) => {
      const nextAction = overrideAction ?? action;
      const zonesNow = [...selectedZones].sort(natural);
      if (!zonesNow.length) {
        setError('Select at least one zone.');
        return;
      }
      const now = Date.now();
      if (now - lastFireRef.current < 100) return;
      lastFireRef.current = now;
      setFiring(true);
      setError(null);
      const rowsNow = selectedRows.size
        ? [...selectedRows].sort(natural)
        : [undefined];
      // One global command is the cleanest and lowest-latency path.
      // When rows are selected, commands are sent per zone because the server
      // intentionally treats "all" as all rows too.
      const useGlobal = zonesNow.length === zones.length && rowsNow.length === 1 && !rowsNow[0];
      const targets: Array<{ zone: string; row?: string }> = [];
      if (useGlobal) {
        targets.push({ zone: 'all' });
      } else {
        for (const zone of zonesNow) {
          for (const row of rowsNow) {
            targets.push(row ? { zone, row } : { zone });
          }
        }
      }
      const pattern =
        patternEnabled && nextAction !== 'off'
          ? {
              type: patternType,
              intensity: Math.max(0, Math.min(1, patternIntensity)),
              seed: Math.floor(Math.random() * 1_000_000_000),
            }
          : undefined;
      try {
        const responses = await Promise.all(
          targets.map(target =>
            requestWithTimeout('/api/command', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                ...target,
                action: nextAction,
                color,
                duration: nextAction === 'flash' ? duration : 0,
                ...(pattern ? { pattern } : {}),
              }),
            }).then(async response => {
              const data = (await response.json()) as CommandResponse;
              if (!response.ok) throw new Error(data.error || 'Lighting command failed');
              return data;
            }),
          ),
        );
        const recipientCount = responses.reduce(
          (total, response) => total + Number(response.recipients ?? 0),
          0,
        );
        setLastFire({
          recipients: recipientCount,
          timestamp: Date.now(),
          label: targetLabel,
          action: nextAction,
          color,
          pattern: pattern?.type,
        });
      } catch (err) {
        setError(
          err instanceof Error && err.name === 'AbortError'
            ? 'Realtime server timed out'
            : err instanceof Error
              ? err.message
              : 'Lighting command failed',
        );
      } finally {
        setFiring(false);
      }
    },
    [action, color, duration, patternEnabled, patternIntensity, patternType, selectedRows, selectedZones, targetLabel, zones.length],
  );
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.isContentEditable
      ) {
        return;
      }
      const key = event.key.toUpperCase();
      if (/^[A-Z]$/.test(key)) {
        const zone = zones.find(item => item.toUpperCase() === key);
        if (zone) toggleZone(zone);
        return;
      }
      if (/^[1-9]$/.test(event.key)) {
        const row = rows[Number(event.key) - 1];
        if (row) toggleRow(row);
        return;
      }
      if (event.key === '0') {
        event.preventDefault();
        selectAllRows();
        return;
      }
      const colorMatch = COLORS.find(item => item.key === key);
      if (colorMatch) {
        setColor(colorMatch.value);
        return;
      }
      if (key === 'F') {
        event.preventDefault();
        void fire('flash');
        return;
      }
      if (key === 'S') {
        event.preventDefault();
        void fire('solid');
        return;
      }
      if (key === 'X') {
        event.preventDefault();
        void fire('off');
        return;
      }
      if (event.key === 'Escape') {
        setSelectedRows(new Set());
      }
      if (event.code === 'Space') {
        event.preventDefault();
        void fire();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [fire, rows, selectAllRows, toggleRow, toggleZone, zones]);
  return (
    <main className="min-h-screen bg-[#050505] text-white">
      <div className="mx-auto min-h-screen max-w-[1500px] px-4 py-4 md:px-6 md:py-6">
        <header className="mb-5 flex flex-col gap-3 border-b border-white/10 pb-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-lime-300/60">
              EVENT CONTROL // REALTIME LIGHTING
            </p>
            <h1 className="mt-1 text-2xl font-semibold tracking-[-0.03em] md:text-3xl">
              Show control
            </h1>
          </div>
          <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-wider text-white/40">
            <span className={`h-2 w-2 rounded-full ${error ? 'bg-red-400' : loading ? 'bg-yellow-300' : 'bg-lime-300'}`} />
            {error ? 'LINK ERROR' : loading ? 'CONNECTING' : 'LIVE'}
            <span className="text-white/15">/</span>
            {stats?.total ?? 0} PHONES
          </div>
        </header>
        <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)\_340px]">
          <div className="space-y-4">
            <section className="rounded-2xl border border-white/10 bg-white/[0.025] p-4 md:p-5">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-white/35">TARGETS</p>
                  <div className="mt-1 text-lg font-medium">{targetLabel}</div>
                </div>
                <button
                  type="button"
                  onClick={selectAllZones}
                  className="rounded-lg border border-white/10 px-3 py-2 font-mono text-[10px] uppercase tracking-wider text-white/55 transition hover:border-white/25 hover:text-white"
                >
                  {selectedZones.size === zones.length ? 'CLEAR ZONES' : 'ALL ZONES'}
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {zones.length ? (
                  zones.map(zone => {
                    const selected = selectedZones.has(zone);
                    return (
                      <button
                        key={zone}
                        type="button"
                        onClick={() => toggleZone(zone)}
                        className={`min-w-14 rounded-xl border px-4 py-3 font-mono text-xs font-semibold transition ${
                          selected
                            ? 'border-lime-300/60 bg-lime-300 text-black shadow-[0_0_24px_rgba(190,255,70,0.15)]'
                            : 'border-white/10 bg-black/20 text-white/50 hover:border-white/25 hover:text-white'
                        }`}
                      >
                        {zone}
                      </button>
                    );
                  })
                ) : (
                  <div className="rounded-xl border border-dashed border-white/10 px-4 py-5 font-mono text-[10px] uppercase tracking-wider text-white/25">
                    No audience zones connected yet
                  </div>
                )}
              </div>
              <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
                <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-white/30">ROWS</p>
                <button
                  type="button"
                  onClick={selectAllRows}
                  disabled={!rows.length}
                  className="rounded-lg border border-white/10 px-3 py-2 font-mono text-[10px] uppercase tracking-wider text-white/45 disabled:opacity-30"
                >
                  {selectedRows.size === rows.length && rows.length ? 'CLEAR ROWS' : 'ALL ROWS'}
                </button>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {rows.length ? rows.map(row => (
                  <button
                    key={row}
                    type="button"
                    onClick={() => toggleRow(row)}
                    className={`min-w-12 rounded-lg border px-3 py-2 font-mono text-[11px] transition ${
                      selectedRows.has(row)
                        ? 'border-white/60 bg-white text-black'
                        : 'border-white/10 bg-black/20 text-white/45 hover:border-white/25 hover:text-white'
                    }`}
                  >
                    {row}
                  </button>
                )) : (
                  <span className="font-mono text-[10px] uppercase tracking-wider text-white/20">
                    No row data yet
                  </span>
                )}
              </div>
            </section>
            <section className="rounded-2xl border border-white/10 bg-white/[0.025] p-4 md:p-5">
              <div className="grid gap-5 lg:grid-cols-[1fr\_1fr]">
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-white/30">ACTION</p>
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    {(['flash', 'solid', 'off'] as Action[]).map(item => (
                      <button
                        key={item}
                        type="button"
                        onClick={() => setAction(item)}
                        className={`rounded-xl border py-4 font-mono text-xs font-semibold uppercase tracking-wider transition ${
                          action === item
                            ? item === 'flash'
                              ? 'border-white bg-white text-black'
                              : item === 'solid'
                                ? 'border-lime-300/60 bg-lime-300 text-black'
                                : 'border-red-300/50 bg-red-300/90 text-black'
                            : 'border-white/10 bg-black/20 text-white/45 hover:border-white/25 hover:text-white'
                        }`}
                      >
                        {item}
                      </button>
                    ))}
                  </div>
                  <div className="mt-4">
                    <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-wider text-white/30">
                      <span>Flash duration</span>
                      <span className="text-white/65">{duration}ms</span>
                    </div>
                    <input
                      type="range"
                      min={80}
                      max={1500}
                      step={10}
                      value={duration}
                      onChange={event => setDuration(Number(event.target.value))}
                      className="mt-2 w-full accent-lime-300"
                    />
                  </div>
                </div>
                <div>
                  <div className="flex items-center justify-between">
                    <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-white/30">COLOUR</p>
                    <button
                      type="button"
                      onClick={() => setPatternEnabled(value => !value)}
                      className={`rounded-full border px-2.5 py-1 font-mono text-[9px] uppercase tracking-wider ${
                        patternEnabled ? 'border-lime-300/40 text-lime-300' : 'border-white/10 text-white/25'
                      }`}
                    >
                      Pattern {patternEnabled ? 'ON' : 'OFF'}
                    </button>
                  </div>
                  <div className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-7">
                    {COLORS.map(item => (
                      <button
                        key={item.key}
                        type="button"
                        aria-label={item.name}
                        onClick={() => setColor(item.value)}
                        className={`group flex aspect-square items-center justify-center rounded-xl border transition ${
                          color === item.value ? 'border-white/80' : 'border-white/10'
                        }`}
                        style={{ background: item.value, boxShadow: color === item.value ? `0 0 28px ${item.value}55` : undefined }}
                      >
                        <span className={`font-mono text-[9px] font-bold ${item.key === 'W' ? 'text-black' : 'text-white'}`}>
                          {item.key}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </section>
            {patternEnabled && (
              <section className="rounded-2xl border border-white/10 bg-white/[0.025] p-4 md:p-5">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-white/30">PATTERN</p>
                    <h2 className="mt-1 text-lg font-medium">What should appear on the audience screens?</h2>
                  </div>
                  <div className="font-mono text-[10px] uppercase tracking-wider text-lime-300/70">
                    {patternType.toUpperCase()}
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-7">
                  {PATTERNS.map(pattern => (
                    <button
                      key={pattern.type}
                      type="button"
                      onClick={() => setPatternType(pattern.type)}
                      className={`min-h-24 rounded-xl border p-3 text-left transition ${
                        patternType === pattern.type
                          ? 'border-lime-300/50 bg-lime-300/[0.08]'
                          : 'border-white/10 bg-black/20 hover:border-white/25'
                      }`}
                    >
                      <div className="font-mono text-[10px] font-semibold tracking-wider text-white/80">
                        {pattern.label}
                      </div>
                      <div className="mt-2 text-[10px] leading-4 text-white/30">
                        {pattern.description}
                      </div>
                    </button>
                  ))}
                </div>
                <div className="mt-5">
                  <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-wider text-white/30">
                    <span>Intensity</span>
                    <span className="text-lime-300/75">{Math.round(patternIntensity * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min={0.2}
                    max={1}
                    step={0.05}
                    value={patternIntensity}
                    onChange={event => setPatternIntensity(Number(event.target.value))}
                    className="mt-2 w-full accent-lime-300"
                  />
                </div>
              </section>
            )}
            {error && (
              <div className="rounded-xl border border-red-300/20 bg-red-300/[0.06] px-4 py-3 font-mono text-[10px] uppercase tracking-wider text-red-200/80">
                {error}
              </div>
            )}
            {lastFire && (
              <div className="rounded-xl border border-lime-300/20 bg-lime-300/[0.04] px-4 py-3">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[10px] uppercase tracking-wider text-white/55">
                  <span className="text-lime-300">COMMAND SENT</span>
                  <span>{lastFire.label}</span>
                  <span>{lastFire.action}</span>
                  <span>{lastFire.color}</span>
                  {lastFire.pattern && <span>{lastFire.pattern}</span>}
                  <span>{lastFire.recipients} RECIPIENTS</span>
                </div>
              </div>
            )}
          </div>
          <aside className="space-y-4">
            <section className="rounded-2xl border border-white/10 bg-white/[0.025] p-4">
              <div className="flex items-center justify-between">
                <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-white/30">CROWD ENERGY</p>
                <span className="font-mono text-[10px] text-lime-300">{Math.round(stats?.crowd.energy ?? 0)}%</span>
              </div>
              <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/5">
                <div
                  className="h-full rounded-full bg-lime-300 transition-[width] duration-200"
                  style={{ width: `${Math.max(0, Math.min(100, stats?.crowd.energy ?? 0))}%` }}
                />
              </div>
              <div className="mt-5 grid grid-cols-2 gap-2">
                <Metric label="TAPS / SEC" value={stats?.crowd.tapsLastSecond ?? 0} />
                <Metric label="CONNECTED" value={stats?.crowd.activeConnections ?? stats?.total ?? 0} />
                <Metric label="5 SEC" value={stats?.crowd.tapsLast5Seconds ?? 0} />
                <Metric label="TOTAL" value={stats?.crowd.totalTaps ?? 0} />
              </div>
            </section>
            <section className="rounded-2xl border border-white/10 bg-white/[0.025] p-4">
              <div className="grid gap-2">
                <button
                  type="button"
                  disabled={firing || !selectedZones.size}
                  onClick={() => void fire()}
                  className="rounded-2xl bg-lime-300 px-5 py-5 text-center font-mono text-sm font-bold uppercase tracking-[0.18em] text-black shadow-[0_0_40px_rgba(190,255,70,0.12)] transition hover:bg-lime-200 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {firing ? 'SENDING…' : 'FIRE SHOW'}
                </button>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => void fire('flash')}
                    disabled={firing || !selectedZones.size}
                    className="rounded-xl border border-white/10 bg-black/20 py-3 font-mono text-[10px] uppercase tracking-wider text-white/55 hover:border-white/25 hover:text-white disabled:opacity-30"
                  >
                    FLASH
                  </button>
                  <button
                    type="button"
                    onClick={() => void fire('solid')}
                    disabled={firing || !selectedZones.size}
                    className="rounded-xl border border-white/10 bg-black/20 py-3 font-mono text-[10px] uppercase tracking-wider text-white/55 hover:border-white/25 hover:text-white disabled:opacity-30"
                  >
                    SOLID
                  </button>
                  <button
                    type="button"
                    onClick={() => void fire('off')}
                    disabled={firing || !selectedZones.size}
                    className="rounded-xl border border-white/10 bg-black/20 py-3 font-mono text-[10px] uppercase tracking-wider text-white/55 hover:border-red-300/25 hover:text-red-200 disabled:opacity-30"
                  >
                    OFF
                  </button>
                </div>
              </div>
            </section>
            <section className="rounded-2xl border border-white/10 bg-white/[0.025] p-4">
              <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-white/30">LIVE ZONE MAP</p>
              <div className="mt-3 space-y-2">
                {zones.length ? zones.map(zone => (
                  <div key={zone} className="flex items-center justify-between rounded-lg border border-white/5 bg-black/20 px-3 py-2">
                    <span className="font-mono text-[10px] uppercase tracking-wider text-white/55">ZONE {zone}</span>
                    <span className="font-mono text-[10px] text-white/30">{stats?.zones[zone]?.total ?? 0}</span>
                  </div>
                )) : (
                  <div className="font-mono text-[10px] uppercase tracking-wider text-white/20">Waiting for audience…</div>
                )}
              </div>
            </section>
            <section className="rounded-2xl border border-white/10 bg-white/[0.025] p-4">
              <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-white/30">KEYS</p>
              <div className="mt-3 grid grid-cols-2 gap-2 font-mono text-[9px] uppercase tracking-wider text-white/35">
                <Key label="A-Z" text="toggle zone" />
                <Key label="1-9" text="toggle row" />
                <Key label="0" text="all rows" />
                <Key label="F" text="flash" />
                <Key label="S" text="solid" />
                <Key label="X" text="off" />
                <Key label="SPACE" text="fire" />
                <Key label="ESC" text="clear rows" />
              </div>
            </section>
          </aside>
        </section>
      </div>
    </main>
  );
}
function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-white/5 bg-black/20 p-3">
      <div className="font-mono text-[9px] uppercase tracking-wider text-white/25">{label}</div>
      <div className="mt-1 text-xl font-semibold tracking-tight">{value}</div>
    </div>
  );
}
function Key({ label, text }: { label: string; text: string }) {
  return (
    <div className="rounded-lg border border-white/5 bg-black/15 p-2">
      <div className="text-white/55">{label}</div>
      <div className="mt-1 text-white/25">{text}</div>
    </div>
  );
}