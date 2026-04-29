import { RealtimeTtsConnection, RealtimeTtsStream, StateError, ConnectionError } from '@soniox/core';
import {
  MockWebSocket,
  installMockWebSocket,
  restoreMockWebSocket,
  getLastMockWebSocket,
} from '../../utils/mock-websocket';

describe('RealtimeTtsConnection', () => {
  const apiKey = 'test-api-key';
  const wsUrl = 'wss://tts-rt.soniox.com/tts-websocket';
  const ttsDefaults = {
    model: 'tts-rt-v1',
    language: 'en',
    voice: 'Adrian',
    audio_format: 'mp3',
  };

  beforeEach(() => {
    installMockWebSocket();
    jest.useFakeTimers();
  });

  afterEach(() => {
    restoreMockWebSocket();
    jest.useRealTimers();
  });

  describe('connect', () => {
    it('should open a WebSocket connection', async () => {
      const conn = new RealtimeTtsConnection(apiKey, wsUrl, ttsDefaults);
      const connectPromise = conn.connect();

      const ws = getLastMockWebSocket()!;
      expect(ws.url).toBe(wsUrl);
      ws.open();

      await connectPromise;
      expect(conn.isConnected).toBe(true);
    });

    it('should reject on connection error', async () => {
      const conn = new RealtimeTtsConnection(apiKey, wsUrl, ttsDefaults);
      const connectPromise = conn.connect();

      const ws = getLastMockWebSocket()!;
      // Dispatch an error event to trigger the rejection
      const errorHandlers = (ws as any).listeners?.get('error');
      if (errorHandlers) {
        for (const handler of errorHandlers) {
          handler({ type: 'error' });
        }
      }

      await expect(connectPromise).rejects.toThrow(ConnectionError);
    });

    it('should reject on connection timeout', async () => {
      const conn = new RealtimeTtsConnection(apiKey, wsUrl, ttsDefaults, {
        connect_timeout_ms: 5000,
      });
      const connectPromise = conn.connect();

      jest.advanceTimersByTime(5001);

      await expect(connectPromise).rejects.toThrow('TTS WebSocket connection timed out');
    });

    it('should not allow concurrent connect calls', async () => {
      const conn = new RealtimeTtsConnection(apiKey, wsUrl, ttsDefaults);
      const p1 = conn.connect();

      await expect(conn.connect()).rejects.toThrow(StateError);

      getLastMockWebSocket()!.open();
      await p1;
    });
  });

  describe('stream', () => {
    it('should auto-connect and open a stream', async () => {
      const conn = new RealtimeTtsConnection(apiKey, wsUrl, ttsDefaults);
      const streamPromise = conn.stream({ voice: 'Adrian' });

      const ws = getLastMockWebSocket()!;
      ws.open();

      const stream = await streamPromise;
      expect(stream).toBeInstanceOf(RealtimeTtsStream);
      expect(stream.streamId).toBeDefined();

      const sent = JSON.parse(ws.sent[0] as string);
      expect(sent.api_key).toBe(apiKey);
      expect(sent.model).toBe('tts-rt-v1');
      expect(sent.voice).toBe('Adrian');
      expect(sent.language).toBe('en');
      expect(sent.audio_format).toBe('mp3');
    });

    it('should merge input with tts_defaults', async () => {
      const conn = new RealtimeTtsConnection(apiKey, wsUrl, ttsDefaults);
      const streamPromise = conn.stream({});

      getLastMockWebSocket()!.open();
      const _stream = await streamPromise;

      const ws = getLastMockWebSocket()!;
      const sent = JSON.parse(ws.sent[0] as string);
      expect(sent.model).toBe('tts-rt-v1');
      expect(sent.voice).toBe('Adrian');
    });

    it('should throw when required fields are missing', async () => {
      const conn = new RealtimeTtsConnection(apiKey, wsUrl, {});
      const streamPromise = conn.stream({});

      getLastMockWebSocket()!.open();

      await expect(streamPromise).rejects.toThrow('Missing required TTS stream fields');
    });

    it('should enforce max 5 streams', async () => {
      const conn = new RealtimeTtsConnection(apiKey, wsUrl, ttsDefaults);
      const connectPromise = conn.connect();
      getLastMockWebSocket()!.open();
      await connectPromise;

      for (let i = 0; i < 5; i++) {
        await conn.stream({ stream_id: `s${i}` });
      }

      await expect(conn.stream({ stream_id: 's5' })).rejects.toThrow('Maximum concurrent streams');
    });

    it('should reject duplicate stream_id', async () => {
      const conn = new RealtimeTtsConnection(apiKey, wsUrl, ttsDefaults);
      const connectPromise = conn.connect();
      getLastMockWebSocket()!.open();
      await connectPromise;

      await conn.stream({ stream_id: 'dup' });
      await expect(conn.stream({ stream_id: 'dup' })).rejects.toThrow("Stream 'dup' is already active");
    });
  });

  describe('keepalive', () => {
    it('should send keepalive messages on interval', async () => {
      const conn = new RealtimeTtsConnection(apiKey, wsUrl, ttsDefaults, {
        keepalive_interval_ms: 2000,
      });
      const connectPromise = conn.connect();
      getLastMockWebSocket()!.open();
      await connectPromise;

      const ws = getLastMockWebSocket()!;
      const initialSent = ws.sent.length;

      jest.advanceTimersByTime(2000);
      expect(ws.sent.length).toBe(initialSent + 1);
      expect(JSON.parse(ws.sent[ws.sent.length - 1] as string)).toEqual({ keep_alive: true });

      jest.advanceTimersByTime(2000);
      expect(ws.sent.length).toBe(initialSent + 2);

      conn.close();
    });
  });

  describe('close', () => {
    it('should close the connection and force-end streams', async () => {
      const conn = new RealtimeTtsConnection(apiKey, wsUrl, ttsDefaults);
      const connectPromise = conn.connect();
      getLastMockWebSocket()!.open();
      await connectPromise;

      const stream = await conn.stream({});
      const terminatedHandler = jest.fn();
      stream.on('terminated', terminatedHandler);

      conn.close();
      expect(conn.isConnected).toBe(false);
    });

    it('should emit close event', async () => {
      const conn = new RealtimeTtsConnection(apiKey, wsUrl, ttsDefaults);
      const connectPromise = conn.connect();
      getLastMockWebSocket()!.open();
      await connectPromise;

      const closeHandler = jest.fn();
      conn.on('close', closeHandler);
      conn.close();
      expect(closeHandler).toHaveBeenCalled();
    });
  });
});

