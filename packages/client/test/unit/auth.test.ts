import { resolveApiKey } from '../../src/auth';

describe('resolveApiKey', () => {
  it('returns a static string key', async () => {
    const key = await resolveApiKey('temp:abc123');
    expect(key).toBe('temp:abc123');
  });

  it('calls an async function and returns the result', async () => {
    const fetchKey = jest.fn().mockResolvedValue('temp:fetched-key');
    const key = await resolveApiKey(fetchKey);
    expect(key).toBe('temp:fetched-key');
    expect(fetchKey).toHaveBeenCalledTimes(1);
  });

  it('throws if the static key is empty', async () => {
    await expect(resolveApiKey('')).rejects.toThrow('api_key must be a non-empty string');
  });

  it('throws if the function returns an empty string', async () => {
    const fetchKey = jest.fn().mockResolvedValue('');
    await expect(resolveApiKey(fetchKey)).rejects.toThrow('api_key function must return a non-empty string');
  });

  it('propagates errors thrown by the async function', async () => {
    const fetchKey = jest.fn().mockRejectedValue(new Error('Network error'));
    await expect(resolveApiKey(fetchKey)).rejects.toThrow('Network error');
  });
});
