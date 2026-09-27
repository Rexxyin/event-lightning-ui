import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function POST(
  request: Request,
) {
  const realtimeUrl =
    process.env.REALTIME_API_URL;

  const adminToken =
    process.env.REALTIME_ADMIN_TOKEN;

  if (!realtimeUrl || !adminToken) {
    console.error(
      '[API /command] Missing realtime environment variables',
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
    const body = await request.json();

    const response = await fetch(
      `${realtimeUrl.replace(/\/$/, '')}/admin/command`,
      {
        method: 'POST',

        headers: {
          'Content-Type':
            'application/json',

          Authorization:
            `Bearer ${adminToken}`,
        },

        body: JSON.stringify(body),

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
      '[API /command] Failed to reach realtime server',
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