describe('RealtimeTtsStream', () => {
  const apiKey = 'test-api-key';
  const wsUrl = 'wss://tts-rt.soniox.com/tts-websocket';
  const ttsDefaults = {
    model: 'tts-rt-v1',
    language: 'en',
    voice: 'Adrian',
    audio_format: 'mp3',
  };

  beforeEach(() => {
    installMockWebSocket();
    jest.useFakeTimers();
  });

  afterEach(() => {
    restoreMockWebSocket();
    jest.useRealTimers();
  });

  async function createStream(streamId?: string): Promise<{
    conn: RealtimeTtsConnection;
    stream: RealtimeTtsStream;
    ws: MockWebSocket;
  }> {
    const conn = new RealtimeTtsConnection(apiKey, wsUrl, ttsDefaults);
    const streamPromise = conn.stream({ stream_id: streamId ?? 'test-stream' });
    const ws = getLastMockWebSocket()!;
    ws.open();
    const stream = await streamPromise;
    return { conn, stream, ws };
  }

  describe('sendText', () => {
    it('should send text chunk JSON', async () => {
      const { stream, ws } = await createStream();

      stream.sendText('Hello');

      const sent = JSON.parse(ws.sent[ws.sent.length - 1] as string);
      expect(sent).toEqual({
        text: 'Hello',
        text_end: false,
        stream_id: 'test-stream',
      });
    });

    it('should send text with end flag', async () => {
      const { stream, ws } = await createStream();

      stream.sendText('Goodbye', { end: true });

      const sent = JSON.parse(ws.sent[ws.sent.length - 1] as string);
      expect(sent.text_end).toBe(true);
    });

    it('should throw in non-active state', async () => {
      const { stream } = await createStream();

      stream.sendText('', { end: true });
      expect(() => stream.sendText('more')).toThrow(StateError);
    });
  });

  describe('finish', () => {
    it('should send empty text with text_end=true', async () => {
      const { stream, ws } = await createStream();

      stream.finish();

      const sent = JSON.parse(ws.sent[ws.sent.length - 1] as string);
      expect(sent).toEqual({
        text: '',
        text_end: true,
        stream_id: 'test-stream',
      });
    });
  });

  describe('cancel', () => {
    it('should send cancel message', async () => {
      const { stream, ws } = await createStream();

      stream.cancel();

      const sent = JSON.parse(ws.sent[ws.sent.length - 1] as string);
      expect(sent).toEqual({
        stream_id: 'test-stream',
        cancel: true,
      });
    });
  });

  describe('audio events', () => {
    it('should emit decoded audio chunks', async () => {
      const { stream, ws } = await createStream();
      const audioHandler = jest.fn();
      stream.on('audio', audioHandler);

      const audioBase64 = btoa('hello');
      ws.message(
        JSON.stringify({
          stream_id: 'test-stream',
          audio: audioBase64,
          audio_end: false,
        })
      );

      expect(audioHandler).toHaveBeenCalledTimes(1);
      const chunk = audioHandler.mock.calls[0][0] as Uint8Array;
      expect(chunk).toBeInstanceOf(Uint8Array);
      expect(Buffer.from(chunk).toString()).toBe('hello');
    });

    it('should emit audioEnd when audio_end is true', async () => {
      const { stream, ws } = await createStream();
      const audioEndHandler = jest.fn();
      stream.on('audioEnd', audioEndHandler);

      ws.message(
        JSON.stringify({
          stream_id: 'test-stream',
          audio: btoa('last'),
          audio_end: true,
        })
      );

      expect(audioEndHandler).toHaveBeenCalledTimes(1);
    });

    it('should emit terminated on terminated event', async () => {
      const { stream, ws } = await createStream();
      const terminatedHandler = jest.fn();
      stream.on('terminated', terminatedHandler);

      ws.message(
        JSON.stringify({
          stream_id: 'test-stream',
          terminated: true,
        })
      );

      expect(terminatedHandler).toHaveBeenCalledTimes(1);
      expect(stream.state).toBe('ended');
    });

    it('should emit error on error event', async () => {
      const { stream, ws } = await createStream();
      const errorHandler = jest.fn();
      stream.on('error', errorHandler);

      ws.message(
        JSON.stringify({
          stream_id: 'test-stream',
          error_code: 400,
          error_message: 'Bad request',
        })
      );

      expect(errorHandler).toHaveBeenCalledTimes(1);
      expect(stream.state).toBe('error');
    });
  });

  describe('audioQueue iterator-attach gate', () => {
    function buildAudioMessage(streamId: string): string {
      return JSON.stringify({
        stream_id: streamId,
        audio: btoa('chunk'),
        audio_end: false,
      });
    }

    it('should not buffer audio in audioQueue when only .on() is used', async () => {
      const { stream, ws } = await createStream();
      stream.on('audio', () => {
        // listener-only consumer; intentionally does nothing
      });

      for (let i = 0; i < 100; i++) {
        ws.message(buildAudioMessage('test-stream'));
      }

      const internalQueue = (stream as unknown as { audioQueue: { queue: unknown[] } }).audioQueue;
      expect(internalQueue.queue.length).toBe(0);
    });

    it('should buffer audio when [Symbol.asyncIterator]() has been called', async () => {
      const { stream, ws } = await createStream();
      const iterator = stream[Symbol.asyncIterator]();

      for (let i = 0; i < 5; i++) {
        ws.message(buildAudioMessage('test-stream'));
      }

      const internalQueue = (stream as unknown as { audioQueue: { queue: unknown[] } }).audioQueue;
      expect(internalQueue.queue.length).toBe(5);

      void iterator;
    });

    it('should detach when consumer breaks out of for await', async () => {
      const { stream, ws } = await createStream();

      const consumed: Uint8Array[] = [];
      const iterPromise = (async () => {
        for await (const chunk of stream) {
          consumed.push(chunk);
          break;
        }
      })();

      ws.message(buildAudioMessage('test-stream'));
      await iterPromise;

      for (let i = 0; i < 100; i++) {
        ws.message(buildAudioMessage('test-stream'));
      }

      const internals = stream as unknown as {
        audioQueue: { queue: unknown[] };
        iteratorAttached: boolean;
      };
      expect(consumed.length).toBe(1);
      expect(internals.iteratorAttached).toBe(false);
      expect(internals.audioQueue.queue.length).toBe(0);
    });
  });

  describe('async iteration', () => {
    it('should yield audio chunks and complete on terminated', async () => {
      const { stream, ws } = await createStream();

      const chunks: Uint8Array[] = [];
      const iterPromise = (async () => {
        for await (const chunk of stream) {
          chunks.push(chunk);
        }
      })();

      ws.message(
        JSON.stringify({
          stream_id: 'test-stream',
          audio: btoa('chunk1'),
        })
      );
      ws.message(
        JSON.stringify({
          stream_id: 'test-stream',
          audio: btoa('chunk2'),
          audio_end: true,
        })
      );
      ws.message(
        JSON.stringify({
          stream_id: 'test-stream',
          terminated: true,
        })
      );

      await iterPromise;
      expect(chunks).toHaveLength(2);
      expect(Buffer.from(chunks[0]).toString()).toBe('chunk1');
      expect(Buffer.from(chunks[1]).toString()).toBe('chunk2');
    });
  });

  describe('stream multiplexing', () => {
    it('should route events to correct streams', async () => {
      const conn = new RealtimeTtsConnection(apiKey, wsUrl, ttsDefaults);
      const connectPromise = conn.connect();
      const ws = getLastMockWebSocket()!;
      ws.open();
      await connectPromise;

      const s1 = await conn.stream({ stream_id: 's1' });
      const s2 = await conn.stream({ stream_id: 's2' });

      const s1Audio = jest.fn();
      const s2Audio = jest.fn();
      s1.on('audio', s1Audio);
      s2.on('audio', s2Audio);

      ws.message(JSON.stringify({ stream_id: 's1', audio: btoa('for-s1') }));
      ws.message(JSON.stringify({ stream_id: 's2', audio: btoa('for-s2') }));

      expect(s1Audio).toHaveBeenCalledTimes(1);
      expect(s2Audio).toHaveBeenCalledTimes(1);
      expect(Buffer.from(s1Audio.mock.calls[0][0]).toString()).toBe('for-s1');
      expect(Buffer.from(s2Audio.mock.calls[0][0]).toString()).toBe('for-s2');
    });
  });
});
