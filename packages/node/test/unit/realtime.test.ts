import { SonioxNodeClient } from '../../src/client';
import {
  installMockWebSocket,
  restoreMockWebSocket,
  getLastMockWebSocket,
} from '../../../core/test/utils/mock-websocket';

describe('SonioxRealtimeApi handshake auth', () => {
  const API_KEY = 'test-api-key';
  const expectedHeaders = { headers: { Authorization: `Bearer ${API_KEY}` } };

  beforeEach(() => {
    installMockWebSocket();
  });

  afterEach(() => {
    restoreMockWebSocket();
  });

  it('STT sessions send the api key as an Authorization header', async () => {
    const client = new SonioxNodeClient({ api_key: API_KEY });
    const session = client.realtime.stt({ model: 'stt-rt-v6' });

    const connectPromise = session.connect();
    const ws = getLastMockWebSocket()!;
    ws.open();
    await connectPromise;

    expect(ws.protocols).toEqual(expectedHeaders);
    session.close();
  });

  it('TTS connections send the api key as an Authorization header', async () => {
    const client = new SonioxNodeClient({ api_key: API_KEY });

    const connectPromise = client.realtime.tts.multiStream();
    const ws = getLastMockWebSocket()!;
    ws.open();
    const connection = await connectPromise;

    expect(ws.protocols).toEqual(expectedHeaders);
    connection.close();
  });

  it('a caller-provided auth_transport overrides the node default', async () => {
    const client = new SonioxNodeClient({ api_key: API_KEY });
    const session = client.realtime.stt({ model: 'stt-rt-v6' }, { auth_transport: 'protocol-list' });

    const connectPromise = session.connect();
    const ws = getLastMockWebSocket()!;
    ws.open();
    await connectPromise;

    expect(ws.protocols).toEqual(['soniox-api-key', API_KEY]);
    session.close();
  });
});

describe('SonioxRealtimeApi stream reconnect', () => {
  const API_KEY = 'test-api-key';
  const RECONNECT_URL = 'wss://stt-rt.soniox.com/transcribe-websocket?reconnect=true&r=Qx7mT2kV';

  beforeEach(() => {
    installMockWebSocket();
  });

  afterEach(() => {
    restoreMockWebSocket();
  });

  it('continues the stream on a new connection, authenticated the same way', async () => {
    const client = new SonioxNodeClient({ api_key: API_KEY });
    const session = client.realtime.stt({ model: 'stt-rt-v5', enable_reconnect: true });

    const connectPromise = session.connect();
    const ws = getLastMockWebSocket()!;
    ws.open();
    await connectPromise;
    ws.message(JSON.stringify({ type: 'reconnect', reconnect_token: 'token-1', reconnect_url: RECONNECT_URL }));

    expect(JSON.parse(ws.sent[0] as string).enable_reconnect).toBe(true);

    session.sendAudio(new Uint8Array([1]));
    session.sendAudio(new Uint8Array([2]));
    ws.close('server_crash');

    const dial = getLastMockWebSocket()!;
    expect(dial.url).toBe(RECONNECT_URL);
    expect(dial.protocols).toEqual({ headers: { Authorization: `Bearer ${API_KEY}` } });

    dial.open();
    dial.message(JSON.stringify({ type: 'reconnected', reconnect_token: 'token-2', last_request: 1 }));
    await Promise.resolve();

    expect(JSON.parse(dial.sent[0] as string)).toEqual({
      type: 'reconnect',
      reconnect_token: 'token-1',
      last_seq: 0,
    });
    expect(dial.sent.slice(1)).toEqual([new Uint8Array([2])]);
    expect(session.state).toBe('connected');

    session.close();
  });
});
