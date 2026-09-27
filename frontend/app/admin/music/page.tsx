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

type ColorOption = {
  key: string;
  name: string;
  value: string;
};

type Beat = {
  time: number;
  strength: number;
};

type LightingEvent = {
  time: number;
  strength: number;
};

type CommandResult = {
  recipients?: number;
  error?: string;
};

const COLORS: ColorOption[] = [
  {
    key: 'R',
    name: 'RED',
    value: '#FF1744',
  },
  {
    key: 'B',
    name: 'BLUE',
    value: '#2979FF',
  },
  {
    key: 'G',
    name: 'GREEN',
    value: '#00E676',
  },
  {
    key: 'P',
    name: 'PURPLE',
    value: '#D500F9',
  },
  {
    key: 'W',
    name: 'WHITE',
    value: '#FFFFFF',
  },
  {
    key: 'Y',
    name: 'YELLOW',
    value: '#FFD600',
  },
  {
    key: 'C',
    name: 'CYAN',
    value: '#00E5FF',
  },
];

const DEFAULT_COLOR = COLORS[3];

function sortNatural(a: string, b: string) {
  return a.localeCompare(b, undefined, {
    numeric: true,
    sensitivity: 'base',
  });
}

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds)) {
    return '00:00';
  }

  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);

  return `${String(mins).padStart(2, '0')}:${String(
    secs,
  ).padStart(2, '0')}`;
}

function clamp(
  value: number,
  min: number,
  max: number,
) {
  return Math.min(
    Math.max(value, min),
    max,
  );
}

