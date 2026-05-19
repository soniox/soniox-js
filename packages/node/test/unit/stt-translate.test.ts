import { SonioxFile, SonioxFilesAPI } from '../../src/async/files';
import { SonioxSttApi } from '../../src/async/stt';
import type { HttpClient } from '../../src/http';
import type {
  SonioxFileData,
  SonioxTranscriptionData,
  TranscriptToken,
  TranslateOptions,
} from '../../src/types/public';

const TRANSCRIPTION_ID = '550e8400-e29b-41d4-a716-446655440000';

const createMockHttpClient = (requestMock: jest.Mock = jest.fn()): HttpClient => ({
  request: requestMock,
});

const createMockFilesAPI = (uploadMock: jest.Mock = jest.fn()): SonioxFilesAPI => {
  const api = new SonioxFilesAPI(createMockHttpClient());
  api.upload = uploadMock;
  return api;
};

const createMockTranscriptionData = (overrides: Partial<SonioxTranscriptionData> = {}): SonioxTranscriptionData => ({
  id: TRANSCRIPTION_ID,
  status: 'queued',
  model: 'stt-async-v4',
  created_at: '2024-11-26T00:00:00Z',
  filename: 'test-audio.mp3',
  enable_speaker_diarization: false,
  enable_language_identification: false,
  ...overrides,
});

const sampleOneWayTokens: TranscriptToken[] = [
  { text: 'Hello', start_ms: 0, end_ms: 500, confidence: 0.95, language: 'en', translation_status: 'original' },
  {
    text: ' Hola',
    confidence: 0.9,
    language: 'es',
    source_language: 'en',
    translation_status: 'translation',
  },
];

const sampleTwoWayTokens: TranscriptToken[] = [
  { text: 'Hello', start_ms: 0, end_ms: 500, confidence: 0.95, language: 'en', translation_status: 'original' },
  {
    text: ' Hola',
    confidence: 0.9,
    language: 'es',
    source_language: 'en',
    translation_status: 'translation',
  },
  {
    text: 'Adios',
    start_ms: 500,
    end_ms: 1000,
    confidence: 0.95,
    language: 'es',
    translation_status: 'original',
  },
  {
    text: ' Bye',
    confidence: 0.9,
    language: 'en',
    source_language: 'es',
    translation_status: 'translation',
  },
];

/**
 * Wire the http mock to handle the create + wait + getTranscript sequence used
 * by `transcribe({ wait: true })`.
 */
function makeRequestMockForTranslate(tokens: TranscriptToken[]): jest.Mock {
  return jest
    .fn()
    .mockResolvedValueOnce({
      status: 201,
      headers: {},
      data: createMockTranscriptionData({ status: 'queued' }),
    })
    .mockResolvedValueOnce({
      status: 200,
      headers: {},
      data: createMockTranscriptionData({ status: 'completed' }),
    })
    .mockResolvedValueOnce({
      status: 200,
      headers: {},
      data: { id: TRANSCRIPTION_ID, text: tokens.map((t) => t.text).join(''), tokens },
    });
}

