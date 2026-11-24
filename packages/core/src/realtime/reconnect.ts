/**
 * The stream reconnect protocol: what a dropped stream needs to come back.
 *
 * A realtime STT stream that loses its connection carries on on a new one. The
 * server names the terms - how long a stream waits to be continued, which
 * messages it counts - and this module holds our side of them: the constants taken from the protocol, and the bookkeeping that
 * says what to send again.
 *
 * No I/O here. The session owns the socket; this only remembers. It is the
 * twin of `_reconnect.py` in the Python SDK, and the two are meant to behave
 * identically.
 */

/** How often to ping, and how late a pong may be before the connection is lost. */
export const PING_INTERVAL_MS = 2000;

/**
 * How long to wait for an answer to the reconnect request.
 *
 * A quarter of the window, at the default idle timeout, which is the pace the
 * documentation asks of an attempt.
 */
export const RECONNECT_REPLY_TIMEOUT_MS = 5000;

/**
 * How many times a stream may be continued with nothing coming back.
 *
 * A connection that answers and then dies before the resend reaches it leaves
 * this session with a new token and a fresh window, so nothing in the protocol
 * would ever stop it trying again. So this one is ours: a stream continued
 * over and over with no response in between is not coming back.
 *
 * Each turn of that loop costs a connection and a round trip, and a stream
 * that is working answers something - a result, or a pong every couple of
 * seconds - between one drop and the next. Five consecutive silent takeovers
 * is already far past any real run of drops, and stops a runaway in well
 * under a second.
 */
export const MAX_RESUMES_WITHOUT_A_FRAME = 5;

/** How long closing may spend taking a stream over just to end it. */
export const CLOSE_DIAL_TIMEOUT_MS = 1000;

/** Smallest window one attempt gets, and the smallest wait inside it. */
export const MIN_RECONNECT_ATTEMPT_MS = 1000;
export const MIN_RECONNECT_WAIT_MS = 100;

/** The wait between attempts, which doubles up to the cap. */
export const RECONNECT_BACKOFF_MS = 250;
export const MAX_RECONNECT_BACKOFF_MS = 2000;

/** One message the server counts, kept until a pong confirms it. */
interface Counted {
  count: number;
  data: string | Uint8Array;
}

/**
 * What a stream has to remember to continue on a new connection.
 *
 * Bookkeeping only. The server counts the messages it received, so every
 * message that counts - audio, keepalive, finalize, agent text, end of audio -
 * goes through `record`, and none of the others do.
 *
 * A pong says the server received everything sent before its ping, so that is
 * when messages are dropped from the resend log. Pinging is what keeps the log
 * small; without it, it would have to hold every message of the window.
 */
export class Reconnect {
  /** The newest token the server gave, which the next attempt presents. */
  token: string | null = null;

  /** Where to continue the stream, as the server gave it. */
  url: string | null = null;

  /** The highest response number delivered, so a replay can be dropped. */
  lastSeq = 0;

  /**
   * When the server last proved it had our messages.
   *
   * The stream's reconnect window runs from the last message the server
   * received, and on a silent drop that is before we noticed, so this is where
   * the window is counted from rather than from the drop.
   */
  ackedAt = Date.now();

  /**
   * Whether anything has arrived from the server on this stream yet.
   *
   * A ping sent right after the start request is answered only once the stream
   * starts, so until then an unanswered ping says nothing about the connection
   * - and counting it kills streams that are slow to open.
   */
  streamStarted = false;

  /** Takeovers since the server last sent anything on this stream. */
  resumesWithoutAFrame = 0;

  private count = 0;
  private unconfirmed: Counted[] = [];
  private pings = new Map<number, { count: number; at: number }>();
  private nextPingId = 1;

  /** Keep a message that counts, before it goes out. */
  record(data: string | Uint8Array): void {
    this.count += 1;
    this.unconfirmed.push({ count: this.count, data });
  }

  /** The next ping, which the server answers with a pong carrying its id. */
  ping(): string {
    const id = this.nextPingId;
    this.nextPingId += 1;
    this.pings.set(id, { count: this.count, at: Date.now() });
    return JSON.stringify({ type: 'ping', id });
  }

  /** Drop the messages the server had already received when it sent this pong. */
  pong(id: number | undefined): void {
    // Any pong proves the server was alive just now, whichever ping it answers
    this.ackedAt = Date.now();
    if (id === undefined) {
      return;
    }
    const sent = this.pings.get(id);
    if (sent === undefined) {
      return;
    }
    this.pings.delete(id);
    this.unconfirmed = this.unconfirmed.filter((message) => message.count > sent.count);
  }

  /** Whether a ping has gone unanswered long enough to call the connection lost. */
  pongOverdue(timeoutMs: number): boolean {
    if (!this.streamStarted) {
      return false; // Nothing is answered before the stream starts.
    }
    const now = Date.now();
    for (const ping of this.pings.values()) {
      if (now - ping.at > timeoutMs) {
        return true;
      }
    }
    return false;
  }

  /** Forget the pings sent so far, so the wait for a pong starts now. */
  clearPings(): void {
    this.pings.clear();
    this.ackedAt = Date.now();
  }

  /**
   * Take the new connection's word for what it has, and say what to send again.
   *
   * The pings of the old connection are gone with it; its pongs would confirm
   * messages against a count this stream no longer keeps.
   */
  resendAfter(lastRequest: number, token: string): Counted[] {
    this.token = token;
    this.resumesWithoutAFrame += 1;
    this.pings.clear();
    this.ackedAt = Date.now();
    this.unconfirmed = this.unconfirmed.filter((message) => message.count > lastRequest);
    return this.unconfirmed;
  }
}
