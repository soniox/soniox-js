export interface SonioxNodeOptions {}

export class SonioxNodeClient {
  private readonly options: SonioxNodeOptions;

  constructor(options: SonioxNodeOptions = {}) {
    this.options = options;
  }

  initialize(): SonioxNodeOptions {
    return this.options;
  }
}
