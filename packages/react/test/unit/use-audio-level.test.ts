import { renderHook, act } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { useAudioLevel, AudioLevel } from '../../src';

let mockTimeDomainData: Uint8Array;
let mockFrequencyData: Uint8Array;
let mockGetUserMedia: jest.Mock;

const mockTrack = { stop: jest.fn() };

const mockAnalyser = {
  fftSize: 256,
  frequencyBinCount: 128,
  getByteTimeDomainData: jest.fn((buffer: Uint8Array) => {
    buffer.set(mockTimeDomainData.subarray(0, buffer.length));
  }),
  getByteFrequencyData: jest.fn((buffer: Uint8Array) => {
    buffer.set(mockFrequencyData.subarray(0, buffer.length));
  }),
};

const mockSource = {
  connect: jest.fn(),
  disconnect: jest.fn(),
};

const mockAudioContext = {
  createMediaStreamSource: jest.fn(() => mockSource),
  createAnalyser: jest.fn(() => mockAnalyser),
  close: jest.fn(() => Promise.resolve()),
};

const mockStream = {
  getTracks: jest.fn(() => [mockTrack]),
};

// Mock requestAnimationFrame to be controllable.
let rafCallbacks: Array<() => void> = [];
let rafIdCounter = 0;

beforeEach(() => {
  jest.clearAllMocks();
  rafCallbacks = [];
  rafIdCounter = 0;

  // Default: silence (128 = zero crossing in unsigned byte format).
  mockTimeDomainData = new Uint8Array(256).fill(128);
  mockFrequencyData = new Uint8Array(128).fill(0);

  // Mock getUserMedia on the real navigator.
  mockGetUserMedia = jest.fn(() => Promise.resolve(mockStream));
  Object.defineProperty(navigator, 'mediaDevices', {
    value: { getUserMedia: mockGetUserMedia },
    writable: true,
    configurable: true,
  });

  // Mock AudioContext.
  (globalThis as any).AudioContext = jest.fn(() => mockAudioContext);

  // Mock rAF / cAF.
  (globalThis as any).requestAnimationFrame = jest.fn((cb: () => void) => {
    rafCallbacks.push(cb);
    return ++rafIdCounter;
  });
  (globalThis as any).cancelAnimationFrame = jest.fn(() => {
    rafCallbacks = [];
  });
});

// Helper: flush pending rAF callbacks (runs N frames).
function flushRAF(count = 1) {
  for (let n = 0; n < count; n++) {
    const cbs = [...rafCallbacks];
    rafCallbacks = [];
    for (const cb of cbs) {
      cb();
    }
  }
}

const tick = (ms = 10) => new Promise((resolve) => setTimeout(resolve, ms));

