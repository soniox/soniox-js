import { readFileSync } from 'fs';
import path from 'path';

import { SonioxNodeClient } from '@soniox/node';
import type { RealtimeSttSession, RealtimeToken } from '@soniox/node';

/**
 * Stream reconnect against the real API.
 * See: https://docs.soniox.com/stt/rt/stream-reconnect
 *
 * The audio is streamed at twice real time and the connection is dropped while
 * it plays. A continued stream has to end with the same transcript as one that
 * never dropped: every final token once, in order, up to the end of the audio.
 */

const AUDIO = readFileSync(path.join(__dirname, '../../audio_samples/coffee_shop.pcm_s16le'));
const SAMPLE_RATE = 16000;
const BYTES_PER_MS = (SAMPLE_RATE * 2) / 1000;
const CHUNK_BYTES = 3840; // 120 ms
const PACE_MS = 60;
const AUDIO_MS = AUDIO.length / BYTES_PER_MS;
const CHUNK_COUNT = Math.ceil(AUDIO.length / CHUNK_BYTES);

const describeWithApiKey = process.env.SONIOX_API_KEY ? describe : describe.skip;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type Frame = Record<string, unknown>;

/**
 * Node's WebSocket, recording what goes through it, and able to turn into a
 * black hole: the socket stays open but nothing reaches either side, which is
 * what a dropped network looks like to a client.
 */
const NativeWebSocket = globalThis.WebSocket;

class TappedWebSocket extends NativeWebSocket {
  static instances: TappedWebSocket[] = [];

  readonly url: string;
  readonly sent: Array<string | Uint8Array> = [];
  readonly received: Frame[] = [];
  /** Audio frames lost to the black hole. */
  swallowed = 0;
  private blackholed = false;

  constructor(url: string | URL, protocols?: string | string[]) {
    super(url, protocols);
    this.url = String(url);
    TappedWebSocket.instances.push(this);
    for (const type of ['message', 'close', 'error'] as const) {
      this.addEventListener(type, (event) => {
        if (this.blackholed) event.stopImmediatePropagation();
      });
    }
    this.addEventListener('message', (event) => {
      if (typeof event.data === 'string') this.received.push(JSON.parse(event.data) as Frame);
    });
  }

  blackhole(): void {
    this.blackholed = true;
  }

  override send(data: string | ArrayBufferLike | Blob | ArrayBufferView): void {
    if (this.blackholed) {
      if (typeof data !== 'string') this.swallowed += 1;
      return;
    }
    this.sent.push(data as string | Uint8Array);
    super.send(data);
  }
}

/** Messages the server counts toward `last_request`: everything after the start request, except pings. */
function countedMessages(ws: TappedWebSocket): number {
  return ws.sent.slice(1).filter((data) => typeof data !== 'string' || (JSON.parse(data) as Frame).type !== 'ping')
    .length;
}

interface Run {
  text: string;
  finals: RealtimeToken[];
  events: string[];
}

interface Hooks {
  afterChunk?: (index: number, session: RealtimeSttSession) => void;
  afterFinishSent?: (session: RealtimeSttSession) => void;
}

async function transcribe(session: RealtimeSttSession, hooks: Hooks = {}): Promise<Run> {
  const finals: RealtimeToken[] = [];
  const events: string[] = [];
  session.on('result', (result) => finals.push(...result.tokens.filter((t) => t.is_final)));
  session.on('resuming', () => events.push('resuming'));
  session.on('resumed', () => events.push('resumed'));
  session.on('error', (error) => events.push(`error: ${error.message}`));

  await session.connect();
  for (let i = 0; i < CHUNK_COUNT; i++) {
    session.sendAudio(AUDIO.subarray(i * CHUNK_BYTES, (i + 1) * CHUNK_BYTES));
    hooks.afterChunk?.(i, session);
    await sleep(PACE_MS);
  }
  const finished = session.finish();
  hooks.afterFinishSent?.(session);
  await finished;

  return { text: finals.map((t) => t.text).join(''), finals, events };
}

