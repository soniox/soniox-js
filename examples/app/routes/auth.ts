import type { Express } from 'express';

import { getClientForRequest } from '../session';

export function register(app: Express) {
  app.get('/tmp-key', async (req, res, next) => {
    try {
      const soniox = getClientForRequest(req);
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
