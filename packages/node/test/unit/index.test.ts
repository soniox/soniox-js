import {SonioxNodeClient} from '../../src/client';

jest.mock('../../src/client');

describe('SonioxClient', () => {

  beforeEach(() => {
    jest.clearAllMocks();
  });


  it('should be defined', () => {
    expect(SonioxNodeClient).toBeDefined();
  });
});