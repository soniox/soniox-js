'use client';

/**
 * useTts — React hook for Text-to-Speech.
 *
 * Supports both WebSocket (realtime streaming) and REST (HTTP) modes.
 */

import { SonioxClient, BrowserPermissionResolver } from '@soniox/client';
import type {
  ConfigContext,
  GenerateSpeechOptions,
  RealtimeTtsStream,
  SonioxClientOptions,
  SonioxConnectionConfig,
  TtsStreamInput,
} from '@soniox/client';
import { useCallback, useContext, useEffect, useRef, useSyncExternalStore } from 'react';

import { SonioxContext } from './context.js';
import { isBrowserEnvironment } from './support.js';
import { TtsStore } from './tts-store.js';
import type { TtsSnapshot, TtsState } from './tts-store.js';

/**
 * Configuration for useTts.
 *
 * Extends {@link TtsStreamInput} — flat TTS fields (model, voice, language,
 * audio_format) are merged on top of server-provided `tts_defaults`.
 *
 * Can be used **with or without** a `<SonioxProvider>`:
 * - **With Provider:** omit `config` — the client is read from context.
 * - **Without Provider:** pass `config` — a client is created internally.
 *
 * In `'rest'` mode, `voice` is required — the REST TTS endpoint
 * (`GenerateSpeechOptions.voice`) has no default. Discover available voices
 * via `client.tts.listModels()`.
 */
export interface UseTtsConfig extends TtsStreamInput {
  /**
   * Connection configuration — sync object or async function.
   * Required when not using `<SonioxProvider>`.
   */
  config?: SonioxConnectionConfig | ((context?: ConfigContext) => Promise<SonioxConnectionConfig>) | undefined;

  /**
   * Transport mode for TTS generation.
   * - `'websocket'` (default): Real-time streaming via WebSocket. Supports
   *   incremental text input (`sendText`/`finish`) and streaming from LLM.
   * - `'rest'`: HTTP request/response via the TTS REST endpoint. Sends full
   *   text at once, streams audio back. Simpler but no incremental text input.
   *
   * @default 'websocket'
   */
  mode?: 'websocket' | 'rest' | undefined;

  /** Called when an audio chunk is received. */
  onAudio?: ((chunk: Uint8Array) => void) | undefined;
  /** Called when the server marks the final audio payload. */
  onAudioEnd?: (() => void) | undefined;
  /** Called when generation is complete. */
  onTerminated?: (() => void) | undefined;
  /** Called on error. */
  onError?: ((error: Error) => void) | undefined;
  /** Called on each state transition. */
  onStateChange?: ((event: { old_state: TtsState; new_state: TtsState }) => void) | undefined;
}

export interface UseTtsReturn extends TtsSnapshot {
  /** Start TTS. Sends text (or pipes an async iterable in WebSocket mode) and generates audio. */
  speak: (text: string | AsyncIterable<string>) => void;
  /** Send one text chunk without finishing. WebSocket mode only. */
  sendText: (text: string) => void;
  /** Signal that no more text will be sent. WebSocket mode only. */
  finish: () => void;
  /** Gracefully stop — sends finish and waits for completion. */
  stop: () => Promise<void>;
  /** Cancel the current generation immediately. */
  cancel: () => void;
}