const words = (text: string) => text.toLowerCase().match(/[\p{L}\p{N}']+/gu) ?? [];

/** Share of words two transcripts have in common, in order (LCS over the longer one). */
function similarity(a: string, b: string): number {
  const x = words(a);
  const y = words(b);
  const row = new Array<number>(y.length + 1).fill(0);
  for (const wx of x) {
    let diagonal = 0;
    for (let j = 1; j <= y.length; j++) {
      const above = row[j]!;
      row[j] = wx === y[j - 1] ? diagonal + 1 : Math.max(row[j]!, row[j - 1]!);
      diagonal = above;
    }
  }
  return row[y.length]! / Math.max(x.length, y.length, 1);
}

/** Nothing repeated (a replay would step back in time) and nothing missing at the end. */
function expectWholeTranscript(run: Run, baseline: Run): void {
  for (let i = 1; i < run.finals.length; i++) {
    expect(run.finals[i]!.start_ms).toBeGreaterThanOrEqual(run.finals[i - 1]!.start_ms);
  }
  const lastEnd = run.finals.at(-1)?.end_ms ?? 0;
  expect(lastEnd).toBeGreaterThan(AUDIO_MS - 2000);
  expect(similarity(run.text, baseline.text)).toBeGreaterThan(0.9);
}

describeWithApiKey('Realtime STT stream reconnect (live API)', () => {
  const client = new SonioxNodeClient();
  const config = {
    model: 'stt-rt-v6',
    audio_format: 'pcm_s16le',
    sample_rate: SAMPLE_RATE,
    num_channels: 1,
    enable_reconnect: true,
  } as const;

  let baseline: Run;

  beforeAll(async () => {
    globalThis.WebSocket = TappedWebSocket;
    baseline = await transcribe(client.realtime.stt(config));
  }, 60000);

  afterAll(() => {
    globalThis.WebSocket = NativeWebSocket;
  });

  beforeEach(() => {
    TappedWebSocket.instances = [];
  });

  it('runs without a drop: the server grants reconnect and numbers responses', () => {
    expect(baseline.events).toEqual([]);
    expect(baseline.finals.length).toBeGreaterThan(0);
    expect(baseline.finals.at(-1)!.end_ms).toBeGreaterThan(AUDIO_MS - 2000);
  });

  it('continues the stream after the connection closes, twice', async () => {
    const run = await transcribe(client.realtime.stt(config), {
      afterChunk: (i, session) => {
        if (i === Math.floor(CHUNK_COUNT * 0.3) || i === Math.floor(CHUNK_COUNT * 0.6)) {
          session.__debugForceDisconnect();
        }
      },
    });

    expect(run.events).toEqual(['resuming', 'resumed', 'resuming', 'resumed']);

    const [first, ...dials] = TappedWebSocket.instances;
    const reconnect = first!.received.find((frame) => frame.type === 'reconnect')!;
    expect(dials).toHaveLength(2);
    for (const dial of dials) {
      expect(dial.url).toBe(reconnect.reconnect_url);
      expect(JSON.parse(dial.sent[0] as string)).toMatchObject({ type: 'reconnect' });
      expect(dial.received[0]).toMatchObject({ type: 'reconnected' });
    }
    // Every reconnect hands out a new token, and the next attempt presents it
    expect(JSON.parse(dials[1]!.sent[0] as string).reconnect_token).toBe(dials[0]!.received[0]!.reconnect_token);

    expectWholeTranscript(run, baseline);
  }, 60000);

  it('moves a healthy stream to a new connection on request', async () => {
    const run = await transcribe(client.realtime.stt(config), {
      afterChunk: (i, session) => {
        if (i === Math.floor(CHUNK_COUNT * 0.5)) {
          expect(session.resumeStream()).toBe(true);
        }
      },
    });

    expect(run.events).toEqual(['resuming', 'resumed']);
    expect(TappedWebSocket.instances).toHaveLength(2);

    expectWholeTranscript(run, baseline);
  }, 60000);

  it('notices a silent drop by ping and resends the audio the server missed', async () => {
    let dropped: TappedWebSocket | undefined;
    const run = await transcribe(client.realtime.stt(config), {
      afterChunk: (i) => {
        if (i === Math.floor(CHUNK_COUNT * 0.3)) {
          dropped = TappedWebSocket.instances.at(-1)!;
          dropped.blackhole();
        }
      },
    });

    expect(run.events).toEqual(['resuming', 'resumed']);
    expect(dropped!.swallowed).toBeGreaterThan(0);

    const dial = TappedWebSocket.instances.at(-1)!;
    expect(dial).not.toBe(dropped);
    const presented = JSON.parse(dial.sent[0] as string) as Frame;
    const reconnected = dial.received[0]!;
    expect(reconnected.type).toBe('reconnected');
    expect(presented.last_seq).toBeGreaterThan(0);

    // The server counted exactly what got through before the drop, so everything
    // swallowed after it has to be sent again on the new connection
    expect(reconnected.last_request).toBe(countedMessages(dropped!));
    const resent = dial.sent.slice(1).filter((data) => typeof data !== 'string');
    expect(resent.length).toBeGreaterThanOrEqual(dropped!.swallowed);

    expectWholeTranscript(run, baseline);
  }, 60000);

  it('gets the final results when the connection drops after the end of audio', async () => {
    const run = await transcribe(client.realtime.stt(config), {
      afterFinishSent: (session) => session.__debugForceDisconnect(),
    });

    expect(run.events).toEqual(['resuming', 'resumed']);
    expect(TappedWebSocket.instances.at(-1)!.received.some((frame) => frame.finished === true)).toBe(true);

    expectWholeTranscript(run, baseline);
  }, 60000);
});
