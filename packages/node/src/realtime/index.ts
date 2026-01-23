import { SonioxRealtimeSession } from "./session";

export class SonioxRealtimeAPI {
    constructor() {}

    createSession() {
        return new SonioxRealtimeSession();
    }
}