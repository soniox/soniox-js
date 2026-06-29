import type { Express } from 'express';

import { getClientForRequest } from '../session';

// Custom (cloned) Text-to-Speech voices via `client.tts.voices`. The reference
// clip is uploaded as a raw request body (mirroring the /files route) to avoid
// pulling in a multipart dependency for the demo.
export function register(app: Express) {
  app.get('/voices', async (req, res, next) => {
    try {
      const soniox = getClientForRequest(req);
      const result = await soniox.tts.voices.list();
      const voices = [];
      for await (const voice of result) {
        voices.push(voice.toJSON());
      }
      res.json(voices);
    } catch (err) {
      next(err);
    }
  });

  app.get('/voices/count', async (req, res, next) => {
    try {
      const soniox = getClientForRequest(req);
      const count = await soniox.tts.voices.count();
      res.json(count);
    } catch (err) {
      next(err);
    }
  });

  app.post('/voices', (req, res, next) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      const buffer = Buffer.concat(chunks);
      const name = (req.headers['x-voice-name'] as string) || 'My voice';
      const filename = (req.headers['x-filename'] as string) || 'reference.wav';
      const soniox = getClientForRequest(req);
      soniox.tts.voices
        .create({ name, file: buffer, filename })
        .then((voice) => res.status(201).json(voice.toJSON()))
        .catch(next);
    });
    req.on('error', next);
  });

  app.post('/voices/:id/recompute', async (req, res, next) => {
    try {
      const soniox = getClientForRequest(req);
      const { model } = (req.body ?? {}) as { model?: string };
      const voice = await soniox.tts.voices.recompute(req.params.id, model ? { model } : {});
      res.json(voice.toJSON());
    } catch (err) {
      next(err);
    }
  });

  app.delete('/voices/:id', async (req, res, next) => {
    try {
      const soniox = getClientForRequest(req);
      await soniox.tts.voices.delete(req.params.id);
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  });
}
