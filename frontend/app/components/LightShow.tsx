'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';

import {
  createSocket,
  type LightCommand,
  type ServerMessage,
} from '@/lib/websocket';

type ConnectionState =
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'offline';

export default function LightShow() {
  const [color, setColor] =
    useState('#000000');

  const [connection, setConnection] =
    useState<ConnectionState>(
      'connecting'
    );

  const [zone, setZone] =
    useState('main');

  const [row, setRow] =
    useState<string | undefined>();

  const [latency, setLatency] =
    useState<number | null>(null);

  const [flash, setFlash] =
    useState(false);

  const socketRef =
    useRef<WebSocket | null>(null);

  const reconnectRef =
    useRef<ReturnType<typeof setTimeout> | null>(
      null
    );

  const flashRef =
    useRef<ReturnType<typeof setTimeout> | null>(
      null
    );

  const mountedRef =
    useRef(true);

  const connect = useCallback(() => {
    if (!mountedRef.current) {
      return;
    }

    setConnection('connecting');

    const params =
      new URLSearchParams(
        window.location.search
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
        requestedRow
      );

    socketRef.current = socket;

    socket.onopen = () => {
      if (!mountedRef.current) {
        return;
      }

      setConnection('connected');

      console.log(
        `[LightShow] Connected to zone "${requestedZone}"`,
        requestedRow
          ? `row "${requestedRow}"`
          : ''
      );
    };

    socket.onmessage = event => {
      try {
        const message =
          JSON.parse(
            event.data
          ) as ServerMessage;

        handleMessage(message);
      } catch (error) {
        console.error(
          '[LightShow] Invalid message',
          error
        );
      }
    };

    socket.onclose = () => {
      if (!mountedRef.current) {
        return;
      }

      setConnection('reconnecting');

      scheduleReconnect();
    };

    socket.onerror = error => {
      console.warn(
        '[LightShow] WebSocket error',
        error
      );
    };
  }, []);

  const scheduleReconnect = useCallback(() => {
    if (
      reconnectRef.current ||
      !mountedRef.current
    ) {
      return;
    }

    reconnectRef.current =
      setTimeout(() => {
        reconnectRef.current = null;
        connect();
      }, 1500);
  }, [connect]);

  const handleCommand = (
    command: LightCommand
  ) => {
    if (
      command.action === 'off'
    ) {
      setFlash(false);
      setColor('#000000');
      return;
    }

    if (
      command.action === 'solid'
    ) {
      setFlash(false);
      setColor(command.color);
      return;
    }

    if (
      command.action === 'flash'
    ) {
      setColor(command.color);
      setFlash(true);

      if (flashRef.current) {
        clearTimeout(
          flashRef.current
        );
      }

      flashRef.current =
        setTimeout(() => {
          if (!mountedRef.current) {
            return;
          }

          setFlash(false);
          setColor('#000000');
        }, command.duration);
    }
  };

  const handleMessage = (
    message: ServerMessage
  ) => {
    if (
      message.type === 'command'
    ) {
      handleCommand(message);
      return;
    }

    if (
      message.type === 'pong'
    ) {
      const roundTrip =
        Date.now() -
        message.timestamp;

      setLatency(roundTrip);

      console.log(
        `[LightShow] WebSocket RTT: ${roundTrip}ms`
      );

      return;
    }

    if (
      message.type === 'joined'
    ) {
      console.log(
        `[LightShow] Joined ${message.zone}`,
        message.row
          ? `row ${message.row}`
          : ''
      );
    }
  };

  /*
   * Initial connection
   */
  useEffect(() => {
    mountedRef.current = true;

    connect();

    return () => {
      mountedRef.current = false;

      if (reconnectRef.current) {
        clearTimeout(
          reconnectRef.current
        );
      }

      if (flashRef.current) {
        clearTimeout(
          flashRef.current
        );
      }

      socketRef.current?.close();
    };
  }, [connect]);

  /*
   * Client → server ping.
   */
  useEffect(() => {
    const interval =
      setInterval(() => {
        const socket =
          socketRef.current;

        if (
          socket?.readyState ===
          WebSocket.OPEN
        ) {
          socket.send(
            JSON.stringify({
              type: 'ping',
              timestamp: Date.now(),
            })
          );
        }
      }, 5000);

    return () =>
      clearInterval(interval);
  }, []);

  return (
    <main
      className="fixed inset-0 overflow-hidden"
      style={{
        backgroundColor: color,
        transition: flash
          ? 'none'
          : 'background-color 700ms cubic-bezier(0.22, 1, 0.36, 1)',
      }}
    >
      {/* Very subtle idle UI */}
      <div
        className={[
          'pointer-events-none fixed',
          'inset-0 flex items-center',
          'justify-center',
          'transition-opacity duration-700',
          color === '#000000'
            ? 'opacity-100'
            : 'opacity-0',
        ].join(' ')}
      >
        <div className="text-center">
          <div className="text-xs font-medium uppercase tracking-[0.5em] text-white/20">
            Light Show
          </div>

          <div className="mt-3 text-[10px] uppercase tracking-[0.3em] text-white/10">
            Waiting for signal
          </div>
        </div>
      </div>

      {/* Debug / connection information */}
      <div className="fixed bottom-5 left-1/2 -translate-x-1/2">
        <div className="flex items-center gap-3 rounded-full border border-white/10 bg-black/20 px-4 py-2 backdrop-blur-xl">
          <span
            className={[
              'h-1.5 w-1.5 rounded-full',
              connection === 'connected'
                ? 'bg-green-400'
                : 'bg-yellow-400',
            ].join(' ')}
          />

          <span className="text-[10px] uppercase tracking-[0.25em] text-white/40">
            {zone}
            {row ? ` · Row ${row}` : ''}
          </span>

          {latency !== null && (
            <span className="font-mono text-[9px] text-white/20">
              {latency}ms
            </span>
          )}
        </div>
      </div>
    </main>
  );
}