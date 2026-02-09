import type { Express } from 'express';

import { getClientForRequest } from '../session';

export function register(app: Express) {
  app.get('/models', async (req, res, next) => {
    try {
      const soniox = getClientForRequest(req);
      const models = await soniox.models.list();
      res.json(models);
    } catch (err) {
      next(err);
    }
  });
}
