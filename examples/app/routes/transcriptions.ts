import type { Express } from 'express';

import { getClientForRequest } from '../session';

interface TranscriptionBody {
  audio_url?: string;
  file_id?: string;
  wait?: boolean;
  enable_speaker_diarization?: boolean;
  enable_language_identification?: boolean;
}

interface WaitBody {
  timeout_ms?: number;
}

export function register(app: Express) {
  app.post('/transcriptions', async (req, res, next) => {
    try {
      const soniox = getClientForRequest(req);
      const body = req.body as TranscriptionBody;

      if (body.audio_url) {
        const transcription = await soniox.stt.transcribeFromUrl(body.audio_url, {
          model: 'stt-async-v4',
          wait: body.wait,
          enable_speaker_diarization: body.enable_speaker_diarization,
          enable_language_identification: body.enable_language_identification,
        });
        return res.status(201).json(transcription);
      }

      if (body.file_id) {
        const transcription = await soniox.stt.transcribeFromFileId(body.file_id, {
          model: 'stt-async-v4',
          wait: body.wait,
          enable_speaker_diarization: body.enable_speaker_diarization,
          enable_language_identification: body.enable_language_identification,
        });
        return res.status(201).json(transcription);
      }

      return res.status(400).json({ error: 'audio_url or file_id required' });
    } catch (err) {
      next(err);
    }
  });

  app.get('/transcriptions', async (req, res, next) => {
    try {
      const soniox = getClientForRequest(req);
      const limit = req.query.limit ? Number(req.query.limit) : undefined;
      const result = await soniox.stt.list({ limit });
      res.json({
        transcriptions: result.transcriptions,
        next_page_cursor: result.next_page_cursor,
      });
    } catch (err) {
      next(err);
    }
  });

  app.get('/transcriptions/:id', async (req, res, next) => {
    try {
      const soniox = getClientForRequest(req);
      const transcription = await soniox.stt.get(req.params.id);
      if (!transcription) return res.status(404).json({ error: 'Transcription not found' });
      res.json(transcription);
    } catch (err) {
      next(err);
    }
  });

  app.get('/transcriptions/:id/transcript', async (req, res, next) => {
    try {
      const soniox = getClientForRequest(req);
      const transcript = await soniox.stt.getTranscript(req.params.id);
      if (!transcript) return res.status(404).json({ error: 'Transcript not found' });
      res.json({
        id: transcript.id,
        parsed: transcript.segments(),
        text: transcript.text,
        raw: transcript.tokens,
      });
    } catch (err) {
      next(err);
    }
  });

  app.post('/transcriptions/:id/wait', async (req, res, next) => {
    try {
      const soniox = getClientForRequest(req);
      const body = req.body as WaitBody;
      const transcription = await soniox.stt.wait(req.params.id, {
        timeout_ms: body.timeout_ms,
      });
      res.json(transcription);
    } catch (err) {
      next(err);
    }
  });

  app.delete('/transcriptions/:id', async (req, res, next) => {
    try {
      const soniox = getClientForRequest(req);
      await soniox.stt.delete(req.params.id);
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  });

  app.post('/transcriptions/purge', async (req, res, next) => {
    try {
      const soniox = getClientForRequest(req);
      const result = await soniox.stt.purge({
        on_progress: (transcription, index) => {
          console.log(`Purging transcription ${index + 1}: ${transcription.id}`);
        },
      });
      res.json(result);
    } catch (err) {
      next(err);
    }
  });
}
