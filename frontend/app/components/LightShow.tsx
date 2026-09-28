'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';

import {
  createSocket,
  sendPing,
  sendTap,
  type LightCommand,
  type ServerMessage,
} from '@/lib/websocket';

type ConnectionState =
  | 'connecting'
  | 'connected'
  | 'disconnected';

type ActiveEffect =
  | 'off'
  | 'solid'
  | 'flash';

interface TapBurst {
  id: number;
  x: number;
  y: number;
  strength: number;
}

function normalizeColor(value: string) {
  if (/^#[0-9a-fA-F]{6}$/.test(value)) {
    return value.toUpperCase();
  }

  return '#FFFFFF';
}

function hexToRgb(hex: string) {
  const normalized = hex.replace('#', '');

  return {
    r: parseInt(normalized.slice(0, 2), 16),
    g: parseInt(normalized.slice(2, 4), 16),
    b: parseInt(normalized.slice(4, 6), 16),
  };
}

function rgba(
  hex: string,
  alpha: number,
) {
  const { r, g, b } = hexToRgb(hex);

  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export default function LightShow() {
  const [color, setColor] =
    useState('#FFFFFF');

  const [connection, setConnection] =
    useState<ConnectionState>('connecting');

  const [zone, setZone] =
    useState('main');

  const [row, setRow] =
    useState<string | undefined>();

  const [latency, setLatency] =
    useState<number | null>(null);

  const [activeEffect, setActiveEffect] =
    useState<ActiveEffect>('solid');

  const [flashKey, setFlashKey] =
    useState(0);

  const [flashDuration, setFlashDuration] =
    useState(500);

  const [tapBursts, setTapBursts] =
    useState<TapBurst[]>([]);

  const [tapCount, setTapCount] =
    useState(0);

  const [tapIntensity, setTapIntensity] =
    useState(0);

  const [showIntro, setShowIntro] =
    useState(true);

  const [countdown, setCountdown] =
    useState(10);

  const [debug, setDebug] =
    useState(false);

  const socketRef =
    useRef<WebSocket | null>(null);

  const reconnectTimer =
    useRef<ReturnType<typeof setTimeout> | null>(
      null,
    );

  const pingTimer =
    useRef<ReturnType<typeof setInterval> | null>(
      null,
    );

  const flashTimer =
    useRef<ReturnType<typeof setTimeout> | null>(
      null,
    );

const tapDecayTimer = useRef<number | null>(null);

  const mountedRef =
    useRef(true);

  const tapIdRef =
    useRef(0);

  const lastTapRef =
    useRef(0);

  const tapCountRef =
    useRef(0);

  const reducedMotionRef =
    useRef(false);

  /*
   * Query parameters are intentionally kept
   * compatible with the existing QR structure.
   */
  const query = useMemo(() => {
    if (typeof window === 'undefined') {
      return {
        zone: 'main',
        row: undefined as string | undefined,
        debug: false,
      };
    }

    const params =
      new URLSearchParams(
        window.location.search,
      );

    return {
      zone:
        params.get('zone')?.trim() ||
        'main',

      row:
        params.get('row')?.trim() ||
        undefined,

      debug:
        params.get('debug') === '1',
    };
  }, []);

  useEffect(() => {
    setDebug(query.debug);
  }, [query.debug]);

  /*
   * Reduced motion / reduced visual intensity.
   */
  useEffect(() => {
    const media =
      window.matchMedia(
        '(prefers-reduced-motion: reduce)',
      );

    const update = () => {
      reducedMotionRef.current =
        media.matches;
    };

    update();

    media.addEventListener(
      'change',
      update,
    );

    return () => {
      media.removeEventListener(
        'change',
        update,
      );
    };
  }, []);

  /*
   * Intro timer.
   *
   * This is informational only.
   * It never blocks tapping.
   */
  useEffect(() => {
    const timer =
      window.setInterval(() => {
        setCountdown((value) => {
          if (value <= 1) {
            window.clearInterval(timer);
            return 0;
          }

          return value - 1;
        });
      }, 1000);

    const hideTimer =
      window.setTimeout(() => {
        setShowIntro(false);
      }, 6500);

    return () => {
      window.clearInterval(timer);
      window.clearTimeout(hideTimer);
    };
  }, []);

  /*
   * Fade crowd intensity back toward zero.
   */
  useEffect(() => {
    tapDecayTimer.current =
      window.setInterval(() => {
        setTapIntensity((value) =>
          Math.max(0, value * 0.86),
        );
      }, 120);

    return () => {
      if (tapDecayTimer.current) {
        clearInterval(
          tapDecayTimer.current,
        );
      }
    };
  }, []);

  /*
   * Existing server-driven light commands.
   */
  const handleCommand = useCallback(
    (command: LightCommand) => {
      const nextColor =
        normalizeColor(command.color);

      setColor(nextColor);

      if (flashTimer.current) {
        clearTimeout(
          flashTimer.current,
        );

        flashTimer.current = null;
      }

      if (command.action === 'off') {
        setActiveEffect('off');
        return;
      }

      if (command.action === 'solid') {
        setActiveEffect('solid');
        return;
      }

      if (command.action === 'flash') {
        const duration =
          Math.max(
            80,
            Math.min(
              2000,
              Number.isFinite(
                command.duration,
              )
                ? command.duration
                : 500,
            ),
          );

        setFlashDuration(duration);

        setFlashKey(
          (current) => current + 1,
        );

        setActiveEffect('flash');

        flashTimer.current =
          setTimeout(() => {
            if (mountedRef.current) {
              setActiveEffect('solid');
            }

            flashTimer.current =
              null;
          }, duration);
      }
    },
    [],
  );

  const handleMessage =
    useCallback(
      (message: ServerMessage) => {
        if (
          message.type === 'joined'
        ) {
          setZone(message.zone);
          setRow(message.row);
          return;
        }

        if (
          message.type === 'pong'
        ) {
          setLatency(
            Math.max(
              0,
              Date.now() -
                message.timestamp,
            ),
          );

          return;
        }

        if (
          message.type === 'command'
        ) {
          handleCommand(message);
        }
      },
      [handleCommand],
    );

  /*
   * Existing WebSocket connection.
   */
  const connect = useCallback(() => {
    if (!mountedRef.current) {
      return;
    }

    if (
      socketRef.current?.readyState ===
        WebSocket.OPEN ||
      socketRef.current?.readyState ===
        WebSocket.CONNECTING
    ) {
      return;
    }

    setConnection('connecting');

    try {
      const requestedZone =
        query.zone;

      const requestedRow =
        query.row;

      setZone(requestedZone);
      setRow(requestedRow);

      const socket =
        createSocket(
          requestedZone,
          requestedRow,
        );

      socketRef.current =
        socket;

      socket.onopen = () => {
        if (
          !mountedRef.current
        ) {
          return;
        }

        setConnection(
          'connected',
        );
      };

      socket.onmessage =
        (event) => {
          try {
            const message =
              JSON.parse(
                event.data,
              ) as ServerMessage;

            handleMessage(message);
          } catch {
            // Ignore malformed messages.
          }
        };

      socket.onerror = () => {
        if (
          mountedRef.current
        ) {
          setConnection(
            'disconnected',
          );
        }
      };

      socket.onclose = () => {
        socketRef.current =
          null;

        if (
          !mountedRef.current
        ) {
          return;
        }

        setConnection(
          'disconnected',
        );

        if (
          reconnectTimer.current
        ) {
          clearTimeout(
            reconnectTimer.current,
          );
        }

        reconnectTimer.current =
          setTimeout(
            connect,
            1500 +
              Math.random() * 1000,
          );
      };
    } catch {
      socketRef.current =
        null;

      setConnection(
        'disconnected',
      );

      reconnectTimer.current =
        setTimeout(
          connect,
          1500,
        );
    }
  }, [
    handleMessage,
    query.zone,
    query.row,
  ]);

  useEffect(() => {
    mountedRef.current =
      true;

    connect();

    return () => {
      mountedRef.current =
        false;

      if (
        reconnectTimer.current
      ) {
        clearTimeout(
          reconnectTimer.current,
        );
      }

      if (
        pingTimer.current
      ) {
        clearInterval(
          pingTimer.current,
        );
      }

      if (
        flashTimer.current
      ) {
        clearTimeout(
          flashTimer.current,
        );
      }

      socketRef.current?.close();
      socketRef.current = null;
    };
  }, [connect]);

  /*
   * Existing heartbeat.
   */
  useEffect(() => {
    if (
      connection !== 'connected'
    ) {
      return;
    }

    const ping = () => {
      sendPing(
        socketRef.current,
      );
    };

    ping();

    pingTimer.current =
      setInterval(
        ping,
        5000,
      );

    return () => {
      if (
        pingTimer.current
      ) {
        clearInterval(
          pingTimer.current,
        );

        pingTimer.current =
          null;
      }
    };
  }, [connection]);

  /*
   * Immediate local audience reaction.
   *
   * IMPORTANT:
   * The visual happens first.
   * Server communication happens second.
   */
  const handleTap =
    useCallback(
      (
        event:
          | React.PointerEvent
          | React.TouchEvent,
      ) => {
        const now =
          performance.now();

        const elapsed =
          now - lastTapRef.current;

        lastTapRef.current =
          now;

        tapCountRef.current += 1;

        const recentTapBoost =
          elapsed < 180
            ? 1
            : elapsed < 420
              ? 0.7
              : 0.35;

        const strength =
          Math.min(
            2,
            0.8 +
              recentTapBoost +
              tapIntensity * 0.45,
          );

        let clientX =
          window.innerWidth / 2;

        let clientY =
          window.innerHeight / 2;

        if (
          'clientX' in event &&
          typeof event.clientX ===
            'number'
        ) {
          clientX =
            event.clientX;
          clientY =
            event.clientY;
        }

        const burst: TapBurst = {
          id:
            ++tapIdRef.current,
          x:
            (clientX /
              window.innerWidth) *
            100,
          y:
            (clientY /
              window.innerHeight) *
            100,
          strength,
        };

        setTapBursts(
          (current) => [
            ...current.slice(-7),
            burst,
          ],
        );

        setTapCount(
          tapCountRef.current,
        );

        setTapIntensity(
          (value) =>
            Math.min(
              1,
              value +
                (recentTapBoost >
                0.7
                  ? 0.28
                  : 0.16),
            ),
        );

        /*
         * Immediate local hit.
         */
        setFlashKey(
          (current) => current + 1,
        );

        /*
         * Remove burst after animation.
         */
        window.setTimeout(() => {
          setTapBursts(
            (current) =>
              current.filter(
                (item) =>
                  item.id !==
                  burst.id,
              ),
          );
        }, reducedMotionRef.current ? 120 : 850);

        /*
         * Backend aggregation.
         *
         * We deliberately do NOT wait for this
         * before rendering the local reaction.
         */
        sendTap(
          socketRef.current,
        );
      },
      [tapIntensity],
    );

  const colorStyles =
    useMemo<CSSProperties>(
      () => ({
        '--light': color,
        '--light-soft':
          rgba(color, 0.22),
        '--light-mid':
          rgba(color, 0.52),
        '--light-strong':
          rgba(color, 0.9),
        '--light-rgb':
          `${hexToRgb(color).r}, ${hexToRgb(color).g}, ${hexToRgb(color).b}`,
        '--hit-duration':
          `${flashDuration}ms`,
        '--tap-intensity':
          tapIntensity,
      } as CSSProperties),
      [
        color,
        flashDuration,
        tapIntensity,
      ],
    );

  const isLit =
    activeEffect !== 'off';

  return (
    <main
      className={[
        'light-show',
        isLit
          ? 'light-show--active'
          : 'light-show--off',
        activeEffect === 'flash'
          ? 'light-show--hit'
          : '',
        tapIntensity > 0
          ? 'light-show--crowd-active'
          : '',
      ].join(' ')}
      style={colorStyles}
      onPointerDown={
        handleTap
      }
      role="button"
      tabIndex={0}
      aria-label="Tap to participate in the light show"
    >
      <div className="light-show__base" />

      {isLit && (
        <>
          <div className="light-show__atmosphere" />

          <div className="light-show__beam light-show__beam--one" />
          <div className="light-show__beam light-show__beam--two" />
          <div className="light-show__beam light-show__beam--three" />

          <div className="light-show__ball">
            <div className="light-show__ball-glow" />

            <div className="light-show__ball-shell">
              <div className="light-show__tiles" />

              <div className="light-show__highlight light-show__highlight--one" />
              <div className="light-show__highlight light-show__highlight--two" />
              <div className="light-show__highlight light-show__highlight--three" />

              <div className="light-show__reflection" />
              <div className="light-show__edge" />
            </div>
          </div>

          <div
            key={`server-${flashKey}`}
            className="light-show__hit"
          />
        </>
      )}

      /*
       * Local tap visualization.
       */
      {tapBursts.map((burst) => (
        <div
          key={burst.id}
          className="tap-burst"
          style={
            {
              '--x': `${burst.x}%`,
              '--y': `${burst.y}%`,
              '--strength':
                burst.strength,
            } as CSSProperties
          }
        >
          <div className="tap-burst__orb" />

          <div className="tap-burst__ring tap-burst__ring--one" />
          <div className="tap-burst__ring tap-burst__ring--two" />
          <div className="tap-burst__ring tap-burst__ring--three" />

          <div className="tap-burst__particle tap-burst__particle--one" />
          <div className="tap-burst__particle tap-burst__particle--two" />
          <div className="tap-burst__particle tap-burst__particle--three" />
          <div className="tap-burst__particle tap-burst__particle--four" />
          <div className="tap-burst__particle tap-burst__particle--five" />
          <div className="tap-burst__particle tap-burst__particle--six" />
        </div>
      ))}

      /*
       * Intro is informational.
       * The page remains tappable underneath.
       */
      {showIntro && (
        <div className="light-show__intro">
          <div className="light-show__intro-kicker">
            EVENT STARTING SOON
          </div>

          <div className="light-show__intro-title">
            GET READY
          </div>

          <div className="light-show__intro-timer">
            00:{String(countdown).padStart(2, '0')}
          </div>

          <div className="light-show__intro-copy">
            Your screen becomes part
            of the show.
          </div>
        </div>
      )}

      {!showIntro && (
        <div
          className={[
            'light-show__tap-hint',
            tapIntensity > 0
              ? 'light-show__tap-hint--active'
              : '',
          ].join(' ')}
        >
          <span>
            TAP TO LIGHT UP
          </span>

          <small>
            YOUR SCREEN IS PART OF THE SHOW
          </small>
        </div>
      )}

      {debug && (
        <>
          {connection !== 'connected' && (
            <div className="light-show__status">
              <span className="light-show__status-dot" />

              <span>
                {connection ===
                'connecting'
                  ? 'Connecting'
                  : 'Reconnecting'}
              </span>

              <span>/</span>

              <span>
                {zone}
                {row
                  ? ` / ${row}`
                  : ''}
              </span>
            </div>
          )}

          {connection ===
            'connected' && (
            <div className="light-show__debug">
              <span>
                {zone}
                {row
                  ? ` / ${row}`
                  : ''}
              </span>

              <span>·</span>

              <span>
                {latency ??
                  '—'}
                ms
              </span>

              <span>·</span>

              <span>
                taps:{' '}
                {tapCount}
              </span>
            </div>
          )}
        </>
      )}

      <a
        href="/visualization"
        className="light-show__visualization-link"
        onPointerDown={(event) =>
          event.stopPropagation()
        }
      >
        VIEW RESPONSE
      </a>

      <style jsx>{`
        .light-show {
          --light: #ffffff;
          --light-soft: rgba(255, 255, 255, 0.22);
          --light-mid: rgba(255, 255, 255, 0.52);
          --light-strong: rgba(255, 255, 255, 0.9);
          --light-rgb: 255, 255, 255;
          --hit-duration: 500ms;

          position: fixed;
          inset: 0;
          z-index: 9999;

          width: 100vw;
          height: 100dvh;

          overflow: hidden;

          background: #010103;
          isolation: isolate;

          user-select: none;
          touch-action: manipulation;
          -webkit-tap-highlight-color: transparent;

          cursor: pointer;
        }

        .light-show__base {
          position: absolute;
          inset: 0;

          background:
            radial-gradient(
              ellipse at 50% 48%,
              rgba(20, 18, 26, 0.98) 0%,
              rgba(4, 5, 10, 1) 52%,
              #000 100%
            );

          transition:
            background 400ms ease;
        }

        .light-show--active
          .light-show__base {
          background:
            radial-gradient(
              ellipse at 50% 48%,
              rgba(
                var(--light-rgb),
                0.11
              ) 0%,
              rgba(10, 8, 18, 0.96)
                44%,
              #000 100%
            );
        }

        .light-show__atmosphere {
          position: absolute;
          inset: -15%;
          z-index: 1;

          background:
            radial-gradient(
              ellipse at 50% 45%,
              var(--light-mid) 0%,
              var(--light-soft) 20%,
              transparent 52%
            );

          filter: blur(28px);
          opacity: 0.8;

          animation:
            atmosphere-breathe
            5s ease-in-out infinite;
        }

        .light-show__beam {
          position: absolute;
          z-index: 2;

          left: -35%;
          width: 170%;
          height: 11%;

          border-radius: 999px;

          pointer-events: none;

          background:
            linear-gradient(
              90deg,
              transparent 0%,
              rgba(
                255,
                255,
                255,
                0.01
              ) 22%,
              rgba(
                255,
                255,
                255,
                0.34
              ) 50%,
              rgba(
                255,
                255,
                255,
                0.01
              ) 78%,
              transparent 100%
            );

          filter: blur(18px);
          mix-blend-mode: screen;
          opacity: 0.38;
        }

        .light-show__beam--one {
          top: 18%;
          transform: rotate(-17deg);
          animation:
            beam-one
            7s
            ease-in-out
            infinite;
        }

        .light-show__beam--two {
          top: 52%;
          transform: rotate(13deg);
          opacity: 0.3;
          animation:
            beam-two
            9s
            ease-in-out
            infinite;
        }

        .light-show__beam--three {
          top: 73%;
          transform: rotate(-9deg);
          opacity: 0.25;
          animation:
            beam-three
            8s
            ease-in-out
            infinite;
        }

        .light-show__ball {
          position: absolute;
          z-index: 5;

          left: 50%;
          top: 50%;

          width:
            min(
              72vw,
              72vh,
              720px
            );

          aspect-ratio: 1;

          transform:
            translate(
              -50%,
              -50%
            );

          filter:
            drop-shadow(
              0 0 30px
                rgba(
                  var(--light-rgb),
                  0.3
                )
            )
            drop-shadow(
              0 0 100px
                rgba(
                  var(--light-rgb),
                  0.18
                )
            );

          animation:
            ball-float
            7s
            ease-in-out
            infinite;
        }

        .light-show__ball-glow {
          position: absolute;
          inset: -15%;

          border-radius: 50%;

          background:
            radial-gradient(
              circle,
              rgba(
                255,
                255,
                255,
                0.26
              ) 0%,
              var(--light-mid) 24%,
              var(--light-soft) 48%,
              transparent 72%
            );

          filter: blur(35px);
          opacity: 0.8;
        }

        .light-show__ball-shell {
          position: absolute;
          inset: 2%;

          overflow: hidden;

          border-radius: 50%;

          background:
            radial-gradient(
              circle at 33% 25%,
              #fff 0%,
              rgba(
                255,
                255,
                255,
                0.92
              ) 3%,
              var(--light) 9%,
              rgba(
                var(--light-rgb),
                0.72
              ) 28%,
              #110c16 72%,
              #020204 100%
            );

          box-shadow:
            inset -35px -45px
              70px
              rgba(
                0,
                0,
                0,
                0.82
              ),
            inset 22px 18px
              35px
              rgba(
                255,
                255,
                255,
                0.34
              ),
            0 0 45px
              rgba(
                var(--light-rgb),
                0.28
              );

          transform: translateZ(0);
        }

        .light-show__tiles {
          position: absolute;
          inset: -5%;

          border-radius: 50%;

          background:
            linear-gradient(
              90deg,
              transparent 0 46%,
              rgba(
                255,
                255,
                255,
                0.52
              ) 47% 49%,
              transparent 50% 100%
            ),
            linear-gradient(
              0deg,
              transparent 0 46%,
              rgba(
                255,
                255,
                255,
                0.38
              ) 47% 49%,
              transparent 50% 100%
            ),
            repeating-linear-gradient(
              90deg,
              rgba(
                255,
                255,
                255,
                0.32
              ) 0 2px,
              transparent 2px 15px
            ),
            repeating-linear-gradient(
              0deg,
              rgba(
                255,
                255,
                255,
                0.26
              ) 0 2px,
              transparent 2px 15px
            );

          background-size:
            100% 100%,
            100% 100%,
            15px 15px,
            15px 15px;

          opacity: 0.72;
          mix-blend-mode: screen;

          animation:
            tile-shimmer
            5s
            linear
            infinite;
        }

        .light-show__reflection {
          position: absolute;
          inset: 0;

          border-radius: 50%;

          background:
            radial-gradient(
              ellipse at 28% 23%,
              rgba(
                255,
                255,
                255,
                0.98
              ) 0%,
              rgba(
                255,
                255,
                255,
                0.55
              ) 5%,
              transparent 18%
            ),
            radial-gradient(
              ellipse at 71% 33%,
              rgba(
                255,
                255,
                255,
                0.88
              ) 0%,
              rgba(
                255,
                255,
                255,
                0.26
              ) 5%,
              transparent 19%
            ),
            radial-gradient(
              ellipse at 52% 78%,
              rgba(
                var(--light-rgb),
                0.8
              ) 0%,
              transparent 28%
            );

          mix-blend-mode: screen;

          animation:
            reflection-drift
            6s
            ease-in-out
            infinite;
        }

        .light-show__highlight {
          position: absolute;

          border-radius: 50%;
          background: white;

          filter: blur(3px);
          mix-blend-mode: screen;
        }

        .light-show__highlight--one {
          width: 20%;
          height: 8%;
          left: 18%;
          top: 25%;

          transform: rotate(-22deg);
          opacity: 0.9;
        }

        .light-show__highlight--two {
          width: 14%;
          height: 6%;
          right: 20%;
          top: 34%;

          transform: rotate(24deg);
          opacity: 0.7;
        }

        .light-show__highlight--three {
          width: 10%;
          height: 5%;
          left: 43%;
          bottom: 17%;

          transform: rotate(-12deg);
          opacity: 0.72;
        }

        .light-show__edge {
          position: absolute;
          inset: 0;

          border-radius: 50%;

          border: 1px solid
            rgba(
              255,
              255,
              255,
              0.34
            );

          box-shadow:
            inset 0 0 22px
              rgba(
                255,
                255,
                255,
                0.2
              ),
            inset 0 0 80px
              rgba(
                0,
                0,
                0,
                0.75
              );
        }

        .light-show__hit {
          position: absolute;
          z-index: 8;
          inset: 0;

          pointer-events: none;

          background:
            radial-gradient(
              circle at 50% 50%,
              rgba(
                255,
                255,
                255,
                0.92
              ) 0%,
              rgba(
                255,
                255,
                255,
                0.45
              ) 8%,
              var(--light-mid) 20%,
              transparent 52%
            );

          mix-blend-mode: screen;
          opacity: 0;

          animation:
            concert-hit
            var(--hit-duration)
            cubic-bezier(
              0.2,
              0.8,
              0.2,
              1
            )
            both;
        }

        /*
         * Crowd tap response.
         */
        .tap-burst {
          position: absolute;

          left: var(--x);
          top: var(--y);

          width: 1px;
          height: 1px;

          z-index: 20;

          pointer-events: none;

          filter:
            drop-shadow(
              0 0 18px
                rgba(
                  var(--light-rgb),
                  0.9
                )
            );
        }

        .tap-burst__orb {
          position: absolute;

          width:
            calc(
              26px *
                var(--strength)
            );

          height:
            calc(
              26px *
                var(--strength)
            );

          left: 0;
          top: 0;

          transform:
            translate(
              -50%,
              -50%
            );

          border-radius: 50%;

          background:
            radial-gradient(
              circle,
              #fff 0%,
              var(--light) 24%,
              rgba(
                var(--light-rgb),
                0.7
              ) 44%,
              transparent 72%
            );

          animation:
            tap-orb
            650ms
            cubic-bezier(
              0.16,
              1,
              0.3,
              1
            )
            both;
        }

        .tap-burst__ring {
          position: absolute;

          left: 0;
          top: 0;

          width:
            calc(
              70px *
                var(--strength)
            );

          height:
            calc(
              70px *
                var(--strength)
            );

          transform:
            translate(
              -50%,
              -50%
            );

          border-radius: 50%;

          border:
            1px solid
            rgba(
              255,
              255,
              255,
              0.8
            );

          box-shadow:
            0 0 20px
              rgba(
                var(--light-rgb),
                0.5
              ),
            inset 0 0 15px
              rgba(
                var(--light-rgb),
                0.25
              );

          animation:
            tap-ring
            850ms
            cubic-bezier(
              0.16,
              1,
              0.3,
              1
            )
            both;
        }

        .tap-burst__ring--two {
          animation-delay: 80ms;
        }

        .tap-burst__ring--three {
          animation-delay: 160ms;
        }

        .tap-burst__particle {
          position: absolute;

          left: 0;
          top: 0;

          width: 5px;
          height: 5px;

          border-radius: 50%;

          background: white;

          box-shadow:
            0 0 12px
              var(--light);

          animation:
            particle-burst
            700ms
            cubic-bezier(
              0.16,
              1,
              0.3,
              1
            )
            both;
        }

        .tap-burst__particle--one {
          --dx: -75px;
          --dy: -55px;
        }

        .tap-burst__particle--two {
          --dx: 70px;
          --dy: -65px;
        }

        .tap-burst__particle--three {
          --dx: -90px;
          --dy: 30px;
        }

        .tap-burst__particle--four {
          --dx: 90px;
          --dy: 25px;
        }

        .tap-burst__particle--five {
          --dx: -30px;
          --dy: 90px;
        }

        .tap-burst__particle--six {
          --dx: 45px;
          --dy: 85px;
        }

        .light-show__intro {
          position: absolute;

          left: 50%;
          top: 50%;

          z-index: 40;

          width: min(
            90vw,
            440px
          );

          transform:
            translate(
              -50%,
              -50%
            );

          text-align: center;

          pointer-events: none;

          animation:
            intro-enter
            900ms
            ease-out
            both;
        }

        .light-show__intro-kicker {
          font-family:
            ui-monospace,
            SFMono-Regular,
            Menlo,
            monospace;

          font-size: 9px;
          letter-spacing: 0.28em;

          color:
            rgba(
              255,
              255,
              255,
              0.5
            );
        }

        .light-show__intro-title {
          margin-top: 12px;

          font-size:
            clamp(
              42px,
              12vw,
              86px
            );

          font-weight: 700;

          letter-spacing:
            -0.07em;

          line-height: 0.9;

          color: white;

          text-shadow:
            0 0 30px
              rgba(
                255,
                255,
                255,
                0.22
              );
        }

        .light-show__intro-timer {
          margin-top: 24px;

          font-family:
            ui-monospace,
            SFMono-Regular,
            Menlo,
            monospace;

          font-size: 12px;

          letter-spacing: 0.22em;

          color:
            var(--light);
        }

        .light-show__intro-copy {
          margin-top: 18px;

          font-size: 12px;

          letter-spacing:
            0.06em;

          color:
            rgba(
              255,
              255,
              255,
              0.42
            );
        }

        .light-show__tap-hint {
          position: absolute;

          left: 50%;
          bottom: 8%;

          z-index: 30;

          transform:
            translateX(-50%);

          display: flex;
          flex-direction: column;

          align-items: center;

          gap: 7px;

          pointer-events: none;

          text-align: center;

          transition:
            opacity 500ms ease,
            transform 500ms ease;
        }

        .light-show__tap-hint span {
          font-family:
            ui-monospace,
            SFMono-Regular,
            Menlo,
            monospace;

          font-size: 10px;

          letter-spacing:
            0.2em;

          color:
            rgba(
              255,
              255,
              255,
              0.7
            );
        }

        .light-show__tap-hint small {
          font-size: 9px;

          letter-spacing:
            0.08em;

          color:
            rgba(
              255,
              255,
              255,
              0.25
            );
        }

        .light-show__tap-hint--active {
          opacity: 0.3;
        }

        .light-show__status {
          position: absolute;

          left: 50%;
          bottom: 24px;

          z-index: 50;

          display: flex;
          align-items: center;
          gap: 7px;

          transform:
            translateX(-50%);

          padding:
            7px 11px;

          border:
            1px solid
            rgba(
              255,
              255,
              255,
              0.08
            );

          border-radius: 999px;

          background:
            rgba(
              0,
              0,
              0,
              0.45
            );

          backdrop-filter:
            blur(10px);

          color:
            rgba(
              255,
              255,
              255,
              0.65
            );

          font-family:
            ui-monospace,
            SFMono-Regular,
            Menlo,
            monospace;

          font-size: 9px;

          letter-spacing:
            0.08em;

          text-transform:
            uppercase;
        }

        .light-show__status-dot {
          width: 5px;
          height: 5px;

          border-radius: 50%;

          background: #facc15;

          box-shadow:
            0 0 8px
              rgba(
                250,
                204,
                21,
                0.8
              );
        }

        .light-show__debug {
          position: absolute;

          right: 12px;
          bottom: 10px;

          z-index: 50;

          display: flex;
          gap: 5px;

          color:
            rgba(
              255,
              255,
              255,
              0.2
            );

          font-family:
            ui-monospace,
            SFMono-Regular,
            Menlo,
            monospace;

          font-size: 8px;
        }

        .light-show__visualization-link {
          position: absolute;

          right: 16px;
          top: 16px;

          z-index: 60;

          padding:
            8px 11px;

          border:
            1px solid
            rgba(
              255,
              255,
              255,
              0.08
            );

          border-radius: 999px;

          color:
            rgba(
              255,
              255,
              255,
              0.28
            );

          background:
            rgba(
              0,
              0,
              0,
              0.2
            );

          font-family:
            ui-monospace,
            SFMono-Regular,
            Menlo,
            monospace;

          font-size: 8px;

          letter-spacing:
            0.12em;

          text-decoration: none;

          opacity: 0;

          transition:
            opacity 200ms ease;
        }

        .light-show:hover
          .light-show__visualization-link {
          opacity: 1;
        }

        @keyframes atmosphere-breathe {
          0%,
          100% {
            transform: scale(0.96);
            opacity: 0.62;
          }

          50% {
            transform: scale(1.08);
            opacity: 0.92;
          }
        }

        @keyframes ball-float {
          0%,
          100% {
            transform:
              translate(
                -50%,
                -50%
              )
              scale(1);
          }

          50% {
            transform:
              translate(
                -50%,
                -50%
              )
              scale(1.018);
          }
        }

        @keyframes concert-hit {
          0% {
            opacity: 0;
            transform: scale(0.72);
          }

          12% {
            opacity: 0.88;
            transform: scale(1.02);
          }

          38% {
            opacity: 0.3;
            transform: scale(1.12);
          }

          100% {
            opacity: 0;
            transform: scale(1.28);
          }
        }

        @keyframes tile-shimmer {
          0%,
          100% {
            transform:
              translateX(-1.5%)
              perspective(
                700px
              )
              rotateX(2deg);

            filter:
              brightness(0.92);
          }

          50% {
            transform:
              translateX(1.5%)
              perspective(
                700px
              )
              rotateX(2deg);

            filter:
              brightness(1.15);
          }
        }

        @keyframes reflection-drift {
          0%,
          100% {
            transform:
              translate3d(
                -1%,
                0,
                0
              )
              scale(1);
          }

          50% {
            transform:
              translate3d(
                2%,
                -1%,
                0
              )
              scale(1.04);
          }
        }

        @keyframes beam-one {
          0%,
          100% {
            transform:
              translate3d(
                -8%,
                -5%,
                0
              )
              rotate(-17deg);
          }

          50% {
            transform:
              translate3d(
                9%,
                8%,
                0
              )
              rotate(-11deg);
          }
        }

        @keyframes beam-two {
          0%,
          100% {
            transform:
              translate3d(
                8%,
                4%,
                0
              )
              rotate(13deg);
          }

          50% {
            transform:
              translate3d(
                -9%,
                -5%,
                0
              )
              rotate(8deg);
          }
        }

        @keyframes beam-three {
          0%,
          100% {
            transform:
              translate3d(
                -8%,
                0,
                0
              )
              rotate(-9deg);
          }

          50% {
            transform:
              translate3d(
                11%,
                4%,
                0
              )
              rotate(-4deg);
          }
        }

        @keyframes tap-orb {
          0% {
            opacity: 1;
            transform:
              translate(
                -50%,
                -50%
              )
              scale(0.3);
          }

          20% {
            opacity: 1;
            transform:
              translate(
                -50%,
                -50%
              )
              scale(1.25);
          }

          100% {
            opacity: 0;
            transform:
              translate(
                -50%,
                -50%
              )
              scale(2.8);
          }
        }

        @keyframes tap-ring {
          0% {
            opacity: 0.85;
            transform:
              translate(
                -50%,
                -50%
              )
              scale(0.25);
          }

          100% {
            opacity: 0;
            transform:
              translate(
                -50%,
                -50%
              )
              scale(3.8);
          }
        }

        @keyframes particle-burst {
          0% {
            opacity: 1;

            transform:
              translate(
                -50%,
                -50%
              )
              scale(1);
          }

          100% {
            opacity: 0;

            transform:
              translate(
                var(--dx),
                var(--dy)
              )
              scale(0);
          }
        }

        @keyframes intro-enter {
          from {
            opacity: 0;
            transform:
              translate(
                -50%,
                -46%
              )
              scale(0.96);
          }

          to {
            opacity: 1;
            transform:
              translate(
                -50%,
                -50%
              )
              scale(1);
          }
        }

        @media (max-width: 600px) {
          .light-show__ball {
            width:
              min(
                82vw,
                82vh
              );
          }

          .light-show__beam {
            height: 8%;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .light-show__atmosphere,
          .light-show__ball,
          .light-show__tiles,
          .light-show__reflection,
          .light-show__beam,
          .light-show__hit,
          .tap-burst__orb,
          .tap-burst__ring,
          .tap-burst__particle {
            animation: none !important;
          }
        }
      `}</style>
    </main>
  );
}