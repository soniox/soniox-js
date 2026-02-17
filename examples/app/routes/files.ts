import type { Express } from 'express';

import { getClientForRequest } from '../session';

export function register(app: Express) {
  app.post('/files', (req, res, next) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      const buffer = Buffer.concat(chunks);
      const filename = (req.headers['x-filename'] as string) || 'audio.mp3';
      const soniox = getClientForRequest(req);
      soniox.files
        .upload(buffer, { filename })
        .then((file) => res.status(201).json(file))
        .catch(next);
    });
    req.on('error', next);
  });

  app.get('/files', async (req, res, next) => {
    try {
      const soniox = getClientForRequest(req);
      const result = await soniox.files.list();
      const files = [];
      for await (const file of result) {
        files.push(file);
      }
      res.json(files);
    } catch (err) {
      next(err);
    }
  });

  app.get('/files/:id', async (req, res, next) => {
    try {
      const soniox = getClientForRequest(req);
      const file = await soniox.files.get(req.params.id);
      if (!file) return res.status(404).json({ error: 'File not found' });
      res.json(file);
    } catch (err) {
      next(err);
    }
  });

  app.delete('/files/:id', async (req, res, next) => {
    try {
      const soniox = getClientForRequest(req);
      await soniox.files.delete(req.params.id);
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  });

  app.post('/files/delete_all', async (req, res, next) => {
    try {
      const soniox = getClientForRequest(req);
      await soniox.files.delete_all();
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  });
}
