import type { Express } from 'express';

import { getClientForRequest } from '../session';

// `listModels()` is only exposed on the Node SDK (it requires a full API key),
// so the browser fetches TTS models/voices through this proxy route.
export function register(app: Express) {
  app.get('/tts/models', async (req, res, next) => {
    try {
      const soniox = getClientForRequest(req);
      const models = await soniox.tts.listModels();
      res.json({ models });
    } catch (err) {
      next(err);
    }
  });
}
