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
  ReconnectingEvent,
  ResolvedConnectionConfig,
  ConfigContext,
  StateChangeReason,
  SttSessionConfig,
  SttSessionOptions,
  AudioSource,
  ApiKeyConfig,
  SonioxClientOptions,
  SonioxConnectionConfig,
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
 * - **With Provider:** omit `config`/`apiKey` — the client is read from context.
 * - **Without Provider:** pass `config` (or legacy `apiKey`) — a client is created internally.
 */
export interface UseRecordingConfig extends SttSessionConfig {
  /**
   * Connection configuration — sync object or async function.
   * Required when not using `<SonioxProvider>`.
   */
  config?: SonioxConnectionConfig | ((context?: ConfigContext) => Promise<SonioxConnectionConfig>) | undefined;

  /**
   * API key — string or async function that fetches a temporary key.
   * Required when not using `<SonioxProvider>`.
   * @deprecated Use `config` instead.
   */
  apiKey?: ApiKeyConfig | undefined;

  /**
   * WebSocket URL override (only used when `apiKey` is provided).
   * @deprecated Use `config.stt_ws_url` or `config.region` instead.
   */
  wsBaseUrl?: string | undefined;

  /**
   * Permission resolver override (only used when creating an inline client).
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

  /**
   * Function that receives the resolved connection config (including
   * `stt_defaults` from the server) and returns session config overrides.
   *
   * When provided, its return value is used as the session config for the
   * recording, and any flat session config fields on this object are ignored.
   *
   * @example
   * ```tsx
   * const { start } = useRecording({
   *   config: asyncConfigFn,
   *   sessionConfig: (resolved) => ({
   *     ...resolved.stt_defaults,
   *     enable_endpoint_detection: true,
   *   }),
   * });
   * ```
   */
  sessionConfig?: ((resolved: ResolvedConnectionConfig) => SttSessionConfig) | undefined;

  // -- Reconnection -----------------------------------------------------------

  /**
   * Enable automatic reconnection on retriable errors.
   * @default false
   */
  auto_reconnect?: boolean | undefined;

  /**
   * Maximum consecutive reconnection attempts before giving up.
   * @default 3
   */
  max_reconnect_attempts?: number | undefined;

  /**
   * Base delay in milliseconds for exponential backoff.
   * @default 1000
   */
  reconnect_base_delay_ms?: number | undefined;

  /**
   * Clear accumulated transcript state on reconnect.
   * Window-tracking state is always reset regardless.
   * @default false
   */
  reset_transcript_on_reconnect?: boolean | undefined;

  // -- Event callbacks (dispatched via refs, never stale) ---------------------

  /** Called on each result from the server. */
  onResult?: ((result: RealtimeResult) => void) | undefined;

  /** Called when an endpoint is detected. */
  onEndpoint?: (() => void) | undefined;

  /** Called for each token received from the server (both final and non-final). */
  onToken?: ((token: RealtimeToken) => void) | undefined;

  /**
   * Called when the server acknowledges a finalize request
   * (see {@link UseRecordingReturn.finalize}).
   */
  onFinalized?: (() => void) | undefined;

  /** Called when an error occurs. */
  onError?: ((error: Error) => void) | undefined;

  /** Called on each state transition. */
  onStateChange?:
    | ((update: { old_state: RecordingState; new_state: RecordingState; reason?: StateChangeReason }) => void)
    | undefined;

  /** Called when the recording session finishes. */
  onFinished?: (() => void) | undefined;

  /** Called when the WebSocket connects. */
  onConnected?: (() => void) | undefined;

  /** Called when the audio source is muted externally (e.g. OS-level or hardware mute). */
  onSourceMuted?: (() => void) | undefined;

  /** Called when the audio source is unmuted after an external mute. */
  onSourceUnmuted?: (() => void) | undefined;

  /** Called before a reconnection attempt. Call `preventDefault()` to cancel. */
  onReconnecting?: ((event: ReconnectingEvent) => void) | undefined;

  /** Called after a successful reconnection. */
  onReconnected?: ((event: { attempt: number }) => void) | undefined;
}

export interface UseRecordingReturn extends RecordingSnapshot {
  /** Start a new recording. Aborts any in-flight recording first. */
  start: () => void;
  /** Gracefully stop — waits for final results from the server. */
  stop: () => Promise<void>;
  /** Immediately cancel — does not wait for final results. */
  cancel: () => void;
  /** Pause recording — pauses audio capture and activates keepalive. */
  pause: () => void;
  /** Resume recording after pause. */
  resume: () => void;
  /** Request the server to finalize current non-final tokens. */
  finalize: (options?: { trailing_silence_ms?: number }) => void;
  /** Clear transcript state (finalText, partialText, utterances, segments). */
  clearTranscript: () => void;
  /**
   * Force a reconnection — tears down the current session and audio
   * encoder, then establishes a new session. Requires `auto_reconnect`.
   *
   * Call this from platform lifecycle handlers (e.g. web
   * `visibilitychange`, React Native `AppState`) to recover from
   * stale connections after sleep/wake or backgrounding.
   */
  reconnect: () => void;
  /** @internal Debug-only: force-close the WebSocket to simulate a disconnect. */
  __debugForceDisconnect: () => void;
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
  /** `true` when the WebSocket is reconnecting after a drop. */
  isReconnecting: boolean;
  /** Current reconnection attempt number (0 when not reconnecting). */
  reconnectAttempt: number;
}

