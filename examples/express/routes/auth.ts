import type { SonioxNodeClient } from '@soniox/node';
import type { Express } from 'express';

export function register(app: Express, soniox: SonioxNodeClient) {
  app.get('/tmp-key', async (_req, res, next) => {
    try {
      const key = await soniox.auth.createTemporaryKey({
        usage_type: 'transcribe_websocket',
        expires_in_seconds: 3600,
      });
      res.json(key);
    } catch (err) {
      next(err);
    }
  });
}
