import { SonioxNodeClient } from '@soniox/node';

describe('Express example setup', () => {
  it('should import SonioxNodeClient from @soniox/node', () => {
    expect(SonioxNodeClient).toBeDefined();
  });
});
