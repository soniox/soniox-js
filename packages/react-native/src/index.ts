export interface SonioxReactNativeOptions {}

export class SonioxReactNativeClient {
  private readonly options: SonioxReactNativeOptions;

  constructor(options: SonioxReactNativeOptions = {}) {
    this.options = options;
  }

  initialize(): SonioxReactNativeOptions {
    return this.options;
  }
}
