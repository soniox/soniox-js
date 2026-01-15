export interface SonioxWebOptions {}

export class SonioxWebClient {
  private readonly options: SonioxWebOptions;

  constructor(options: SonioxWebOptions = {}) {
    this.options = options;
  }

  initialize(): SonioxWebOptions {
    return this.options;
  }
}
