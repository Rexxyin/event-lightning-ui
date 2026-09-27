'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

type Action = 'solid' | 'flash' | 'off';

type ZoneStats = {
  total: number;
  rows: Record<string, number>;
};

type Stats = {
  total: number;
  zones: Record<string, ZoneStats>;
};

type CommandResponse = {
  success?: boolean;
  recipients?: number;
  target?: {
    zone: string;
    row?: string;
  };
  command?: {
    action: Action;
    color: string;
    duration: number;
    timestamp: number;
    sequence: number;
  };
  error?: string;
};

const COLORS = [
  { key: 'R', name: 'RED', value: '#FF1744' },
  { key: 'B', name: 'BLUE', value: '#2979FF' },
  { key: 'G', name: 'GREEN', value: '#00E676' },
  { key: 'P', name: 'PURPLE', value: '#D500F9' },
  { key: 'W', name: 'WHITE', value: '#FFFFFF' },
  { key: 'Y', name: 'YELLOW', value: '#FFD600' },
  { key: 'C', name: 'CYAN', value: '#00E5FF' },
];

const DEFAULT_COLOR = COLORS[0];

function sortNatural(a: string, b: string) {
  return a.localeCompare(b, undefined, {
    numeric: true,
    sensitivity: 'base',
  });
}

