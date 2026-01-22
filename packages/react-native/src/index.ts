export interface SonioxRNOptions {}

export class SonioxRNClient {
  private readonly options: SonioxRNOptions;

  constructor(options: SonioxRNOptions = {}) {
    this.options = options;
  }

  initialize(): SonioxRNOptions {
    return this.options;
  }
}
