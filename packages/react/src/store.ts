/**
 * RecordingStore — external mutable store consumed by `useSyncExternalStore`
 *
 * It listens to events from a `Recording` instance, accumulates transcript
 * data, and notifies React when the snapshot changes.
 */

import { RealtimeUtteranceBuffer } from '@soniox/client';
import type {
  Recording,
  RecordingState,
  RealtimeResult,
  RealtimeSegment,
  RealtimeToken,
  RealtimeUtterance,
} from '@soniox/client';

/**
 * A group of tokens split by a grouping key (translation status, language, speaker, etc.).
 *
 * Populated on `RecordingSnapshot.groups` when a `groupBy` strategy or
 * `translation` config is provided to `useRecording`.
 *
 * Text fields accumulate for the lifetime of the recording.
 * `partialTokens` contains only the current non-final tokens for this group
 * (replaced on every result — always small).
 */
export interface TokenGroup {
  /** Full text: `finalText + partialText`. */
  readonly text: string;
  /** Accumulated finalized text in this group. */
  readonly finalText: string;
  /** Text from current non-final tokens in this group. */
  readonly partialText: string;
  /** Current non-final tokens in this group (from the latest result only). */
  readonly partialTokens: readonly RealtimeToken[];
}

/** Function that maps a token to a group key string. */
export type GroupByFn = (token: RealtimeToken) => string;

/**
 * Immutable snapshot of the recording state exposed to React.
 */
export interface RecordingSnapshot {
  /** Current recording lifecycle state. */
  readonly state: RecordingState;
  /** `true` when state is not idle/stopped/canceled/error. */
  readonly isActive: boolean;
  /** `true` when `state === 'recording'`. */
  readonly isRecording: boolean;
  /** Full transcript: `finalText + partialText`. */
  readonly text: string;
  /** Accumulated finalized text. */
  readonly finalText: string;
  /** Text from current non-final tokens. */
  readonly partialText: string;
  /** Accumulated final segments. */
  readonly segments: readonly RealtimeSegment[];
  /** Accumulated utterances (one per endpoint). */
  readonly utterances: readonly RealtimeUtterance[];
  /** Tokens from the latest result message. */
  readonly tokens: readonly RealtimeToken[];
  /** Non-final tokens from the latest result. */
  readonly partialTokens: readonly RealtimeToken[];
  /**
   * Tokens grouped by the active `groupBy` strategy.
   *
   * Auto-populated when `translation` config is provided:
   * - `one_way` → keys: `"original"`, `"translation"`
   * - `two_way` → keys: language codes (e.g. `"en"`, `"es"`)
   *
   * Empty `{}` when no grouping is active.
   */
  readonly groups: Readonly<Record<string, TokenGroup>>;
  /** Latest raw result from the server. */
  readonly result: RealtimeResult | null;
  /** Latest error, if any. */
  readonly error: Error | null;
}

interface MutableGroupState {
  finalText: string;
  partial: RealtimeToken[];
}

const TERMINAL_STATES: ReadonlySet<RecordingState> = new Set(['idle', 'stopped', 'canceled', 'error']);

const EMPTY_TOKENS = Object.freeze([]) as readonly RealtimeToken[];
const EMPTY_GROUPS: Readonly<Record<string, TokenGroup>> = Object.freeze({});

const IDLE_SNAPSHOT: RecordingSnapshot = Object.freeze({
  state: 'idle' as const,
  isActive: false,
  isRecording: false,
  text: '',
  finalText: '',
  partialText: '',
  segments: Object.freeze([]) as readonly RealtimeSegment[],
  utterances: Object.freeze([]) as readonly RealtimeUtterance[],
  tokens: EMPTY_TOKENS,
  partialTokens: EMPTY_TOKENS,
  groups: EMPTY_GROUPS,
  result: null,
  error: null,
});

type Listener = () => void;

export class RecordingStore {
  private listeners = new Set<Listener>();
  private snapshot: RecordingSnapshot = IDLE_SNAPSHOT;

  // Mutable working state — frozen into snapshot on notify().
  private _state: RecordingState = 'idle';
  private _finalText = '';
  private _partialText = '';
  private _segments: RealtimeSegment[] = [];
  private _utterances: RealtimeUtterance[] = [];
  private _tokens: RealtimeToken[] = [];
  private _result: RealtimeResult | null = null;
  private _error: Error | null = null;

  // Partial token tracking (always small — replaced each result).
  private _partialTokens: RealtimeToken[] = [];

