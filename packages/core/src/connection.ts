/**
 * Connection configuration and region resolution.
 *
 * Provides types and utilities for resolving Soniox API endpoints
 * based on region and explicit overrides.
 */

import type { SttSessionConfig } from './types/realtime.js';

/**
 * Soniox deployment region.
 *
 * Known regions get autocomplete; any string is accepted for forward-compatibility
 * with regions added after this SDK version was published.
 *
 * - `'eu'` — European Union
 * - `'jp'` — Japan
 * - `undefined` — Default (United States)
 *
 * For unknown regions, provide `api_domain` and `stt_ws_url` explicitly.
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
  /** Temporary API key for authentication. */
  api_key: string;

  /**
   * Deployment region. Determines which regional endpoints are used.
   * Leave `undefined` for the default (US) region.
   *
   * @see https://soniox.com/docs/stt/data-residency
   */
  region?: SonioxRegion | undefined;

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
   * Default session configuration returned from the server.
   *
   * These values are available to the `session_config` function passed to
   * `client.realtime.record()`, allowing server-driven defaults for model,
   * language hints, context, etc.
   *
   * Not applied automatically — the caller must explicitly spread them.
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
  /** Server-provided session defaults (empty object when not provided). */
  session_defaults: Partial<SttSessionConfig>;
};

type RegionEntry = {
  api_domain: string;
  stt_ws_url: string;
};

const DEFAULT_REGION: RegionEntry = {
  api_domain: 'https://api.soniox.com',
  stt_ws_url: 'wss://stt-rt.soniox.com/transcribe-websocket',
};

const REGION_MAP: Record<string, RegionEntry> = {
  eu: {
    api_domain: 'https://api.eu.soniox.com',
    stt_ws_url: 'wss://stt-rt.eu.soniox.com/transcribe-websocket',
  },
  jp: {
    api_domain: 'https://api.jp.soniox.com',
    stt_ws_url: 'wss://stt-rt.jp.soniox.com/transcribe-websocket',
  },
};

/**
 * Resolve a {@link SonioxConnectionConfig} into fully qualified URLs.
 *
 * Resolution priority: explicit URL > region-derived URL > default (US) URLs.
 *
 * @throws If a region is specified that isn't in the built-in map and
 *         the caller did not supply both `api_domain` and `stt_ws_url`.
 */
export function resolveConnectionConfig(config: SonioxConnectionConfig): ResolvedConnectionConfig {
  const { region, api_domain, stt_ws_url } = config;

  let defaults: RegionEntry;

  if (region === undefined) {
    defaults = DEFAULT_REGION;
  } else {
    const entry = REGION_MAP[region];
    if (entry !== undefined) {
      defaults = entry;
    } else if (api_domain !== undefined && stt_ws_url !== undefined) {
      defaults = { api_domain, stt_ws_url };
    } else {
      const missing = [api_domain === undefined ? 'api_domain' : null, stt_ws_url === undefined ? 'stt_ws_url' : null]
        .filter(Boolean)
        .join(' and ');

      throw new Error(`Unknown region '${region}'. Provide ${missing} explicitly, or upgrade the SDK.`);
    }
  }

  return {
    api_key: config.api_key,
    api_domain: api_domain ?? defaults.api_domain,
    stt_ws_url: stt_ws_url ?? defaults.stt_ws_url,
    session_defaults: config.session_defaults ?? {},
  };
}
