import type { TemporaryApiKeyUsageType } from '@soniox/node';
import type { Express } from 'express';

import { getClientForRequest } from '../session';

const SUPPORTED_USAGE_TYPES: TemporaryApiKeyUsageType[] = ['transcribe_websocket', 'tts_rt'];

// You don't want to expose the raw API key to the browser, so we mint a
// temporary one. The client SDK calls this route via a `ConfigContext` with
// `usage` ('transcribe_websocket' or 'tts_rt') so we mint a correctly-scoped
// temporary key for STT or TTS.
//
// We also echo the region / base_domain this server is running against. The
// temporary key is scoped to a specific regional deployment (US/EU/JP), so
// the browser SDK must connect to the matching regional endpoints — otherwise
// it would fall back to the default US endpoints and the key would fail auth.
export function register(app: Express) {
  app.post('/tmp-key', async (req, res, next) => {
    try {
      const body = (req.body ?? {}) as { usage_type?: string };
      const usageType: TemporaryApiKeyUsageType = SUPPORTED_USAGE_TYPES.includes(
        body.usage_type as TemporaryApiKeyUsageType
      )
        ? (body.usage_type as TemporaryApiKeyUsageType)
        : 'transcribe_websocket';

      const soniox = getClientForRequest(req);
      const { api_key } = await soniox.auth.createTemporaryKey({
        usage_type: usageType,
        expires_in_seconds: 300,
      });

      res.json({
        apiKey: api_key,
        region: process.env['SONIOX_REGION'] ?? null,
        baseDomain: process.env['SONIOX_BASE_DOMAIN'] ?? null,
      });
    } catch (err) {
      next(err);
    }
  });
}
