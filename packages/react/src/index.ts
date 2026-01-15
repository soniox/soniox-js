export interface SonioxReactOptions {}

export class SonioxReactClient {
  private readonly options: SonioxReactOptions;

  constructor(options: SonioxReactOptions = {}) {
    this.options = options;
  }

  initialize(): SonioxReactOptions {
    return this.options;
  }
}
