import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const realtimeUrl =
    process.env.REALTIME_API_URL;

  const adminToken =
    process.env.REALTIME_ADMIN_TOKEN;

  if (!realtimeUrl || !adminToken) {
    console.error(
      '[API /stats] Missing realtime environment variables',
    );

    return NextResponse.json(
      {
        error:
          'Realtime server configuration is missing',
      },
      { status: 500 },
    );
  }

  try {
    const response = await fetch(
      `${realtimeUrl.replace(/\/$/, '')}/admin/stats`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
        cache: 'no-store',
      },
    );

    const data = await response.json();

    return NextResponse.json(
      data,
      {
        status: response.status,
      },
    );
  } catch (error) {
    console.error(
      '[API /stats] Failed to reach realtime server',
      error,
    );

    return NextResponse.json(
      {
        error:
          'Unable to reach realtime server',
      },
      { status: 502 },
    );
  }
}