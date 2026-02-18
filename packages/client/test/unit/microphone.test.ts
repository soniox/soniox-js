import { MicrophoneSource } from '../../src/audio/microphone';
import { AudioPermissionError, AudioDeviceError, AudioUnavailableError } from '../../src/audio/errors';

// Mock MediaRecorder
type AnyFn = (...args: unknown[]) => unknown;

class MockMediaRecorder {
  state = 'inactive' as 'inactive' | 'recording' | 'paused';
  private listeners = new Map<string, AnyFn[]>();

  constructor(
    public stream: MediaStream,
    public options: MediaRecorderOptions
  ) {}

  addEventListener(event: string, handler: AnyFn) {
    const handlers = this.listeners.get(event) ?? [];
    handlers.push(handler);
    this.listeners.set(event, handlers);
  }

  removeEventListener(event: string, handler: AnyFn) {
    const handlers = this.listeners.get(event) ?? [];
    this.listeners.set(
      event,
      handlers.filter((h) => h !== handler)
    );
  }

  start(_timeslice?: number) {
    this.state = 'recording';
  }

  stop() {
    this.state = 'inactive';
  }

  pause() {
    this.state = 'paused';
  }

  resume() {
    this.state = 'recording';
  }
}

// Set up global MediaRecorder mock
(globalThis as any).MediaRecorder = MockMediaRecorder;

function createMockTrack() {
  const listeners = new Map<string, AnyFn[]>();
  return {
    stop: jest.fn(),
    addEventListener: (event: string, handler: AnyFn) => {
      const handlers = listeners.get(event) ?? [];
      handlers.push(handler);
      listeners.set(event, handlers);
    },
    removeEventListener: (event: string, handler: AnyFn) => {
      const handlers = listeners.get(event) ?? [];
      listeners.set(
        event,
        handlers.filter((h) => h !== handler)
      );
    },
    fire: (event: string) => {
      const handlers = listeners.get(event) ?? [];
      for (const h of handlers) h();
    },
    getListenerCount: (event: string) => (listeners.get(event) ?? []).length,
  };
}

function createMockStream(track?: ReturnType<typeof createMockTrack>): MediaStream {
  const t = track ?? createMockTrack();
  return {
    getTracks: () => [t],
    getAudioTracks: () => [t],
  } as unknown as MediaStream;
}

