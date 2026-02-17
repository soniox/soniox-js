/**
 * useRecording — main React hook for real-time speech-to-text.
 *
 * Wraps the @soniox/client Recording lifecycle with:
 * - useSyncExternalStore for render-safe subscriptions
 * - AbortSignal for safe cleanup (Strict Mode, unmount, double-start)
 * - Callback refs to prevent stale closures
 */

import { SonioxClient, BrowserPermissionResolver } from '@soniox/client';
import type {
  Recording,
  RecordingState,
  RealtimeResult,
  RealtimeToken,
  SttSessionConfig,
  SttSessionOptions,
  AudioSource,
  ApiKeyConfig,
  SonioxClientOptions,
  PermissionResolver,
  TranslationConfig,
} from '@soniox/client';
import { useCallback, useContext, useEffect, useRef, useSyncExternalStore } from 'react';

import { SonioxContext } from './context.js';
import { RecordingStore } from './store.js';
import type { GroupByFn, RecordingSnapshot } from './store.js';
import { checkAudioSupport, isBrowserEnvironment } from './support.js';
import type { UnsupportedReason } from './support.js';

/**
 * Configuration for useRecording.
 *
 * Extends the STT session config (model, language_hints, etc.) with
 * recording-specific and React-specific options.
 *
 * Can be used **with or without** a `<SonioxProvider>`:
 * - **With Provider:** omit `apiKey` — the client is read from context.
 * - **Without Provider:** pass `apiKey` directly — a client is created internally.
 */
export interface UseRecordingConfig extends SttSessionConfig {
  /**
   * API key — string or async function that fetches a temporary key.
   * Required when not using `<SonioxProvider>`.
   */
  apiKey?: ApiKeyConfig | undefined;

  /** WebSocket URL override (only used when `apiKey` is provided). */
  wsBaseUrl?: string | undefined;

  /**
   * Permission resolver override (only used when `apiKey` is provided).
   * Pass `null` to explicitly disable.
   */
  permissions?: PermissionResolver | null | undefined;

  /** Custom audio source (bypasses default MicrophoneSource). */
  source?: AudioSource | undefined;

  /** SDK-level session options (signal, etc.). */
  session_options?: SttSessionOptions | undefined;

  /** Maximum audio chunks to buffer during connection setup. */
  buffer_queue_size?: number | undefined;

  /**
   * Reset transcript state when `start()` is called.
   * @default true
   */
  resetOnStart?: boolean | undefined;

  /**
   * Group tokens by a key for easy splitting (e.g. translation, language, speaker).
   *
   * - `'translation'` — group by `translation_status`: keys `"original"` and `"translation"`
   * - `'language'` — group by token `language` field: keys are language codes
   * - `'speaker'` — group by token `speaker` field: keys are speaker identifiers
   * - `(token) => string` — custom grouping function
   *
   * **Auto-defaults** when `translation` config is provided:
   * - `one_way` → `'translation'`
   * - `two_way` → `'language'`
   */
  groupBy?: 'translation' | 'language' | 'speaker' | ((token: RealtimeToken) => string) | undefined;

  // -- Event callbacks (dispatched via refs, never stale) ---------------------

  /** Called on each result from the server. */
  onResult?: ((result: RealtimeResult) => void) | undefined;

  /** Called when an endpoint is detected. */
  onEndpoint?: (() => void) | undefined;

  /** Called when an error occurs. */
  onError?: ((error: Error) => void) | undefined;

  /** Called on each state transition. */
  onStateChange?: ((update: { old_state: RecordingState; new_state: RecordingState }) => void) | undefined;

  /** Called when the recording session finishes. */
  onFinished?: (() => void) | undefined;

  /** Called when the WebSocket connects. */
  onConnected?: (() => void) | undefined;
}

