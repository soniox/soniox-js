import { BrowserPermissionResolver } from '../../src/permissions/browser';

describe('BrowserPermissionResolver', () => {
  let resolver: BrowserPermissionResolver;

  beforeEach(() => {
    resolver = new BrowserPermissionResolver();
  });

  describe('check', () => {
    it('returns unavailable for unsupported permission types', async () => {
      // @ts-expect-error - testing unknown permission type
      const result = await resolver.check('camera');
      expect(result).toEqual({ status: 'unavailable', can_request: false });
    });

    it('returns granted when permissions API reports granted', async () => {
      Object.defineProperty(navigator, 'permissions', {
        value: {
          query: jest.fn().mockResolvedValue({ state: 'granted' }),
        },
        writable: true,
        configurable: true,
      });

      const result = await resolver.check('microphone');
      expect(result).toEqual({ status: 'granted', can_request: true });
    });

    it('returns denied when permissions API reports denied', async () => {
      Object.defineProperty(navigator, 'permissions', {
        value: {
          query: jest.fn().mockResolvedValue({ state: 'denied' }),
        },
        writable: true,
        configurable: true,
      });

      const result = await resolver.check('microphone');
      expect(result).toEqual({ status: 'denied', can_request: false });
    });

    it('returns prompt when permissions API reports prompt', async () => {
      Object.defineProperty(navigator, 'permissions', {
        value: {
          query: jest.fn().mockResolvedValue({ state: 'prompt' }),
        },
        writable: true,
        configurable: true,
      });

      const result = await resolver.check('microphone');
      expect(result).toEqual({ status: 'prompt', can_request: true });
    });

    it('falls back to prompt when permissions API throws (Safari)', async () => {
      Object.defineProperty(navigator, 'permissions', {
        value: {
          query: jest.fn().mockRejectedValue(new TypeError('not supported')),
        },
        writable: true,
        configurable: true,
      });

      // getUserMedia must exist for fallback
      Object.defineProperty(navigator, 'mediaDevices', {
        value: { getUserMedia: jest.fn() },
        writable: true,
        configurable: true,
      });

      const result = await resolver.check('microphone');
      expect(result).toEqual({ status: 'prompt', can_request: true });
    });
  });

  describe('request', () => {
    it('returns granted on successful getUserMedia', async () => {
      const mockTrack = { stop: jest.fn() };
      const mockStream = { getTracks: () => [mockTrack] };

      Object.defineProperty(navigator, 'mediaDevices', {
        value: {
          getUserMedia: jest.fn().mockResolvedValue(mockStream),
        },
        writable: true,
        configurable: true,
      });

      const result = await resolver.request('microphone');
      expect(result).toEqual({ status: 'granted', can_request: true });
      expect(mockTrack.stop).toHaveBeenCalled();
    });

    it('returns denied on NotAllowedError', async () => {
      const error = new DOMException('Permission denied', 'NotAllowedError');

      Object.defineProperty(navigator, 'mediaDevices', {
        value: {
          getUserMedia: jest.fn().mockRejectedValue(error),
        },
        writable: true,
        configurable: true,
      });

      const result = await resolver.request('microphone');
      expect(result).toEqual({ status: 'denied', can_request: false });
    });

    it('returns unavailable on NotFoundError', async () => {
      const error = new DOMException('No device', 'NotFoundError');

      Object.defineProperty(navigator, 'mediaDevices', {
        value: {
          getUserMedia: jest.fn().mockRejectedValue(error),
        },
        writable: true,
        configurable: true,
      });

      const result = await resolver.request('microphone');
      expect(result).toEqual({ status: 'unavailable', can_request: false });
    });
  });
});
