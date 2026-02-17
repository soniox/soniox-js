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
  readyState = MockWebSocket.CONNECTING;
  binaryType = 'arraybuffer';
  /** Tracks all messages sent via send() */
  sent: unknown[] = [];
  private readonly listeners = new Map<string, Set<(event: any) => void>>();

  constructor(url: string) {
    this.url = url;
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

  send(data: unknown): void {
    if (this.readyState !== MockWebSocket.OPEN) {
      throw new Error('WebSocket is not open');
    }
    this.sent.push(data);
  }

  /** Simulate the WebSocket opening */
  open(): void {
    this.readyState = MockWebSocket.OPEN;
    this.dispatch('open', { type: 'open' });
  }

  /** Simulate the WebSocket closing */
  close(reason = ''): void {
    if (this.readyState === MockWebSocket.CLOSED) {
      return;
    }
    this.readyState = MockWebSocket.CLOSED;
    this.dispatch('close', { type: 'close', reason });
  }

  /** Simulate receiving a message from the server */
  message(data: string): void {
    this.dispatch('message', { data });
  }

  private dispatch(type: string, event: any): void {
    const handlers = this.listeners.get(type);
    if (!handlers) return;
    for (const handler of handlers) {
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