describe('SonioxSttApi.translate()', () => {
  it('returns a queued translation job by default without waiting', async () => {
    const requestMock = jest.fn().mockResolvedValueOnce({
      status: 201,
      headers: {},
      data: createMockTranscriptionData({ status: 'queued' }),
    });
    const api = new SonioxSttApi(createMockHttpClient(requestMock), createMockFilesAPI());

    const job = await api.translate({
      audio_url: 'https://example.com/audio.mp3',
      to: 'es',
    });

    expect(job.id).toBe(TRANSCRIPTION_ID);
    expect(job.status).toBe('queued');
    expect(job.translation).toBeUndefined();
    expect(requestMock).toHaveBeenCalledTimes(1);
  });

  describe('mode mapping', () => {
    it('one-way `to` only → one_way translation, no language_hints, no language_hints_strict', async () => {
      jest.useFakeTimers();
      const requestMock = makeRequestMockForTranslate(sampleOneWayTokens);
      const api = new SonioxSttApi(createMockHttpClient(requestMock), createMockFilesAPI());

      const promise = api.translate({
        audio_url: 'https://example.com/audio.mp3',
        to: 'es',
        wait: true,
      });

      await jest.advanceTimersByTimeAsync(1000);
      const job = await promise;

      expect(job.translation?.mode).toBe('one_way');
      const createCall = requestMock.mock.calls[0]?.[0];
      expect(createCall.path).toBe('/v1/transcriptions');
      expect(createCall.body).toMatchObject({
        model: 'stt-async-v4',
        audio_url: 'https://example.com/audio.mp3',
        translation: { type: 'one_way', target_language: 'es' },
      });
      expect(createCall.body.language_hints).toBeUndefined();
      expect(createCall.body.language_hints_strict).toBeUndefined();

      jest.useRealTimers();
    });

    it('one-way `to` + `from` → language_hints=[from], language_hints_strict=true', async () => {
      jest.useFakeTimers();
      const requestMock = makeRequestMockForTranslate(sampleOneWayTokens);
      const api = new SonioxSttApi(createMockHttpClient(requestMock), createMockFilesAPI());

      const promise = api.translate({
        audio_url: 'https://example.com/audio.mp3',
        from: 'en',
        to: 'es',
        wait: true,
      });

      await jest.advanceTimersByTimeAsync(1000);
      const job = await promise;

      expect(job.translation?.mode).toBe('one_way');
      if (job.translation?.mode === 'one_way') {
        expect(job.translation.from).toBe('en');
        expect(job.translation.to).toBe('es');
      }

      const createBody = requestMock.mock.calls[0]?.[0]?.body;
      expect(createBody).toMatchObject({
        translation: { type: 'one_way', target_language: 'es' },
        language_hints: ['en'],
        language_hints_strict: true,
      });

      jest.useRealTimers();
    });

    it('two-way `between` → two_way translation with both languages as hints', async () => {
      jest.useFakeTimers();
      const requestMock = makeRequestMockForTranslate(sampleTwoWayTokens);
      const api = new SonioxSttApi(createMockHttpClient(requestMock), createMockFilesAPI());

      const promise = api.translate({
        audio_url: 'https://example.com/audio.mp3',
        between: ['en', 'es'],
        wait: true,
      });

      await jest.advanceTimersByTimeAsync(1000);
      const job = await promise;

      expect(job.translation?.mode).toBe('two_way');
      if (job.translation?.mode === 'two_way') {
        expect(job.translation.language_a).toBe('en');
        expect(job.translation.language_b).toBe('es');
        expect(job.translation.segments).toHaveLength(2);
      }

      const createBody = requestMock.mock.calls[0]?.[0]?.body;
      expect(createBody).toMatchObject({
        translation: { type: 'two_way', language_a: 'en', language_b: 'es' },
        language_hints: ['en', 'es'],
        language_hints_strict: true,
      });

      jest.useRealTimers();
    });
  });

  describe('defaults and pass-through', () => {
    it('defaults the model to stt-async-v4 when omitted', async () => {
      jest.useFakeTimers();
      const requestMock = makeRequestMockForTranslate(sampleOneWayTokens);
      const api = new SonioxSttApi(createMockHttpClient(requestMock), createMockFilesAPI());

      const promise = api.translate({
        audio_url: 'https://example.com/audio.mp3',
        to: 'es',
        wait: true,
      });
      await jest.advanceTimersByTimeAsync(1000);
      await promise;

      expect(requestMock.mock.calls[0]?.[0]?.body.model).toBe('stt-async-v4');

      jest.useRealTimers();
    });

    it('respects an explicit `model` override', async () => {
      jest.useFakeTimers();
      const requestMock = makeRequestMockForTranslate(sampleOneWayTokens);
      const api = new SonioxSttApi(createMockHttpClient(requestMock), createMockFilesAPI());

      const promise = api.translate({
        audio_url: 'https://example.com/audio.mp3',
        to: 'es',
        model: 'stt-async-v5',
        wait: true,
      });
      await jest.advanceTimersByTimeAsync(1000);
      await promise;

      expect(requestMock.mock.calls[0]?.[0]?.body.model).toBe('stt-async-v5');

      jest.useRealTimers();
    });

    it('passes through audio source, context, diarization, webhook, client_reference_id, and webhook_query', async () => {
      jest.useFakeTimers();
      const requestMock = makeRequestMockForTranslate(sampleOneWayTokens);
      const api = new SonioxSttApi(createMockHttpClient(requestMock), createMockFilesAPI());

      const promise = api.translate({
        audio_url: 'https://example.com/audio.mp3',
        to: 'es',
        wait: true,
        enable_speaker_diarization: true,
        context: { general: [{ key: 'topic', value: 'meeting' }] },
        webhook_url: 'https://example.com/hook',
        webhook_auth_header_name: 'X-Auth',
        webhook_auth_header_value: 'secret',
        webhook_query: { id: '123' },
        client_reference_id: 'ref-1',
      });
      await jest.advanceTimersByTimeAsync(1000);
      await promise;

      const body = requestMock.mock.calls[0]?.[0]?.body;
      expect(body).toMatchObject({
        audio_url: 'https://example.com/audio.mp3',
        enable_speaker_diarization: true,
        context: { general: [{ key: 'topic', value: 'meeting' }] },
        webhook_url: 'https://example.com/hook?id=123',
        webhook_auth_header_name: 'X-Auth',
        webhook_auth_header_value: 'secret',
        client_reference_id: 'ref-1',
      });

      jest.useRealTimers();
    });

    it('always forces options required by the reshape', async () => {
      jest.useFakeTimers();
      const requestMock = makeRequestMockForTranslate(sampleOneWayTokens);
      const api = new SonioxSttApi(createMockHttpClient(requestMock), createMockFilesAPI());

      const promise = api.translate({
        audio_url: 'https://example.com/audio.mp3',
        to: 'es',
        wait: true,
        // Even if the caller smuggles in method-owned fields, the helper must
        // override them because the reshape requires language-tagged transcript tokens.
        ...({ enable_language_identification: false, fetch_transcript: false } as Record<string, unknown>),
      });
      await jest.advanceTimersByTimeAsync(1000);
      await promise;

      expect(requestMock.mock.calls[0]?.[0]?.body.enable_language_identification).toBe(true);
      expect(requestMock).toHaveBeenCalledTimes(3);

      jest.useRealTimers();
    });

    it('waits without fetching translation when fetch_translation is false', async () => {
      jest.useFakeTimers();
      const requestMock = jest
        .fn()
        .mockResolvedValueOnce({
          status: 201,
          headers: {},
          data: createMockTranscriptionData({ status: 'queued' }),
        })
        .mockResolvedValueOnce({
          status: 200,
          headers: {},
          data: createMockTranscriptionData({ status: 'completed' }),
        });
      const api = new SonioxSttApi(createMockHttpClient(requestMock), createMockFilesAPI());

      const promise = api.translate({
        audio_url: 'https://example.com/audio.mp3',
        to: 'es',
        wait: true,
        fetch_translation: false,
      });
      await jest.advanceTimersByTimeAsync(1000);
      const job = await promise;

      expect(job.status).toBe('completed');
      expect(job.translation).toBeUndefined();
      expect(requestMock).toHaveBeenCalledTimes(2);

      jest.useRealTimers();
    });

    it('fetches translation from a completed job', async () => {
      const requestMock = jest
        .fn()
        .mockResolvedValueOnce({
          status: 201,
          headers: {},
          data: createMockTranscriptionData({ status: 'completed' }),
        })
        .mockResolvedValueOnce({
          status: 200,
          headers: {},
          data: { id: TRANSCRIPTION_ID, text: 'Hello Hola', tokens: sampleOneWayTokens },
        });
      const api = new SonioxSttApi(createMockHttpClient(requestMock), createMockFilesAPI());

      const job = await api.translate({
        audio_url: 'https://example.com/audio.mp3',
        to: 'es',
      });
      const translation = await job.fetchTranslation();

      expect(translation?.mode).toBe('one_way');
      expect(requestMock).toHaveBeenCalledTimes(2);
    });

    it('uploads `file` first and then translates from the resulting file_id', async () => {
      jest.useFakeTimers();
      const fileData: SonioxFileData = {
        id: 'uploaded-file-id',
        filename: 'audio.mp3',
        size: 12345,
        created_at: '2024-11-26T00:00:00Z',
      };
      const uploadMock = jest.fn().mockResolvedValue(new SonioxFile(fileData, createMockHttpClient()));
      const requestMock = makeRequestMockForTranslate(sampleOneWayTokens);
      const api = new SonioxSttApi(createMockHttpClient(requestMock), createMockFilesAPI(uploadMock));

      const promise = api.translate({
        file: Buffer.from('test'),
        filename: 'audio.mp3',
        to: 'es',
        wait: true,
      });
      await jest.advanceTimersByTimeAsync(1000);
      const job = await promise;

      expect(uploadMock).toHaveBeenCalled();
      const body = requestMock.mock.calls[0]?.[0]?.body;
      expect(body.file_id).toBe('uploaded-file-id');
      expect(body.audio_url).toBeUndefined();
      expect(job.translation?.mode).toBe('one_way');

      jest.useRealTimers();
    });
  });

  describe('error handling', () => {
    it('returns an errored job when the underlying transcription errors', async () => {
      jest.useFakeTimers();
      const requestMock = jest
        .fn()
        .mockResolvedValueOnce({
          status: 201,
          headers: {},
          data: createMockTranscriptionData({ status: 'queued' }),
        })
        .mockResolvedValueOnce({
          status: 200,
          headers: {},
          data: createMockTranscriptionData({ status: 'error', error_message: 'audio decode failed' }),
        });
      const api = new SonioxSttApi(createMockHttpClient(requestMock), createMockFilesAPI());

      const promise = api.translate({
        audio_url: 'https://example.com/audio.mp3',
        to: 'es',
        wait: true,
      });

      await jest.advanceTimersByTimeAsync(1000);
      const job = await promise;

      expect(job.status).toBe('error');
      expect(job.error_message).toBe('audio decode failed');
      expect(job.translation).toBeNull();

      jest.useRealTimers();
    });
  });

  describe('runtime mode validation', () => {
    const api = () => new SonioxSttApi(createMockHttpClient(), createMockFilesAPI());

    it('rejects when neither `to` nor `between` is provided', async () => {
      await expect(
        api().translate({ audio_url: 'https://example.com/a.mp3' } as unknown as TranslateOptions)
      ).rejects.toThrow('translate: requires either "to" or "between"');
    });

    it('rejects when both `to` and `between` are provided', async () => {
      await expect(
        api().translate({
          audio_url: 'https://example.com/a.mp3',
          to: 'es',
          between: ['en', 'es'],
        } as unknown as TranslateOptions)
      ).rejects.toThrow('translate: cannot specify both "to" and "between"');
    });

    it('rejects when `between` has the wrong arity', async () => {
      await expect(
        api().translate({
          audio_url: 'https://example.com/a.mp3',
          between: ['en'],
        } as unknown as TranslateOptions)
      ).rejects.toThrow('translate: "between" must be a [language_a, language_b] tuple');
    });
  });
});
