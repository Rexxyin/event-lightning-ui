export type LightAction =
  | 'solid'
  | 'flash'
  | 'off';

export interface LightCommand {
  type: 'command';
  action: LightAction;
  color: string;
  duration: number;
  timestamp: number;
  sequence: number;
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

export function createSocket(
  zone: string,
  row?: string
) {
  const base =
    process.env.NEXT_PUBLIC_WS_URL;

  if (!base) {
    throw new Error(
      'NEXT_PUBLIC_WS_URL is not configured'
    );
  }

  const url = new URL(base);

  url.searchParams.set('zone', zone);

  if (row) {
    url.searchParams.set('row', row);
  }

  return new WebSocket(url.toString());
}