  // Token grouping — groups accumulate finalText as a string (O(text length)),
  // and only keep current partial tokens (small, replaced each result).
  private _groupByFn: GroupByFn | null = null;
  private _groupsByKey = new Map<string, MutableGroupState>();

  // Utterance accumulation
  private utteranceBuffer = new RealtimeUtteranceBuffer();
  private _currentUtteranceSegmentCount = 0;

  // Current recording + bound handlers for cleanup
  private recording: Recording | null = null;
  private boundHandlers: BoundHandlers | null = null;

  // Callback dispatch — set externally by the hook to avoid stale closures.
  onResult: ((result: RealtimeResult) => void) | null = null;
  onEndpoint: (() => void) | null = null;
  onError: ((error: Error) => void) | null = null;
  onStateChange: ((update: { old_state: RecordingState; new_state: RecordingState }) => void) | null = null;
  onFinished: (() => void) | null = null;
  onConnected: (() => void) | null = null;

  // ---------------------------------------------------------------------------
  // useSyncExternalStore contract
  // ---------------------------------------------------------------------------

  /** Subscribe to snapshot changes. */
  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  /** Return the current snapshot. */
  getSnapshot = (): RecordingSnapshot => {
    return this.snapshot;
  };

  /** SSR-safe snapshot — always returns idle state. */
  getServerSnapshot = (): RecordingSnapshot => {
    return IDLE_SNAPSHOT;
  };

  // ---------------------------------------------------------------------------
  // Attach / Detach
  // ---------------------------------------------------------------------------

  /**
   * Wire event listeners onto a Recording instance.
   * Detaches from any previously attached recording first.
   */
  attach(recording: Recording): void {
    this.detach();
    this.recording = recording;

    const handlers: BoundHandlers = {
      result: (result: RealtimeResult) => {
        const allTokensText = result.tokens.map((t) => t.text).join('');
        this._partialText = allTokensText;
        this._tokens = result.tokens;
        this._result = result;

        // Replace partial tokens (always small — just the current non-finals).
        const newPartials: RealtimeToken[] = [];
        for (const token of result.tokens) {
          if (!token.is_final) {
            newPartials.push(token);
          }
        }
        this._partialTokens = newPartials;

        // Route tokens to groups if a groupBy function is active.
        if (this._groupByFn !== null) {
          // Clear partial tokens for all existing groups.
          for (const group of this._groupsByKey.values()) {
            group.partial = [];
          }
          for (const token of result.tokens) {
            const key = this._groupByFn(token);
            let group = this._groupsByKey.get(key);
            if (group === undefined) {
              group = { finalText: '', partial: [] };
              this._groupsByKey.set(key, group);
            }
            if (token.is_final) {
              // Accumulate text only — no token objects stored for finals.
              group.finalText += token.text;
            } else {
              group.partial.push(token);
            }
          }
        }

        // Feed the utterance buffer for segment/utterance accumulation.
        const stableSegments = this.utteranceBuffer.addResult(result);
        if (stableSegments.length > 0) {
          this._segments = [...this._segments, ...stableSegments];
          this._currentUtteranceSegmentCount += stableSegments.length;
        }

        this.notify();
        this.onResult?.(result);
      },

      endpoint: () => {
        const utterance = this.utteranceBuffer.markEndpoint();
        if (utterance !== undefined) {
          this._utterances = [...this._utterances, utterance];
          this._finalText += utterance.text;
          // Append trailing segments from this utterance that weren't already
          // flushed as stable during result events.  The per-utterance counter
          // tracks how many of this utterance's segments are already in _segments.
          const trailingSegments = utterance.segments.slice(this._currentUtteranceSegmentCount);
          if (trailingSegments.length > 0) {
            this._segments = [...this._segments, ...trailingSegments];
          }
        }
        this._currentUtteranceSegmentCount = 0;
        this._partialText = '';
        this._partialTokens = [];

        // Move any remaining partial tokens' text to finalText in groups
        // (defensive: the server normally finalizes before endpoint).
        for (const group of this._groupsByKey.values()) {
          if (group.partial.length > 0) {
            group.finalText += group.partial.map((t) => t.text).join('');
            group.partial = [];
          }
        }

        this.notify();
        this.onEndpoint?.();
      },

      finished: () => {
        // Flush any remaining partial text into final.
        if (this._partialText.trim()) {
          this._finalText += this._partialText;
        }
        this._partialText = '';
        this._partialTokens = [];

        // Move remaining partial tokens' text to finalText in groups.
        for (const group of this._groupsByKey.values()) {
          if (group.partial.length > 0) {
            group.finalText += group.partial.map((t) => t.text).join('');
            group.partial = [];
          }
        }

        this.notify();
        this.onFinished?.();
      },

      error: (error: Error) => {
        this._error = error;
        this.notify();
        this.onError?.(error);
      },

      state_change: (update: { old_state: RecordingState; new_state: RecordingState }) => {
        this._state = update.new_state;
        this.notify();
        this.onStateChange?.(update);
      },

      connected: () => {
        this.onConnected?.();
      },
    };

    recording.on('result', handlers.result);
    recording.on('endpoint', handlers.endpoint);
    recording.on('finished', handlers.finished);
    recording.on('error', handlers.error);
    recording.on('state_change', handlers.state_change);
    recording.on('connected', handlers.connected);

    this.boundHandlers = handlers;
  }