export default function MusicControlPage() {
  /**
   * ------------------------------------------------------------
   * EVENT / TARGET STATE
   * ------------------------------------------------------------
   */

  const [stats, setStats] =
    useState<Stats | null>(null);

  const [selectedZones, setSelectedZones] =
    useState<Set<string>>(new Set());

  const [selectedRows, setSelectedRows] =
    useState<Set<string>>(new Set());

  const [color, setColor] =
    useState<ColorOption>(DEFAULT_COLOR);

  const [action, setAction] =
    useState<Action>('flash');

  const [duration, setDuration] =
    useState(220);

  /**
   * Music behaviour.
   */
  const [beatEnabled, setBeatEnabled] =
    useState(true);

  const [strongBeatEnabled, setStrongBeatEnabled] =
    useState(true);

  const [beatDivision, setBeatDivision] =
    useState<'1' | '2' | '4'>('1');

  /**
   * ------------------------------------------------------------
   * AUDIO STATE
   * ------------------------------------------------------------
   */

  const [fileName, setFileName] =
    useState('');

  const [audioUrl, setAudioUrl] =
    useState('');

  const [durationSeconds, setDurationSeconds] =
    useState(0);

  const [currentTime, setCurrentTime] =
    useState(0);

  const [isPlaying, setIsPlaying] =
    useState(false);

  const [isAnalyzing, setIsAnalyzing] =
    useState(false);

  const [isReady, setIsReady] =
    useState(false);

  /**
   * ------------------------------------------------------------
   * ANALYSIS STATE
   * ------------------------------------------------------------
   */

  const [beats, setBeats] =
    useState<Beat[]>([]);

  const [lightingEvents, setLightingEvents] =
    useState<LightingEvent[]>([]);

  const [bpm, setBpm] =
    useState<number | null>(null);

  const [analysisProgress, setAnalysisProgress] =
    useState(0);

  const [currentBeatIndex, setCurrentBeatIndex] =
    useState(-1);

  /**
   * ------------------------------------------------------------
   * LIVE STATE
   * ------------------------------------------------------------
   */

  const [firing, setFiring] =
    useState(false);

  const [lastRecipients, setLastRecipients] =
    useState(0);

  const [error, setError] =
    useState<string | null>(null);

  const [lastCommandAt, setLastCommandAt] =
    useState<number | null>(null);

  /**
   * ------------------------------------------------------------
   * REFS
   * ------------------------------------------------------------
   */

  const audioRef =
    useRef<HTMLAudioElement | null>(null);

  const audioContextRef =
    useRef<AudioContext | null>(null);

  const sourceNodeRef =
    useRef<MediaElementAudioSourceNode | null>(
      null,
    );

  const analyserRef =
    useRef<AnalyserNode | null>(null);

  const animationFrameRef =
    useRef<number | null>(null);

  const lastTriggeredBeatRef =
    useRef(-1);

  const analysisAbortRef =
    useRef(false);

  const objectUrlRef =
    useRef<string | null>(null);

  /**
   * ------------------------------------------------------------
   * LOAD STATS
   * ------------------------------------------------------------
   */

  const loadStats = useCallback(async () => {
    try {
      const response = await fetch(
        '/api/stats',
        {
          cache: 'no-store',
        },
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data?.error ||
            'Unable to load event stats',
        );
      }

      setStats(data);
      setError(null);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to load event stats',
      );
    }
  }, []);

  useEffect(() => {
    void loadStats();

    const interval =
      window.setInterval(
        loadStats,
        5000,
      );

    return () =>
      window.clearInterval(
        interval,
      );
  }, [loadStats]);

  /**
   * ------------------------------------------------------------
   * ZONES / ROWS
   * ------------------------------------------------------------
   */

  const zones = useMemo(() => {
    if (!stats) return [];

    return Object.keys(
      stats.zones,
    ).sort(sortNatural);
  }, [stats]);

  const allRows = useMemo(() => {
    if (!stats) return [];

    const rows = new Set<string>();

    for (const zone of zones) {
      Object.keys(
        stats.zones[zone]?.rows ?? {},
      ).forEach(row =>
        rows.add(row),
      );
    }

    return Array.from(rows).sort(
      sortNatural,
    );
  }, [stats, zones]);

  /**
   * Default to ALL zones once stats arrive.
   */
  useEffect(() => {
    if (
      zones.length > 0 &&
      selectedZones.size === 0
    ) {
      setSelectedZones(
        new Set(zones),
      );
    }
  }, [zones, selectedZones.size]);

  /**
   * ------------------------------------------------------------
   * TARGET HELPERS
   * ------------------------------------------------------------
   */

  const toggleZone = useCallback(
    (zone: string) => {
      setSelectedZones(
        previous => {
          const next =
            new Set(previous);

          if (next.has(zone)) {
            next.delete(zone);
          } else {
            next.add(zone);
          }

          return next;
        },
      );
    },
    [],
  );

  const toggleRow = useCallback(
    (row: string) => {
      setSelectedRows(
        previous => {
          const next =
            new Set(previous);

          if (next.has(row)) {
            next.delete(row);
          } else {
            next.add(row);
          }

          return next;
        },
      );
    },
    [],
  );

  const selectAllZones =
    useCallback(() => {
      setSelectedZones(
        previous =>
          previous.size === zones.length
            ? new Set()
            : new Set(zones),
      );
    }, [zones]);

  const selectAllRows =
    useCallback(() => {
      setSelectedRows(
        previous =>
          previous.size === allRows.length
            ? new Set()
            : new Set(allRows),
      );
    }, [allRows]);

  const targetLabel = useMemo(() => {
    if (selectedZones.size === 0) {
      return 'NO TARGET';
    }

    const selected =
      Array.from(
        selectedZones,
      ).sort(sortNatural);

    const zoneText =
      selected.length === zones.length
        ? 'ALL ZONES'
        : selected.length === 1
          ? `ZONE ${selected[0]}`
          : `${selected.length} ZONES`;

    if (selectedRows.size === 0) {
      return zoneText;
    }

    const rows =
      Array.from(
        selectedRows,
      ).sort(sortNatural);

    const rowText =
      rows.length === allRows.length
        ? 'ALL ROWS'
        : rows.length === 1
          ? `ROW ${rows[0]}`
          : `${rows.length} ROWS`;

    return `${zoneText} · ${rowText}`;
  }, [
    selectedZones,
    selectedRows,
    zones.length,
    allRows.length,
  ]);

  /**
   * ------------------------------------------------------------
   * COMMAND
   * ------------------------------------------------------------
   */

  const sendCommand = useCallback(
    async (
      commandAction: Action = action,
      commandColor: string = color.value,
      commandDuration: number = duration,
    ) => {
      if (selectedZones.size === 0) {
        setError(
          'Select at least one zone.',
        );

        return;
      }

      const zonesToSend =
        Array.from(
          selectedZones,
        ).sort(sortNatural);

      /**
       * Current backend accepts one zone/row
       * per command.
       *
       * We parallelize the requests so the selected
       * targets fire as close together as possible.
       */
      const rowsToSend =
        selectedRows.size > 0
          ? Array.from(
              selectedRows,
            ).sort(sortNatural)
          : [undefined];

      setFiring(true);
      setError(null);

      try {
        const requests: Promise<Response>[] =
          [];

        for (const zone of zonesToSend) {
          for (const row of rowsToSend) {
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
                    commandAction,
                  color:
                    commandColor,
                  duration:
                    commandAction ===
                    'off'
                      ? 0
                      : commandDuration,
                }),
              }),
            );
          }
        }

        const responses =
          await Promise.all(
            requests,
          );

        const payloads: CommandResult[] =
          await Promise.all(
            responses.map(
              response =>
                response.json(),
            ),
          );

        const failed =
          payloads.find(
            item => item.error,
          );

        if (failed?.error) {
          throw new Error(
            failed.error,
          );
        }

        const recipients =
          payloads.reduce(
            (total, item) =>
              total +
              (item.recipients ?? 0),
            0,
          );

        setLastRecipients(
          recipients,
        );

        setLastCommandAt(
          Date.now(),
        );
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : 'Command failed',
        );
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
    ],
  );

  /**
   * ------------------------------------------------------------
   * AUDIO FILE
   * ------------------------------------------------------------
   */

  const handleFile = useCallback(
    (file: File) => {
      if (
        !file.type.startsWith(
          'audio/',
        )
      ) {
        setError(
          'Please select an audio file.',
        );

        return;
      }

      /**
       * Stop current playback.
       */
      audioRef.current?.pause();

      if (
        objectUrlRef.current
      ) {
        URL.revokeObjectURL(
          objectUrlRef.current,
        );
      }

      const url =
        URL.createObjectURL(
          file,
        );

      objectUrlRef.current = url;

      setFileName(file.name);
      setAudioUrl(url);
      setDurationSeconds(0);
      setCurrentTime(0);
      setBeats([]);
      setLightingEvents([]);
      setBpm(null);
      setCurrentBeatIndex(-1);
      setIsReady(false);
      setError(null);
    },
    [],
  );

  /**
   * ------------------------------------------------------------
   * ANALYZE AUDIO
   * ------------------------------------------------------------
   *
   * This uses the Web Audio API.
   *
   * We decode the audio into PCM data and perform
   * simple energy-based onset detection.
   *
   * It is intentionally dependency-free.
   */

  const analyzeAudio =
    useCallback(async () => {
      if (!audioUrl) {
        setError(
          'Choose a music file first.',
        );

        return;
      }

      setIsAnalyzing(true);
      setAnalysisProgress(0);
      setError(null);
      setBeats([]);
      setLightingEvents([]);
      setBpm(null);

      analysisAbortRef.current =
        false;

      try {
        const response =
          await fetch(audioUrl);

        const arrayBuffer =
          await response.arrayBuffer();

        if (
          analysisAbortRef.current
        ) {
          return;
        }

        setAnalysisProgress(20);

        const AudioContextClass =
          window.AudioContext ||
          (
            window as typeof window & {
              webkitAudioContext?: typeof AudioContext;
            }
          ).webkitAudioContext;

        if (!AudioContextClass) {
          throw new Error(
            'Web Audio API is not supported in this browser.',
          );
        }

        const context =
          new AudioContextClass();

        audioContextRef.current =
          context;

        const audioBuffer =
          await context.decodeAudioData(
            arrayBuffer.slice(0),
          );

        if (
          analysisAbortRef.current
        ) {
          return;
        }

        setAnalysisProgress(45);

        const channel =
          audioBuffer.getChannelData(
            0,
          );

        const sampleRate =
          audioBuffer.sampleRate;

        /**
         * Analyze approximately every 50ms.
         *
         * This is enough for a live lighting MVP
         * without making analysis unnecessarily expensive.
         */
        const frameSize =
          Math.floor(
            sampleRate * 0.05,
          );

        const hopSize =
          frameSize;

        const energies: number[] =
          [];

        const times: number[] =
          [];

        for (
          let offset = 0;
          offset + frameSize <
          channel.length;
          offset += hopSize
        ) {
          let sum = 0;

          for (
            let i = 0;
            i < frameSize;
            i++
          ) {
            const sample =
              channel[
                offset + i
              ];

            sum +=
              sample * sample;
          }

          const rms = Math.sqrt(
            sum / frameSize,
          );

          energies.push(rms);

          times.push(
            offset / sampleRate,
          );

          if (
            energies.length %
              500 ===
            0
          ) {
            setAnalysisProgress(
              clamp(
                45 +
                  (offset /
                    channel.length) *
                    35,
                45,
                80,
              ),
            );
          }
        }

        /**
         * Smooth energy.
         */
        const smoothed =
          energies.map(
            (_, index) => {
              const start =
                Math.max(
                  0,
                  index - 2,
                );

              const end =
                Math.min(
                  energies.length,
                  index + 3,
                );

              let sum = 0;

              for (
                let i = start;
                i < end;
                i++
              ) {
                sum +=
                  energies[i];
              }

              return (
                sum /
                Math.max(
                  1,
                  end - start,
                )
              );
            },
          );

        /**
         * Local-average threshold.
         */
        const detected: Beat[] =
          [];

        const minimumGap =
          0.22;

        let lastBeatTime =
          -Infinity;

        for (
          let i = 3;
          i <
          smoothed.length - 3;
          i++
        ) {
          const current =
            smoothed[i];

          const localStart =
            Math.max(
              0,
              i - 20,
            );

          const localEnd =
            Math.min(
              smoothed.length,
              i + 20,
            );

          let localSum = 0;

          for (
            let j = localStart;
            j < localEnd;
            j++
          ) {
            localSum +=
              smoothed[j];
          }

          const localAverage =
            localSum /
            Math.max(
              1,
              localEnd -
                localStart,
            );

          /**
           * Require meaningful energy rise.
           */
          const threshold =
            Math.max(
              localAverage *
                1.32,
              0.008,
            );

          const isPeak =
            current >
              smoothed[i - 1] &&
            current >=
              smoothed[i + 1] &&
            current >
              threshold;

          if (!isPeak) {
            continue;
          }

          const time =
            times[i];

          if (
            time -
              lastBeatTime <
            minimumGap
          ) {
            continue;
          }

          /**
           * Strength relative to local average.
           */
          const strength =
            clamp(
              current /
                Math.max(
                  localAverage,
                  0.0001,
                ),
              1,
              3,
            );

          detected.push({
            time,
            strength,
          });

          lastBeatTime =
            time;
        }

        /**
         * If detector is too conservative,
         * derive a fallback BPM from autocorrelation-like
         * interval histogram.
         */
        const intervals: number[] =
          [];

        for (
          let i = 1;
          i < detected.length;
          i++
        ) {
          const diff =
            detected[i].time -
            detected[i - 1].time;

          if (
            diff >= 0.3 &&
            diff <= 1.2
          ) {
            intervals.push(
              diff,
            );
          }
        }

        let estimatedBpm:
          | number
          | null = null;

        if (
          intervals.length >=
          4
        ) {
          const sorted =
            [...intervals].sort(
              (a, b) => a - b,
            );

          const median =
            sorted[
              Math.floor(
                sorted.length /
                  2,
              )
            ];

          estimatedBpm =
            clamp(
              60 / median,
              60,
              180,
            );

          /**
           * Normalize common half/double BPM ranges.
           */
          while (
            estimatedBpm <
            80
          ) {
            estimatedBpm *= 2;
          }

          while (
            estimatedBpm >
            160
          ) {
            estimatedBpm /= 2;
          }

          estimatedBpm =
            Math.round(
              estimatedBpm,
            );
        }

        /**
         * If no reliable beats were found,
         * still allow playback but show a warning.
         */
        setBeats(detected);
        setBpm(estimatedBpm);

        /**
         * Build lighting events.
         *
         * For now:
         *
         * normal beat -> selected action
         * strong beat -> slightly stronger flash
         *
         * The important thing is that this timeline
         * can later be replaced with a much richer
         * pattern engine without changing the UI.
         */
        const events: LightingEvent[] =
          detected.map(
            beat => ({
              time: beat.time,
              strength:
                beat.strength,
            }),
          );

        setLightingEvents(
          events,
        );

        setAnalysisProgress(100);
        setIsReady(true);
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : 'Unable to analyze audio.',
        );
      } finally {
        setIsAnalyzing(false);
      }
    }, [audioUrl]);

  /**
   * ------------------------------------------------------------
   * AUDIO ENGINE
   * ------------------------------------------------------------
   */

  const ensureAudioEngine =
    useCallback(async () => {
      const audio =
        audioRef.current;

      if (!audio) return;

      const AudioContextClass =
        window.AudioContext ||
        (
          window as typeof window & {
            webkitAudioContext?: typeof AudioContext;
          }
        ).webkitAudioContext;

      if (!AudioContextClass) {
        throw new Error(
          'Web Audio API is unavailable.',
        );
      }

      let context =
        audioContextRef.current;

      if (!context) {
        context =
          new AudioContextClass();

        audioContextRef.current =
          context;
      }

      /**
       * Connect the audio element to
       * an analyser exactly once.
       */
      if (
        !sourceNodeRef.current
      ) {
        const source =
          context.createMediaElementSource(
            audio,
          );

        const analyser =
          context.createAnalyser();

        analyser.fftSize = 2048;

        analyser.smoothingTimeConstant =
          0.75;

        source.connect(
          analyser,
        );

        analyser.connect(
          context.destination,
        );

        sourceNodeRef.current =
          source;

        analyserRef.current =
          analyser;
      }

      if (
        context.state ===
        'suspended'
      ) {
        await context.resume();
      }
    }, []);

  /**
   * ------------------------------------------------------------
   * BEAT LOOP
   * ------------------------------------------------------------
   */

  const processPlayback =
    useCallback(() => {
      const audio =
        audioRef.current;

      if (!audio) return;

      const time =
        audio.currentTime;

      setCurrentTime(time);

      /**
       * Find the latest beat.
       */
      let beatIndex = -1;

      for (
        let i = 0;
        i < beats.length;
        i++
      ) {
        if (
          beats[i].time <=
          time + 0.02
        ) {
          beatIndex = i;
        } else {
          break;
        }
      }

      if (
        beatIndex >= 0 &&
        beatIndex !==
          currentBeatIndex
      ) {
        setCurrentBeatIndex(
          beatIndex,
        );

        /**
         * Prevent duplicate beat execution.
         */
        if (
          beatIndex !==
          lastTriggeredBeatRef.current
        ) {
          lastTriggeredBeatRef.current =
            beatIndex;

          const beat =
            beats[beatIndex];

          /**
           * Beat division.
           *
           * The analyzed beat is the base unit.
           * For 1/2 and 1/4 we currently fire
           * the original beat less frequently.
           *
           * The UI keeps this simple for MVP.
           */
          let shouldFire =
            true;

          if (
            beatDivision === '2'
          ) {
            shouldFire =
              beatIndex % 2 === 0;
          }

          if (
            beatDivision === '4'
          ) {
            shouldFire =
              beatIndex % 4 === 0;
          }

          if (
            beatEnabled &&
            shouldFire
          ) {
            /**
             * Strong beat handling.
             *
             * Strong beats get a slightly longer
             * flash. We do not create a second
             * command for them.
             */
            const strong =
              beat.strength >=
              1.7;

            const effectiveDuration =
              strong &&
              strongBeatEnabled
                ? Math.min(
                    450,
                    duration +
                      120,
                  )
                : duration;

            void sendCommand(
              action,
              color.value,
              effectiveDuration,
            );
          }
        }
      }

      animationFrameRef.current =
        requestAnimationFrame(
          processPlayback,
        );
    }, [
      beats,
      currentBeatIndex,
      beatDivision,
      beatEnabled,
      strongBeatEnabled,
      duration,
      action,
      color,
      sendCommand,
    ]);

  /**
   * ------------------------------------------------------------
   * PLAY / PAUSE
   * ------------------------------------------------------------
   */

  const togglePlayback =
    useCallback(async () => {
      const audio =
        audioRef.current;

      if (!audio || !audioUrl) {
        setError(
          'Choose a music file first.',
        );

        return;
      }

      try {
        await ensureAudioEngine();

        if (
          audio.paused
        ) {
          /**
           * Start from beginning if finished.
           */
          if (
            audio.currentTime >=
            audio.duration
          ) {
            audio.currentTime =
              0;

            lastTriggeredBeatRef.current =
              -1;
          }

          await audio.play();

          setIsPlaying(true);

          if (
            animationFrameRef.current
          ) {
            cancelAnimationFrame(
              animationFrameRef.current,
            );
          }

          animationFrameRef.current =
            requestAnimationFrame(
              processPlayback,
            );
        } else {
          audio.pause();

          setIsPlaying(false);

          if (
            animationFrameRef.current
          ) {
            cancelAnimationFrame(
              animationFrameRef.current,
            );

            animationFrameRef.current =
              null;
          }
        }
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : 'Unable to start playback.',
        );
      }
    }, [
      audioUrl,
      ensureAudioEngine,
      processPlayback,
    ]);

  /**
   * ------------------------------------------------------------
   * AUDIO EVENTS
   * ------------------------------------------------------------
   */

  useEffect(() => {
    const audio =
      audioRef.current;

    if (!audio) return;

    const onLoadedMetadata =
      () => {
        setDurationSeconds(
          Number.isFinite(
            audio.duration,
          )
            ? audio.duration
            : 0,
        );
      };

    const onEnded = () => {
      setIsPlaying(false);

      setCurrentTime(
        audio.duration || 0,
      );

      if (
        animationFrameRef.current
      ) {
        cancelAnimationFrame(
          animationFrameRef.current,
        );

        animationFrameRef.current =
          null;
      }
    };

    audio.addEventListener(
      'loadedmetadata',
      onLoadedMetadata,
    );

    audio.addEventListener(
      'ended',
      onEnded,
    );

    return () => {
      audio.removeEventListener(
        'loadedmetadata',
        onLoadedMetadata,
      );

      audio.removeEventListener(
        'ended',
        onEnded,
      );
    };
  }, [audioUrl]);

  /**
   * ------------------------------------------------------------
   * CLEANUP
   * ------------------------------------------------------------
   */

  useEffect(() => {
    return () => {
      analysisAbortRef.current =
        true;

      if (
        animationFrameRef.current
      ) {
        cancelAnimationFrame(
          animationFrameRef.current,
        );
      }

      if (
        objectUrlRef.current
      ) {
        URL.revokeObjectURL(
          objectUrlRef.current,
        );
      }

      audioContextRef.current?.close();

      audioContextRef.current =
        null;

      sourceNodeRef.current =
        null;

      analyserRef.current =
        null;
    };
  }, []);

  /**
   * ------------------------------------------------------------
   * KEYBOARD SHORTCUTS
   * ------------------------------------------------------------
   */

  useEffect(() => {
    function onKeyDown(
      event: KeyboardEvent,
    ) {
      const target =
        event.target as HTMLElement | null;

      if (
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.tagName === 'SELECT' ||
        target?.isContentEditable
      ) {
        return;
      }

      const key =
        event.key.toLowerCase();

      /**
       * SPACE
       *
       * Manual beat override.
       */
      if (
        event.code ===
        'Space'
      ) {
        event.preventDefault();

        if (!event.repeat) {
          void sendCommand();
        }

        return;
      }

      /**
       * PLAY / PAUSE
       */
      if (
        event.code ===
        'Enter'
      ) {
        event.preventDefault();

        void togglePlayback();

        return;
      }

      /**
       * COLORS
       */
      const selectedColor =
        COLORS.find(
          item =>
            item.key.toLowerCase() ===
            key,
        );

      if (selectedColor) {
        event.preventDefault();

        setColor(
          selectedColor,
        );

        return;
      }

      /**
       * ZONES
       */
      if (/^[a-z]$/.test(key)) {
        const zone =
          zones.find(
            item =>
              item.toLowerCase() ===
              key,
          );

        if (zone) {
          event.preventDefault();

          toggleZone(zone);

          return;
        }
      }

      /**
       * ROWS
       */
      if (/^[0-9]$/.test(key)) {
        event.preventDefault();

        if (key === '0') {
          selectAllRows();

          return;
        }

        const row =
          allRows.find(
            item =>
              item === key,
          );

        if (row) {
          toggleRow(row);
        }

        return;
      }

      /**
       * ACTIONS
       */
      if (key === 'f') {
        event.preventDefault();
        setAction('flash');
        return;
      }

      if (key === 's') {
        event.preventDefault();
        setAction('solid');
        return;
      }

      if (key === 'x') {
        event.preventDefault();
        setAction('off');
      }
    }

    window.addEventListener(
      'keydown',
      onKeyDown,
    );

    return () => {
      window.removeEventListener(
        'keydown',
        onKeyDown,
      );
    };
  }, [
    zones,
    allRows,
    sendCommand,
    togglePlayback,
    toggleZone,
    toggleRow,
    selectAllRows,
  ]);

  /**
   * ------------------------------------------------------------
   * PROGRESS
   * ------------------------------------------------------------
   */

  const progress =
    durationSeconds > 0
      ? clamp(
          currentTime /
            durationSeconds,
          0,
          1,
        )
      : 0;

  /**
   * ------------------------------------------------------------
   * RENDER
   * ------------------------------------------------------------
   */

  return (
    <main className="min-h-screen bg-[#09090b] text-zinc-100">
      <audio
        ref={audioRef}
        src={audioUrl || undefined}
        preload="auto"
      />

      <div className="mx-auto min-h-screen w-full max-w-[1500px]">
        {/* HEADER */}

        <header className="flex min-h-16 items-center justify-between border-b border-zinc-800/80 px-5 md:px-8">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-900 font-mono text-[10px] font-bold">
              LF
            </div>

            <div>
              <div className="text-sm font-semibold tracking-tight">
                MUSIC CONTROL
              </div>

              <div className="font-mono text-[9px] uppercase tracking-[0.18em] text-zinc-500">
                Beat synchronized lighting
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="hidden text-right sm:block">
              <div className="font-mono text-[9px] uppercase tracking-[0.14em] text-zinc-600">
                Audience
              </div>

              <div className="font-mono text-xs text-zinc-300">
                {stats?.total ?? 0}
              </div>
            </div>

            <div className="flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.14em] text-emerald-400">
              <span className="h-2 w-2 rounded-full bg-emerald-400" />
              Ready
            </div>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px]">
          {/* MAIN */}

          <section className="min-w-0 border-b border-zinc-800/80 lg:border-r lg:border-b-0">
            <div className="space-y-7 p-5 md:p-8">
              {/* MUSIC */}

              <section>
                <div className="mb-3 flex items-end justify-between">
                  <div>
                    <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-500">
                      Music
                    </div>

                    <div className="mt-1 text-xl font-semibold tracking-tight">
                      Choose your track
                    </div>
                  </div>

                  {bpm && (
                    <div className="text-right">
                      <div className="font-mono text-[9px] uppercase tracking-[0.16em] text-zinc-600">
                        Estimated BPM
                      </div>

                      <div className="font-mono text-xl text-zinc-200">
                        {bpm}
                      </div>
                    </div>
                  )}
                </div>

                <label className="group flex min-h-[130px] cursor-pointer items-center justify-center rounded-2xl border border-dashed border-zinc-700 bg-zinc-900/50 transition hover:border-zinc-500 hover:bg-zinc-900">
                  <input
                    type="file"
                    accept="audio/*,.mp3,.wav,.m4a,.aac,.ogg"
                    className="sr-only"
                    onChange={event => {
                      const file =
                        event.target.files?.[0];

                      if (file) {
                        handleFile(file);
                      }
                    }}
                  />

                  <div className="px-5 text-center">
                    <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-500">
                      {fileName
                        ? 'Selected track'
                        : 'Choose audio'}
                    </div>

                    <div className="mt-2 text-lg font-medium text-zinc-200">
                      {fileName ||
                        'MP3 / WAV / M4A'}
                    </div>

                    <div className="mt-2 font-mono text-[9px] text-zinc-600">
                      Audio stays in this browser
                    </div>
                  </div>
                </label>

                {fileName && (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        void analyzeAudio()
                      }
                      disabled={
                        isAnalyzing
                      }
                      className="rounded-lg bg-white px-4 py-2.5 font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-black transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {isAnalyzing
                        ? `Analyzing ${Math.round(
                            analysisProgress,
                          )}%`
                        : 'Analyze track'}
                    </button>

                    {isReady && (
                      <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-emerald-400">
                        {beats.length} beats
                        detected
                      </span>
                    )}
                  </div>
                )}
              </section>

              {/* PLAYER */}

              {fileName && (
                <section>
                  <div className="mb-3 flex items-center justify-between">
                    <div>
                      <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-500">
                        Playback
                      </div>

                      <div className="mt-1 text-sm text-zinc-300">
                        {formatTime(
                          currentTime,
                        )}{' '}
                        /{' '}
                        {formatTime(
                          durationSeconds,
                        )}
                      </div>
                    </div>

                    {isReady && (
                      <div className="font-mono text-[9px] uppercase tracking-[0.14em] text-zinc-600">
                        Beat engine{' '}
                        <span className="text-emerald-400">
                          ready
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="relative h-20 overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900">
                    <div
                      className="absolute inset-y-0 left-0 bg-white/5 transition-[width] duration-75"
                      style={{
                        width: `${progress * 100}%`,
                      }}
                    />

                    <div className="absolute inset-0 flex items-center gap-[3px] px-3">
                      {beats
                        .slice(
                          0,
                          180,
                        )
                        .map(
                          (
                            beat,
                            index,
                          ) => {
                            const x =
                              durationSeconds >
                              0
                                ? beat.time /
                                  durationSeconds
                                : 0;

                            return (
                              <div
                                key={`${beat.time}-${index}`}
                                className={[
                                  'absolute bottom-3 top-3 w-px transition-colors',
                                  index ===
                                    currentBeatIndex
                                    ? 'bg-white'
                                    : 'bg-zinc-700',
                                ].join(
                                  ' ',
                                )}
                                style={{
                                  left: `${x * 100}%`,
                                  opacity:
                                    clamp(
                                      beat.strength /
                                        2,
                                      0.2,
                                      1,
                                    ),
                                }}
                              />
                            );
                          },
                        )}
                    </div>

                    <div className="absolute inset-x-0 bottom-0 h-px bg-zinc-700" />

                    <div
                      className="absolute bottom-0 top-0 w-0.5 bg-white transition-[left] duration-75"
                      style={{
                        left: `${progress * 100}%`,
                      }}
                    />
                  </div>

                  <div className="mt-3 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        void togglePlayback()
                      }
                      disabled={
                        !isReady
                      }
                      className="min-w-32 rounded-xl border border-zinc-700 bg-zinc-900 px-5 py-3 font-mono text-[10px] uppercase tracking-[0.15em] text-zinc-200 transition hover:border-zinc-500 disabled:cursor-not-allowed disabled:opacity-30"
                    >
                      {isPlaying
                        ? 'Pause'
                        : 'Play'}
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        if (
                          audioRef.current
                        ) {
                          audioRef.current.pause();
                          audioRef.current.currentTime =
                            0;
                        }

                        setIsPlaying(
                          false,
                        );
                        setCurrentTime(
                          0,
                        );
                        setCurrentBeatIndex(
                          -1,
                        );
                        lastTriggeredBeatRef.current =
                          -1;
                      }}
                      className="rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3 font-mono text-[10px] uppercase tracking-[0.15em] text-zinc-500 transition hover:border-zinc-600 hover:text-zinc-200"
                    >
                      Reset
                    </button>
                  </div>
                </section>
              )}

              {/* TARGET */}

              <section>
                <div className="mb-3 flex items-end justify-between">
                  <div>
                    <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-500">
                      Target
                    </div>

                    <div className="mt-1 text-sm text-zinc-300">
                      Multi-zone audience
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={
                      selectAllZones
                    }
                    className="font-mono text-[9px] uppercase tracking-[0.14em] text-zinc-500 hover:text-white"
                  >
                    {selectedZones.size ===
                    zones.length
                      ? 'Clear'
                      : 'All zones'}
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {zones.map(
                    zone => {
                      const selected =
                        selectedZones.has(
                          zone,
                        );

                      return (
                        <button
                          key={zone}
                          type="button"
                          onClick={() =>
                            toggleZone(
                              zone,
                            )
                          }
                          aria-pressed={
                            selected
                          }
                          className={[
                            'min-h-20 rounded-xl border text-left transition active:scale-[0.98]',
                            selected
                              ? 'border-white bg-white text-black'
                              : 'border-zinc-800 bg-zinc-900 text-zinc-400 hover:border-zinc-600 hover:text-white',
                          ].join(
                            ' ',
                          )}
                        >
                          <div className="p-4">
                            <div className="font-mono text-[9px] uppercase tracking-[0.15em] opacity-50">
                              Zone
                            </div>

                            <div className="mt-1 text-2xl font-semibold">
                              {zone}
                            </div>
                          </div>
                        </button>
                      );
                    },
                  )}
                </div>
              </section>

              {/* ROWS */}

              <section>
                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-500">
                      Rows
                    </div>

                    <div className="mt-1 text-xs text-zinc-600">
                      Optional
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={
                      selectAllRows
                    }
                    className="font-mono text-[9px] uppercase tracking-[0.14em] text-zinc-500 hover:text-white"
                  >
                    {selectedRows.size ===
                    allRows.length
                      ? 'Clear'
                      : 'All rows'}
                  </button>
                </div>

                <div className="flex flex-wrap gap-2">
                  {allRows.map(
                    row => {
                      const selected =
                        selectedRows.has(
                          row,
                        );

                      return (
                        <button
                          key={row}
                          type="button"
                          onClick={() =>
                            toggleRow(
                              row,
                            )
                          }
                          className={[
                            'h-11 min-w-11 rounded-lg border px-3 font-mono text-xs transition',
                            selected
                              ? 'border-white bg-white text-black'
                              : 'border-zinc-800 bg-zinc-900 text-zinc-500 hover:border-zinc-600 hover:text-white',
                          ].join(
                            ' ',
                          )}
                        >
                          {row}
                        </button>
                      );
                    },
                  )}
                </div>
              </section>
            </div>
          </section>

          {/* RIGHT CONTROL DECK */}

          <aside className="bg-zinc-950">
            <div className="space-y-6 p-5 md:p-7">
              {/* LIVE STATUS */}

              <section className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5">
                <div className="flex items-center justify-between">
                  <div className="font-mono text-[9px] uppercase tracking-[0.18em] text-zinc-600">
                    Live pattern
                  </div>

                  <span className="flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.14em] text-emerald-400">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                    Armed
                  </span>
                </div>

                <div className="mt-4 text-xl font-semibold tracking-tight">
                  {targetLabel}
                </div>

                <div className="mt-5 flex items-center gap-3">
                  <span
                    className="h-9 w-9 rounded-full border border-white/10"
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
                      {action.toUpperCase()}
                    </div>
                  </div>
                </div>
              </section>

              {/* BEAT SETTINGS */}

              <section>
                <div className="mb-3 font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-500">
                  Beat engine
                </div>

                <div className="space-y-2">
                  <button
                    type="button"
                    onClick={() =>
                      setBeatEnabled(
                        value => !value,
                      )
                    }
                    className={[
                      'flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left transition',
                      beatEnabled
                        ? 'border-zinc-600 bg-zinc-900'
                        : 'border-zinc-800 bg-zinc-950',
                    ].join(' ')}
                  >
                    <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-zinc-300">
                      Beat trigger
                    </span>

                    <span
                      className={[
                        'font-mono text-[9px] uppercase',
                        beatEnabled
                          ? 'text-emerald-400'
                          : 'text-zinc-600',
                      ].join(' ')}
                    >
                      {beatEnabled
                        ? 'ON'
                        : 'OFF'}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      setStrongBeatEnabled(
                        value => !value,
                      )
                    }
                    className={[
                      'flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left transition',
                      strongBeatEnabled
                        ? 'border-zinc-600 bg-zinc-900'
                        : 'border-zinc-800 bg-zinc-950',
                    ].join(' ')}
                  >
                    <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-zinc-300">
                      Strong beats
                    </span>

                    <span
                      className={[
                        'font-mono text-[9px] uppercase',
                        strongBeatEnabled
                          ? 'text-emerald-400'
                          : 'text-zinc-600',
                      ].join(' ')}
                    >
                      {strongBeatEnabled
                        ? 'BOOST'
                        : 'OFF'}
                    </span>
                  </button>
                </div>

                <div className="mt-4">
                  <div className="mb-2 font-mono text-[9px] uppercase tracking-[0.14em] text-zinc-600">
                    Beat division
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    {(
                      [
                        ['1', '1/1'],
                        ['2', '1/2'],
                        ['4', '1/4'],
                      ] as const
                    ).map(
                      ([value, label]) => (
                        <button
                          key={value}
                          type="button"
                          onClick={() =>
                            setBeatDivision(
                              value,
                            )
                          }
                          className={[
                            'rounded-lg border py-3 font-mono text-[10px] transition',
                            beatDivision ===
                            value
                              ? 'border-white bg-white text-black'
                              : 'border-zinc-800 bg-zinc-900 text-zinc-500 hover:text-white',
                          ].join(
                            ' ',
                          )}
                        >
                          {label}
                        </button>
                      ),
                    )}
                  </div>
                </div>
              </section>

              {/* COLOR */}

              <section>
                <div className="mb-3 font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-500">
                  Color
                </div>

                <div className="grid grid-cols-4 gap-2">
                  {COLORS.map(
                    item => {
                      const selected =
                        item.key ===
                        color.key;

                      return (
                        <button
                          key={item.key}
                          type="button"
                          onClick={() =>
                            setColor(
                              item,
                            )
                          }
                          className={[
                            'flex h-14 flex-col items-center justify-center rounded-lg border transition',
                            selected
                              ? 'border-white bg-zinc-100'
                              : 'border-zinc-800 bg-zinc-900 hover:border-zinc-600',
                          ].join(
                            ' ',
                          )}
                        >
                          <span
                            className="h-4 w-4 rounded-full border border-black/10"
                            style={{
                              backgroundColor:
                                item.value,
                            }}
                          />

                          <span
                            className={[
                              'mt-1 font-mono text-[8px]',
                              selected
                                ? 'text-black'
                                : 'text-zinc-600',
                            ].join(
                              ' ',
                            )}
                          >
                            {item.name}
                          </span>
                        </button>
                      );
                    },
                  )}
                </div>
              </section>

              {/* ACTION */}

              <section>
                <div className="mb-3 font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-500">
                  Beat action
                </div>

                <div className="grid grid-cols-3 gap-2">
                  {(
                    [
                      ['flash', 'FLASH'],
                      ['solid', 'SOLID'],
                      ['off', 'OFF'],
                    ] as const
                  ).map(
                    ([value, label]) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() =>
                          setAction(
                            value,
                          )}
                        className={[
                          'rounded-xl border py-4 font-mono text-[9px] uppercase tracking-[0.12em] transition',
                          action === value
                            ? 'border-white bg-white text-black'
                            : 'border-zinc-800 bg-zinc-900 text-zinc-500 hover:text-white',
                        ].join(
                          ' ',
                        )}
                      >
                        {label}
                      </button>
                    ),
                  )}
                </div>
              </section>

              {/* DURATION */}

              {action ===
                'flash' && (
                <section>
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
                    max="1000"
                    step="10"
                    value={duration}
                    onChange={event =>
                      setDuration(
                        Number(
                          event.target
                            .value,
                        ),
                      )
                    }
                    className="w-full accent-white"
                  />
                </section>
              )}

              {/* MANUAL FIRE */}

              <button
                type="button"
                onClick={() =>
                  void sendCommand()
                }
                disabled={
                  firing ||
                  selectedZones.size ===
                    0
                }
                className={[
                  'flex min-h-[140px] w-full flex-col items-center justify-center rounded-2xl border transition active:scale-[0.985]',
                  selectedZones.size >
                    0 &&
                  !firing
                    ? 'border-white bg-white text-black hover:bg-zinc-200'
                    : 'cursor-not-allowed border-zinc-800 bg-zinc-900 text-zinc-700',
                ].join(' ')}
              >
                <span className="font-mono text-[9px] uppercase tracking-[0.18em] opacity-50">
                  Manual override
                </span>

                <span className="mt-2 text-4xl font-semibold tracking-[-0.04em]">
                  SPACE
                </span>

                <span className="mt-2 font-mono text-[9px] uppercase tracking-[0.12em] opacity-50">
                  Fire now
                </span>
              </button>

              {/* COMMAND STATUS */}

              <section className="border-t border-zinc-800 pt-5">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-zinc-600">
                    Last transmission
                  </span>

                  {lastCommandAt && (
                    <span className="font-mono text-[9px] text-emerald-400">
                      SENT
                    </span>
                  )}
                </div>

                <div className="mt-2 font-mono text-[10px] text-zinc-500">
                  {lastRecipients > 0
                    ? `${lastRecipients} recipients`
                    : 'No commands yet'}
                </div>
              </section>

              {/* ERROR */}

              {error && (
                <div className="rounded-xl border border-red-900/50 bg-red-950/30 p-3 font-mono text-[10px] leading-relaxed text-red-400">
                  {error}
                </div>
              )}
            </div>
          </aside>
        </div>

        {/* KEYBOARD */}

        <footer className="border-t border-zinc-800 bg-zinc-950 px-5 py-3 md:px-8">
          <div className="flex flex-wrap gap-x-5 gap-y-2 font-mono text-[9px] uppercase tracking-[0.12em] text-zinc-600">
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
                F/S/X
              </kbd>{' '}
              action
            </span>

            <span>
              <kbd className="text-zinc-300">
                ENTER
              </kbd>{' '}
              play/pause
            </span>

            <span className="ml-auto">
              <kbd className="text-zinc-300">
                SPACE
              </kbd>{' '}
              manual fire
            </span>
          </div>
        </footer>
      </div>
    </main>
  );
}