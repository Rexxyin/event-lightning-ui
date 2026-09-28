export type LightAction =
  | 'solid'
  | 'flash'
  | 'off';

export type PatternType =
  | 'pulse'
  | 'wave'
  | 'ripple'
  | 'chase'
  | 'spark'
  | 'comet'
  | 'finale';

export interface PatternConfig {
  type: PatternType;
  intensity: number;
  seed: number;
}

export interface LightCommand {
  type: 'command';
  action: LightAction;
  color: string;
  duration: number;
  timestamp: number;
  sequence: number;
  pattern?: PatternConfig;
}

export interface JoinedMessage {
  type: 'joined';
  zone: string;
  row?: string;
  serverTime: number;
}

export interface PongMessage {
  type: 'pong';
  timestamp: number;
  serverTime: number;
}

export type ServerMessage =
  | LightCommand
  | JoinedMessage
  | PongMessage;

export type AudienceEvent =
  | {
      type: 'tap';
      timestamp?: number;
    }
  | {
      type: 'ping';
      timestamp: number;
    };

export interface CrowdStats {
  totalTaps: number;
  tapsLastSecond: number;
  tapsLast5Seconds: number;
  tapsLast10Seconds: number;
  energy: number;
  activeConnections: number;
  updatedAt: number;
}

export function createSocket(
  zone: string,
  row?: string,
) {
  const base =
    process.env.NEXT_PUBLIC_WS_URL;

  if (!base) {
    throw new Error(
      'NEXT_PUBLIC_WS_URL is not configured',
    );
  }

  const url = new URL(base);

  url.searchParams.set('zone', zone);

  if (row) {
    url.searchParams.set('row', row);
  }

  return new WebSocket(url.toString());
}

export function sendTap(
  socket: WebSocket | null,
) {
  if (
    !socket ||
    socket.readyState !== WebSocket.OPEN
  ) {
    return false;
  }

  socket.send(
    JSON.stringify({
      type: 'tap',
      timestamp: Date.now(),
    } satisfies AudienceEvent),
  );

  return true;
}

export function sendPing(
  socket: WebSocket | null,
) {
  if (
    !socket ||
    socket.readyState !== WebSocket.OPEN
  ) {
    return false;
  }

  socket.send(
    JSON.stringify({
      type: 'ping',
      timestamp: Date.now(),
    } satisfies AudienceEvent),
  );

  return true;
}