export default function AdminPage() {
  const [stats, setStats] = useState<Stats | null>(null);

  const [selectedZones, setSelectedZones] = useState<Set<string>>(
    new Set(),
  );

  const [selectedRows, setSelectedRows] = useState<Set<string>>(
    new Set(),
  );

  const [color, setColor] = useState(DEFAULT_COLOR);

  const [action, setAction] = useState<Action>('flash');

  const [duration, setDuration] = useState(500);

  const [loading, setLoading] = useState(true);
  const [firing, setFiring] = useState(false);

  const [lastFire, setLastFire] = useState<{
    recipients: number;
    timestamp: number;
    targetLabel: string;
  } | null>(null);

  const [error, setError] = useState<string | null>(null);

  const lastFireRef = useRef(0);

  /**
   * ------------------------------------------------------------
   * LOAD STATS
   * ------------------------------------------------------------
   */

  const loadStats = useCallback(async () => {
    try {
      const response = await fetch('/api/stats', {
        cache: 'no-store',
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data?.error || 'Unable to load event stats',
        );
      }

      setStats(data);
      setError(null);

      return data as Stats;
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : 'Unable to load event stats';

      setError(message);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStats();

    const interval = window.setInterval(
      loadStats,
      5000,
    );

    return () => {
      window.clearInterval(interval);
    };
  }, [loadStats]);

  /**
   * ------------------------------------------------------------
   * AVAILABLE ZONES / ROWS
   * ------------------------------------------------------------
   */

  const zones = useMemo(() => {
    if (!stats) return [];

    return Object.keys(stats.zones).sort(sortNatural);
  }, [stats]);

  const allRows = useMemo(() => {
    if (!stats) return [];

    const rows = new Set<string>();

    for (const zone of zones) {
      Object.keys(stats.zones[zone]?.rows ?? {}).forEach(
        row => rows.add(row),
      );
    }

    return Array.from(rows).sort(sortNatural);
  }, [stats, zones]);

  /**
   * Keep selections valid when stats change.
   */
  useEffect(() => {
    if (!stats) return;

    setSelectedZones(previous => {
      const next = new Set(
        Array.from(previous).filter(zone =>
          zones.includes(zone),
        ),
      );

      return next;
    });

    setSelectedRows(previous => {
      const next = new Set(
        Array.from(previous).filter(row =>
          allRows.includes(row),
        ),
      );

      return next;
    });
  }, [stats, zones, allRows]);

  /**
   * ------------------------------------------------------------
   * TARGET SELECTION
   * ------------------------------------------------------------
   */

  const selectAllZones = useCallback(() => {
    setSelectedZones(
      previous => {
        if (previous.size === zones.length) {
          return new Set();
        }

        return new Set(zones);
      },
    );
  }, [zones]);

  const toggleZone = useCallback(
    (zone: string) => {
      setSelectedZones(previous => {
        const next = new Set(previous);

        if (next.has(zone)) {
          next.delete(zone);
        } else {
          next.add(zone);
        }

        return next;
      });
    },
    [],
  );

  const clearZones = useCallback(() => {
    setSelectedZones(new Set());
  }, []);

  const toggleRow = useCallback((row: string) => {
    setSelectedRows(previous => {
      const next = new Set(previous);

      if (next.has(row)) {
        next.delete(row);
      } else {
        next.add(row);
      }

      return next;
    });
  }, []);

  const selectAllRows = useCallback(() => {
    setSelectedRows(previous => {
      if (previous.size === allRows.length) {
        return new Set();
      }

      return new Set(allRows);
    });
  }, [allRows]);

  const clearRows = useCallback(() => {
    setSelectedRows(new Set());
  }, []);

  /**
   * ------------------------------------------------------------
   * TARGET DESCRIPTION
   * ------------------------------------------------------------
   */

  const targetLabel = useMemo(() => {
    if (selectedZones.size === 0) {
      return 'NO TARGET';
    }

    const zoneNames = Array.from(selectedZones).sort(
      sortNatural,
    );

    const zoneLabel =
      zoneNames.length === zones.length
        ? 'ALL ZONES'
        : zoneNames.length === 1
          ? `ZONE ${zoneNames[0]}`
          : `${zoneNames.length} ZONES`;

    if (selectedRows.size === 0) {
      return zoneLabel;
    }

    const rowNames = Array.from(selectedRows).sort(
      sortNatural,
    );

    const rowLabel =
      rowNames.length === allRows.length
        ? 'ALL ROWS'
        : rowNames.length === 1
          ? `ROW ${rowNames[0]}`
          : `${rowNames.length} ROWS`;

    return `${zoneLabel} · ${rowLabel}`;
  }, [
    selectedZones,
    selectedRows,
    zones.length,
    allRows.length,
  ]);

  /**
   * ------------------------------------------------------------
   * COMMAND SENDING
   * ------------------------------------------------------------
   */

  const fire = useCallback(
    async (overrideAction?: Action) => {
      if (selectedZones.size === 0) {
        setError('Select at least one zone.');
        return;
      }

      /**
       * Prevent keyboard repeat / accidental double fire.
       *
       * This is deliberately very small because a concert
       * controller needs to remain extremely responsive.
       */
      const now = performance.now();

      if (now - lastFireRef.current < 100) {
        return;
      }

      lastFireRef.current = now;

      setFiring(true);
      setError(null);

      const zonesToFire = Array.from(selectedZones).sort(
        sortNatural,
      );

      const rowsToFire =
        selectedRows.size > 0
          ? Array.from(selectedRows).sort(sortNatural)
          : [undefined];

      try {
        /**
         * Important:
         *
         * We intentionally send commands in parallel.
         *
         * If A + C + D are selected, the browser fires all
         * commands at approximately the same time instead of
         * waiting for A to finish before sending C.
         */
        const requests: Promise<Response>[] = [];

        for (const zone of zonesToFire) {
          for (const row of rowsToFire) {
            requests.push(
              fetch('/api/command', {
                method: 'POST',
                headers: {
                  'Content-Type':
                    'application/json',
                },
                body: JSON.stringify({
                  zone,
                  ...(row
                    ? { row }
                    : {}),
                  action:
                    overrideAction ?? action,
                  color: color.value,
                  duration:
                    overrideAction === 'off'
                      ? 0
                      : duration,
                }),
              }),
            );
          }
        }

        const responses = await Promise.all(
          requests,
        );

        const payloads: CommandResponse[] =
          await Promise.all(
            responses.map(response =>
              response.json(),
            ),
          );

        const failed = payloads.find(
          payload => payload.error,
        );

        if (failed?.error) {
          throw new Error(failed.error);
        }

        const recipients = payloads.reduce(
          (total, payload) =>
            total + (payload.recipients ?? 0),
          0,
        );

        setLastFire({
          recipients,
          timestamp: Date.now(),
          targetLabel,
        });
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : 'Command failed';

        setError(message);
      } finally {
        setFiring(false);
      }
    },
    [
      selectedZones,
      selectedRows,
      action,
      color,
      duration,
      targetLabel,
    ],
  );

  /**
   * ------------------------------------------------------------
   * KEYBOARD CONTROL
   * ------------------------------------------------------------
   *
   * Main show-control interaction:
   *
   * A/B/C/D -> toggle zone
   * 1/2/3... -> toggle row
   * 0 -> all rows
   * R/B/G/P/W/Y/C -> color
   * SPACE -> fire
   * S -> solid
   * X -> off
   * ESC -> clear rows
   *
   * Shift + zone key also toggles zone.
   *
   * This means the operator can keep both hands on the
   * keyboard/controller and fire without reaching for UI.
   */

  useEffect(() => {
    function handleKeyDown(
      event: KeyboardEvent,
    ) {
      const target = event.target as HTMLElement | null;

      /**
       * Never hijack typing inside an input/select.
       */
      if (
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.tagName === 'SELECT' ||
        target?.isContentEditable
      ) {
        return;
      }

      const key = event.key.toLowerCase();

      /**
       * SPACE = FIRE
       */
      if (event.code === 'Space') {
        event.preventDefault();

        if (!event.repeat) {
          void fire();
        }

        return;
      }

      /**
       * ESC = clear rows
       */
      if (event.key === 'Escape') {
        event.preventDefault();
        clearRows();
        return;
      }

      /**
       * ALL ZONES
       */
      if (key === 'a') {
        /**
         * If there is a real zone "A", toggle it.
         *
         * Ctrl/Cmd + A is reserved for selecting all zones.
         */
        if (event.metaKey || event.ctrlKey) {
          event.preventDefault();
          selectAllZones();
          return;
        }

        if (zones.includes('A')) {
          event.preventDefault();
          toggleZone('A');
          return;
        }
      }

      /**
       * B/C/D/E/F/G... zones
       */
      if (/^[a-z]$/.test(key)) {
        const matchingZone = zones.find(
          zone =>
            zone.toLowerCase() === key,
        );

        /**
         * Don't treat color shortcuts as zone shortcuts.
         */
        const isColorShortcut = COLORS.some(
          item =>
            item.key.toLowerCase() === key,
        );

        if (
          matchingZone &&
          !isColorShortcut
        ) {
          event.preventDefault();
          toggleZone(matchingZone);
          return;
        }
      }

      /**
       * Number keys = rows
       *
       * 0 = all rows
       * 1–9 = individual rows
       */
      if (/^[0-9]$/.test(key)) {
        event.preventDefault();

        if (key === '0') {
          selectAllRows();
          return;
        }

        const matchingRow = allRows.find(
          row => row === key,
        );

        if (matchingRow) {
          toggleRow(matchingRow);
        }

        return;
      }

      /**
       * COLOR SHORTCUTS
       */
      const selectedColor = COLORS.find(
        item =>
          item.key.toLowerCase() === key,
      );

      if (selectedColor) {
        event.preventDefault();
        setColor(selectedColor);
        return;
      }

      /**
       * ACTION SHORTCUTS
       */
      if (key === 's') {
        event.preventDefault();
        setAction('solid');
        return;
      }

      if (key === 'x') {
        event.preventDefault();
        setAction('off');
        return;
      }

      /**
       * F = flash
       */
      if (key === 'f') {
        event.preventDefault();
        setAction('flash');
      }
    }

    window.addEventListener(
      'keydown',
      handleKeyDown,
    );

    return () => {
      window.removeEventListener(
        'keydown',
        handleKeyDown,
      );
    };
  }, [
    zones,
    allRows,
    fire,
    toggleZone,
    toggleRow,
    selectAllZones,
    selectAllRows,
    clearRows,
  ]);

  /**
   * ------------------------------------------------------------
   * RENDER
   * ------------------------------------------------------------
   */

  if (loading) {
    return (
      <main className="min-h-screen bg-zinc-950 text-zinc-100">
        <div className="flex min-h-screen items-center justify-center">
          <div className="font-mono text-xs uppercase tracking-[0.18em] text-zinc-500">
            Loading control surface...
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#09090b] text-zinc-100 selection:bg-white selection:text-black">
      <div className="mx-auto flex min-h-screen w-full max-w-[1500px] flex-col">
        {/* --------------------------------------------------- */}
        {/* HEADER */}
        {/* --------------------------------------------------- */}

        <header className="flex min-h-16 items-center justify-between border-b border-zinc-800/80 px-5 md:px-8">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-900 font-mono text-[10px] font-bold">
              LF
            </div>

            <div>
              <div className="text-sm font-semibold tracking-tight">
                LIVE CONTROL
              </div>

              <div className="font-mono text-[9px] uppercase tracking-[0.18em] text-zinc-500">
                Event lighting
              </div>
            </div>
          </div>

          <div className="flex items-center gap-5">
            <div className="hidden text-right sm:block">
              <div className="font-mono text-[9px] uppercase tracking-[0.16em] text-zinc-600">
                Connected
              </div>

              <div className="font-mono text-xs text-zinc-300">
                {stats?.total ?? 0}
              </div>
            </div>

            <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.14em] text-emerald-400">
              <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
              Live
            </div>
          </div>
        </header>

        {/* --------------------------------------------------- */}
        {/* CONTROL AREA */}
        {/* --------------------------------------------------- */}

        <div className="grid flex-1 grid-cols-1 gap-0 lg:grid-cols-[1fr_340px]">
          {/* MAIN CONSOLE */}

          <section className="min-w-0 border-b border-zinc-800/80 lg:border-r lg:border-b-0">
            <div className="space-y-7 p-5 md:p-8">
              {/* TARGET */}

              <section>
                <div className="mb-3 flex items-end justify-between">
                  <div>
                    <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-500">
                      Target
                    </div>

                    <div className="mt-1 text-xl font-semibold tracking-tight">
                      Select audience
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={selectAllZones}
                    className={[
                      'rounded-md border px-3 py-2 font-mono text-[10px] uppercase tracking-[0.12em] transition',
                      selectedZones.size ===
                      zones.length
                        ? 'border-white bg-white text-black'
                        : 'border-zinc-700 bg-zinc-900 text-zinc-400 hover:border-zinc-500 hover:text-white',
                    ].join(' ')}
                  >
                    {selectedZones.size ===
                    zones.length
                      ? 'All armed'
                      : 'All zones'}
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
                  {zones.map(zone => {
                    const selected =
                      selectedZones.has(zone);

                    const zoneStats =
                      stats?.zones?.[zone];

                    return (
                      <button
                        key={zone}
                        type="button"
                        onClick={() =>
                          toggleZone(zone)
                        }
                        aria-pressed={selected}
                        className={[
                          'group relative min-h-[96px] overflow-hidden rounded-xl border text-left transition active:scale-[0.98]',
                          selected
                            ? 'border-white bg-white text-black'
                            : 'border-zinc-800 bg-zinc-900/60 text-zinc-300 hover:border-zinc-600 hover:bg-zinc-900',
                        ].join(' ')}
                      >
                        <div className="absolute right-3 top-3">
                          <span
                            className={[
                              'block h-2.5 w-2.5 rounded-full',
                              selected
                                ? 'bg-black'
                                : 'bg-zinc-700',
                            ].join(' ')}
                          />
                        </div>

                        <div className="p-4">
                          <div className="font-mono text-[10px] uppercase tracking-[0.16em] opacity-60">
                            Zone
                          </div>

                          <div className="mt-1 text-3xl font-semibold tracking-tight">
                            {zone}
                          </div>

                          <div className="mt-2 font-mono text-[9px] uppercase tracking-[0.12em] opacity-50">
                            {zoneStats?.total ?? 0}{' '}
                            devices
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </section>

              {/* ROWS */}

              <section>
                <div className="mb-3 flex items-end justify-between">
                  <div>
                    <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-500">
                      Rows
                    </div>

                    <div className="mt-1 text-sm text-zinc-300">
                      Optional precision targeting
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={selectAllRows}
                    disabled={
                      selectedZones.size === 0
                    }
                    className="font-mono text-[10px] uppercase tracking-[0.12em] text-zinc-500 transition hover:text-white disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    {selectedRows.size ===
                    allRows.length
                      ? 'Clear rows'
                      : 'All rows'}
                  </button>
                </div>

                <div className="flex flex-wrap gap-2">
                  {allRows.map(row => {
                    const selected =
                      selectedRows.has(row);

                    return (
                      <button
                        key={row}
                        type="button"
                        onClick={() =>
                          toggleRow(row)
                        }
                        disabled={
                          selectedZones.size === 0
                        }
                        aria-pressed={selected}
                        className={[
                          'relative flex h-12 min-w-12 items-center justify-center rounded-lg border px-4 font-mono text-sm transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-25',
                          selected
                            ? 'border-white bg-white text-black'
                            : 'border-zinc-800 bg-zinc-900 text-zinc-400 hover:border-zinc-600 hover:text-white',
                        ].join(' ')}
                      >
                        {row}

                        <span className="absolute bottom-1 right-1.5 font-mono text-[7px] opacity-40">
                          {Number(row) <= 9
                            ? row
                            : ''}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>

              {/* COLOR */}

              <section>
                <div className="mb-3">
                  <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-500">
                    Color
                  </div>

                  <div className="mt-1 text-sm text-zinc-300">
                    Press a color key or tap a pad
                  </div>
                </div>

                <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
                  {COLORS.map(item => {
                    const selected =
                      color.key === item.key;

                    return (
                      <button
                        key={item.key}
                        type="button"
                        onClick={() =>
                          setColor(item)
                        }
                        aria-pressed={selected}
                        className={[
                          'group relative flex h-20 flex-col items-center justify-center rounded-xl border transition active:scale-95',
                          selected
                            ? 'border-white bg-zinc-100'
                            : 'border-zinc-800 bg-zinc-900/70 hover:border-zinc-600',
                        ].join(' ')}
                      >
                        <span
                          className="mb-2 h-5 w-5 rounded-full border border-black/20"
                          style={{
                            backgroundColor:
                              item.value,
                          }}
                        />

                        <span
                          className={[
                            'font-mono text-[9px] uppercase tracking-[0.12em]',
                            selected
                              ? 'text-black'
                              : 'text-zinc-500 group-hover:text-zinc-200',
                          ].join(' ')}
                        >
                          {item.name}
                        </span>

                        <span
                          className={[
                            'absolute right-2 top-2 font-mono text-[8px]',
                            selected
                              ? 'text-black/40'
                              : 'text-zinc-700',
                          ].join(' ')}
                        >
                          {item.key}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>

              {/* ACTIONS */}

              <section>
                <div className="mb-3">
                  <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-500">
                    Action
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setAction('flash')
                    }
                    className={[
                      'min-h-[76px] rounded-xl border font-mono text-xs uppercase tracking-[0.16em] transition',
                      action === 'flash'
                        ? 'border-white bg-white text-black'
                        : 'border-zinc-800 bg-zinc-900 text-zinc-400 hover:border-zinc-600 hover:text-white',
                    ].join(' ')}
                  >
                    <span className="block text-lg">
                      FLASH
                    </span>

                    <span className="mt-1 block text-[9px] opacity-50">
                      F
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      setAction('solid')
                    }
                    className={[
                      'min-h-[76px] rounded-xl border font-mono text-xs uppercase tracking-[0.16em] transition',
                      action === 'solid'
                        ? 'border-white bg-white text-black'
                        : 'border-zinc-800 bg-zinc-900 text-zinc-400 hover:border-zinc-600 hover:text-white',
                    ].join(' ')}
                  >
                    <span className="block text-lg">
                      SOLID
                    </span>

                    <span className="mt-1 block text-[9px] opacity-50">
                      S
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      setAction('off')
                    }
                    className={[
                      'min-h-[76px] rounded-xl border font-mono text-xs uppercase tracking-[0.16em] transition',
                      action === 'off'
                        ? 'border-white bg-white text-black'
                        : 'border-zinc-800 bg-zinc-900 text-zinc-400 hover:border-zinc-600 hover:text-white',
                    ].join(' ')}
                  >
                    <span className="block text-lg">
                      OFF
                    </span>

                    <span className="mt-1 block text-[9px] opacity-50">
                      X
                    </span>
                  </button>
                </div>
              </section>
            </div>
          </section>

          {/* ------------------------------------------------ */}
          {/* FIRE DECK */}
          {/* ------------------------------------------------ */}

          <aside className="flex min-h-[420px] flex-col bg-zinc-950">
            <div className="flex-1 p-5 md:p-7">
              <div className="mb-4 font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-600">
                Armed command
              </div>

              <div
                className={[
                  'relative overflow-hidden rounded-2xl border p-5 transition',
                  selectedZones.size > 0
                    ? 'border-zinc-600 bg-zinc-900'
                    : 'border-zinc-800 bg-zinc-900/40',
                ].join(' ')}
              >
                <div className="absolute inset-x-0 top-0 h-px bg-white/20" />

                <div className="flex items-center justify-between">
                  <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-zinc-500">
                    Target
                  </span>

                  <span
                    className={[
                      'font-mono text-[9px] uppercase tracking-[0.16em]',
                      selectedZones.size > 0
                        ? 'text-emerald-400'
                        : 'text-zinc-600',
                    ].join(' ')}
                  >
                    {selectedZones.size > 0
                      ? 'ARMED'
                      : 'EMPTY'}
                  </span>
                </div>

                <div className="mt-3 text-2xl font-semibold tracking-tight">
                  {targetLabel}
                </div>

                <div className="mt-5 flex items-center gap-3">
                  <span
                    className="h-8 w-8 rounded-full border border-white/10"
                    style={{
                      backgroundColor:
                        color.value,
                    }}
                  />

                  <div>
                    <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-300">
                      {color.name}
                    </div>

                    <div className="font-mono text-[9px] text-zinc-600">
                      {color.value}
                    </div>
                  </div>
                </div>

                <div className="mt-4 border-t border-zinc-800 pt-4">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-zinc-600">
                      Action
                    </span>

                    <span className="font-mono text-xs uppercase text-zinc-200">
                      {action}
                    </span>
                  </div>

                  {action === 'flash' && (
                    <div className="mt-2 flex items-center justify-between">
                      <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-zinc-600">
                        Duration
                      </span>

                      <span className="font-mono text-xs text-zinc-300">
                        {duration}ms
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* FIRE */}

              <button
                type="button"
                onClick={() => void fire()}
                disabled={
                  selectedZones.size === 0 ||
                  firing
                }
                className={[
                  'mt-4 flex w-full min-h-[180px] flex-col items-center justify-center rounded-2xl border transition active:scale-[0.985]',
                  selectedZones.size > 0 &&
                  !firing
                    ? 'border-white bg-white text-black hover:bg-zinc-200'
                    : 'cursor-not-allowed border-zinc-800 bg-zinc-900 text-zinc-700',
                ].join(' ')}
              >
                <span className="font-mono text-[10px] uppercase tracking-[0.2em] opacity-50">
                  {firing
                    ? 'Transmitting'
                    : 'Press'}
                </span>

                <span className="mt-2 text-5xl font-semibold tracking-[-0.05em]">
                  SPACE
                </span>

                <span className="mt-3 font-mono text-[9px] uppercase tracking-[0.16em] opacity-50">
                  {firing
                    ? 'Sending command...'
                    : 'Fire command'}
                </span>
              </button>

              {/* DURATION */}

              {action === 'flash' && (
                <div className="mt-5">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-zinc-600">
                      Flash duration
                    </span>

                    <span className="font-mono text-[10px] text-zinc-400">
                      {duration}ms
                    </span>
                  </div>

                  <input
                    type="range"
                    min="50"
                    max="2000"
                    step="50"
                    value={duration}
                    onChange={event =>
                      setDuration(
                        Number(event.target.value),
                      )
                    }
                    className="w-full accent-white"
                  />
                </div>
              )}

              {/* ERROR */}

              {error && (
                <div className="mt-5 rounded-xl border border-red-900/50 bg-red-950/30 p-3 font-mono text-[10px] leading-relaxed text-red-400">
                  {error}
                </div>
              )}
            </div>

            {/* LAST COMMAND */}

            <div className="border-t border-zinc-800/80 p-5 md:p-7">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-zinc-600">
                  Last command
                </span>

                {lastFire && (
                  <span className="font-mono text-[9px] text-emerald-400">
                    SENT
                  </span>
                )}
              </div>

              {lastFire ? (
                <div className="mt-3 flex items-center justify-between">
                  <div>
                    <div className="text-sm text-zinc-300">
                      {lastFire.targetLabel}
                    </div>

                    <div className="mt-1 font-mono text-[9px] uppercase tracking-[0.12em] text-zinc-600">
                      {lastFire.recipients}{' '}
                      recipients
                    </div>
                  </div>

                  <div
                    className="h-5 w-5 rounded-full"
                    style={{
                      backgroundColor:
                        color.value,
                    }}
                  />
                </div>
              ) : (
                <div className="mt-3 font-mono text-[10px] text-zinc-700">
                  Waiting for first command
                </div>
              )}
            </div>
          </aside>
        </div>

        {/* --------------------------------------------------- */}
        {/* KEYBOARD STRIP */}
        {/* --------------------------------------------------- */}

        <footer className="border-t border-zinc-800/80 bg-zinc-950 px-5 py-3 md:px-8">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 font-mono text-[9px] uppercase tracking-[0.12em] text-zinc-600">
            <span>
              <kbd className="text-zinc-300">
                A–Z
              </kbd>{' '}
              zones
            </span>

            <span>
              <kbd className="text-zinc-300">
                1–9
              </kbd>{' '}
              rows
            </span>

            <span>
              <kbd className="text-zinc-300">
                0
              </kbd>{' '}
              all rows
            </span>

            <span>
              <kbd className="text-zinc-300">
                R B G P W Y C
              </kbd>{' '}
              color
            </span>

            <span>
              <kbd className="text-zinc-300">
                F
              </kbd>{' '}
              flash
            </span>

            <span>
              <kbd className="text-zinc-300">
                S
              </kbd>{' '}
              solid
            </span>

            <span>
              <kbd className="text-zinc-300">
                X
              </kbd>{' '}
              off
            </span>

            <span>
              <kbd className="text-zinc-300">
                ESC
              </kbd>{' '}
              clear rows
            </span>

            <span className="ml-auto">
              <kbd className="text-zinc-300">
                SPACE
              </kbd>{' '}
              FIRE
            </span>
          </div>
        </footer>
      </div>
    </main>
  );
}