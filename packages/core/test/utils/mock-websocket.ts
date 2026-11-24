/**
 * MockWebSocket for testing WebSocket-based functionality.
 * Provides methods to simulate server events and track sent messages.
 */
export class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSED = 3;
  static instances: MockWebSocket[] = [];

  readonly url: string;
  /** Subprotocols requested on the handshake, if any */
  readonly protocols: string | string[] | undefined;
  readyState = MockWebSocket.CONNECTING;
  binaryType = 'arraybuffer';
  /** Tracks all messages sent via send() */
  sent: unknown[] = [];
  /** Close code the code under test asked for, when it gave one */
  closeCode: number | undefined;
  private readonly listeners = new Map<string, Set<(event: any) => void>>();

  constructor(url: string, protocols?: string | string[]) {
    this.url = url;
    this.protocols = protocols;
    MockWebSocket.instances.push(this);
  }

  addEventListener(type: string, listener: (event: any) => void): void {
    const handlers = this.listeners.get(type) ?? new Set();
    handlers.add(listener);
    this.listeners.set(type, handlers);
  }

  removeEventListener(type: string, listener: (event: any) => void): void {
    this.listeners.get(type)?.delete(listener);
  }

  /** Which send this connection refuses, counted from one. The rest go through. */
  failSendNumber: number | null = null;
  private sendAttempts = 0;

  send(data: unknown): void {
    if (this.readyState !== MockWebSocket.OPEN) {
      throw new Error('WebSocket is not open');
    }
    this.sendAttempts += 1;
    if (this.sendAttempts === this.failSendNumber) {
      throw new Error('WebSocket is closing');
    }
    this.sent.push(data);
  }

  /** Simulate the WebSocket opening */
  open(): void {
    this.readyState = MockWebSocket.OPEN;
    this.dispatch('open', { type: 'open' });
  }

  /**
   * Close the socket
   * Called as `close(code?, reason?)` by the code under test, and as
   * `close(reason)` by tests simulating the server closing
   */
  close(codeOrReason: number | string = '', reason = ''): void {
    if (this.readyState === MockWebSocket.CLOSED) {
      // The first close is the one that counts, as on a real socket
      return;
    }
    if (typeof codeOrReason === 'number') {
      this.closeCode = codeOrReason;
    }
    this.readyState = MockWebSocket.CLOSED;
    // A server close with no code reads as 1005 on a real socket, and the
    // code is what a test about which closes are resumable needs to set
    this.dispatch('close', {
      type: 'close',
      code: typeof codeOrReason === 'number' ? codeOrReason : 1005,
      reason: typeof codeOrReason === 'string' ? codeOrReason : reason,
    });
  }

  /** Simulate receiving a message from the server */
  message(data: string): void {
    this.dispatch('message', { data });
  }

  /** Simulate a transport failure: a refused handshake, or a dead socket */
  error(message = ''): void {
    this.dispatch('error', { type: 'error', message });
  }

  private dispatch(type: string, event: any): void {
    const handlers = this.listeners.get(type);
    if (!handlers) return;
    // Copied, so a listener added during delivery does not also receive it
    for (const handler of [...handlers]) {
      handler(event);
    }
  }

  /** Reset all MockWebSocket instances */
  static reset(): void {
    MockWebSocket.instances = [];
  }
}

/** Original WebSocket stored for restoration */
let OriginalWebSocket: typeof WebSocket | undefined;

/**
 * Install MockWebSocket as global.WebSocket.
 * Call in beforeEach.
 */
export function installMockWebSocket(): void {
  OriginalWebSocket = global.WebSocket;
  MockWebSocket.reset();

  (global as any).WebSocket = MockWebSocket;
}

/**
 * Restore the original WebSocket.
 * Call in afterEach.
 */
export function restoreMockWebSocket(): void {
  (global as any).WebSocket = OriginalWebSocket;
}

/**
 * Get the most recently created MockWebSocket instance.
 */
export function getLastMockWebSocket(): MockWebSocket | undefined {
  return MockWebSocket.instances[MockWebSocket.instances.length - 1];
}

/**
 * Get MockWebSocket instance by index.
 */
export function getMockWebSocket(index: number): MockWebSocket | undefined {
  return MockWebSocket.instances[index];
}