export function useRecording(config: UseRecordingConfig): UseRecordingReturn {
  // Resolve client: inline config takes priority over context (Provider).
  // This allows callers to use a different config (e.g., different credentials
  // or endpoints) even when a SonioxProvider is present.
  const contextClient = useContext(SonioxContext);
  const inlineClientRef = useRef<SonioxClient | undefined>(undefined);
  const initialInlineConfigRef = useRef<{ config: unknown; apiKey: unknown; wsBaseUrl: unknown } | undefined>(
    undefined
  );

  const hasInlineConfig = config.config !== undefined || config.apiKey !== undefined;

  if (hasInlineConfig && inlineClientRef.current === undefined) {
    const opts: SonioxClientOptions = {};
    if (config.config !== undefined) {
      opts.config = config.config;
    } else if (config.apiKey !== undefined) {
      opts.api_key = config.apiKey;
      if (config.wsBaseUrl !== undefined) {
        opts.ws_base_url = config.wsBaseUrl;
      }
    }
    if (config.permissions === null) {
      // Explicitly disabled — leave undefined.
    } else if (config.permissions !== undefined) {
      opts.permissions = config.permissions;
    } else if (isBrowserEnvironment()) {
      opts.permissions = new BrowserPermissionResolver();
    }
    inlineClientRef.current = new SonioxClient(opts);
    initialInlineConfigRef.current = { config: config.config, apiKey: config.apiKey, wsBaseUrl: config.wsBaseUrl };
  }

  // Dev-mode: warn if inline connection config changes after the client was created.
  if (
    process.env.NODE_ENV !== 'production' &&
    inlineClientRef.current !== undefined &&
    initialInlineConfigRef.current !== undefined
  ) {
    const init = initialInlineConfigRef.current;
    if (init.config !== config.config || init.apiKey !== config.apiKey || init.wsBaseUrl !== config.wsBaseUrl) {
      // eslint-disable-next-line no-console
      console.warn(
        '[@soniox/react] useRecording connection config (config, apiKey, wsBaseUrl) changed after mount. ' +
          'The client is created once and will not be recreated. ' +
          'Use an async config function for dynamic credentials, or remount the component with a React key.'
      );
    }
  }

  const client = hasInlineConfig ? inlineClientRef.current : contextClient;
  if (client === undefined || client === null) {
    throw new Error(
      'useRecording requires either a <SonioxProvider> ancestor or a `config` prop. ' +
        'Pass config directly: useRecording({ config, model }) or wrap your tree in <SonioxProvider>.'
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
  store.onToken = config.onToken ?? null;
  store.onFinalized = config.onFinalized ?? null;
  store.onError = config.onError ?? null;
  store.onStateChange = config.onStateChange ?? null;
  store.onFinished = config.onFinished ?? null;
  store.onConnected = config.onConnected ?? null;
  store.onSourceMuted = config.onSourceMuted ?? null;
  store.onSourceUnmuted = config.onSourceUnmuted ?? null;
  store.onReconnecting = config.onReconnecting ?? null;
  store.onReconnected = config.onReconnected ?? null;

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
      config: _config,
      apiKey: _apiKey,
      wsBaseUrl: _wsBaseUrl,
      permissions: _permissions,
      source,
      session_options,
      buffer_queue_size,
      resetOnStart: _resetOnStart,
      groupBy: _groupBy,
      sessionConfig,
      auto_reconnect,
      max_reconnect_attempts,
      reconnect_base_delay_ms,
      reset_transcript_on_reconnect,
      onResult: _onResult,
      onEndpoint: _onEndpoint,
      onToken: _onToken,
      onFinalized: _onFinalized,
      onError: _onError,
      onStateChange: _onStateChange,
      onFinished: _onFinished,
      onConnected: _onConnected,
      onSourceMuted: _onSourceMuted,
      onSourceUnmuted: _onSourceUnmuted,
      onReconnecting: _onReconnecting,
      onReconnected: _onReconnected,
      ...sttConfig
    } = cfg;

    // Configure token grouping strategy.
    store.setGroupBy(resolveGroupByFn(_groupBy, sttConfig.translation));

    const recording = client.realtime.record({
      ...sttConfig,
      ...(source !== undefined ? { source } : {}),
      ...(session_options !== undefined ? { session_options } : {}),
      ...(buffer_queue_size !== undefined ? { buffer_queue_size } : {}),
      ...(sessionConfig !== undefined ? { session_config: sessionConfig } : {}),
      ...(auto_reconnect !== undefined ? { auto_reconnect } : {}),
      ...(max_reconnect_attempts !== undefined ? { max_reconnect_attempts } : {}),
      ...(reconnect_base_delay_ms !== undefined ? { reconnect_base_delay_ms } : {}),
      ...(reset_transcript_on_reconnect !== undefined ? { reset_transcript_on_reconnect } : {}),
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

  const pause = useCallback((): void => {
    recordingRef.current?.pause();
  }, []);

  const resume = useCallback((): void => {
    recordingRef.current?.resume();
  }, []);

  const finalize = useCallback((options?: { trailing_silence_ms?: number }): void => {
    recordingRef.current?.finalize(options);
  }, []);

  const clearTranscript = useCallback((): void => {
    store.clearTranscript();
  }, [store]);

  const reconnect = useCallback((): void => {
    recordingRef.current?.reconnect();
  }, []);

  const __debugForceDisconnect = useCallback((): void => {
    recordingRef.current?.__debugForceDisconnect();
  }, []);

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
    finalTokens: snapshot.finalTokens,
    groups: snapshot.groups,
    result: snapshot.result,
    error: snapshot.error,
    isPaused: snapshot.isPaused,
    isSourceMuted: snapshot.isSourceMuted,
    isReconnecting: snapshot.isReconnecting,
    reconnectAttempt: snapshot.reconnectAttempt,

    // Actions
    start,
    stop,
    cancel,
    pause,
    resume,
    finalize,
    clearTranscript,
    reconnect,

    // Debug
    __debugForceDisconnect,

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
