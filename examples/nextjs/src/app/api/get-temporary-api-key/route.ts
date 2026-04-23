import { SonioxNodeClient } from '@soniox/node';
import type { TemporaryApiKeyUsageType } from '@soniox/node';
import { NextResponse } from 'next/server';

const soniox = new SonioxNodeClient();

const SUPPORTED_USAGE_TYPES: TemporaryApiKeyUsageType[] = ['transcribe_websocket', 'tts_rt'];

// You don't want to expose the API key to the client, so we generate a temporary one.
// Temporary API keys are then used to initialize the SonioxClient instance on the client.
//
// The client SDK forwards a ConfigContext with `usage` ('transcribe_websocket' or
// 'tts_rt') so we can mint a correctly-scoped temporary key for STT or TTS.
//
// We also echo the region / base_domain used by this server back to the browser.
// The temporary key is scoped to a specific regional deployment (e.g. EU or JP),
// so the browser SDK must connect to the matching regional endpoints — otherwise
// it would fall back to the default US endpoints and the key would fail to auth.
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const usageType: TemporaryApiKeyUsageType = SUPPORTED_USAGE_TYPES.includes(body?.usage_type)
    ? body.usage_type
    : 'transcribe_websocket';

  const { api_key } = await soniox.auth.createTemporaryKey({
    usage_type: usageType,
    expires_in_seconds: 300,
  });

  return NextResponse.json({
    apiKey: api_key,
    region: process.env.SONIOX_REGION ?? null,
    baseDomain: process.env.SONIOX_BASE_DOMAIN ?? null,
  });
}
