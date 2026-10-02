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
    const session = client.realtime.stt({ model: 'stt-rt-v5' });

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
    const session = client.realtime.stt({ model: 'stt-rt-v5' }, { auth_transport: 'protocol-list' });

    const connectPromise = session.connect();
    const ws = getLastMockWebSocket()!;
    ws.open();
    await connectPromise;

    expect(ws.protocols).toEqual(['soniox-api-key', API_KEY]);
    session.close();
  });
});
