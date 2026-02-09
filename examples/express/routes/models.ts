import type { SonioxNodeClient } from '@soniox/node';
import type { Express } from 'express';

export function register(app: Express, soniox: SonioxNodeClient) {
  app.get('/models', async (_req, res, next) => {
    try {
      const models = await soniox.models.list();
      res.json(models);
    } catch (err) {
      next(err);
    }
  });
}
