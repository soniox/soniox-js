import { SonioxNodeClient } from '@soniox/node';
import { NextResponse } from 'next/server';

const soniox = new SonioxNodeClient();

// You don't want to expose the API key to the client, so we generate a temporary one.
// Temporary API keys are then used to initialize the SonioxClient instance on the client.
export async function POST() {
  const { api_key } = await soniox.auth.createTemporaryKey({
    usage_type: 'transcribe_websocket',
    expires_in_seconds: 300,
  });

  return NextResponse.json({ apiKey: api_key });
}