describe('useAudioLevel', () => {
  it('returns volume 0 and empty bands when not active', () => {
    const { result } = renderHook(() => useAudioLevel());

    expect(result.current.volume).toBe(0);
    expect(result.current.bands).toEqual([]);
  });

  it('returns volume 0 and empty bands when active is false', () => {
    const { result } = renderHook(() => useAudioLevel({ active: false }));

    expect(result.current.volume).toBe(0);
    expect(result.current.bands).toEqual([]);
  });

  it('calls getUserMedia when active becomes true', async () => {
    renderHook(() => useAudioLevel({ active: true }));

    await act(async () => {
      await tick();
    });

    expect(mockGetUserMedia).toHaveBeenCalledWith({ audio: true });
  });

  it('creates AudioContext and AnalyserNode when active', async () => {
    renderHook(() => useAudioLevel({ active: true }));

    await act(async () => {
      await tick();
    });

    expect(AudioContext).toHaveBeenCalled();
    expect(mockAudioContext.createMediaStreamSource).toHaveBeenCalledWith(mockStream);
    expect(mockAudioContext.createAnalyser).toHaveBeenCalled();
    expect(mockSource.connect).toHaveBeenCalledWith(mockAnalyser);
  });

  it('updates volume from rAF loop', async () => {
    // Simulate loud audio: alternating 0 and 255.
    mockTimeDomainData = new Uint8Array(256);
    for (let i = 0; i < 256; i++) {
      mockTimeDomainData[i] = i % 2 === 0 ? 0 : 255;
    }

    const { result } = renderHook(() => useAudioLevel({ active: true, smoothing: 0 }));

    await act(async () => {
      await tick();
    });

    act(() => {
      flushRAF(3);
    });

    expect(result.current.volume).toBeGreaterThan(0.5);
  });

  it('returns empty bands when bands option is not set', async () => {
    const { result } = renderHook(() => useAudioLevel({ active: true, smoothing: 0 }));

    await act(async () => {
      await tick();
    });

    act(() => {
      flushRAF(1);
    });

    expect(result.current.bands).toEqual([]);
  });

  it('returns correct number of bands when bands option is set', async () => {
    mockFrequencyData = new Uint8Array(128).fill(200);

    const { result } = renderHook(() => useAudioLevel({ active: true, bands: 8, smoothing: 0 }));

    await act(async () => {
      await tick();
    });

    act(() => {
      flushRAF(3);
    });

    expect(result.current.bands).toHaveLength(8);
    for (const band of result.current.bands) {
      expect(band).toBeGreaterThan(0);
    }
  });

  it('applies EMA smoothing to volume', async () => {
    mockTimeDomainData = new Uint8Array(256).fill(128); // silence

    const { result } = renderHook(() => useAudioLevel({ active: true, smoothing: 0.9 }));

    await act(async () => {
      await tick();
    });

    // First frame: silence.
    act(() => {
      flushRAF(1);
    });
    expect(result.current.volume).toBeCloseTo(0, 1);

    // Switch to loud audio.
    for (let i = 0; i < 256; i++) {
      mockTimeDomainData[i] = i % 2 === 0 ? 0 : 255;
    }

    // One frame with 0.9 smoothing — volume rises but doesn't jump to max.
    act(() => {
      flushRAF(1);
    });
    expect(result.current.volume).toBeGreaterThan(0);
    expect(result.current.volume).toBeLessThan(0.95);

    // Many frames — converges toward raw value.
    act(() => {
      flushRAF(50);
    });
    expect(result.current.volume).toBeGreaterThan(0.8);
  });

  it('applies per-band EMA smoothing', async () => {
    mockFrequencyData = new Uint8Array(128).fill(0); // silence

    const { result } = renderHook(() => useAudioLevel({ active: true, bands: 4, smoothing: 0.9 }));

    await act(async () => {
      await tick();
    });

    act(() => {
      flushRAF(1);
    });
    expect(result.current.bands[0]).toBeCloseTo(0, 1);

    // Jump to loud.
    mockFrequencyData = new Uint8Array(128).fill(255);

    act(() => {
      flushRAF(1);
    });
    expect(result.current.bands[0]).toBeGreaterThan(0);
    expect(result.current.bands[0]).toBeLessThan(0.95);
  });

  it('cleans up resources when active becomes false', async () => {
    const { rerender } = renderHook(({ active }: { active: boolean }) => useAudioLevel({ active }), {
      initialProps: { active: true },
    });

    await act(async () => {
      await tick();
    });

    // Deactivate.
    rerender({ active: false });

    expect(mockAudioContext.close).toHaveBeenCalled();
    expect(mockStream.getTracks).toHaveBeenCalled();
    expect(mockTrack.stop).toHaveBeenCalled();
  });

  it('cleans up on unmount', async () => {
    const { unmount } = renderHook(() => useAudioLevel({ active: true }));

    await act(async () => {
      await tick();
    });

    unmount();

    expect(mockAudioContext.close).toHaveBeenCalled();
    expect(cancelAnimationFrame).toHaveBeenCalled();
  });

  it('handles getUserMedia failure gracefully', async () => {
    mockGetUserMedia.mockRejectedValueOnce(new Error('Denied'));

    const { result } = renderHook(() => useAudioLevel({ active: true }));

    await act(async () => {
      await tick();
    });

    expect(result.current.volume).toBe(0);
    expect(result.current.bands).toEqual([]);
  });
});

describe('AudioLevel', () => {
  it('renders children with volume and bands', async () => {
    mockFrequencyData = new Uint8Array(128).fill(200);

    let capturedState: { volume: number; bands: readonly number[] } | null = null;

    renderHook(() => {}, {
      wrapper: ({ children }: { children: ReactNode }) =>
        createElement(
          AudioLevel,
          { active: true, bands: 4, smoothing: 0 } as any,
          (state: { volume: number; bands: readonly number[] }) => {
            capturedState = state;
            return children;
          }
        ),
    });

    await act(async () => {
      await tick();
    });

    act(() => {
      flushRAF(3);
    });

    expect(capturedState).not.toBeNull();
    expect(typeof capturedState!.volume).toBe('number');
    expect(capturedState!.bands).toHaveLength(4);
  });
});
