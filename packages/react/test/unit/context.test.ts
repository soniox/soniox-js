import { renderHook } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { SonioxClient } from '@soniox/client';
import { SonioxProvider, useSoniox } from '../../src';

(globalThis as any).WebSocket = class {
  addEventListener() {}
  removeEventListener() {}
  close() {}
  send() {}
};

describe('SonioxProvider', () => {
  it('creates a client from apiKey and makes it available via useSoniox', () => {
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(SonioxProvider, { apiKey: 'temp:test-key' }, children);

    const { result } = renderHook(() => useSoniox(), { wrapper });

    expect(result.current).toBeInstanceOf(SonioxClient);
  });

  it('accepts a pre-built client via the client prop', () => {
    const client = new SonioxClient({ api_key: 'temp:test-key' });
    const wrapper = ({ children }: { children: ReactNode }) => createElement(SonioxProvider, { client }, children);

    const { result } = renderHook(() => useSoniox(), { wrapper });

    expect(result.current).toBe(client);
  });

  it('provides the same client across re-renders', () => {
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(SonioxProvider, { apiKey: 'temp:test-key' }, children);

    const { result, rerender } = renderHook(() => useSoniox(), { wrapper });

    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });

  it('warns in dev mode when props change after mount', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const originalEnv = process.env.NODE_ENV;

    try {
      // Ensure we're in development mode
      process.env.NODE_ENV = 'development';

      let apiKey = 'temp:key-1';

      const Wrapper = ({ children }: { children: ReactNode }) => createElement(SonioxProvider, { apiKey }, children);

      const { rerender } = renderHook(() => useSoniox(), {
        wrapper: Wrapper,
      });

      // Change apiKey and re-render
      apiKey = 'temp:key-2';
      rerender();

      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('SonioxProvider props changed after mount'));
    } finally {
      process.env.NODE_ENV = originalEnv;
      warnSpy.mockRestore();
    }
  });
});

describe('useSoniox', () => {
  it('throws when used outside a provider', () => {
    // Suppress console.error from React's error boundary
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => {
      renderHook(() => useSoniox());
    }).toThrow('useSoniox must be used within a <SonioxProvider>');

    errorSpy.mockRestore();
  });
});

describe('SonioxProvider permission resolver defaults', () => {
  it('sets default BrowserPermissionResolver when navigator.mediaDevices exists', () => {
    // jsdom provides navigator and we mock mediaDevices
    const original = navigator.mediaDevices;
    Object.defineProperty(navigator, 'mediaDevices', {
      value: { getUserMedia: jest.fn() },
      configurable: true,
    });

    try {
      const wrapper = ({ children }: { children: ReactNode }) =>
        createElement(SonioxProvider, { apiKey: 'temp:test-key' }, children);

      const { result } = renderHook(() => useSoniox(), { wrapper });
      expect(result.current.permissions).toBeDefined();
    } finally {
      Object.defineProperty(navigator, 'mediaDevices', {
        value: original,
        configurable: true,
      });
    }
  });

  it('does not set resolver when navigator.mediaDevices is missing (RN-like)', () => {
    const original = navigator.mediaDevices;
    Object.defineProperty(navigator, 'mediaDevices', {
      value: undefined,
      configurable: true,
    });

    try {
      const wrapper = ({ children }: { children: ReactNode }) =>
        createElement(SonioxProvider, { apiKey: 'temp:test-key' }, children);

      const { result } = renderHook(() => useSoniox(), { wrapper });
      expect(result.current.permissions).toBeUndefined();
    } finally {
      Object.defineProperty(navigator, 'mediaDevices', {
        value: original,
        configurable: true,
      });
    }
  });

  it('uses explicitly provided permissions resolver', () => {
    const mockResolver = {
      check: jest.fn().mockResolvedValue({ status: 'granted', can_request: true }),
      request: jest.fn().mockResolvedValue({ status: 'granted', can_request: true }),
    };

    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(SonioxProvider, { apiKey: 'temp:test-key', permissions: mockResolver }, children);

    const { result } = renderHook(() => useSoniox(), { wrapper });
    expect(result.current.permissions).toBe(mockResolver);
  });

  it('disables resolver when permissions is null', () => {
    const original = navigator.mediaDevices;
    Object.defineProperty(navigator, 'mediaDevices', {
      value: { getUserMedia: jest.fn() },
      configurable: true,
    });

    try {
      const wrapper = ({ children }: { children: ReactNode }) =>
        createElement(SonioxProvider, { apiKey: 'temp:test-key', permissions: null }, children);

      const { result } = renderHook(() => useSoniox(), { wrapper });
      expect(result.current.permissions).toBeUndefined();
    } finally {
      Object.defineProperty(navigator, 'mediaDevices', {
        value: original,
        configurable: true,
      });
    }
  });
});