export function useTts(config: UseTtsConfig): UseTtsReturn {
  const contextClient = useContext(SonioxContext);
  const inlineClientRef = useRef<SonioxClient | undefined>(undefined);

  const hasInlineConfig = config.config !== undefined;

  // TTS always prefers inline config when provided, even if a SonioxProvider
  // exists. This is because TTS temporary API keys may have a different
  // usage_type than STT keys.
  if (hasInlineConfig && inlineClientRef.current === undefined) {
    const opts: SonioxClientOptions = {};
    if (config.config !== undefined) {
      opts.config = config.config;
    }
    if (isBrowserEnvironment()) {
      opts.permissions = new BrowserPermissionResolver();
    }
    inlineClientRef.current = new SonioxClient(opts);
  }

  const client = hasInlineConfig ? inlineClientRef.current : contextClient;
  if (client === undefined || client === null) {
    throw new Error(
      'useTts requires either a <SonioxProvider> ancestor or a `config` prop. ' +
        'Pass config directly: useTts({ config, voice }) or wrap your tree in <SonioxProvider>.'
    );
  }

  const storeRef = useRef<TtsStore>(undefined);
  if (storeRef.current === undefined) {
    storeRef.current = new TtsStore();
  }
  const store = storeRef.current;

  const streamRef = useRef<RealtimeTtsStream | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const configRef = useRef(config);
  configRef.current = config;

  store.onAudio = config.onAudio ?? null;
  store.onAudioEnd = config.onAudioEnd ?? null;
  store.onTerminated = config.onTerminated ?? null;
  store.onError = config.onError ?? null;
  store.onStateChange = config.onStateChange ?? null;

  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);

  const isRestMode = () => configRef.current.mode === 'rest';

  const extractStreamInput = useCallback((): TtsStreamInput => {
    const {
      config: _config,
      mode: _mode,
      onAudio: _onAudio,
      onAudioEnd: _onAudioEnd,
      onTerminated: _onTerminated,
      onError: _onError,
      onStateChange: _onStateChange,
      ...streamInput
    } = configRef.current;
    return streamInput;
  }, []);

  const buildRestOptions = useCallback(
    (text: string, voice: string): GenerateSpeechOptions => {
      const input = extractStreamInput();
      return {
        text,
        voice,
        model: input.model,
        language: input.language,
        audio_format: input.audio_format,
        sample_rate: input.sample_rate,
        bitrate: input.bitrate,
      };
    },
    [extractStreamInput]
  );

  // WebSocket mode: create stream
  const ensureStream = useCallback(async (): Promise<RealtimeTtsStream> => {
    if (streamRef.current) return streamRef.current;

    store.setConnecting();
    const streamInput = extractStreamInput();
    const stream = await client.realtime.tts(streamInput);
    streamRef.current = stream;
    store.attach(stream);
    return stream;
  }, [client, store, extractStreamInput]);

  // REST mode: generate via HTTP
  const speakRest = useCallback(
    (text: string): void => {
      const voice = configRef.current.voice;
      if (voice === undefined || voice === '') {
        store.setError(
          new Error(
            'useTts REST mode requires a `voice` — pass it via the hook config. ' +
              'Discover available voices via client.tts.listModels().'
          )
        );
        return;
      }

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      store.setConnecting();

      void (async () => {
        try {
          const options = { ...buildRestOptions(text, voice), signal: controller.signal };

          store.setState('speaking');

          for await (const chunk of client.tts.generateStream(options)) {
            if (controller.signal.aborted) break;
            store.onAudio?.(chunk);
          }

          if (!controller.signal.aborted) {
            store.onAudioEnd?.();
            store.onTerminated?.();
            store.setState('idle');
          }
        } catch (error) {
          if (!controller.signal.aborted) {
            store.setError(error instanceof Error ? error : new Error(String(error)));
          }
        }
      })();
    },
    [client, store, buildRestOptions]
  );

  const speak = useCallback(
    (text: string | AsyncIterable<string>): void => {
      // Cancel any in-flight operation
      if (streamRef.current) {
        streamRef.current.cancel();
        streamRef.current = null;
      }
      abortRef.current?.abort();
      store.reset();

      if (isRestMode()) {
        if (typeof text !== 'string') {
          store.onError?.(new Error('REST mode only supports string text input, not async iterables.'));
          return;
        }
        speakRest(text);
      } else {
        void (async () => {
          try {
            const stream = await ensureStream();
            if (typeof text === 'string') {
              stream.sendText(text, { end: true });
            } else {
              await stream.sendStream(text);
            }
          } catch (error) {
            store.onError?.(error instanceof Error ? error : new Error(String(error)));
          }
        })();
      }
    },
    [store, ensureStream, speakRest]
  );

  const sendText = useCallback(
    (text: string): void => {
      if (isRestMode()) return;
      void (async () => {
        try {
          const stream = await ensureStream();
          stream.sendText(text);
        } catch (error) {
          store.onError?.(error instanceof Error ? error : new Error(String(error)));
        }
      })();
    },
    [store, ensureStream]
  );

  const finish = useCallback((): void => {
    if (isRestMode()) return;
    if (streamRef.current && streamRef.current.state === 'active') {
      streamRef.current.finish();
      store.setStopping();
    }
  }, [store]);

  const stop = useCallback(async (): Promise<void> => {
    if (isRestMode()) {
      abortRef.current?.abort();
      store.reset();
      return;
    }
    const stream = streamRef.current;
    if (!stream) return;
    if (stream.state === 'active') {
      stream.finish();
      store.setStopping();
    }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    for await (const _ of stream) {
      // Drain
    }
  }, [store]);

  const cancel = useCallback((): void => {
    abortRef.current?.abort();
    streamRef.current?.cancel();
    streamRef.current = null;
    store.reset();
  }, [store]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      streamRef.current?.cancel();
      store.detach();
    };
  }, [store]);

  return {
    state: snapshot.state,
    isSpeaking: snapshot.isSpeaking,
    isConnecting: snapshot.isConnecting,
    error: snapshot.error,
    speak,
    sendText,
    finish,
    stop,
    cancel,
  };
}