export interface UseRecordingReturn extends RecordingSnapshot {
  /** Start a new recording. Aborts any in-flight recording first. */
  start: () => void;
  /** Gracefully stop — waits for final results from the server. */
  stop: () => Promise<void>;
  /** Immediately cancel — does not wait for final results. */
  cancel: () => void;
  /** Request the server to finalize current non-final tokens. */
  finalize: (options?: { trailing_silence_ms?: number }) => void;
  /** Clear transcript state (finalText, partialText, utterances, segments). */
  clearTranscript: () => void;
  /**
   * Whether the built-in browser `MicrophoneSource` is available.
   * Custom `AudioSource` implementations work regardless of this value.
   */
  isSupported: boolean;
  /**
   * Why the built-in `MicrophoneSource` is unavailable, if applicable.
   * Custom `AudioSource` implementations bypass this check entirely.
   */
  unsupportedReason: UnsupportedReason | undefined;
}

export function useRecording(config: UseRecordingConfig): UseRecordingReturn {
  // Resolve client: prefer context (Provider), fall back to inline config.
  const contextClient = useContext(SonioxContext);
  const inlineClientRef = useRef<SonioxClient | undefined>(undefined);
  const initialInlineConfigRef = useRef<{ apiKey: unknown; wsBaseUrl: unknown } | undefined>(undefined);

  if (contextClient === null && config.apiKey !== undefined && inlineClientRef.current === undefined) {
    const opts: SonioxClientOptions = { api_key: config.apiKey };
    if (config.wsBaseUrl !== undefined) {
      opts.ws_base_url = config.wsBaseUrl;
    }
    if (config.permissions === null) {
      // Explicitly disabled — leave undefined.
    } else if (config.permissions !== undefined) {
      opts.permissions = config.permissions;
    } else if (isBrowserEnvironment()) {
      opts.permissions = new BrowserPermissionResolver();
    }
    inlineClientRef.current = new SonioxClient(opts);
    initialInlineConfigRef.current = { apiKey: config.apiKey, wsBaseUrl: config.wsBaseUrl };
  }

  // Dev-mode: warn if inline connection config changes after the client was created.
  if (
    process.env.NODE_ENV !== 'production' &&
    inlineClientRef.current !== undefined &&
    initialInlineConfigRef.current !== undefined
  ) {
    const init = initialInlineConfigRef.current;
    if (init.apiKey !== config.apiKey || init.wsBaseUrl !== config.wsBaseUrl) {
      // eslint-disable-next-line no-console
      console.warn(
        '[@soniox/react] useRecording connection config (apiKey, wsBaseUrl) changed after mount. ' +
          'The client is created once and will not be recreated. ' +
          'Use an async apiKey function for dynamic credentials, or remount the component with a React key.'
      );
    }
  }

  const client = contextClient ?? inlineClientRef.current;
  if (client === undefined) {
    throw new Error(
      'useRecording requires either a <SonioxProvider> ancestor or an `apiKey` prop. ' +
        'Pass apiKey directly: useRecording({ apiKey, model }) or wrap your tree in <SonioxProvider>.'
    );
  }

  // One store per hook instance — created once.
  const storeRef = useRef<RecordingStore>(undefined);
  if (storeRef.current === undefined) {
    storeRef.current = new RecordingStore();
  }
  const store = storeRef.current;

  // Abort controller for lifecycle safety.
  const abortRef = useRef<AbortController | null>(null);

  // Current recording ref for stop/finalize calls.
  const recordingRef = useRef<Recording | null>(null);

  // Callback refs — updated every render, read from event handlers.
  const configRef = useRef(config);
  configRef.current = config;

  // Sync callback refs into store every render.
  store.onResult = config.onResult ?? null;
  store.onEndpoint = config.onEndpoint ?? null;
  store.onError = config.onError ?? null;
  store.onStateChange = config.onStateChange ?? null;
  store.onFinished = config.onFinished ?? null;
  store.onConnected = config.onConnected ?? null;

  // Platform support (computed once).
  const supportRef = useRef<{ isSupported: boolean; reason: UnsupportedReason | undefined }>(undefined);
  if (supportRef.current === undefined) {
    const result = checkAudioSupport();
    supportRef.current = { isSupported: result.isSupported, reason: result.reason };
  }

  // Subscribe to the store via useSyncExternalStore.
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);

  // -------------------------------------------------------------------------
  // Actions (stable references)
  // -------------------------------------------------------------------------

  const start = useCallback((): void => {
    const cfg = configRef.current;

    // Abort any in-flight recording (handles Strict Mode, double-clicks, etc.).
    abortRef.current?.abort();

    // Reset transcript if configured (default: true).
    if (cfg.resetOnStart !== false) {
      store.reset();
    }

    // Create new abort controller.
    const controller = new AbortController();
    abortRef.current = controller;

    // Extract hook-only props from config; pass the rest as SttSessionConfig.
    const {
      apiKey: _apiKey,
      wsBaseUrl: _wsBaseUrl,
      permissions: _permissions,
      source,
      session_options,
      buffer_queue_size,
      resetOnStart: _resetOnStart,
      groupBy: _groupBy,
      onResult: _onResult,
      onEndpoint: _onEndpoint,
      onError: _onError,
      onStateChange: _onStateChange,
      onFinished: _onFinished,
      onConnected: _onConnected,
      ...sttConfig
    } = cfg;

    // Configure token grouping strategy.
    store.setGroupBy(resolveGroupByFn(_groupBy, sttConfig.translation));

    const recording = client.realtime.record({
      ...sttConfig,
      ...(source !== undefined ? { source } : {}),
      ...(session_options !== undefined ? { session_options } : {}),
      ...(buffer_queue_size !== undefined ? { buffer_queue_size } : {}),
      signal: controller.signal,
    });

    recordingRef.current = recording;
    store.attach(recording);
  }, [client, store]);

  const stop = useCallback(async (): Promise<void> => {
    const recording = recordingRef.current;
    if (recording === null) {
      return;
    }
    await recording.stop();
  }, []);

  const cancel = useCallback((): void => {
    // Cancel the recording first (synchronous, transitions to 'canceled'),
    // then abort the signal (prevents the session's abort handler from
    // overwriting the state to 'error' via Recording.handleError).
    recordingRef.current?.cancel();
    abortRef.current?.abort();
  }, []);

  const finalize = useCallback((options?: { trailing_silence_ms?: number }): void => {
    recordingRef.current?.finalize(options);
  }, []);

  const clearTranscript = useCallback((): void => {
    store.clearTranscript();
  }, [store]);

  // Cleanup on unmount.
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      store.detach();
    };
  }, [store]);

  // -------------------------------------------------------------------------
  // Return
  // -------------------------------------------------------------------------

  return {
    // Snapshot fields
    state: snapshot.state,
    isActive: snapshot.isActive,
    isRecording: snapshot.isRecording,
    text: snapshot.text,
    finalText: snapshot.finalText,
    partialText: snapshot.partialText,
    segments: snapshot.segments,
    utterances: snapshot.utterances,
    tokens: snapshot.tokens,
    partialTokens: snapshot.partialTokens,
    groups: snapshot.groups,
    result: snapshot.result,
    error: snapshot.error,

    // Actions
    start,
    stop,
    cancel,
    finalize,
    clearTranscript,

    // Platform support
    isSupported: supportRef.current.isSupported,
    unsupportedReason: supportRef.current.reason,
  };
}

/**
 * Resolve the groupBy config + translation config into a concrete GroupByFn.
 */
function resolveGroupByFn(
  groupBy: UseRecordingConfig['groupBy'],
  translation: TranslationConfig | undefined
): GroupByFn | null {
  // Explicit groupBy takes priority.
  if (typeof groupBy === 'function') {
    return groupBy;
  }

  // Resolve named strategies (explicit or auto-defaulted from translation).
  const strategy = groupBy ?? (translation?.type === 'two_way' ? 'language' : translation ? 'translation' : undefined);

  switch (strategy) {
    case 'translation':
      return (token) => (token.translation_status === 'translation' ? 'translation' : 'original');
    case 'language':
      return (token) => token.language ?? 'unknown';
    case 'speaker':
      return (token) => token.speaker ?? 'unknown';
    default:
      return null;
  }
}
