import { readFileSync } from 'fs';
import path from 'path';

import { SonioxNodeClient } from '@soniox/node';
import request from 'supertest';

import { app } from './server';

const AUDIO_FILE_SHORT = path.join(__dirname, '../../audio_samples/audio_short.mp3');
const AUDIO_FILE_DIALOG = path.join(__dirname, '../../audio_samples/audio_dialog.mp3');

const describeWithApiKey = process.env.SONIOX_API_KEY ? describe : describe.skip;

// =============================================================================
// Webhook Handler Tests (no API key required)
// =============================================================================

interface WebhookResponse {
  received?: boolean;
  error?: string;
}

describe('Webhook Handler', () => {
  // Suppress console.error/log during webhook tests
  beforeEach(() => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  it('accepts completed status', async () => {
    const res = await request(app)
      .post('/webhook')
      .send({ id: '550e8400-e29b-41d4-a716-446655440000', status: 'completed' });

    expect(res.status).toBe(200);
    expect((res.body as WebhookResponse).received).toBe(true);
  });

  it('accepts error status', async () => {
    const res = await request(app)
      .post('/webhook')
      .send({ id: '550e8400-e29b-41d4-a716-446655440000', status: 'error' });

    expect(res.status).toBe(200);
    expect((res.body as WebhookResponse).received).toBe(true);
  });

  it('rejects invalid status', async () => {
    const res = await request(app)
      .post('/webhook')
      .send({ id: '550e8400-e29b-41d4-a716-446655440000', status: 'processing' });

    expect(res.status).toBe(400);
    expect((res.body as WebhookResponse).error).toBeDefined();
  });

  it('rejects missing id', async () => {
    const res = await request(app).post('/webhook').send({ status: 'completed' });

    expect(res.status).toBe(400);
    expect((res.body as WebhookResponse).error).toBeDefined();
  });

  it('rejects missing status', async () => {
    const res = await request(app).post('/webhook').send({ id: '550e8400-e29b-41d4-a716-446655440000' });

    expect(res.status).toBe(400);
    expect((res.body as WebhookResponse).error).toBeDefined();
  });

  it('rejects empty payload', async () => {
    const res = await request(app).post('/webhook').send({});

    expect(res.status).toBe(400);
    expect((res.body as WebhookResponse).error).toBeDefined();
  });
});

// =============================================================================
// API Integration Tests (require API key)
// =============================================================================

describeWithApiKey('Soniox SDK Integration Tests', () => {
  let client: SonioxNodeClient;

  beforeAll(() => {
    client = new SonioxNodeClient();
  });

  describe('Auth', () => {
    it('creates temporary API key', async () => {
      const result = await client.auth.createTemporaryKey({
        usage_type: 'transcribe_websocket',
        expires_in_seconds: 60,
      });

      expect(result.api_key).toBeDefined();
      expect(result.expires_at).toBeDefined();
    });
  });

  describe('Models', () => {
    it('lists available models', async () => {
      const models = await client.models.list();

      expect(Array.isArray(models)).toBe(true);
      expect(models.length).toBeGreaterThan(0);
      expect(models[0]).toHaveProperty('id');
    });
  });

  describe('Files', () => {
    let uploadedFileId: string;

    it('uploads a file', async () => {
      const buffer = readFileSync(AUDIO_FILE_SHORT);
      const file = await client.files.upload(buffer, { filename: 'test-audio.mp3' });

      expect(file.id).toBeDefined();
      expect(file.filename).toBe('test-audio.mp3');
      uploadedFileId = file.id;
    });

    it('lists files', async () => {
      const result = await client.files.list();
      const files = [];
      for await (const file of result) {
        files.push(file);
        if (files.length >= 10) break;
      }

      expect(Array.isArray(files)).toBe(true);
    });

    it('gets a file by id', async () => {
      expect(uploadedFileId).toBeDefined();
      const file = await client.files.get(uploadedFileId);

      expect(file).not.toBeNull();
      expect(file?.id).toBe(uploadedFileId);
    });

    it('deletes a file', async () => {
      expect(uploadedFileId).toBeDefined();
      await client.files.delete(uploadedFileId);

      const file = await client.files.get(uploadedFileId);
      expect(file).toBeNull();
    });
  });

  describe('Transcriptions', () => {
    let transcriptionId: string;

    it('transcribes from file and waits for completion', async () => {
      const buffer = readFileSync(AUDIO_FILE_SHORT);
      const transcription = await client.stt.transcribeFromFile(buffer, {
        model: 'stt-async-v4',
        filename: 'test-audio.mp3',
        wait: true,
      });

      expect(transcription.id).toBeDefined();
      expect(transcription.status).toBe('completed');
      transcriptionId = transcription.id;
    }, 60000);

    it('gets transcript', async () => {
      expect(transcriptionId).toBeDefined();
      const transcript = await client.stt.getTranscript(transcriptionId);

      expect(transcript).not.toBeNull();
      expect(transcript?.text).toBeDefined();
      expect(transcript?.tokens).toBeDefined();
    });

    it('gets transcription by id', async () => {
      expect(transcriptionId).toBeDefined();
      const transcription = await client.stt.get(transcriptionId);

      expect(transcription).not.toBeNull();
      expect(transcription?.id).toBe(transcriptionId);
    });

    it('lists transcriptions', async () => {
      const result = await client.stt.list({ limit: 10 });

      expect(result.transcriptions).toBeDefined();
      expect(Array.isArray(result.transcriptions)).toBe(true);
    });

    it('deletes transcription', async () => {
      expect(transcriptionId).toBeDefined();
      await client.stt.delete(transcriptionId);

      const transcription = await client.stt.get(transcriptionId);
      expect(transcription).toBeNull();
    });
  });

  describe('Transcriptions with options', () => {
    it('transcribes with speaker diarization', async () => {
      const buffer = readFileSync(AUDIO_FILE_DIALOG);
      const transcription = await client.stt.transcribeFromFile(buffer, {
        model: 'stt-async-v4',
        filename: 'test-audio.mp3',
        enable_speaker_diarization: true,
        wait: true,
      });

      expect(transcription.status).toBe('completed');
      expect(transcription.enable_speaker_diarization).toBe(true);

      await client.stt.destroy(transcription.id);
    }, 60000);

    it('transcribes with language identification', async () => {
      const buffer = readFileSync(AUDIO_FILE_DIALOG);
      const transcription = await client.stt.transcribeFromFile(buffer, {
        model: 'stt-async-v4',
        filename: 'test-audio.mp3',
        enable_language_identification: true,
        wait: true,
      });

      expect(transcription.status).toBe('completed');
      expect(transcription.enable_language_identification).toBe(true);

      await client.stt.destroy(transcription.id);
    }, 60000);
  });

  describe('Transcription cleanup', () => {
    it('destroy() removes both transcription and uploaded file', async () => {
      const buffer = readFileSync(AUDIO_FILE_SHORT);
      const transcription = await client.stt.transcribeFromFile(buffer, {
        model: 'stt-async-v4',
        filename: 'test-cleanup.mp3',
        wait: true,
      });

      expect(transcription.status).toBe('completed');
      expect(transcription.file_id).toBeDefined();

      // Verify file exists before destroy
      const fileBefore = await client.files.get(transcription.file_id!);
      expect(fileBefore).not.toBeNull();

      // Destroy transcription (should also delete the file)
      await client.stt.destroy(transcription.id);

      // Verify transcription is removed
      const transcriptionAfter = await client.stt.get(transcription.id);
      expect(transcriptionAfter).toBeNull();

      // Verify file is also removed
      const fileAfter = await client.files.get(transcription.file_id!);
      expect(fileAfter).toBeNull();
    }, 60000);
  });
});