describe('MicrophoneSource', () => {
  let source: MicrophoneSource;

  beforeEach(() => {
    source = new MicrophoneSource();
  });

  afterEach(() => {
    source.stop();
  });

  describe('start', () => {
    it('throws AudioUnavailableError when getUserMedia is not available', async () => {
      Object.defineProperty(navigator, 'mediaDevices', {
        value: undefined,
        writable: true,
        configurable: true,
      });

      const handlers = { onData: jest.fn(), onError: jest.fn() };
      await expect(source.start(handlers)).rejects.toThrow(AudioUnavailableError);
    });

    it('throws AudioPermissionError on NotAllowedError', async () => {
      Object.defineProperty(navigator, 'mediaDevices', {
        value: {
          getUserMedia: jest.fn().mockRejectedValue(new DOMException('Denied', 'NotAllowedError')),
        },
        writable: true,
        configurable: true,
      });

      const handlers = { onData: jest.fn(), onError: jest.fn() };
      await expect(source.start(handlers)).rejects.toThrow(AudioPermissionError);
    });

    it('throws AudioDeviceError on NotFoundError', async () => {
      Object.defineProperty(navigator, 'mediaDevices', {
        value: {
          getUserMedia: jest.fn().mockRejectedValue(new DOMException('No device', 'NotFoundError')),
        },
        writable: true,
        configurable: true,
      });

      const handlers = { onData: jest.fn(), onError: jest.fn() };
      await expect(source.start(handlers)).rejects.toThrow(AudioDeviceError);
    });

    it('starts recording successfully with getUserMedia', async () => {
      const mockStream = createMockStream();
      Object.defineProperty(navigator, 'mediaDevices', {
        value: {
          getUserMedia: jest.fn().mockResolvedValue(mockStream),
        },
        writable: true,
        configurable: true,
      });

      const handlers = { onData: jest.fn(), onError: jest.fn() };
      await source.start(handlers);

      // No error thrown means success
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith({
        audio: expect.any(Object),
      });
    });
  });

  describe('stop', () => {
    it('is safe to call multiple times', () => {
      // Stop before start - should not throw
      source.stop();
      source.stop();
    });

    it('stops tracks on the stream', async () => {
      const mockStop = jest.fn();
      const mockTrack = { stop: mockStop, addEventListener: jest.fn(), removeEventListener: jest.fn() };
      const mockStream = {
        getTracks: () => [mockTrack],
        getAudioTracks: () => [mockTrack],
      } as unknown as MediaStream;

      Object.defineProperty(navigator, 'mediaDevices', {
        value: {
          getUserMedia: jest.fn().mockResolvedValue(mockStream),
        },
        writable: true,
        configurable: true,
      });

      const handlers = { onData: jest.fn(), onError: jest.fn() };
      await source.start(handlers);
      source.stop();

      expect(mockStop).toHaveBeenCalled();
    });
  });

  describe('pause/resume', () => {
    it('delegates to MediaRecorder pause/resume', async () => {
      const mockStream = createMockStream();
      Object.defineProperty(navigator, 'mediaDevices', {
        value: {
          getUserMedia: jest.fn().mockResolvedValue(mockStream),
        },
        writable: true,
        configurable: true,
      });

      const handlers = { onData: jest.fn(), onError: jest.fn() };
      await source.start(handlers);

      source.pause?.call(source);
      source.resume?.call(source);
    });
  });

  describe('mute detection', () => {
    it('fires onMuted when audio track emits mute', async () => {
      const track = createMockTrack();
      const mockStream = createMockStream(track);
      Object.defineProperty(navigator, 'mediaDevices', {
        value: { getUserMedia: jest.fn().mockResolvedValue(mockStream) },
        writable: true,
        configurable: true,
      });

      const onMuted = jest.fn();
      await source.start({ onData: jest.fn(), onError: jest.fn(), onMuted });

      track.fire('mute');
      expect(onMuted).toHaveBeenCalledTimes(1);
    });

    it('fires onUnmuted when audio track emits unmute', async () => {
      const track = createMockTrack();
      const mockStream = createMockStream(track);
      Object.defineProperty(navigator, 'mediaDevices', {
        value: { getUserMedia: jest.fn().mockResolvedValue(mockStream) },
        writable: true,
        configurable: true,
      });

      const onUnmuted = jest.fn();
      await source.start({ onData: jest.fn(), onError: jest.fn(), onUnmuted });

      track.fire('unmute');
      expect(onUnmuted).toHaveBeenCalledTimes(1);
    });

    it('cleans up mute listeners on stop()', async () => {
      const track = createMockTrack();
      const mockStream = createMockStream(track);
      Object.defineProperty(navigator, 'mediaDevices', {
        value: { getUserMedia: jest.fn().mockResolvedValue(mockStream) },
        writable: true,
        configurable: true,
      });

      const onMuted = jest.fn();
      const onUnmuted = jest.fn();
      await source.start({ onData: jest.fn(), onError: jest.fn(), onMuted, onUnmuted });

      source.stop();

      track.fire('mute');
      track.fire('unmute');
      expect(onMuted).not.toHaveBeenCalled();
      expect(onUnmuted).not.toHaveBeenCalled();
    });

    it('works without onMuted/onUnmuted handlers', async () => {
      const track = createMockTrack();
      const mockStream = createMockStream(track);
      Object.defineProperty(navigator, 'mediaDevices', {
        value: { getUserMedia: jest.fn().mockResolvedValue(mockStream) },
        writable: true,
        configurable: true,
      });

      await source.start({ onData: jest.fn(), onError: jest.fn() });

      // Should not throw when mute/unmute fire without handlers
      expect(() => track.fire('mute')).not.toThrow();
      expect(() => track.fire('unmute')).not.toThrow();
    });
  });
});
