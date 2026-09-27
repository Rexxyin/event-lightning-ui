'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  Activity,
  ChevronDown,
  ChevronRight,
  Circle,
  Command,
  Eye,
  Flashlight,
  Globe2,
  Loader2,
  Radio,
  RefreshCw,
  Send,
  Users,
  Wifi,
  WifiOff,
  Zap,
} from 'lucide-react';

type LightAction = 'solid' | 'flash' | 'off';

type ZoneStats = {
  total: number;
  rows: Record<string, number>;
};

type Stats = {
  total: number;
  zones: Record<string, ZoneStats>;
};

type Target = {
  zone: string;
  row?: string;
};

type CommandResult = {
  success: boolean;
  recipients: number;
  target: Target;
  command: {
    type: 'command';
    action: LightAction;
    color: string;
    duration: number;
    timestamp: number;
    sequence: number;
  };
};

const COLORS = [
  { name: 'White', value: '#FFFFFF' },
  { name: 'Red', value: '#FF3B30' },
  { name: 'Orange', value: '#FF9500' },
  { name: 'Yellow', value: '#FFD60A' },
  { name: 'Green', value: '#30D158' },
  { name: 'Cyan', value: '#64D2FF' },
  { name: 'Blue', value: '#0A84FF' },
  { name: 'Purple', value: '#BF5AF2' },
  { name: 'Pink', value: '#FF375F' },
];

const POLL_INTERVAL = 3000;

