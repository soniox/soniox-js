import { RealtimeSttSession, StateError } from '@soniox/core';
import type { RealtimeEvent, SttSessionConfig } from '@soniox/core';

import { MockWebSocket, installMockWebSocket, restoreMockWebSocket } from '../../utils/mock-websocket';

const API_KEY = 'test-api-key';
const WS_URL = 'wss://test.soniox.com/transcribe-websocket';
const RECONNECT_URL = 'wss://test.soniox.com/transcribe-websocket?reconnect=true&r=Qx7mT2kV';

/** The socket of the attempt that is in flight. */
function dialing(): MockWebSocket {
  return MockWebSocket.instances[MockWebSocket.instances.length - 1]!;
}

/**
 * The messages a stream delivered over its connections, in order: audio, the
 * end of audio, and the rest the server counts. The start request, the pings
 * and the reconnect control requests are not among them.
 */
function delivered(sockets: MockWebSocket[]): unknown[] {
  return sockets
    .flatMap((socket) => socket.sent)
    .filter((data) => {
      if (typeof data !== 'string' || data === '') {
        return true;
      }
      const message = JSON.parse(data) as { type?: string; model?: string };
      return message.model === undefined && message.type !== 'ping' && message.type !== 'reconnect';
    });
}

describe('RealtimeSttSession stream reconnect', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    installMockWebSocket();
  });

  afterEach(() => {
    restoreMockWebSocket();
    jest.useRealTimers();
  });

  /** Connect, and let the server offer to continue this stream. */
  async function startStream(
    config: Partial<SttSessionConfig> = {},
    options: { offer?: boolean } = {}
  ): Promise<{ session: RealtimeSttSession; ws: MockWebSocket }> {
    const session = new RealtimeSttSession(API_KEY, WS_URL, {
      model: 'stt-rt-v5',
      enable_reconnect: true,
      ...config,
    });
    const connecting = session.connect();
    const ws = dialing();
    ws.open();
    await connecting;

    if (options.offer !== false) {
      ws.message(JSON.stringify({ type: 'reconnect', reconnect_token: 'token-1', reconnect_url: RECONNECT_URL }));
    }
    return { session, ws };
  }

  /** Answer the attempt in flight, and let the session adopt its connection. */
  async function accept(reply: Record<string, unknown>): Promise<MockWebSocket> {
    const dial = dialing();
    dial.open();
    dial.message(JSON.stringify({ type: 'reconnected', reconnect_token: 'token-2', ...reply }));
    await jest.advanceTimersByTimeAsync(0);
    return dial;
  }

  describe('resumeStream()', () => {
    it('should move a live stream to a new connection and resend what was not confirmed', async () => {
      const { session, ws } = await startStream();
      const events: string[] = [];
      session.on('resuming', () => events.push('resuming'));
      session.on('resumed', () => events.push('resumed'));
      session.sendAudio(new Uint8Array([1]));

      expect(session.resumeStream()).toBe(true);
      expect(ws.closeCode).toBe(4000);
      expect(dialing().url).toBe(RECONNECT_URL);

      const dial = await accept({ last_request: 0 });

      expect(JSON.parse(dial.sent[0] as string)).toEqual({
        type: 'reconnect',
        reconnect_token: 'token-1',
        last_seq: 0,
      });
      expect(dial.sent.slice(1)).toEqual([new Uint8Array([1])]);
      expect(events).toEqual(['resuming', 'resumed']);
      expect(session.state).toBe('connected');

      session.close();
    });

    it('should do nothing when the server offered no reconnect', async () => {
      const { session, ws } = await startStream({}, { offer: false });

      expect(session.resumeStream()).toBe(false);
      expect(MockWebSocket.instances).toEqual([ws]);
      expect(ws.readyState).toBe(MockWebSocket.OPEN);

      session.close();
    });

    it('should do nothing without enable_reconnect', async () => {
      const { session } = await startStream({ enable_reconnect: undefined });

      expect(session.resumeStream()).toBe(false);
      expect(MockWebSocket.instances).toHaveLength(1);

      session.close();
    });

    it('should do nothing once the stream has ended', async () => {
      const { session, ws } = await startStream();
      ws.message(JSON.stringify({ tokens: [], finished: true, seq: 1 }));

      expect(session.resumeStream()).toBe(false);
      expect(MockWebSocket.instances).toHaveLength(1);
    });

    it('should fail with a retriable error when the reconnect window has passed', async () => {
      const { session } = await startStream({ idle_timeout_ms: 10000 });
      const errors: Error[] = [];
      session.on('error', (error) => errors.push(error));
      // A sleeping machine runs no timers: nothing was pinged or noticed
      jest.setSystemTime(Date.now() + 60000);

      expect(session.resumeStream()).toBe(true);
      await jest.advanceTimersByTimeAsync(0);

      expect(errors.map((error) => error.constructor.name)).toEqual(['ConnectionError']);
      expect(session.state).toBe('error');
    });
  });

  describe('enable_reconnect', () => {
    it('should ask the server for a reconnect token in the start request', async () => {
      const { session, ws } = await startStream({ idle_timeout_ms: 10000 });

      const start = JSON.parse(ws.sent[0] as string);
      expect(start.enable_reconnect).toBe(true);
      expect(start.idle_timeout_ms).toBe(10000);

      session.close();
    });

    it('should leave the start request alone without the flag', async () => {
      const { session, ws } = await startStream({ enable_reconnect: undefined });

      expect(JSON.parse(ws.sent[0] as string).enable_reconnect).toBeUndefined();

      session.close();
    });

    it('should end a stream the server offered no reconnect for when a pong is late', async () => {
      const { session, ws } = await startStream({}, { offer: false });
      const errors: Error[] = [];
      session.on('error', (error) => errors.push(error));

      // The stream starts, which is when the server begins answering pings
      ws.message(JSON.stringify({ tokens: [], seq: 1 }));
      await jest.advanceTimersByTimeAsync(6000);

      expect(errors.map((error) => error.message)).toEqual(['The connection was lost: a ping went unanswered']);
      expect(session.state).toBe('error');
      expect(MockWebSocket.instances).toHaveLength(1);
    });

    it('should not call a stream lost on a ping sent before it started', async () => {
      // The server answers a ping sent with the start request only once the
      // stream starts, so an unanswered one says nothing about the connection
      // yet - and counting it kills every stream the server is slow to open,
      // including every stream the server declines to offer one for
      const { session } = await startStream({}, { offer: false });
      const errors: Error[] = [];
      session.on('error', (error) => errors.push(error));

      await jest.advanceTimersByTimeAsync(30000);

      expect(errors).toEqual([]);
      expect(session.state).toBe('connected');

      session.close();
    });

    it('should not dial when the server offered no reconnect', async () => {
      const { session, ws } = await startStream({}, { offer: false });
      const errors: Error[] = [];
      session.on('error', (error) => errors.push(error));

      ws.close('server_crash');

      expect(MockWebSocket.instances).toHaveLength(1);
      expect(session.state).toBe('closed');
      expect(errors).toHaveLength(1);
    });
  });

  describe('drop detection', () => {
    it('should ping every two seconds', async () => {
      const { session, ws } = await startStream();

      await jest.advanceTimersByTimeAsync(1999);
      expect(ws.sent.filter((data) => String(data).includes('"ping"'))).toHaveLength(0);

      await jest.advanceTimersByTimeAsync(1);
      expect(JSON.parse(ws.sent[1] as string)).toEqual({ type: 'ping', id: 1 });

      session.close();
    });

    it('should pace the pings by a shortened idle timeout', async () => {
      const { session, ws } = await startStream({ idle_timeout_ms: 4000 });

      await jest.advanceTimersByTimeAsync(1000);

      expect(JSON.parse(ws.sent[1] as string)).toEqual({ type: 'ping', id: 1 });

      session.close();
    });

    it('should not ping a stream without reconnect', async () => {
      const { session, ws } = await startStream({ enable_reconnect: false }, { offer: false });

      await jest.advanceTimersByTimeAsync(10000);

      expect(ws.sent).toHaveLength(1);

      session.close();
    });

    it('should take the stream over when a pong is late', async () => {
      const { session } = await startStream();

      await jest.advanceTimersByTimeAsync(4000);
      expect(MockWebSocket.instances).toHaveLength(1);

      await jest.advanceTimersByTimeAsync(2000);

      expect(MockWebSocket.instances).toHaveLength(2);
      expect(dialing().url).toBe(RECONNECT_URL);

      session.close();
    });

    it('should time the pongs from the frame that starts the stream', async () => {
      const { session, ws } = await startStream({}, { offer: false });
      await jest.advanceTimersByTimeAsync(2000);

      ws.message(JSON.stringify({ type: 'reconnect', reconnect_token: 'token-1', reconnect_url: RECONNECT_URL }));
      await jest.advanceTimersByTimeAsync(4000);

      expect(MockWebSocket.instances).toHaveLength(1);

      session.close();
    });

    it('should leave the lost connection without a 1000 close', async () => {
      const { session, ws } = await startStream();

      await jest.advanceTimersByTimeAsync(6000);

      expect(ws.closeCode).toBe(4000);

      session.close();
    });

    it('should take the stream over on a close that carries no terminal frame', async () => {
      const { session, ws } = await startStream();
      const errors: Error[] = [];
      session.on('error', (error) => errors.push(error));

      ws.close('going away');

      expect(MockWebSocket.instances).toHaveLength(2);
      expect(session.state).toBe('connected');
      expect(errors).toHaveLength(0);

      session.close();
    });

    it('should take the stream over on a socket error', async () => {
      const { session, ws } = await startStream();

      ws.error('socket is gone');
      ws.close('and now the close');

      expect(MockWebSocket.instances).toHaveLength(2);
      expect(session.state).toBe('connected');

      session.close();
    });

    it('should take the stream over when the debug helper kills the socket', async () => {
      const { session, ws } = await startStream();
      const resumed = jest.fn();
      session.on('resumed', resumed);

      session.__debugForceDisconnect();

      expect(ws.closeCode).toBe(4999);
      expect(MockWebSocket.instances).toHaveLength(2);

      const dial = await accept({ last_request: 0 });
      session.sendAudio(new Uint8Array([1]));

      expect(resumed).toHaveBeenCalledTimes(1);
      expect(session.state).toBe('connected');
      expect(dial.sent.slice(1)).toEqual([new Uint8Array([1])]);

      session.close();
    });

    it('should forget the pings the lost connection took with it', async () => {
      const { session, ws } = await startStream();
      await jest.advanceTimersByTimeAsync(2000);

      ws.close('server_crash');
      await accept({ last_request: 0 });
      await jest.advanceTimersByTimeAsync(2000);

      expect(MockWebSocket.instances).toHaveLength(2);

      session.close();
    });
  });

  describe('reconnect request', () => {
    it('should be the first message on the new connection, with the last seq seen', async () => {
      const { session, ws } = await startStream();
      ws.message(JSON.stringify({ seq: 3, tokens: [] }));

      ws.close('server_crash');
      const dial = dialing();
      dial.open();

      expect(JSON.parse(dial.sent[0] as string)).toEqual({
        type: 'reconnect',
        reconnect_token: 'token-1',
        last_seq: 3,
      });

      session.close();
    });

    it('should use the token the last reply rotated in', async () => {
      const { session, ws } = await startStream();

      ws.close('server_crash');
      const first = await accept({ last_request: 0 });

      first.close('server_crash');
      const second = dialing();
      second.open();

      expect(JSON.parse(second.sent[0] as string).reconnect_token).toBe('token-2');

      session.close();
    });
  });

  describe('resend log', () => {
    it('should send again exactly what the server did not get', async () => {
      const { session, ws } = await startStream();
      session.sendAudio(new Uint8Array([1]));
      session.sendAudio(new Uint8Array([2]));
      session.sendAudio(new Uint8Array([3]));

      ws.close('server_crash');
      const dial = await accept({ last_request: 1 });

      expect(dial.sent.slice(1)).toEqual([new Uint8Array([2]), new Uint8Array([3])]);

      session.close();
    });

    it('should keep the audio sent while the stream was being taken over', async () => {
      const { session, ws } = await startStream();
      session.sendAudio(new Uint8Array([1]));

      ws.close('server_crash');
      session.sendAudio(new Uint8Array([2]));
      const dial = await accept({ last_request: 1 });

      expect(dial.sent.slice(1)).toEqual([new Uint8Array([2])]);

      session.close();
    });

    it('should drop what a pong confirmed, counted from when that ping went out', async () => {
      const { session, ws } = await startStream();
      session.sendAudio(new Uint8Array([1]));
      await jest.advanceTimersByTimeAsync(2000);
      session.sendAudio(new Uint8Array([2]));
      ws.message(JSON.stringify({ type: 'pong', id: 1 }));

      ws.close('server_crash');
      const dial = await accept({ last_request: 0 });

      expect(dial.sent.slice(1)).toEqual([new Uint8Array([2])]);

      session.close();
    });

    it('should not resend the pings', async () => {
      const { session, ws } = await startStream();
      session.sendAudio(new Uint8Array([1]));
      await jest.advanceTimersByTimeAsync(2000);

      ws.close('server_crash');
      const dial = await accept({ last_request: 0 });

      expect(dial.sent.slice(1)).toEqual([new Uint8Array([1])]);

      session.close();
    });

    it('should leave the server with exactly what a run without a drop delivers', async () => {
      const chunks = [new Uint8Array([1]), new Uint8Array([2]), new Uint8Array([3]), new Uint8Array([4])];

      // The yardstick: the same audio over a connection that never dropped.
      const clean = await startStream();
      for (const chunk of chunks) {
        clean.session.sendAudio(chunk);
      }
      const finishingClean = clean.session.finish();
      clean.ws.message(JSON.stringify({ seq: 1, tokens: [], finished: true }));
      await finishingClean;
      const yardstick = delivered([clean.ws]);

      // The same run, dropped with nothing confirmed by a pong, so every
      // chunk is still in the log and only `last_request` says what to resend.
      const { session, ws } = await startStream();
      session.sendAudio(chunks[0]!);
      session.sendAudio(chunks[1]!);
      session.sendAudio(chunks[2]!);

      ws.close('server_crash');
      session.sendAudio(chunks[3]!);
      const dial = await accept({ last_request: 2 });
      const finishing = session.finish();
      dial.message(JSON.stringify({ seq: 1, tokens: [], finished: true }));
      await finishing;

      // The server counted two: what went into the socket after that was lost
      // with it, which is why it asks for the rest again.
      expect([...delivered([ws]).slice(0, 2), ...delivered([dial])]).toEqual(yardstick);
    });

    it('should resend the end of audio, once, and finish on the new connection', async () => {
      const { session, ws } = await startStream();
      session.sendAudio(new Uint8Array([1]));
      const finishing = session.finish();

      expect(ws.sent.filter((data) => data === '')).toHaveLength(1);

      ws.close('server_crash');
      const dial = await accept({ last_request: 1 });

      expect(dial.sent.slice(1)).toEqual(['']);

      dial.message(JSON.stringify({ seq: 1, tokens: [], finished: true }));
      await expect(finishing).resolves.toBeUndefined();
      expect(session.state).toBe('finished');
    });

    it('should refuse a second end of audio', async () => {
      const { session, ws } = await startStream();
      const finishing = session.finish();

      await expect(session.finish()).rejects.toThrow(StateError);
      expect(ws.sent.filter((data) => data === '')).toHaveLength(1);

      ws.message(JSON.stringify({ seq: 1, tokens: [], finished: true }));
      await finishing;
    });
  });

  describe('frames on the new connection', () => {
    it('should drop the responses it already delivered', async () => {
      const { session, ws } = await startStream();
      const results: RealtimeEvent[] = [];
      session.on('result', () => results.push({ kind: 'result' } as RealtimeEvent));
      ws.message(JSON.stringify({ seq: 1, tokens: [] }));
      ws.message(JSON.stringify({ seq: 2, tokens: [] }));

      ws.close('server_crash');
      const dial = await accept({ last_request: 0 });
      dial.message(JSON.stringify({ seq: 2, tokens: [] }));
      dial.message(JSON.stringify({ seq: 3, tokens: [] }));

      expect(results).toHaveLength(3);

      session.close();
    });

    it('should end the stream on a terminal frame numbered behind the last response', async () => {
      const { session, ws } = await startStream();
      const errors: Error[] = [];
      session.on('error', (error) => errors.push(error));
      ws.message(JSON.stringify({ seq: 7, tokens: [] }));

      ws.message(JSON.stringify({ seq: 3, tokens: [], error_code: 503, error_message: 'Cannot continue' }));

      expect(errors.map((error) => error.message)).toEqual(['Cannot continue']);
      expect(session.state).toBe('error');
    });

    it('should end the stream on a terminal frame that carries no seq', async () => {
      const { session, ws } = await startStream();
      const errors: Error[] = [];
      session.on('error', (error) => errors.push(error));
      ws.message(JSON.stringify({ seq: 7, tokens: [] }));

      ws.message(JSON.stringify({ tokens: [], error_code: 503, error_message: 'Cannot continue request' }));

      expect(errors.map((error) => error.message)).toEqual(['Cannot continue request']);
      expect(session.state).toBe('error');
    });

    it('should say the stream is being continued, and then that it was', async () => {
      const { session, ws } = await startStream();
      const said: string[] = [];
      const resumed = jest.fn();
      session.on('resuming', () => said.push('resuming'));
      session.on('resumed', () => said.push('resumed'));
      session.on('resumed', resumed);
      const events: RealtimeEvent[] = [];
      const iterating = (async () => {
        for await (const event of session) {
          events.push(event);
        }
      })();

      ws.close('server_crash');
      await accept({ last_request: 0 });

      expect(resumed).toHaveBeenCalledTimes(1);
      // The pair, in order: the wait can last the whole window, so a caller
      // has to hear it start as well as finish
      expect(said).toEqual(['resuming', 'resumed']);
      expect(events).toEqual([{ kind: 'resuming' }, { kind: 'resumed' }]);

      session.close();
      await iterating;
    });

    it('should deliver the responses replayed in the same read as the reply', async () => {
      const { session, ws } = await startStream();
      const results: unknown[] = [];
      session.on('result', (result) => results.push(result));

      ws.close('server_crash');
      const dial = dialing();
      dial.open();
      // Node hands over every frame of one read at once, with no turn of the
      // event loop in between.
      dial.message(JSON.stringify({ type: 'reconnected', reconnect_token: 'token-2', last_request: 0 }));
      dial.message(JSON.stringify({ seq: 1, tokens: [] }));
      dial.message(JSON.stringify({ seq: 2, tokens: [], finished: true }));
      await jest.advanceTimersByTimeAsync(0);

      expect(results).toHaveLength(2);
      expect(session.state).toBe('finished');
    });

    it('should end without ending the stream a newer connection took over', async () => {
      const { session, ws } = await startStream();
      const errors: Error[] = [];
      session.on('error', (error) => errors.push(error));

      ws.message(
        JSON.stringify({
          tokens: [],
          error_code: 400,
          error_type: 'connection_replaced',
          error_message: 'The connection was replaced by a newer one.',
        })
      );

      expect(errors.map((error) => error.message)).toEqual(['The connection was replaced by a newer one.']);
      expect(session.state).toBe('error');
      expect(ws.closeCode).toBe(4000);
      expect(MockWebSocket.instances).toHaveLength(1);
    });

    it('should ignore a connection the stream was taken from', async () => {
      const { session, ws } = await startStream();
      const errors: Error[] = [];
      session.on('error', (error) => errors.push(error));

      ws.close('server_crash');
      await accept({ last_request: 0 });

      ws.message(JSON.stringify({ tokens: [], error_code: 400, error_message: 'The connection was replaced' }));
      ws.close('replaced');

      expect(errors).toHaveLength(0);
      expect(session.state).toBe('connected');

      session.close();
    });
  });

  describe('failed takeover', () => {
    it('should not dial after a terminal frame, and should refuse further sends', async () => {
      const { session, ws } = await startStream();

      ws.message(JSON.stringify({ seq: 1, tokens: [], finished: true }));
      expect(() => session.sendAudio(new Uint8Array([1]))).toThrow(StateError);

      ws.close('server_crash');
      expect(MockWebSocket.instances).toHaveLength(1);
    });

    it('should refuse a send from an error handler, before the session is torn down', async () => {
      const { session, ws } = await startStream();
      let sendError: unknown;
      session.on('error', () => {
        try {
          session.sendAudio(new Uint8Array([1]));
        } catch (error) {
          sendError = error;
        }
      });

      ws.message(JSON.stringify({ tokens: [], error_code: 503, error_message: 'Cannot continue' }));

      expect(sendError).toBeInstanceOf(StateError);
      expect(ws.sent.filter((data) => data instanceof Uint8Array)).toHaveLength(0);
    });

    it('should refuse to finish a stream that has ended, rather than waiting forever', async () => {
      const { session, ws } = await startStream();
      let finishError: unknown;
      session.on('error', () => {
        finishError = session.finish().catch((error: unknown) => error);
      });

      ws.message(JSON.stringify({ tokens: [], error_code: 503, error_message: 'Cannot continue' }));

      await expect(finishError).resolves.toBeInstanceOf(StateError);
      expect(ws.sent.filter((data) => data === '')).toHaveLength(0);
    });

    it('should ignore a reply that arrives after the session was closed', async () => {
      const { session, ws } = await startStream();
      const resumed = jest.fn();
      session.on('resumed', resumed);

      ws.close('server_crash');
      const dial = dialing();
      dial.open();
      session.close();
      // The reply was already on its way when the session closed.
      dial.message(JSON.stringify({ type: 'reconnected', reconnect_token: 'token-2', last_request: 0 }));
      await jest.advanceTimersByTimeAsync(0);

      expect(resumed).not.toHaveBeenCalled();
      expect(session.state).toBe('canceled');
      // This connection presented its token, so the server may have taken the
      // stream over onto it with only the reply still in flight. The 1000 is
      // what ends it; a 4000 would tell the server to keep it waiting
      expect(dial.closeCode).toBe(1000);
    });

    it('should dial again when the handshake fails on the way in, not the stream', async () => {
      const { session, ws } = await startStream({ idle_timeout_ms: 8000 });

      ws.close('server_crash');
      dialing().error('Unexpected server response: 503');
      await jest.advanceTimersByTimeAsync(300);

      expect(MockWebSocket.instances).toHaveLength(3);
      expect(session.state).toBe('connected');

      session.close();
    });

    it('should end the stream with a 1000 close when the caller closes the session', async () => {
      const { session, ws } = await startStream();

      session.close();

      expect(ws.closeCode).toBe(1000);
    });

    it('should report a refusal once, with the reason the server gave', async () => {
      const { session, ws } = await startStream();
      const errors: Error[] = [];
      session.on('error', (error) => errors.push(error));

      ws.close('server_crash');
      const dial = dialing();
      dial.open();
      dial.message(JSON.stringify({ error_code: 400, error_message: 'The stream has ended. Start a new stream.' }));
      await jest.advanceTimersByTimeAsync(0);

      expect(errors.map((error) => error.message)).toEqual(['The stream has ended. Start a new stream.']);
      expect(MockWebSocket.instances).toHaveLength(2);
      expect(dial.closeCode).toBe(4000);
      expect(session.state).toBe('error');
    });

    it('should report a refused handshake and should not dial again', async () => {
      const { session, ws } = await startStream();
      const errors: Error[] = [];
      session.on('error', (error) => errors.push(error));

      ws.close('server_crash');
      dialing().error('Unexpected server response: 403');
      await jest.advanceTimersByTimeAsync(0);

      expect(errors).toHaveLength(1);
      expect(errors[0]!.message).toContain('403');
      expect(MockWebSocket.instances).toHaveLength(2);
      expect(session.state).toBe('error');
    });

    it('should count the window from the last message the server acknowledged', async () => {
      const { session, ws } = await startStream({ idle_timeout_ms: 8000 });
      const errors: Error[] = [];
      session.on('error', (error) => errors.push(error));

      // The server answers one ping and is never heard from again, so its idle
      // timeout runs out 8s after that pong - not 8s after the two further
      // pings it took to notice the drop.
      await jest.advanceTimersByTimeAsync(2000);
      ws.message(JSON.stringify({ type: 'pong', id: 1 }));
      await jest.advanceTimersByTimeAsync(10000);

      expect(errors.map((error) => error.message)).toEqual([
        'The stream was not continued before its reconnect window closed',
      ]);
      // Two dials fitted in what the pong left of the window; measured from
      // the start of the stream instead, there would have been none. Then one
      // more, closed with 1000, in case the server still holds the stream.
      expect(MockWebSocket.instances).toHaveLength(4);
      expect(dialing().closeCode).toBe(1000);
      void session;
    });

    it('should give a hanging dial half of what is left of the window', async () => {
      const { session, ws } = await startStream({ idle_timeout_ms: 8000 });

      ws.close('server_crash');
      const hung = dialing();
      expect(MockWebSocket.instances).toHaveLength(2);

      // The first attempt gets half of the 8s window and no more, so a dial
      // that hangs still leaves time for a second one.
      await jest.advanceTimersByTimeAsync(3900);
      expect(MockWebSocket.instances).toHaveLength(2);
      await jest.advanceTimersByTimeAsync(400);

      expect(MockWebSocket.instances).toHaveLength(3);
      expect(hung.closeCode).toBe(4000);

      session.close();
    });

    it('should wait a jittered backoff between dials', async () => {
      jest.spyOn(Math, 'random').mockReturnValue(0);
      const { session, ws } = await startStream({ idle_timeout_ms: 4000 });

      ws.close('server_crash');
      await jest.advanceTimersByTimeAsync(2000);
      expect(MockWebSocket.instances).toHaveLength(2);

      // Equal jitter on a 250ms backoff: half of it, plus random() of the half.
      await jest.advanceTimersByTimeAsync(124);
      expect(MockWebSocket.instances).toHaveLength(2);
      await jest.advanceTimersByTimeAsync(1);

      expect(MockWebSocket.instances).toHaveLength(3);

      session.close();
    });

    it('should pass on the refusal when a token will not be taken again', async () => {
      // How often a token may be presented is the server's rule, not ours: an
      // attempt whose reply never arrives may have been accepted all the same,
      // so the session cannot tell when one is spent. It keeps presenting the
      // token it holds, and reports the refusal in the server's own words
      const { session, ws } = await startStream();
      const errors: Error[] = [];
      session.on('error', (error) => errors.push(error));

      ws.close('server_crash');
      for (let step = 0; step < 80 && errors.length === 0; step += 1) {
        const dial = dialing();
        if (dial.readyState === MockWebSocket.CONNECTING) {
          dial.open();
          if (MockWebSocket.instances.length > 3) {
            dial.message(
              JSON.stringify({
                error_code: 400,
                error_type: 'reconnect_failed',
                error_message: 'The reconnect token was used too many times.',
              })
            );
          }
        }
        await jest.advanceTimersByTimeAsync(250);
      }

      expect(errors.map((error) => error.message)).toEqual(['The reconnect token was used too many times.']);
      expect(session.state).toBe('error');
    });

    it('should take the stream over again and again, each time on a fresh token', async () => {
      const { session, ws } = await startStream();
      const resumed = jest.fn();
      session.on('resumed', resumed);

      let live = ws;
      for (let drop = 1; drop <= 4; drop += 1) {
        live.close('server_crash');
        const dial = dialing();
        dial.open();
        expect(JSON.parse(dial.sent[0] as string).reconnect_token).toBe(`token-${drop}`);
        dial.message(JSON.stringify({ type: 'reconnected', reconnect_token: `token-${drop + 1}`, last_request: 0 }));
        await jest.advanceTimersByTimeAsync(0);
        live = dial;
      }

      expect(resumed).toHaveBeenCalledTimes(4);
      expect(session.state).toBe('connected');

      session.close();
    });

    it('should end the stream when the window closes', async () => {
      const { session, ws } = await startStream({ idle_timeout_ms: 3000 });
      const errors: Error[] = [];
      session.on('error', (error) => errors.push(error));

      ws.close('server_crash');
      await jest.advanceTimersByTimeAsync(6000);

      expect(errors).toHaveLength(1);
      expect(errors[0]!.message).toContain('window closed');
      expect(session.state).toBe('error');
    });

    it('should end the stream when the session is closed while a dial runs', async () => {
      const { session, ws } = await startStream();
      const resumed = jest.fn();
      session.on('resumed', resumed);

      ws.close('server_crash');
      const dial = dialing();
      session.close();

      // The dial in flight is let go without ending the stream
      expect(dial.closeCode).toBe(4000);
      expect(session.state).toBe('canceled');

      // One connection is opened for the only thing left to do: tell the
      // server the stream is over, so it does not bill out its whole window
      const closing = dialing();
      expect(closing).not.toBe(dial);
      expect(closing.url).toBe(RECONNECT_URL);
      closing.open();
      expect(JSON.parse(closing.sent[0] as string)).toEqual({
        type: 'reconnect',
        reconnect_token: 'token-1',
        last_seq: 0,
      });

      // The close goes out once the server has answered: until then this
      // connection holds no stream to end
      expect(closing.closeCode).toBeUndefined();
      closing.message(JSON.stringify({ type: 'reconnected', reconnect_token: 'token-2', last_request: 0 }));
      expect(closing.closeCode).toBe(1000);

      dial.open();
      await jest.advanceTimersByTimeAsync(0);

      expect(resumed).not.toHaveBeenCalled();
      expect(jest.getTimerCount()).toBe(0);
    });

    it('should end a stranded stream even when the server never answers', async () => {
      const { session, ws } = await startStream();

      ws.close('server_crash');
      const dial = dialing();
      session.close();

      // The connection the close made, not the takeover dial it let go
      const closing = dialing();
      expect(closing).not.toBe(dial);
      expect(MockWebSocket.instances).toHaveLength(3);
      closing.open();
      expect(JSON.parse(closing.sent[0] as string).type).toBe('reconnect');

      // The server never answers. A caller on the way out waits for nothing -
      // and the close still goes out, because the server may have taken the
      // stream over onto this socket with only the reply lost
      await jest.advanceTimersByTimeAsync(1000);

      expect(closing.closeCode).toBe(1000);
      expect(jest.getTimerCount()).toBe(0);
    });

    it('should present the token it holds to end a stranded stream', async () => {
      const { session, ws } = await startStream({ idle_timeout_ms: 20000 });
      session.on('error', () => undefined);

      const presentations = () =>
        MockWebSocket.instances.filter((socket) => socket.sent.some((data) => String(data).includes('"reconnect"')))
          .length;

      // Three presentations, none answered, then closed mid-takeover. Whether
      // the server will take this token again is its call, so the close still
      // presents it: a refusal costs one connection, and a stream left running
      // costs its whole idle window, billed
      ws.close('server_crash');
      for (let tick = 0; tick < 10 && presentations() < 3; tick += 1) {
        const dial = dialing();
        if (dial.readyState === MockWebSocket.CONNECTING) {
          dial.open();
        }
        await jest.advanceTimersByTimeAsync(presentations() < 3 ? 5000 : 0);
      }
      expect(presentations()).toBe(3);
      await jest.advanceTimersByTimeAsync(100);
      expect(session.state).toBe('connected');
      const dialled = MockWebSocket.instances.length;

      session.close();

      expect(MockWebSocket.instances).toHaveLength(dialled + 1);
      const closing = dialing();
      closing.open();
      expect(JSON.parse(closing.sent[0] as string).type).toBe('reconnect');
    });

    it('should end a stranded stream whose reconnect request will not go out', async () => {
      const { session, ws } = await startStream();

      ws.close('server_crash');
      session.close();

      // A connection that opens and then refuses the write: without the close
      // the socket stays open with nothing left to shut it, which in node
      // holds the event loop open and leaves the stream billing
      const closing = dialing();
      closing.failSendNumber = 1;
      closing.open();

      expect(closing.closeCode).toBe(1000);
      expect(jest.getTimerCount()).toBe(0);
    });

    it('should not continue a stream that never answers for ever', async () => {
      // A connection can answer `reconnected` and die before the resend lands.
      // Every success rotates the token and starts the window again, so the
      // bookkeeping alone has nothing left to stop on
      const { session, ws } = await startStream();
      const errors: Error[] = [];
      session.on('error', (error) => errors.push(error));
      session.sendAudio(new Uint8Array([1]));

      ws.close('server_crash');
      for (let tick = 0; tick < 40 && session.state === 'connected'; tick += 1) {
        const dial = dialing();
        if (dial.readyState === MockWebSocket.CONNECTING) {
          dial.open();
          dial.message(JSON.stringify({ type: 'reconnected', reconnect_token: `token-${tick}`, last_request: 0 }));
          dial.close('died before the resend landed');
        }
        await jest.advanceTimersByTimeAsync(2000);
      }

      expect(errors.map((error) => error.message)).toEqual([
        'The stream could not be continued: it was continued 5 times with no response from the server',
      ]);
      // MAX_RESUMES_WITHOUT_A_FRAME of them, behind the stream's own connection,
      // and one more to end the stream the server is still holding
      expect(MockWebSocket.instances).toHaveLength(7);
      const ending = dialing();
      ending.open();
      expect(JSON.parse(ending.sent[0] as string)).toMatchObject({ type: 'reconnect' });
      ending.message(JSON.stringify({ type: 'reconnected', reconnect_token: 'token-final', last_request: 1 }));
      expect(ending.closeCode).toBe(1000);
    });

    it('should end the stream before reporting a failed takeover', async () => {
      // A caller that starts a fresh stream on the error must not leave this
      // one running beside it
      const { session, ws } = await startStream({ idle_timeout_ms: 8000 });
      let dialsWhenReported = 0;
      session.on('error', () => {
        dialsWhenReported = MockWebSocket.instances.length;
      });

      ws.close('server_crash');
      await jest.advanceTimersByTimeAsync(10000);

      expect(dialsWhenReported).toBeGreaterThan(0);
      expect(MockWebSocket.instances).toHaveLength(dialsWhenReported);
      expect(dialing().url).toBe(RECONNECT_URL);
      expect(dialing().closeCode).toBe(1000);
    });

    it('should continue a working stream as often as it drops', async () => {
      // The cap counts takeovers in a row that got nothing back, not takeovers
      const { session, ws } = await startStream();
      const errors: Error[] = [];
      session.on('error', (error) => errors.push(error));

      // Counted by the resumes the session reports, not by loop turns: a
      // takeover takes as long as its backoff, and a turn that finds no dial
      // in flight has driven nothing
      let resumes = 0;
      session.on('resumed', () => {
        resumes += 1;
      });

      ws.close('server_crash');
      for (let tick = 0; tick < 200 && resumes < 9; tick += 1) {
        const dial = dialing();
        if (dial.readyState === MockWebSocket.CONNECTING) {
          dial.open();
          dial.message(JSON.stringify({ type: 'reconnected', reconnect_token: `token-${tick}`, last_request: 0 }));
          // The response that proves this takeover reached a live stream
          dial.message(JSON.stringify({ tokens: [], seq: resumes }));
          dial.close('dropped again');
        }
        await jest.advanceTimersByTimeAsync(500);
      }

      expect(resumes).toBe(9);
      expect(errors).toEqual([]);
      expect(session.state).toBe('connected');

      session.close();
    });

    it('should not end a stream a newer connection holds', async () => {
      const { session, ws } = await startStream();
      session.on('error', () => undefined);

      ws.message(
        JSON.stringify({
          error_code: 400,
          error_type: 'connection_replaced',
          error_message: 'A newer connection has this stream.',
        })
      );
      await jest.advanceTimersByTimeAsync(0);

      // Dropped, not closed, and not dialled again: the stream runs on there,
      // and a 1000 from here would reach the server as the end of it
      expect(ws.closeCode).toBe(4000);
      expect(MockWebSocket.instances).toHaveLength(1);
    });

    it.each([1000, 1001, 1005, 1006])('should take the stream over on a close code of %i', async (code) => {
      const { session, ws } = await startStream();
      session.on('error', () => undefined);

      ws.close(code);

      // Only a terminal frame ends a stream. A close is the connection's,
      // whatever its code, and a server going away
      // closes cleanly with the stream still waiting to be continued
      expect(MockWebSocket.instances).toHaveLength(2);
      expect(session.state).toBe('connected');

      session.close();
    });

    it('should refuse a reply that does not say what the server has', async () => {
      const { session, ws } = await startStream();
      const errors: Error[] = [];
      session.on('error', (error) => errors.push(error));
      session.sendAudio(new Uint8Array([1, 2, 3]));

      ws.close('server_crash');
      const dial = dialing();
      dial.open();
      // No `last_request`: resending from the first message would send that
      // audio twice, and the server transcribes what it is sent
      dial.message(JSON.stringify({ type: 'reconnected', reconnect_token: 'token-2' }));
      await jest.advanceTimersByTimeAsync(0);

      expect(session.state).toBe('error');
      expect(dial.sent).toHaveLength(1);
      expect(dial.closeCode).toBe(4000);
      expect(errors).toHaveLength(1);
    });

    it('should stop resending at the first message the connection refuses', async () => {
      const { session, ws } = await startStream();
      session.on('error', () => undefined);
      session.sendAudio(new Uint8Array([1]));
      session.sendAudio(new Uint8Array([2]));
      session.sendAudio(new Uint8Array([3]));

      ws.close('server_crash');
      const dial = dialing();
      // The reconnect request, the first chunk, then one send fails - and the
      // one behind it would go through, which is the whole danger
      dial.failSendNumber = 3;
      dial.open();
      dial.message(JSON.stringify({ type: 'reconnected', reconnect_token: 'token-2', last_request: 0 }));
      await jest.advanceTimersByTimeAsync(0);

      // The server counts what it reads, so sending the third chunk as its
      // second would leave its count behind ours, and the next resend would
      // repeat one chunk and skip another with nothing raised anywhere
      expect(delivered([dial])).toEqual([new Uint8Array([1])]);
    });

    it('should reject finish() with the reason the stream could not be continued', async () => {
      const { session, ws } = await startStream({ idle_timeout_ms: 3000 });
      session.on('error', () => undefined);
      const finishing = session.finish();

      ws.close('server_crash');
      const settled = expect(finishing).rejects.toThrow('window closed');
      await jest.advanceTimersByTimeAsync(6000);

      await settled;
    });
  });
});
