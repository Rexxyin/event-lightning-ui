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

type ActiveEffect =
  | 'off'
  | 'solid'
  | 'flash';

function normalizeColor(
  value: string,
): string {
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
): string {
  const { r, g, b } = hexToRgb(hex);

  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export default function LightShow() {
  const [color, setColor] =
    useState('#FFFFFF');

  const [connection, setConnection] =
    useState<ConnectionState>(
      'connecting',
    );

  const [zone, setZone] =
    useState('main');

  const [row, setRow] =
    useState<string | undefined>();

  const [latency, setLatency] =
    useState<number | null>(null);

  const [activeEffect, setActiveEffect] =
    useState<ActiveEffect>('off');

  const [flashKey, setFlashKey] =
    useState(0);

  const [flashDuration, setFlashDuration] =
    useState(500);

  const socketRef =
    useRef<WebSocket | null>(null);

  const reconnectTimer =
    useRef<ReturnType<
      typeof setTimeout
    > | null>(null);

  const pingTimer =
    useRef<ReturnType<
      typeof setInterval
    > | null>(null);

  const flashTimer =
    useRef<ReturnType<
      typeof setTimeout
    > | null>(null);

  const mountedRef =
    useRef(true);

  /*
   * Keep the latest message handler available
   * without creating unnecessary socket
   * reconnects.
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

      /*
       * OFF
       */
      if (command.action === 'off') {
        setActiveEffect('off');
        return;
      }

      /*
       * SOLID
       */
      if (command.action === 'solid') {
        setActiveEffect('solid');
        return;
      }

      /*
       * FLASH
       */
      if (command.action === 'flash') {
        const duration = Math.max(
          50,
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

        /*
         * Incrementing the key restarts the
         * CSS animation for every flash command.
         */
        setFlashKey(
          (current) => current + 1,
        );

        setActiveEffect('flash');

        flashTimer.current =
          setTimeout(() => {
            if (
              mountedRef.current
            ) {
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
      /*
       * Initial room confirmation.
       */
      if (message.type === 'joined') {
        setZone(message.zone);
        setRow(message.row);

        return;
      }

      /*
       * Latency response.
       */
      if (message.type === 'pong') {
        const roundTrip =
          Date.now() -
          message.timestamp;

        setLatency(roundTrip);

        console.log(
          `[LightShow] WebSocket RTT: ${roundTrip}ms`,
        );

        return;
      }

      /*
       * Light command.
       */
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

    /*
     * Prevent duplicate sockets.
     */
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
      const params =
        new URLSearchParams(
          window.location.search,
        );

      const requestedZone =
        params.get('zone')?.trim() ||
        'main';

      const requestedRow =
        params.get('row')?.trim() ||
        undefined;

      setZone(requestedZone);
      setRow(requestedRow);

      const socket =
        createSocket(
          requestedZone,
          requestedRow,
        );

      socketRef.current = socket;

      socket.onopen = () => {
        if (!mountedRef.current) {
          return;
        }

        console.log(
          '[LightShow] connected',
        );

        setConnection('connected');
      };

      socket.onmessage = (
        event,
      ) => {
        try {
          const message =
            JSON.parse(
              event.data,
            ) as ServerMessage;

          handleMessage(message);
        } catch (error) {
          console.error(
            '[LightShow] invalid message',
            error,
          );
        }
      };

      socket.onerror = () => {
        console.warn(
          '[LightShow] WebSocket error',
        );

        if (mountedRef.current) {
          setConnection(
            'disconnected',
          );
        }
      };

      socket.onclose = () => {
        console.warn(
          '[LightShow] disconnected',
        );

        socketRef.current = null;

        if (!mountedRef.current) {
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
          setTimeout(() => {
            connect();
          }, 1500);
      };
    } catch (error) {
      console.error(
        '[LightShow] connection failed',
        error,
      );

      socketRef.current = null;

      setConnection(
        'disconnected',
      );

      reconnectTimer.current =
        setTimeout(() => {
          connect();
        }, 1500);
    }
  }, [handleMessage]);

  /*
   * Initial WebSocket connection.
   */
  useEffect(() => {
    mountedRef.current = true;

    connect();

    return () => {
      mountedRef.current = false;

      if (
        reconnectTimer.current
      ) {
        clearTimeout(
          reconnectTimer.current,
        );

        reconnectTimer.current = null;
      }

      if (pingTimer.current) {
        clearInterval(
          pingTimer.current,
        );

        pingTimer.current = null;
      }

      if (flashTimer.current) {
        clearTimeout(
          flashTimer.current,
        );

        flashTimer.current = null;
      }

      socketRef.current?.close();
      socketRef.current = null;
    };
  }, [connect]);

  /*
   * Client -> server latency heartbeat.
   */
  useEffect(() => {
    if (
      connection !== 'connected'
    ) {
      if (pingTimer.current) {
        clearInterval(
          pingTimer.current,
        );

        pingTimer.current = null;
      }

      return;
    }

    const sendPing = () => {
      const socket =
        socketRef.current;

      if (
        socket?.readyState !==
        WebSocket.OPEN
      ) {
        return;
      }

      socket.send(
        JSON.stringify({
          type: 'ping',
          timestamp: Date.now(),
        }),
      );
    };

    /*
     * Get an initial latency measurement
     * immediately after connection.
     */
    sendPing();

    pingTimer.current =
      setInterval(
        sendPing,
        5000,
      );

    return () => {
      if (pingTimer.current) {
        clearInterval(
          pingTimer.current,
        );

        pingTimer.current = null;
      }
    };
  }, [connection]);

  /*
   * Convert the selected color into CSS
   * variables used by the visual layers.
   */
  const colorStyles =
    useMemo<CSSProperties>(() => {
      return {
        '--light': color,
        '--light-soft': rgba(
          color,
          0.45,
        ),
        '--light-mid': rgba(
          color,
          0.7,
        ),
        '--light-strong': rgba(
          color,
          0.95,
        ),
        '--flash-duration': `${flashDuration}ms`,
      } as CSSProperties;
    }, [color, flashDuration]);

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
          ? 'light-show--flash'
          : '',
      ].join(' ')}
      style={colorStyles}
    >
      {/* ================================================= */}
      {/* BASE */}
      {/* ================================================= */}

      <div className="light-show__base" />

      {/* ================================================= */}
      {/* ACTIVE LIGHT SHOW */}
      {/* ================================================= */}

      {isLit && (
        <>
          {/* Full-screen base light */}
          <div className="light-show__field" />

          {/* Large luminous blooms */}
          <div className="light-show__bloom light-show__bloom--one" />

          <div className="light-show__bloom light-show__bloom--two" />

          <div className="light-show__bloom light-show__bloom--three" />

          {/* Large moving light beams */}
          <div className="light-show__beam light-show__beam--one" />

          <div className="light-show__beam light-show__beam--two" />

          <div className="light-show__beam light-show__beam--three" />

          {/* Dense full-screen texture */}
          <div className="light-show__texture" />

          {/* Bright glitter layer */}
          <div className="light-show__sparkle" />

          {/* Flash burst */}
          {activeEffect === 'flash' && (
            <div
              key={flashKey}
              className="light-show__flash"
            />
          )}
        </>
      )}

      {/* ================================================= */}
      {/* CONNECTION STATUS */}
      {/* ================================================= */}

      {connection !==
        'connected' && (
        <div className="light-show__status">
          <span className="light-show__status-dot" />

          <span>
            {connection ===
            'connecting'
              ? 'Connecting'
              : 'Reconnecting'}
          </span>

          <span className="light-show__status-separator">
            /
          </span>

          <span>
            {zone}
            {row
              ? ` / ${row}`
              : ''}
          </span>
        </div>
      )}

      {/* ================================================= */}
      {/* DEBUG INFO */}
      {/* ================================================= */}

      {connection ===
        'connected' && (
        <div className="light-show__debug">
          <span>
            {zone}
            {row
              ? ` / ${row}`
              : ''}
          </span>

          {latency !== null && (
            <>
              <span>·</span>

              <span>
                {latency}ms
              </span>
            </>
          )}
        </div>
      )}

      <style jsx>{`
        /*
         * =====================================================
         * ROOT
         * =====================================================
         */

        .light-show {
          --light: #ffffff;

          --light-soft: rgba(
            255,
            255,
            255,
            0.45
          );

          --light-mid: rgba(
            255,
            255,
            255,
            0.7
          );

          --light-strong: rgba(
            255,
            255,
            255,
            0.95
          );

          --flash-duration: 500ms;

          position: fixed;
          inset: 0;

          z-index: 9999;

          width: 100vw;
          height: 100dvh;

          overflow: hidden;

          background: #000;

          isolation: isolate;

          -webkit-user-select: none;
          user-select: none;

          -webkit-tap-highlight-color: transparent;
        }

        /*
         * =====================================================
         * BASE
         * =====================================================
         */

        .light-show__base {
          position: absolute;
          inset: 0;

          z-index: 0;

          background: #000;
        }

        /*
         * =====================================================
         * MAIN FULL-SCREEN LIGHT
         *
         * The most important layer.
         *
         * Even if every other animation is removed,
         * the phone is still a bright colored rectangle
         * visible from far away.
         * =====================================================
         */

        .light-show__field {
          position: absolute;
          inset: -12%;

          z-index: 1;

          background:
            radial-gradient(
              ellipse at 50% 45%,
              var(--light-strong) 0%,
              var(--light-mid) 28%,
              var(--light) 58%,
              var(--light-soft) 82%,
              var(--light) 100%
            );

          animation:
            field-breathe 5s
            ease-in-out infinite;

          transform: translateZ(0);

          will-change:
            transform,
            opacity;
        }

        /*
         * =====================================================
         * LARGE LIGHT BLOOMS
         * =====================================================
         */

        .light-show__bloom {
          position: absolute;

          z-index: 2;

          width: 85vw;
          height: 85vw;

          max-width: 1000px;
          max-height: 1000px;

          border-radius: 9999px;

          pointer-events: none;

          filter: blur(50px);

          opacity: 0.5;

          will-change: transform;
        }

        .light-show__bloom--one {
          left: -25%;
          top: -20%;

          background: var(--light-strong);

          animation:
            bloom-one 8s
            ease-in-out infinite
            alternate;
        }

        .light-show__bloom--two {
          right: -30%;
          bottom: -25%;

          width: 75vw;
          height: 75vw;

          background: var(--light-soft);

          animation:
            bloom-two 10s
            ease-in-out infinite
            alternate;
        }

        .light-show__bloom--three {
          left: 25%;
          top: 20%;

          width: 50vw;
          height: 50vw;

          background: var(--light-mid);

          opacity: 0.25;

          animation:
            bloom-three 7s
            ease-in-out infinite
            alternate;
        }

        /*
         * =====================================================
         * LARGE MOVING LIGHT BANDS
         * =====================================================
         */

        .light-show__beam {
          position: absolute;

          z-index: 3;

          left: -35%;

          width: 170%;
          height: 18%;

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
                  0.02
                )
                20%,
              rgba(
                  255,
                  255,
                  255,
                  0.24
                )
                50%,
              rgba(
                  255,
                  255,
                  255,
                  0.02
                )
                80%,
              transparent 100%
            );

          filter: blur(18px);

          mix-blend-mode: screen;

          opacity: 0.6;
        }

        .light-show__beam--one {
          top: 12%;

          transform:
            rotate(-18deg);

          animation:
            beam-one 7s
            ease-in-out infinite;
        }

        .light-show__beam--two {
          top: 44%;

          transform:
            rotate(14deg);

          opacity: 0.45;

          animation:
            beam-two 9s
            ease-in-out infinite;
        }

        .light-show__beam--three {
          top: 72%;

          transform:
            rotate(-11deg);

          opacity: 0.4;

          animation:
            beam-three 8s
            ease-in-out infinite;
        }

        /*
         * =====================================================
         * DENSE TEXTURE
         *
         * Multiple repeating patterns give the screen
         * a rich texture without hundreds of DOM nodes.
         * =====================================================
         */

        .light-show__texture {
          position: absolute;
          inset: 0;

          z-index: 4;

          pointer-events: none;

          background:
            radial-gradient(
              circle at 20% 30%,
              rgba(
                  255,
                  255,
                  255,
                  0.25
                )
                0 1px,
              transparent 2px
            ),
            radial-gradient(
              circle at 70% 20%,
              rgba(
                  255,
                  255,
                  255,
                  0.18
                )
                0 1px,
              transparent 2px
            ),
            radial-gradient(
              circle at 45% 75%,
              rgba(
                  255,
                  255,
                  255,
                  0.2
                )
                0 1px,
              transparent 2px
            ),
            radial-gradient(
              circle at 85% 65%,
              rgba(
                  255,
                  255,
                  255,
                  0.18
                )
                0 1px,
              transparent 2px
            ),
            repeating-radial-gradient(
              circle at 50% 50%,
              rgba(
                  255,
                  255,
                  255,
                  0.08
                )
                0 1px,
              transparent 1px 8px
            );

          background-size:
            37px 37px,
            53px 53px,
            47px 47px,
            61px 61px,
            13px 13px;

          mix-blend-mode: screen;

          opacity: 0.55;

          animation:
            texture-drift 12s
            linear infinite;
        }

        /*
         * =====================================================
         * GLITTER
         * =====================================================
         */

        .light-show__sparkle {
          position: absolute;
          inset: -20%;

          z-index: 5;

          pointer-events: none;

          background:
            radial-gradient(
              circle at 8% 12%,
              rgba(
                  255,
                  255,
                  255,
                  0.85
                )
                0 1px,
              transparent 2px
            ),
            radial-gradient(
              circle at 19% 74%,
              rgba(
                  255,
                  255,
                  255,
                  0.7
                )
                0 1px,
              transparent 2px
            ),
            radial-gradient(
              circle at 33% 38%,
              rgba(
                  255,
                  255,
                  255,
                  0.75
                )
                0 1.5px,
              transparent 2.5px
            ),
            radial-gradient(
              circle at 48% 82%,
              rgba(
                  255,
                  255,
                  255,
                  0.65
                )
                0 1px,
              transparent 2px
            ),
            radial-gradient(
              circle at 61% 18%,
              rgba(
                  255,
                  255,
                  255,
                  0.8
                )
                0 1.5px,
              transparent 2.5px
            ),
            radial-gradient(
              circle at 77% 53%,
              rgba(
                  255,
                  255,
                  255,
                  0.75
                )
                0 1px,
              transparent 2px
            ),
            radial-gradient(
              circle at 91% 31%,
              rgba(
                  255,
                  255,
                  255,
                  0.8
                )
                0 1.5px,
              transparent 2.5px
            ),
            radial-gradient(
              circle at 84% 88%,
              rgba(
                  255,
                  255,
                  255,
                  0.7
                )
                0 1px,
              transparent 2px
            );

          background-size:
            23vw 23vw,
            31vw 31vw,
            27vw 27vw,
            19vw 19vw,
            29vw 29vw,
            25vw 25vw,
            21vw 21vw,
            33vw 33vw;

          mix-blend-mode: screen;

          opacity: 0.65;

          animation:
            sparkle-drift 5s
            ease-in-out infinite
            alternate;
        }

        /*
         * =====================================================
         * FLASH
         * =====================================================
         */

        .light-show__flash {
          position: absolute;
          inset: 0;

          z-index: 10;

          pointer-events: none;

          background:
            radial-gradient(
              circle at 50% 50%,
              #ffffff 0%,
              rgba(
                  255,
                  255,
                  255,
                  0.98
                )
                20%,
              var(--light) 48%,
              transparent 100%
            );

          animation:
            flash-burst
            var(--flash-duration)
            cubic-bezier(
              0.22,
              1,
              0.36,
              1
            )
            forwards;

          mix-blend-mode: screen;
        }

        /*
         * =====================================================
         * CONNECTION STATUS
         * =====================================================
         */

        .light-show__status {
          position: absolute;

          left: 50%;
          bottom: 24px;

          z-index: 30;

          display: flex;
          align-items: center;
          gap: 7px;

          transform:
            translateX(-50%);

          padding: 7px 11px;

          border: 1px solid
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

          backdrop-filter: blur(10px);

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

          letter-spacing: 0.08em;

          text-transform: uppercase;
        }

        .light-show__status-dot {
          width: 5px;
          height: 5px;

          border-radius: 999px;

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

        .light-show__status-separator {
          color:
            rgba(
              255,
              255,
              255,
              0.2
            );
        }

        /*
         * =====================================================
         * DEBUG
         *
         * Kept extremely subtle for now.
         * We can remove this entirely before the event.
         * =====================================================
         */

        .light-show__debug {
          position: absolute;

          right: 12px;
          bottom: 10px;

          z-index: 30;

          display: flex;
          align-items: center;
          gap: 5px;

          color:
            rgba(
              255,
              255,
              255,
              0.12
            );

          font-family:
            ui-monospace,
            SFMono-Regular,
            Menlo,
            monospace;

          font-size: 8px;

          pointer-events: none;
        }

        /*
         * =====================================================
         * OFF
         * =====================================================
         */

        .light-show--off {
          background: #000;
        }

        .light-show--off
          .light-show__base {
          background: #000;
        }

        /*
         * =====================================================
         * ACTIVE
         * =====================================================
         */

        .light-show--active {
          background: var(--light);
        }

        /*
         * =====================================================
         * FLASH FIELD
         * =====================================================
         */

        .light-show--flash
          .light-show__field {
          animation:
            field-flash
            var(--flash-duration)
            ease-out
            infinite;
        }

        /*
         * =====================================================
         * FIELD BREATHING
         * =====================================================
         */

        @keyframes field-breathe {
          0%,
          100% {
            transform:
              scale(1.02);

            opacity: 0.94;
          }

          50% {
            transform:
              scale(1.08);

            opacity: 1;
          }
        }

        /*
         * =====================================================
         * FLASH FIELD
         * =====================================================
         */

        @keyframes field-flash {
          0% {
            opacity: 0.9;
          }

          20% {
            opacity: 1;
          }

          45% {
            opacity: 0.55;
          }

          70% {
            opacity: 1;
          }

          100% {
            opacity: 0.9;
          }
        }

        /*
         * =====================================================
         * BLOOM ONE
         * =====================================================
         */

        @keyframes bloom-one {
          0% {
            transform:
              translate3d(
                -4%,
                -2%,
                0
              )
              scale(0.9);
          }

          50% {
            transform:
              translate3d(
                12%,
                10%,
                0
              )
              scale(1.08);
          }

          100% {
            transform:
              translate3d(
                2%,
                18%,
                0
              )
              scale(0.96);
          }
        }

        /*
         * =====================================================
         * BLOOM TWO
         * =====================================================
         */

        @keyframes bloom-two {
          0% {
            transform:
              translate3d(
                10%,
                10%,
                0
              )
              scale(0.9);
          }

          50% {
            transform:
              translate3d(
                -8%,
                -12%,
                0
              )
              scale(1.1);
          }

          100% {
            transform:
              translate3d(
                -18%,
                4%,
                0
              )
              scale(0.98);
          }
        }

        /*
         * =====================================================
         * BLOOM THREE
         * =====================================================
         */

        @keyframes bloom-three {
          0% {
            transform:
              translate3d(
                -10%,
                10%,
                0
              )
              scale(0.85);
          }

          100% {
            transform:
              translate3d(
                15%,
                -12%,
                0
              )
              scale(1.12);
          }
        }

        /*
         * =====================================================
         * BEAM ONE
         * =====================================================
         */

        @keyframes beam-one {
          0%,
          100% {
            transform:
              translate3d(
                -8%,
                -10%,
                0
              )
              rotate(-18deg);
          }

          50% {
            transform:
              translate3d(
                12%,
                12%,
                0
              )
              rotate(-12deg);
          }
        }

        /*
         * =====================================================
         * BEAM TWO
         * =====================================================
         */

        @keyframes beam-two {
          0%,
          100% {
            transform:
              translate3d(
                12%,
                4%,
                0
              )
              rotate(14deg);
          }

          50% {
            transform:
              translate3d(
                -12%,
                -8%,
                0
              )
              rotate(8deg);
          }
        }

        /*
         * =====================================================
         * BEAM THREE
         * =====================================================
         */

        @keyframes beam-three {
          0%,
          100% {
            transform:
              translate3d(
                -10%,
                0,
                0
              )
              rotate(-11deg);
          }

          50% {
            transform:
              translate3d(
                14%,
                5%,
                0
              )
              rotate(-5deg);
          }
        }

        /*
         * =====================================================
         * TEXTURE DRIFT
         * =====================================================
         */

        @keyframes texture-drift {
          0% {
            transform:
              translate3d(
                0,
                0,
                0
              )
              scale(1);
          }

          50% {
            transform:
              translate3d(
                2%,
                -2%,
                0
              )
              scale(1.04);
          }

          100% {
            transform:
              translate3d(
                -2%,
                2%,
                0
              )
              scale(1);
          }
        }

        /*
         * =====================================================
         * SPARKLE
         * =====================================================
         */

        @keyframes sparkle-drift {
          0% {
            transform:
              translate3d(
                -1%,
                1%,
                0
              )
              scale(1);

            opacity: 0.35;
          }

          50% {
            opacity: 0.85;
          }

          100% {
            transform:
              translate3d(
                2%,
                -2%,
                0
              )
              scale(1.04);

            opacity: 0.55;
          }
        }

        /*
         * =====================================================
         * FLASH BURST
         * =====================================================
         */

        @keyframes flash-burst {
          0% {
            opacity: 0;

            transform:
              scale(0.8);
          }

          12% {
            opacity: 1;

            transform:
              scale(1.08);
          }

          32% {
            opacity: 0.9;

            transform:
              scale(1.03);
          }

          58% {
            opacity: 0.2;

            transform:
              scale(1);
          }

          100% {
            opacity: 0;

            transform:
              scale(1.1);
          }
        }

        /*
         * =====================================================
         * REDUCED MOTION
         *
         * Keep the phone bright but remove movement.
         * =====================================================
         */

        @media (
          prefers-reduced-motion: reduce
        ) {
          .light-show__field,
          .light-show__bloom,
          .light-show__beam,
          .light-show__texture,
          .light-show__sparkle,
          .light-show__flash {
            animation: none !important;
          }
        }
      `}</style>
    </main>
  );
}