export default function AdminPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [statsError, setStatsError] = useState(false);
  const [loadingStats, setLoadingStats] = useState(true);

  const [target, setTarget] = useState<Target>({
    zone: 'all',
  });

  const [expandedZones, setExpandedZones] = useState<
    Record<string, boolean>
  >({});

  const [color, setColor] = useState('#FFFFFF');
  const [action, setAction] =
    useState<LightAction>('solid');

  const [duration, setDuration] = useState(500);

  const [sending, setSending] = useState(false);
  const [lastCommand, setLastCommand] =
    useState<CommandResult | null>(null);

  const [customColor, setCustomColor] =
    useState('#FFFFFF');

  const fetchStats = useCallback(async () => {
    try {
      const response = await fetch('/api/stats', {
        cache: 'no-store',
      });

      if (!response.ok) {
        throw new Error('Failed to fetch stats');
      }

      const data = (await response.json()) as Stats;

      setStats(data);
      setStatsError(false);
    } catch {
      setStatsError(true);
    } finally {
      setLoadingStats(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();

    const interval = window.setInterval(
      fetchStats,
      POLL_INTERVAL,
    );

    return () => {
      window.clearInterval(interval);
    };
  }, [fetchStats]);

  const zones = useMemo(() => {
    if (!stats) return [];

    return Object.entries(stats.zones).sort(
      ([a], [b]) => a.localeCompare(b),
    );
  }, [stats]);

  const selectedAudience = useMemo(() => {
    if (!stats) return 0;

    if (target.zone === 'all') {
      return stats.total;
    }

    const zone = stats.zones[target.zone];

    if (!zone) return 0;

    if (!target.row) {
      return zone.total;
    }

    return zone.rows[target.row] ?? 0;
  }, [stats, target]);

  const targetLabel = useMemo(() => {
    if (target.zone === 'all') {
      return 'Everyone';
    }

    if (target.row) {
      return `${target.zone} / Row ${target.row}`;
    }

    return `Zone ${target.zone}`;
  }, [target]);

  const toggleZone = (zone: string) => {
    setExpandedZones((current) => ({
      ...current,
      [zone]: !current[zone],
    }));
  };

  const selectZone = (zone: string) => {
    setTarget({
      zone,
    });
  };

  const selectRow = (
    zone: string,
    row: string,
  ) => {
    setTarget({
      zone,
      row,
    });
  };

  const selectGlobal = () => {
    setTarget({
      zone: 'all',
    });
  };

  const selectColor = (value: string) => {
    setColor(value);
    setCustomColor(value);
  };

  const sendCommand = async (
    nextAction: LightAction = action,
    nextColor = color,
    nextDuration = duration,
  ) => {
    if (sending) return;

    setSending(true);

    try {
      const response = await fetch(
        '/api/command',
        {
          method: 'POST',
          headers: {
            'Content-Type':
              'application/json',
          },
          body: JSON.stringify({
            zone: target.zone,
            ...(target.row
              ? { row: target.row }
              : {}),
            action: nextAction,
            color: nextColor,
            duration:
              nextAction === 'flash'
                ? nextDuration
                : 0,
          }),
        },
      );

      const data =
        (await response.json()) as CommandResult;

      if (!response.ok) {
        throw new Error(
          'Failed to send command',
        );
      }

      setLastCommand(data);
    } catch (error) {
      console.error(
        '[Admin] command failed',
        error,
      );
    } finally {
      setSending(false);
    }
  };

  const blackout = () => {
    void sendCommand(
      'off',
      '#000000',
      0,
    );
  };

  return (
    <main className="min-h-screen bg-[#09090b] text-zinc-100">
      {/* Ambient background */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute left-1/2 top-[-300px] h-[600px] w-[800px] -translate-x-1/2 rounded-full bg-white/[0.025] blur-[140px]" />

        <div className="absolute bottom-[-300px] right-[-200px] h-[500px] w-[500px] rounded-full bg-violet-500/[0.025] blur-[140px]" />
      </div>

      <div className="relative mx-auto min-h-screen max-w-[1600px] px-4 py-4 sm:px-6 lg:px-8">
        {/* ------------------------------------------------ */}
        {/* Header */}
        {/* ------------------------------------------------ */}

        <header className="mb-4 flex flex-col gap-4 border-b border-white/[0.07] pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.04]">
              <Flashlight
                size={19}
                strokeWidth={1.7}
              />
            </div>

            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-sm font-semibold tracking-tight">
                  Event Lighting
                </h1>

                <span className="rounded-md border border-white/[0.08] bg-white/[0.035] px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.12em] text-zinc-500">
                  Control
                </span>
              </div>

              <p className="mt-0.5 text-[11px] text-zinc-500">
                Live audience light control
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div
              className={`flex items-center gap-2 rounded-full border px-3 py-1.5 ${
                statsError
                  ? 'border-red-500/20 bg-red-500/[0.06] text-red-400'
                  : 'border-emerald-500/20 bg-emerald-500/[0.05] text-emerald-400'
              }`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  statsError
                    ? 'bg-red-400'
                    : 'bg-emerald-400'
                }`}
              />

              <span className="font-mono text-[10px] uppercase tracking-[0.12em]">
                {statsError
                  ? 'Offline'
                  : 'Live'}
              </span>
            </div>

            <div className="flex items-center gap-2 rounded-full border border-white/[0.07] bg-white/[0.025] px-3 py-1.5 text-zinc-400">
              <Users size={12} />

              <span className="font-mono text-[10px]">
                {stats?.total ?? 0}
              </span>

              <span className="text-[10px] text-zinc-600">
                connected
              </span>
            </div>

            <button
              onClick={fetchStats}
              disabled={loadingStats}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/[0.07] bg-white/[0.025] text-zinc-500 transition hover:border-white/[0.12] hover:bg-white/[0.05] hover:text-zinc-200 disabled:opacity-50"
              aria-label="Refresh audience"
            >
              <RefreshCw
                size={13}
                className={
                  loadingStats
                    ? 'animate-spin'
                    : ''
                }
              />
            </button>
          </div>
        </header>

        {/* ------------------------------------------------ */}
        {/* Main grid */}
        {/* ------------------------------------------------ */}

        <div className="grid gap-4 lg:grid-cols-[250px_minmax(0,1fr)_260px]">
          {/* ================================================= */}
          {/* TARGET */}
          {/* ================================================= */}

          <section className="rounded-2xl border border-white/[0.07] bg-white/[0.018]">
            <div className="border-b border-white/[0.06] px-4 py-3">
              <div className="flex items-center gap-2">
                <Globe2
                  size={13}
                  className="text-zinc-500"
                />

                <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-400">
                  Target
                </span>
              </div>
            </div>

            <div className="p-2">
              {/* Global */}

              <button
                onClick={selectGlobal}
                className={`group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition ${
                  target.zone === 'all'
                    ? 'bg-white/[0.07] text-white'
                    : 'text-zinc-500 hover:bg-white/[0.035] hover:text-zinc-200'
                }`}
              >
                <span
                  className={`flex h-7 w-7 items-center justify-center rounded-lg border ${
                    target.zone === 'all'
                      ? 'border-white/10 bg-white/[0.08]'
                      : 'border-white/[0.06] bg-white/[0.025]'
                  }`}
                >
                  <Globe2 size={13} />
                </span>

                <span className="flex-1">
                  <span className="block text-xs font-medium">
                    Global
                  </span>

                  <span className="mt-0.5 block font-mono text-[9px] text-zinc-600">
                    {stats?.total ?? 0} devices
                  </span>
                </span>

                {target.zone ===
                  'all' && (
                  <Circle
                    size={7}
                    fill="currentColor"
                    className="text-white"
                  />
                )}
              </button>

              {/* Dynamic zones */}

              <div className="mt-1 space-y-0.5">
                {loadingStats &&
                  !stats && (
                    <div className="px-3 py-8 text-center">
                      <Loader2
                        size={15}
                        className="mx-auto animate-spin text-zinc-700"
                      />
                    </div>
                  )}

                {!loadingStats &&
                  zones.length === 0 && (
                    <div className="px-3 py-8 text-center">
                      <WifiOff
                        size={16}
                        className="mx-auto mb-2 text-zinc-700"
                      />

                      <p className="text-[10px] text-zinc-600">
                        No zones connected
                      </p>
                    </div>
                  )}

                {zones.map(
                  ([zone, zoneData]) => {
                    const expanded =
                      expandedZones[
                        zone
                      ] ?? false;

                    const zoneSelected =
                      target.zone === zone &&
                      !target.row;

                    return (
                      <div key={zone}>
                        <div className="flex items-center">
                          <button
                            onClick={() =>
                              toggleZone(
                                zone,
                              )
                            }
                            className="flex h-8 w-7 items-center justify-center text-zinc-600 hover:text-zinc-300"
                            aria-label={`Toggle ${zone}`}
                          >
                            {expanded ? (
                              <ChevronDown
                                size={13}
                              />
                            ) : (
                              <ChevronRight
                                size={13}
                              />
                            )}
                          </button>

                          <button
                            onClick={() =>
                              selectZone(
                                zone,
                              )
                            }
                            className={`flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-2 text-left transition ${
                              zoneSelected
                                ? 'bg-white/[0.07] text-white'
                                : 'text-zinc-400 hover:bg-white/[0.035] hover:text-zinc-200'
                            }`}
                          >
                            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-white/[0.06] bg-white/[0.025] font-mono text-[9px] font-medium uppercase">
                              {zone.slice(
                                0,
                                2,
                              )}
                            </span>

                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-[11px] font-medium">
                                {zone}
                              </span>

                              <span className="block font-mono text-[9px] text-zinc-600">
                                {
                                  zoneData.total
                                }{' '}
                                devices
                              </span>
                            </span>

                            {zoneSelected && (
                              <Circle
                                size={7}
                                fill="currentColor"
                                className="shrink-0 text-white"
                              />
                            )}
                          </button>
                        </div>

                        {/* Rows */}

                        {expanded && (
                          <div className="ml-7 border-l border-white/[0.06] pl-2">
                            {Object.entries(
                              zoneData.rows,
                            )
                              .sort(
                                (
                                  [a],
                                  [b],
                                ) =>
                                  a.localeCompare(
                                    b,
                                    undefined,
                                    {
                                      numeric:
                                        true,
                                    },
                                  ),
                              )
                              .map(
                                ([
                                  row,
                                  count,
                                ]) => {
                                  const selected =
                                    target.zone ===
                                      zone &&
                                    target.row ===
                                      row;

                                  return (
                                    <button
                                      key={
                                        row
                                      }
                                      onClick={() =>
                                        selectRow(
                                          zone,
                                          row,
                                        )
                                      }
                                      className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left transition ${
                                        selected
                                          ? 'bg-white/[0.07] text-white'
                                          : 'text-zinc-500 hover:bg-white/[0.035] hover:text-zinc-300'
                                      }`}
                                    >
                                      <span className="font-mono text-[9px] text-zinc-700">
                                        /
                                      </span>

                                      <span className="flex-1 text-[10px]">
                                        Row{' '}
                                        {row}
                                      </span>

                                      <span className="font-mono text-[9px] text-zinc-700">
                                        {
                                          count
                                        }
                                      </span>
                                    </button>
                                  );
                                },
                              )}
                          </div>
                        )}
                      </div>
                    );
                  },
                )}
              </div>
            </div>
          </section>

          {/* ================================================= */}
          {/* CONTROL */}
          {/* ================================================= */}

          <section className="min-w-0 rounded-2xl border border-white/[0.07] bg-white/[0.018]">
            {/* Target bar */}

            <div className="flex flex-col gap-3 border-b border-white/[0.06] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <Command
                    size={13}
                    className="text-zinc-500"
                  />

                  <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-400">
                    Live Control
                  </span>
                </div>

                <div className="mt-1 flex items-center gap-2">
                  <span className="text-xs text-white">
                    {targetLabel}
                  </span>

                  <span className="font-mono text-[9px] text-zinc-600">
                    {selectedAudience}{' '}
                    audience
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2 rounded-lg border border-white/[0.06] bg-black/20 px-2.5 py-1.5">
                <Radio
                  size={11}
                  className="text-emerald-400"
                />

                <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-zinc-500">
                  Ready
                </span>
              </div>
            </div>

            <div className="p-4">
              {/* Preview */}

              <div className="relative mb-4 overflow-hidden rounded-2xl border border-white/[0.07] bg-[#050506]">
                <div
                  className="absolute inset-0 opacity-20 blur-3xl transition-all duration-500"
                  style={{
                    backgroundColor:
                      color,
                  }}
                />

                <div className="relative flex min-h-[250px] flex-col items-center justify-center">
                  <div
                    className="relative flex h-28 w-28 items-center justify-center rounded-full transition-all duration-500"
                    style={{
                      backgroundColor:
                        color,
                      boxShadow: `0 0 80px ${color}30, 0 0 25px ${color}35`,
                    }}
                  >
                    <div className="absolute inset-2 rounded-full border border-white/20" />

                    <Zap
                      size={24}
                      strokeWidth={1.4}
                      className="text-black/60"
                    />
                  </div>

                  <div className="mt-6 text-center">
                    <p className="text-[10px] uppercase tracking-[0.18em] text-zinc-600">
                      Preview
                    </p>

                    <p className="mt-1 font-mono text-[10px] text-zinc-500">
                      {color.toUpperCase()}
                    </p>
                  </div>
                </div>

                <div className="absolute left-3 top-3 flex items-center gap-1.5 rounded-md border border-white/[0.06] bg-black/40 px-2 py-1 backdrop-blur">
                  <Eye
                    size={10}
                    className="text-zinc-600"
                  />

                  <span className="font-mono text-[8px] uppercase tracking-[0.12em] text-zinc-600">
                    Audience preview
                  </span>
                </div>
              </div>

              {/* Colors */}

              <div className="mb-5">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-[10px] font-medium uppercase tracking-[0.12em] text-zinc-500">
                    Color
                  </span>

                  <span className="font-mono text-[9px] text-zinc-700">
                    {color.toUpperCase()}
                  </span>
                </div>

                <div className="grid grid-cols-5 gap-2 sm:grid-cols-9">
                  {COLORS.map(
                    (item) => {
                      const selected =
                        color.toUpperCase() ===
                        item.value;

                      return (
                        <button
                          key={
                            item.value
                          }
                          onClick={() =>
                            selectColor(
                              item.value,
                            )
                          }
                          title={
                            item.name
                          }
                          className={`group relative flex h-9 items-center justify-center rounded-lg border transition ${
                            selected
                              ? 'border-white/30 bg-white/[0.08]'
                              : 'border-white/[0.06] bg-white/[0.02] hover:border-white/[0.12] hover:bg-white/[0.04]'
                          }`}
                        >
                          <span
                            className="h-4 w-4 rounded-full"
                            style={{
                              backgroundColor:
                                item.value,
                              boxShadow: `0 0 12px ${item.value}55`,
                            }}
                          />

                          {selected && (
                            <span className="absolute inset-0 rounded-lg ring-1 ring-white/20" />
                          )}
                        </button>
                      );
                    },
                  )}
                </div>

                <div className="mt-2 flex items-center gap-2">
                  <input
                    type="color"
                    value={customColor}
                    onChange={(event) => {
                      const value =
                        event.target
                          .value
                          .toUpperCase();

                      setCustomColor(
                        value,
                      );
                      setColor(value);
                    }}
                    className="h-8 w-10 cursor-pointer rounded-md border border-white/[0.07] bg-transparent p-0.5"
                  />

                  <input
                    value={customColor}
                    onChange={(event) => {
                      let value =
                        event.target.value;

                      if (
                        !value.startsWith(
                          '#',
                        )
                      ) {
                        value = `#${value}`;
                      }

                      setCustomColor(
                        value,
                      );

                      if (
                        /^#[0-9A-Fa-f]{6}$/.test(
                          value,
                        )
                      ) {
                        setColor(
                          value.toUpperCase(),
                        );
                      }
                    }}
                    className="h-8 w-28 rounded-md border border-white/[0.07] bg-black/20 px-2.5 font-mono text-[10px] text-zinc-300 outline-none placeholder:text-zinc-700 focus:border-white/15"
                    placeholder="#FFFFFF"
                  />
                </div>
              </div>

              {/* Effects */}

              <div className="mb-5">
                <div className="mb-2 text-[10px] font-medium uppercase tracking-[0.12em] text-zinc-500">
                  Effect
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() =>
                      setAction(
                        'solid',
                      )
                    }
                    className={`rounded-xl border px-3 py-3 text-left transition ${
                      action ===
                      'solid'
                        ? 'border-white/15 bg-white/[0.08] text-white'
                        : 'border-white/[0.06] bg-white/[0.02] text-zinc-500 hover:bg-white/[0.04] hover:text-zinc-300'
                    }`}
                  >
                    <div className="mb-1 text-xs font-medium">
                      Solid
                    </div>

                    <div className="text-[9px] text-zinc-600">
                      Hold selected
                      color
                    </div>
                  </button>

                  <button
                    onClick={() =>
                      setAction(
                        'flash',
                      )
                    }
                    className={`rounded-xl border px-3 py-3 text-left transition ${
                      action ===
                      'flash'
                        ? 'border-white/15 bg-white/[0.08] text-white'
                        : 'border-white/[0.06] bg-white/[0.02] text-zinc-500 hover:bg-white/[0.04] hover:text-zinc-300'
                    }`}
                  >
                    <div className="mb-1 text-xs font-medium">
                      Flash
                    </div>

                    <div className="text-[9px] text-zinc-600">
                      Pulse selected
                      color
                    </div>
                  </button>
                </div>
              </div>

              {/* Duration */}

              {action ===
                'flash' && (
                <div className="mb-5 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
                  <div className="mb-3 flex items-center justify-between">
                    <span className="text-[10px] uppercase tracking-[0.1em] text-zinc-500">
                      Flash duration
                    </span>

                    <span className="font-mono text-[10px] text-zinc-300">
                      {duration}ms
                    </span>
                  </div>

                  <input
                    type="range"
                    min="50"
                    max="2000"
                    step="50"
                    value={duration}
                    onChange={(
                      event,
                    ) =>
                      setDuration(
                        Number(
                          event.target
                            .value,
                        ),
                      )
                    }
                    className="w-full accent-white"
                  />

                  <div className="mt-1 flex justify-between font-mono text-[8px] text-zinc-700">
                    <span>
                      50ms
                    </span>
                    <span>
                      2000ms
                    </span>
                  </div>
                </div>
              )}

              {/* Actions */}

              <div className="grid grid-cols-[1fr_auto] gap-2">
                <button
                  onClick={() =>
                    void sendCommand()
                  }
                  disabled={
                    sending ||
                    selectedAudience ===
                      0
                  }
                  className="group flex h-11 items-center justify-center gap-2 rounded-xl bg-white px-4 text-xs font-semibold text-black transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {sending ? (
                    <Loader2
                      size={14}
                      className="animate-spin"
                    />
                  ) : (
                    <Send size={14} />
                  )}

                  {sending
                    ? 'Sending...'
                    : `Send to ${targetLabel}`}
                </button>

                <button
                  onClick={blackout}
                  disabled={sending}
                  className="flex h-11 items-center justify-center gap-2 rounded-xl border border-red-500/15 bg-red-500/[0.05] px-4 text-xs font-medium text-red-400 transition hover:border-red-500/25 hover:bg-red-500/[0.09] disabled:opacity-40"
                >
                  <Circle
                    size={10}
                    fill="currentColor"
                  />

                  Off
                </button>
              </div>
            </div>
          </section>

          {/* ================================================= */}
          {/* AUDIENCE */}
          {/* ================================================= */}

          <section className="rounded-2xl border border-white/[0.07] bg-white/[0.018]">
            <div className="border-b border-white/[0.06] px-4 py-3">
              <div className="flex items-center gap-2">
                <Activity
                  size={13}
                  className="text-zinc-500"
                />

                <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-400">
                  Audience
                </span>
              </div>
            </div>

            <div className="p-4">
              {/* Total */}

              <div className="mb-5">
                <div className="flex items-end justify-between">
                  <div>
                    <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-zinc-600">
                      Connected
                    </p>

                    <p className="mt-1 text-4xl font-light tracking-[-0.04em] text-white">
                      {stats?.total ??
                        0}
                    </p>
                  </div>

                  <Wifi
                    size={16}
                    className="mb-2 text-emerald-400"
                  />
                </div>

                <div className="mt-3 h-px bg-white/[0.06]" />
              </div>

              {/* Zone stats */}

              <div className="space-y-2">
                {zones.map(
                  ([
                    zone,
                    zoneData,
                  ]) => {
                    const percentage =
                      stats?.total
                        ? Math.round(
                            (zoneData.total /
                              stats.total) *
                              100,
                          )
                        : 0;

                    return (
                      <div
                        key={zone}
                        className="rounded-xl border border-white/[0.05] bg-black/10 p-3"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />

                            <span className="text-xs font-medium text-zinc-300">
                              {zone}
                            </span>
                          </div>

                          <span className="font-mono text-[10px] text-zinc-500">
                            {
                              zoneData.total
                            }
                          </span>
                        </div>

                        <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/[0.05]">
                          <div
                            className="h-full rounded-full bg-white/50 transition-all duration-500"
                            style={{
                              width: `${percentage}%`,
                            }}
                          />
                        </div>

                        <div className="mt-2 flex items-center justify-between">
                          <span className="font-mono text-[8px] text-zinc-700">
                            {
                              Object.keys(
                                zoneData.rows,
                              ).length
                            }{' '}
                            rows
                          </span>

                          <span className="font-mono text-[8px] text-zinc-700">
                            {percentage}%
                          </span>
                        </div>
                      </div>
                    );
                  },
                )}
              </div>

              {/* Last command */}

              <div className="mt-5 border-t border-white/[0.06] pt-4">
                <div className="mb-2 flex items-center gap-2">
                  <Zap
                    size={11}
                    className="text-zinc-600"
                  />

                  <span className="text-[9px] font-medium uppercase tracking-[0.12em] text-zinc-600">
                    Last command
                  </span>
                </div>

                {lastCommand ? (
                  <div className="rounded-xl border border-white/[0.05] bg-black/15 p-3">
                    <div className="flex items-center gap-2">
                      <span
                        className="h-4 w-4 rounded-full border border-white/10"
                        style={{
                          backgroundColor:
                            lastCommand
                              .command
                              .color,
                        }}
                      />

                      <span className="text-[10px] font-medium text-zinc-300">
                        {lastCommand
                          .command
                          .action
                          .toUpperCase()}
                      </span>

                      <span className="ml-auto font-mono text-[9px] text-zinc-600">
                        #
                        {
                          lastCommand
                            .command
                            .sequence
                        }
                      </span>
                    </div>

                    <div className="mt-2 font-mono text-[9px] text-zinc-600">
                      {lastCommand
                        .target
                        .zone ===
                      'all'
                        ? 'GLOBAL'
                        : lastCommand
                            .target
                            .row
                          ? `${lastCommand.target.zone} / ROW ${lastCommand.target.row}`
                          : `ZONE ${lastCommand.target.zone}`}
                    </div>

                    <div className="mt-1 font-mono text-[9px] text-zinc-700">
                      {
                        lastCommand.recipients
                      }{' '}
                      recipients
                    </div>
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-white/[0.05] p-3 text-center">
                    <p className="text-[9px] text-zinc-700">
                      No commands yet
                    </p>
                  </div>
                )}
              </div>
            </div>
          </section>
        </div>

        {/* Footer status */}

        <footer className="mt-4 flex flex-col gap-2 border-t border-white/[0.05] pt-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <span className="h-1 w-1 rounded-full bg-emerald-400" />

            <span className="font-mono text-[8px] uppercase tracking-[0.14em] text-zinc-700">
              Realtime control channel active
            </span>
          </div>

          <div className="flex items-center gap-3 font-mono text-[8px] uppercase tracking-[0.1em] text-zinc-700">
            <span>
              {zones.length} zones
            </span>

            <span className="text-zinc-800">
              /
            </span>

            <span>
              {stats?.total ?? 0}{' '}
              devices
            </span>
          </div>
        </footer>
      </div>
    </main>
  );
}