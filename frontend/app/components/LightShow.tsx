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
  type LightCommand,
  type ServerMessage,
} from '@/lib/websocket';

type ConnectionState =
  | 'connecting'
  | 'connected'
  | 'disconnected';

type ActiveEffect = 'off' | 'solid' | 'flash';

function normalizeColor(value: string): string {
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

function rgba(hex: string, alpha: number): string {
  const { r, g, b } = hexToRgb(hex);

  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export default function LightShow() {
  const [color, setColor] = useState('#FFFFFF');

  const [connection, setConnection] =
    useState<ConnectionState>('connecting');

  const [zone, setZone] = useState('main');
  const [row, setRow] = useState<string | undefined>();

  const [latency, setLatency] = useState<number | null>(null);

  const [activeEffect, setActiveEffect] =
    useState<ActiveEffect>('off');

  /**
   * Increment this for every flash/beat hit.
   * The visualizer uses it to restart the hit animation.
   */
  const [flashKey, setFlashKey] = useState(0);

  const [flashDuration, setFlashDuration] =
    useState(500);

  const socketRef = useRef<WebSocket | null>(null);

  const reconnectTimer =
    useRef<ReturnType<typeof setTimeout> | null>(null);

  const pingTimer =
    useRef<ReturnType<typeof setInterval> | null>(null);

  const flashTimer =
    useRef<ReturnType<typeof setTimeout> | null>(null);

  const mountedRef = useRef(true);

  const handleCommand = useCallback(
    (command: LightCommand) => {
      const nextColor = normalizeColor(command.color);

      setColor(nextColor);

      if (flashTimer.current) {
        clearTimeout(flashTimer.current);
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
        const duration = Math.max(
          80,
          Math.min(
            2000,
            Number.isFinite(command.duration)
              ? command.duration
              : 500,
          ),
        );

        setFlashDuration(duration);
        setFlashKey((current) => current + 1);
        setActiveEffect('flash');

        /**
         * Important:
         * The ball does NOT turn into a flat screen after
         * a flash. It returns to its cinematic idle state.
         */
        flashTimer.current = setTimeout(() => {
          if (mountedRef.current) {
            setActiveEffect('solid');
          }

          flashTimer.current = null;
        }, duration);
      }
    },
    [],
  );

  const handleMessage = useCallback(
    (message: ServerMessage) => {
      if (message.type === 'joined') {
        setZone(message.zone);
        setRow(message.row);
        return;
      }

      if (message.type === 'pong') {
        const roundTrip =
          Date.now() - message.timestamp;

        setLatency(roundTrip);
        return;
      }

      if (message.type === 'command') {
        handleCommand(message);
      }
    },
    [handleCommand],
  );

  const connect = useCallback(() => {
    if (!mountedRef.current) {
      return;
    }

    if (
      socketRef.current?.readyState === WebSocket.OPEN ||
      socketRef.current?.readyState === WebSocket.CONNECTING
    ) {
      return;
    }

    setConnection('connecting');

    try {
      const params = new URLSearchParams(
        window.location.search,
      );

      const requestedZone =
        params.get('zone')?.trim() || 'main';

      const requestedRow =
        params.get('row')?.trim() || undefined;

      setZone(requestedZone);
      setRow(requestedRow);

      const socket = createSocket(
        requestedZone,
        requestedRow,
      );

      socketRef.current = socket;

      socket.onopen = () => {
        if (!mountedRef.current) {
          return;
        }

        setConnection('connected');
      };

      socket.onmessage = (event) => {
        try {
          const message =
            JSON.parse(event.data) as ServerMessage;

          handleMessage(message);
        } catch (error) {
          console.error(
            '[LightShow] invalid message',
            error,
          );
        }
      };

      socket.onerror = () => {
        if (mountedRef.current) {
          setConnection('disconnected');
        }
      };

      socket.onclose = () => {
        socketRef.current = null;

        if (!mountedRef.current) {
          return;
        }

        setConnection('disconnected');

        if (reconnectTimer.current) {
          clearTimeout(reconnectTimer.current);
        }

        reconnectTimer.current = setTimeout(() => {
          connect();
        }, 1500);
      };
    } catch (error) {
      console.error(
        '[LightShow] connection failed',
        error,
      );

      socketRef.current = null;
      setConnection('disconnected');

      reconnectTimer.current = setTimeout(() => {
        connect();
      }, 1500);
    }
  }, [handleMessage]);

  useEffect(() => {
    mountedRef.current = true;
    connect();

    return () => {
      mountedRef.current = false;

      if (reconnectTimer.current) {
        clearTimeout(reconnectTimer.current);
        reconnectTimer.current = null;
      }

      if (pingTimer.current) {
        clearInterval(pingTimer.current);
        pingTimer.current = null;
      }

      if (flashTimer.current) {
        clearTimeout(flashTimer.current);
        flashTimer.current = null;
      }

      socketRef.current?.close();
      socketRef.current = null;
    };
  }, [connect]);

  useEffect(() => {
    if (connection !== 'connected') {
      if (pingTimer.current) {
        clearInterval(pingTimer.current);
        pingTimer.current = null;
      }

      return;
    }

    const sendPing = () => {
      const socket = socketRef.current;

      if (socket?.readyState !== WebSocket.OPEN) {
        return;
      }

      socket.send(
        JSON.stringify({
          type: 'ping',
          timestamp: Date.now(),
        }),
      );
    };

    sendPing();

    pingTimer.current = setInterval(
      sendPing,
      5000,
    );

    return () => {
      if (pingTimer.current) {
        clearInterval(pingTimer.current);
        pingTimer.current = null;
      }
    };
  }, [connection]);

  const colorStyles =
    useMemo<CSSProperties>(() => {
      return {
        '--light': color,
        '--light-soft': rgba(color, 0.22),
        '--light-mid': rgba(color, 0.52),
        '--light-strong': rgba(color, 0.9),
        '--light-rgb': `${hexToRgb(color).r}, ${hexToRgb(color).g}, ${hexToRgb(color).b}`,
        '--hit-duration': `${flashDuration}ms`,
      } as CSSProperties;
    }, [color, flashDuration]);

  const isLit = activeEffect !== 'off';

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
      ].join(' ')}
      style={colorStyles}
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
            key={flashKey}
            className="light-show__hit"
          />
        </>
      )}

      {connection !== 'connected' && (
        <div className="light-show__status">
          <span className="light-show__status-dot" />
          <span>
            {connection === 'connecting'
              ? 'Connecting'
              : 'Reconnecting'}
          </span>
          <span className="light-show__status-separator">
            /
          </span>
          <span>
            {zone}
            {row ? ` / ${row}` : ''}
          </span>
        </div>
      )}

      {connection === 'connected' && (
        <div className="light-show__debug">
          <span>
            {zone}
            {row ? ` / ${row}` : ''}
          </span>

          {latency !== null && (
            <>
              <span>·</span>
              <span>{latency}ms</span>
            </>
          )}
        </div>
      )}

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
          -webkit-tap-highlight-color: transparent;
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
        }

        .light-show--active .light-show__base {
          background:
            radial-gradient(
              ellipse at 50% 48%,
              rgba(var(--light-rgb), 0.11) 0%,
              rgba(10, 8, 18, 0.96) 44%,
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
          animation: atmosphere-breathe 5s ease-in-out infinite;
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
              rgba(255, 255, 255, 0.01) 22%,
              rgba(255, 255, 255, 0.34) 50%,
              rgba(255, 255, 255, 0.01) 78%,
              transparent 100%
            );
          filter: blur(18px);
          mix-blend-mode: screen;
          opacity: 0.38;
        }

        .light-show__beam--one {
          top: 18%;
          transform: rotate(-17deg);
          animation: beam-one 7s ease-in-out infinite;
        }

        .light-show__beam--two {
          top: 52%;
          transform: rotate(13deg);
          opacity: 0.3;
          animation: beam-two 9s ease-in-out infinite;
        }

        .light-show__beam--three {
          top: 73%;
          transform: rotate(-9deg);
          opacity: 0.25;
          animation: beam-three 8s ease-in-out infinite;
        }

        .light-show__ball {
          position: absolute;
          z-index: 5;
          left: 50%;
          top: 50%;
          width: min(72vw, 72vh, 720px);
          aspect-ratio: 1;
          transform: translate(-50%, -50%);
          filter:
            drop-shadow(
              0 0 30px rgba(var(--light-rgb), 0.3)
            )
            drop-shadow(
              0 0 100px rgba(var(--light-rgb), 0.18)
            );
          animation: ball-float 7s ease-in-out infinite;
        }

        .light-show__ball-glow {
          position: absolute;
          inset: -15%;
          border-radius: 50%;
          background:
            radial-gradient(
              circle,
              rgba(255, 255, 255, 0.26) 0%,
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
              rgba(255, 255, 255, 0.92) 3%,
              var(--light) 9%,
              rgba(var(--light-rgb), 0.72) 28%,
              #110c16 72%,
              #020204 100%
            );
          box-shadow:
            inset -35px -45px 70px rgba(0, 0, 0, 0.82),
            inset 22px 18px 35px rgba(255, 255, 255, 0.34),
            0 0 45px rgba(var(--light-rgb), 0.28);
          transform: translateZ(0);
        }

        /*
         * The tile grid gives the ball its disco-ball identity.
         * It is one CSS layer rather than hundreds of DOM nodes.
         */
        .light-show__tiles {
          position: absolute;
          inset: -5%;
          border-radius: 50%;
          background:
            linear-gradient(
              90deg,
              transparent 0 46%,
              rgba(255, 255, 255, 0.52) 47% 49%,
              transparent 50% 100%
            ),
            linear-gradient(
              0deg,
              transparent 0 46%,
              rgba(255, 255, 255, 0.38) 47% 49%,
              transparent 50% 100%
            ),
            repeating-linear-gradient(
              90deg,
              rgba(255, 255, 255, 0.32) 0 2px,
              transparent 2px 15px
            ),
            repeating-linear-gradient(
              0deg,
              rgba(255, 255, 255, 0.26) 0 2px,
              transparent 2px 15px
            );
          background-size:
            100% 100%,
            100% 100%,
            15px 15px,
            15px 15px;
          opacity: 0.72;
          mix-blend-mode: screen;
          transform: perspective(700px) rotateX(2deg);
          animation: tile-shimmer 5s linear infinite;
        }

        .light-show__reflection {
          position: absolute;
          inset: 0;
          border-radius: 50%;
          background:
            radial-gradient(
              ellipse at 28% 23%,
              rgba(255, 255, 255, 0.98) 0%,
              rgba(255, 255, 255, 0.55) 5%,
              transparent 18%
            ),
            radial-gradient(
              ellipse at 71% 33%,
              rgba(255, 255, 255, 0.88) 0%,
              rgba(255, 255, 255, 0.26) 5%,
              transparent 19%
            ),
            radial-gradient(
              ellipse at 52% 78%,
              rgba(var(--light-rgb), 0.8) 0%,
              transparent 28%
            );
          mix-blend-mode: screen;
          animation: reflection-drift 6s ease-in-out infinite;
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
          border: 1px solid rgba(255, 255, 255, 0.34);
          box-shadow:
            inset 0 0 22px rgba(255, 255, 255, 0.2),
            inset 0 0 80px rgba(0, 0, 0, 0.75);
        }

        .light-show__hit {
          position: absolute;
          z-index: 8;
          inset: 0;
          pointer-events: none;
          background:
            radial-gradient(
              circle at 50% 50%,
              rgba(255, 255, 255, 0.92) 0%,
              rgba(255, 255, 255, 0.45) 8%,
              var(--light-mid) 20%,
              transparent 52%
            );
          mix-blend-mode: screen;
          opacity: 0;
          animation:
            concert-hit
            var(--hit-duration)
            cubic-bezier(0.2, 0.8, 0.2, 1)
            both;
        }

        .light-show--hit .light-show__ball {
          animation:
            ball-hit
            var(--hit-duration)
            cubic-bezier(0.2, 0.8, 0.2, 1)
            both;
        }

        .light-show--hit .light-show__ball-glow {
          animation:
            glow-hit
            var(--hit-duration)
            cubic-bezier(0.2, 0.8, 0.2, 1)
            both;
        }

        .light-show__status {
          position: absolute;
          left: 50%;
          bottom: 24px;
          z-index: 30;
          display: flex;
          align-items: center;
          gap: 7px;
          transform: translateX(-50%);
          padding: 7px 11px;
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 999px;
          background: rgba(0, 0, 0, 0.45);
          backdrop-filter: blur(10px);
          color: rgba(255, 255, 255, 0.65);
          font-family:
            ui-monospace,
            SFMono-Regular,
            Menlo,
            monospace;
          font-size: 9px;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }

        .light-show__status-dot {
          width: 5px;
          height: 5px;
          border-radius: 999px;
          background: #facc15;
          box-shadow:
            0 0 8px rgba(250, 204, 21, 0.8);
        }

        .light-show__status-separator {
          color: rgba(255, 255, 255, 0.2);
        }

        .light-show__debug {
          position: absolute;
          right: 12px;
          bottom: 10px;
          z-index: 30;
          display: flex;
          align-items: center;
          gap: 5px;
          color: rgba(255, 255, 255, 0.12);
          font-family:
            ui-monospace,
            SFMono-Regular,
            Menlo,
            monospace;
          font-size: 8px;
          pointer-events: none;
        }

        .light-show--off {
          background: #000;
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
            transform: translate(-50%, -50%)
              scale(1);
          }

          50% {
            transform: translate(-50%, -50%)
              scale(1.018);
          }
        }

        @keyframes ball-hit {
          0% {
            transform: translate(-50%, -50%)
              scale(1);
          }

          12% {
            transform: translate(-50%, -50%)
              scale(1.07);
          }

          36% {
            transform: translate(-50%, -50%)
              scale(1.035);
          }

          100% {
            transform: translate(-50%, -50%)
              scale(1);
          }
        }

        @keyframes glow-hit {
          0% {
            opacity: 0.65;
            transform: scale(1);
          }

          16% {
            opacity: 1;
            transform: scale(1.22);
          }

          100% {
            opacity: 0.72;
            transform: scale(1);
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
          0% {
            transform:
              translateX(-1.5%)
              perspective(700px)
              rotateX(2deg);
            filter: brightness(0.92);
          }

          50% {
            transform:
              translateX(1.5%)
              perspective(700px)
              rotateX(2deg);
            filter: brightness(1.15);
          }

          100% {
            transform:
              translateX(-1.5%)
              perspective(700px)
              rotateX(2deg);
            filter: brightness(0.92);
          }
        }

        @keyframes reflection-drift {
          0%,
          100% {
            transform: translate3d(-1%, 0, 0)
              scale(1);
          }

          50% {
            transform: translate3d(2%, -1%, 0)
              scale(1.04);
          }
        }

        @keyframes beam-one {
          0%,
          100% {
            transform:
              translate3d(-8%, -5%, 0)
              rotate(-17deg);
          }

          50% {
            transform:
              translate3d(9%, 8%, 0)
              rotate(-11deg);
          }
        }

        @keyframes beam-two {
          0%,
          100% {
            transform:
              translate3d(8%, 4%, 0)
              rotate(13deg);
          }

          50% {
            transform:
              translate3d(-9%, -5%, 0)
              rotate(8deg);
          }
        }

        @keyframes beam-three {
          0%,
          100% {
            transform:
              translate3d(-8%, 0, 0)
              rotate(-9deg);
          }

          50% {
            transform:
              translate3d(11%, 4%, 0)
              rotate(-4deg);
          }
        }

        @media (max-width: 600px) {
          .light-show__ball {
            width: min(82vw, 82vh);
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
          .light-show__hit {
            animation: none !important;
          }
        }
      `}</style>
    </main>
  );
}