  /** Remove all event listeners from the current recording. */
  detach(): void {
    if (this.recording !== null && this.boundHandlers !== null) {
      const r = this.recording;
      const h = this.boundHandlers;
      r.off('result', h.result);
      r.off('endpoint', h.endpoint);
      r.off('finished', h.finished);
      r.off('error', h.error);
      r.off('state_change', h.state_change);
      r.off('connected', h.connected);
    }
    this.recording = null;
    this.boundHandlers = null;
  }

  // ---------------------------------------------------------------------------
  // Grouping
  // ---------------------------------------------------------------------------

  /**
   * Configure the token grouping strategy.
   * Called from the hook before attaching a new recording.
   */
  setGroupBy(groupByFn: GroupByFn | null): void {
    this._groupByFn = groupByFn;
    this._groupsByKey.clear();
  }

  // ---------------------------------------------------------------------------
  // Reset / Clear
  // ---------------------------------------------------------------------------

  /** Reset all state to defaults (called before a new recording starts). */
  reset(): void {
    this._state = 'idle';
    this._finalText = '';
    this._partialText = '';
    this._segments = [];
    this._utterances = [];
    this._tokens = [];
    this._partialTokens = [];
    this._groupsByKey.clear();
    this._result = null;
    this._error = null;
    this._currentUtteranceSegmentCount = 0;
    this.utteranceBuffer = new RealtimeUtteranceBuffer();
    this.notify();
  }

  /** Clear transcript fields only, keeping state and error. */
  clearTranscript(): void {
    this._finalText = '';
    this._partialText = '';
    this._segments = [];
    this._utterances = [];
    this._tokens = [];
    this._partialTokens = [];
    this._groupsByKey.clear();
    this._result = null;
    this._currentUtteranceSegmentCount = 0;
    this.utteranceBuffer = new RealtimeUtteranceBuffer();
    this.notify();
  }

  // ---------------------------------------------------------------------------
  // Internal
  // ---------------------------------------------------------------------------

  private notify(): void {
    const isActive = !TERMINAL_STATES.has(this._state);

    // Build frozen groups from mutable group buckets.
    let groups: Readonly<Record<string, TokenGroup>>;
    if (this._groupsByKey.size === 0) {
      groups = EMPTY_GROUPS;
    } else {
      const built: Record<string, TokenGroup> = {};
      for (const [key, { finalText, partial }] of this._groupsByKey) {
        const partialText = partial.map((t) => t.text).join('');
        built[key] = Object.freeze({
          text: finalText + partialText,
          finalText,
          partialText,
          partialTokens: Object.freeze([...partial]),
        });
      }
      groups = Object.freeze(built);
    }

    const next: RecordingSnapshot = Object.freeze({
      state: this._state,
      isActive,
      isRecording: this._state === 'recording',
      text: this._finalText + this._partialText,
      finalText: this._finalText,
      partialText: this._partialText,
      segments: Object.freeze([...this._segments]),
      utterances: Object.freeze([...this._utterances]),
      tokens: Object.freeze([...this._tokens]),
      partialTokens: Object.freeze([...this._partialTokens]),
      groups,
      result: this._result,
      error: this._error,
    });

    this.snapshot = next;

    for (const listener of this.listeners) {
      listener();
    }
  }
}

interface BoundHandlers {
  result: (result: RealtimeResult) => void;
  endpoint: () => void;
  finished: () => void;
  error: (error: Error) => void;
  state_change: (update: { old_state: RecordingState; new_state: RecordingState }) => void;
  connected: () => void;
}
