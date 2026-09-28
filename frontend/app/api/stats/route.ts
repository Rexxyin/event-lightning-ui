import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const FALLBACK_CROWD = {
  totalTaps: 0,
  tapsLastSecond: 0,
  tapsLast5Seconds: 0,
  tapsLast10Seconds: 0,
  energy: 0,
  activeConnections: 0,
  updatedAt: Date.now(),
};

export async function GET() {
  const realtimeUrl = process.env.REALTIME_API_URL;
  const adminToken = process.env.REALTIME_ADMIN_TOKEN;

  if (!realtimeUrl || !adminToken) {
    return NextResponse.json(
      { error: 'Realtime server configuration is missing' },
      { status: 500 },
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch(
      `${realtimeUrl.replace(/\/$/, '')}/admin/stats`,
      {
        headers: { Authorization: `Bearer ${adminToken}` },
        cache: 'no-store',
        signal: controller.signal,
      },
    );

    const data = await response.json();

    if (!response.ok) {
      return NextResponse.json(data, { status: response.status });
    }

    const rooms = data.rooms ?? {};

    return NextResponse.json({
      status: data.status ?? 'ok',
      serverTime: data.serverTime ?? Date.now(),
      total: rooms.totalClients ?? 0,
      zones: rooms.zones ?? {},
      crowd: data.crowd ?? FALLBACK_CROWD,
    });
  } catch (error) {
    console.error('[API /stats] failed', error);
    return NextResponse.json(
      { error: error instanceof Error && error.name === 'AbortError' ? 'Realtime server timed out' : 'Unable to reach realtime server' },
      { status: 502 },
    );
  } finally {
    clearTimeout(timeout);
  }
}
