import { renderHook, act } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { SonioxClient } from '@soniox/client';
import type { PermissionResolver, PermissionResult, PermissionType } from '@soniox/client';
import { SonioxProvider, useMicrophonePermission } from '../../src';

(globalThis as any).WebSocket = class {
  addEventListener() {}
  removeEventListener() {}
  close() {}
  send() {}
};

class MockPermissionResolver implements PermissionResolver {
  private result: PermissionResult = { status: 'prompt', can_request: true };

  setResult(result: PermissionResult) {
    this.result = result;
  }

  async check(_permission: PermissionType): Promise<PermissionResult> {
    return this.result;
  }

  async request(_permission: PermissionType): Promise<PermissionResult> {
    return this.result;
  }
}

function createWrapper(options?: { permissions?: PermissionResolver | null }) {
  const client = new SonioxClient({
    api_key: 'temp:test-key',
    ...(options?.permissions !== undefined ? { permissions: options.permissions ?? undefined } : {}),
  });
  const wrapper = ({ children }: { children: ReactNode }) => createElement(SonioxProvider, { client }, children);
  return { client, wrapper };
}

describe('useMicrophonePermission', () => {
  it('returns unsupported when no resolver is configured', () => {
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useMicrophonePermission(), { wrapper });

    expect(result.current.status).toBe('unsupported');
    expect(result.current.isSupported).toBe(false);
    expect(result.current.isGranted).toBe(false);
    expect(result.current.isDenied).toBe(false);
    expect(result.current.canRequest).toBe(false);
  });

  it('check() is a no-op when unsupported', async () => {
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useMicrophonePermission(), { wrapper });

    await act(async () => {
      await result.current.check();
    });

    expect(result.current.status).toBe('unsupported');
  });

  it('returns unknown as initial status when resolver exists', () => {
    const resolver = new MockPermissionResolver();
    const { wrapper } = createWrapper({ permissions: resolver });
    const { result } = renderHook(() => useMicrophonePermission(), { wrapper });

    expect(result.current.status).toBe('unknown');
    expect(result.current.isSupported).toBe(true);
  });

  it('check() updates status from resolver', async () => {
    const resolver = new MockPermissionResolver();
    resolver.setResult({ status: 'granted', can_request: false });

    const { wrapper } = createWrapper({ permissions: resolver });
    const { result } = renderHook(() => useMicrophonePermission(), { wrapper });

    await act(async () => {
      await result.current.check();
    });

    expect(result.current.status).toBe('granted');
    expect(result.current.isGranted).toBe(true);
    expect(result.current.isDenied).toBe(false);
    expect(result.current.canRequest).toBe(false);
  });

  it('reflects denied status', async () => {
    const resolver = new MockPermissionResolver();
    resolver.setResult({ status: 'denied', can_request: false });

    const { wrapper } = createWrapper({ permissions: resolver });
    const { result } = renderHook(() => useMicrophonePermission(), { wrapper });

    await act(async () => {
      await result.current.check();
    });

    expect(result.current.status).toBe('denied');
    expect(result.current.isDenied).toBe(true);
    expect(result.current.isGranted).toBe(false);
    expect(result.current.canRequest).toBe(false);
  });

  it('autoCheck triggers check on mount', async () => {
    const resolver = new MockPermissionResolver();
    resolver.setResult({ status: 'granted', can_request: false });

    const { wrapper } = createWrapper({ permissions: resolver });
    const { result } = renderHook(() => useMicrophonePermission({ autoCheck: true }), { wrapper });

    // Wait for the effect to fire
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });

    expect(result.current.status).toBe('granted');
    expect(result.current.isGranted).toBe(true);
  });

  it('autoCheck does not trigger when false', async () => {
    const resolver = new MockPermissionResolver();
    resolver.setResult({ status: 'granted', can_request: false });

    const { wrapper } = createWrapper({ permissions: resolver });
    const { result } = renderHook(() => useMicrophonePermission({ autoCheck: false }), { wrapper });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });

    // Should still be unknown since autoCheck is false
    expect(result.current.status).toBe('unknown');
  });

  it('check function reference is stable across renders', () => {
    const resolver = new MockPermissionResolver();
    const { wrapper } = createWrapper({ permissions: resolver });

    const { result, rerender } = renderHook(() => useMicrophonePermission(), { wrapper });

    const firstCheck = result.current.check;
    rerender();
    expect(result.current.check).toBe(firstCheck);
  });
});
