import type { SonioxNodeClient } from '@soniox/node';
import type { Express } from 'express';

export function register(app: Express, soniox: SonioxNodeClient) {
  app.post('/files', (req, res, next) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      const buffer = Buffer.concat(chunks);
      const filename = (req.headers['x-filename'] as string) || 'audio.mp3';
      soniox.files
        .upload(buffer, { filename })
        .then((file) => res.status(201).json(file))
        .catch(next);
    });
    req.on('error', next);
  });

  app.get('/files', async (_req, res, next) => {
    try {
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
      const file = await soniox.files.get(req.params.id);
      if (!file) return res.status(404).json({ error: 'File not found' });
      res.json(file);
    } catch (err) {
      next(err);
    }
  });

  app.delete('/files/:id', async (req, res, next) => {
    try {
      await soniox.files.delete(req.params.id);
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  });

  app.post('/files/purge', async (_req, res, next) => {
    try {
      const result = await soniox.files.purge({
        on_progress: (file, index) => {
          console.log(`Purging file ${index + 1}: ${file.id}`);
        },
      });
      res.json(result);
    } catch (err) {
      next(err);
    }
  });
}
