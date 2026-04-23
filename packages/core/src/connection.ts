/**
 * Connection configuration and region resolution.
 *
 * Provides types and utilities for resolving Soniox API endpoints
 * based on region and explicit overrides.
 */

import type { SttSessionConfig } from './types/realtime.js';
import type { TtsStreamConfig } from './types/tts.js';

/**
 * Context passed to the config resolver function by the SDK.
 *
 * `usage` indicates what the resolved config will be used for, so the
 * server can generate a temporary API key with the correct scope.
 * `params` is a freeform bag for any custom data the developer wants
 * to forward to their backend.
 */
export type ConfigContext = {
  /** What the config will be used for. Set by the SDK internally. */
  usage?: 'transcribe_websocket' | 'tts_rt' | undefined;
  /** Freeform data the developer can forward to their backend. */
  params?: Record<string, unknown> | undefined;
};

/**
 * Soniox deployment region.
 *
 * Defined regions:
 * - `'eu'` — European Union (`*.eu.soniox.com`)
 * - `'jp'` — Japan (`*.jp.soniox.com`)
 * - `undefined` — Default (United States). The US region has no subdomain.
 *
 * A region name (other than `'us'`) is shorthand for setting `base_domain`
 * to `{region}.soniox.com`. The string `'us'` is accepted and normalized to
 * the default (United States) base domain; there is no `us.soniox.com` host.
 *
 * The type stays open (`string & {}`) for forward compatibility with regions
 * added after this SDK version was published, but passing an unknown region
 * simply prepends it as a subdomain and may not resolve.
 *
 * @see https://soniox.com/docs/stt/data-residency
 */
export type SonioxRegion = 'eu' | 'jp' | (string & {});

/**
 * Connection configuration for Soniox APIs.
 *
 * Can be provided as a plain object (sync) or returned from an async function
 * to support fetching configuration from a server at runtime.
 */
export type SonioxConnectionConfig = {
  /** API key for authentication. */
  api_key: string;

  /**
   * Deployment region. Determines which regional endpoints are used.
   * Leave `undefined` for the default (US) region.
   *
   * Shorthand for `base_domain: '{region}.soniox.com'`.
   * `base_domain` takes precedence when both are provided.
   *
   * @see https://soniox.com/docs/stt/data-residency
   */
  region?: SonioxRegion | undefined;

  /**
   * Base domain for all Soniox service URLs.
   *
   * A single override that derives all four service endpoints:
   * - `api_domain`  → `https://api.{base_domain}`
   * - `stt_ws_url`  → `wss://stt-rt.{base_domain}/transcribe-websocket`
   * - `tts_api_url` → `https://tts-rt.{base_domain}`
   * - `tts_ws_url`  → `wss://tts-rt.{base_domain}/tts-websocket`
   *
   * Takes precedence over `region`. Individual URL fields (`api_domain`,
   * `stt_ws_url`, etc.) still take final precedence over this value.
   *
   * @example 'eu.soniox.com'
   */
  base_domain?: string | undefined;

  /**
   * REST API domain override (e.g. `'https://api.eu.soniox.com'`).
   * When set, takes precedence over the region-derived domain.
   */
  api_domain?: string | undefined;

  /**
   * STT WebSocket URL override (e.g. `'wss://stt-rt.eu.soniox.com/transcribe-websocket'`).
   * When set, takes precedence over the region-derived URL.
   */
  stt_ws_url?: string | undefined;

  /**
   * TTS REST API URL override (e.g. `'https://tts-rt.eu.soniox.com'`).
   * When set, takes precedence over the region-derived URL.
   */
  tts_api_url?: string | undefined;

  /**
   * TTS WebSocket URL override (e.g. `'wss://tts-rt.eu.soniox.com/tts-websocket'`).
   * When set, takes precedence over the region-derived URL.
   */
  tts_ws_url?: string | undefined;

  /**
   * Server-provided STT session defaults (model, language hints, context, etc.).
   *
   * Available to the `session_config` function passed to `client.realtime.record()`,
   * allowing server-driven defaults. Not applied automatically — the caller must
   * explicitly spread them.
   */
  stt_defaults?: Partial<SttSessionConfig> | undefined;

  /**
   * Server-provided TTS stream defaults (model, voice, language, audio_format, etc.).
   *
   * Automatically merged as the base layer when opening TTS streams.
   * Caller-provided fields override these defaults.
   */
  tts_defaults?: Partial<TtsStreamConfig> | undefined;

  /**
   * @deprecated Use `stt_defaults` instead. Kept as an alias for backward
   * compatibility; the resolver treats it as equivalent to `stt_defaults`
   * when that field is absent. Planned for removal in the next major version.
   */
  session_defaults?: Partial<SttSessionConfig> | undefined;
};

/**
 * Fully resolved connection configuration with all URLs determined.
 */
export type ResolvedConnectionConfig = {
  api_key: string;
  api_domain: string;
  stt_ws_url: string;
  tts_api_url: string;
  tts_ws_url: string;
  /** Server-provided STT session defaults (empty object when not provided). */
  stt_defaults: Partial<SttSessionConfig>;
  /** Server-provided TTS stream defaults (empty object when not provided). */
  tts_defaults: Partial<TtsStreamConfig>;

  /**
   * @deprecated Use `stt_defaults` instead. Kept in the resolver output as
   * an alias for backward compatibility; planned for removal in the next
   * major version.
   */
  session_defaults: Partial<SttSessionConfig>;
};

/** Root domain used for the default (US) deployment. */
const DEFAULT_BASE_DOMAIN = 'soniox.com';

/**
 * Derives the four Soniox service URLs from a base domain.
 * All Soniox deployments follow the same subdomain pattern:
 *   api.{base}  /  stt-rt.{base}  /  tts-rt.{base}
 */
function urlsFromBase(base: string) {
  return {
    api_domain: `https://api.${base}`,
    stt_ws_url: `wss://stt-rt.${base}/transcribe-websocket`,
    tts_api_url: `https://tts-rt.${base}`,
    tts_ws_url: `wss://tts-rt.${base}/tts-websocket`,
  };
}

/**
 * Resolve a {@link SonioxConnectionConfig} into fully qualified URLs.
 *
 * Resolution priority (highest → lowest) for each URL:
 * 1. Explicit field (`api_domain`, `stt_ws_url`, `tts_api_url`, `tts_ws_url`)
 * 2. Derived from `base_domain`
 * 3. Derived from `region` → `{region}.soniox.com`
 * 4. Default US base domain (`soniox.com`)
 */
export function resolveConnectionConfig(config: SonioxConnectionConfig): ResolvedConnectionConfig {
  const { region, base_domain, api_domain, stt_ws_url, tts_api_url, tts_ws_url } = config;

  const normalizedRegion = region !== undefined && region.toLowerCase() !== 'us' ? region : undefined;
  const effectiveBase =
    base_domain ?? (normalizedRegion !== undefined ? `${normalizedRegion}.soniox.com` : DEFAULT_BASE_DOMAIN);
  const derived = urlsFromBase(effectiveBase);

  const sttDefaults = config.stt_defaults ?? config.session_defaults ?? {};

  return {
    api_key: config.api_key,
    api_domain: api_domain ?? derived.api_domain,
    stt_ws_url: stt_ws_url ?? derived.stt_ws_url,
    tts_api_url: tts_api_url ?? derived.tts_api_url,
    tts_ws_url: tts_ws_url ?? derived.tts_ws_url,
    stt_defaults: sttDefaults,
    tts_defaults: config.tts_defaults ?? {},
    session_defaults: sttDefaults,
  };
}
