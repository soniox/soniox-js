/**
 * SonioxProvider — React context provider for the Soniox client
 *
 * Creates and shares a single SonioxClient instance
 */

import { SonioxClient, BrowserPermissionResolver } from '@soniox/client';
import type { ApiKeyConfig, SonioxClientOptions, SonioxConnectionConfig, PermissionResolver } from '@soniox/client';
import { createContext, createElement, useRef, type ReactNode } from 'react';

import { isBrowserEnvironment } from './support.js';

export const SonioxContext = createContext<SonioxClient | null>(null);

/**
 * Props for SonioxProvider.
 *
 * Supply either a pre-built `client` instance or configuration props
 */
export type SonioxProviderProps = {
  children: ReactNode;
} & (SonioxProviderConfigProps | SonioxProviderClientProps);

type SonioxProviderConfigProps = {
  /**
   * Connection configuration — sync object or async function.
   *
   * When provided as a function, it is called once per recording session,
   * allowing you to fetch a fresh temporary API key and connection settings
   * from your backend at runtime.
   *
   * @example
   * ```tsx
   * <SonioxProvider config={{ api_key: tempKey, region: 'eu' }}>
   *   ...
   * </SonioxProvider>
   * ```
   */
  config?: SonioxConnectionConfig | (() => Promise<SonioxConnectionConfig>) | undefined;

  /**
   * API key configuration — string or async function
   * @deprecated Use `config` instead.
   */
  apiKey?: ApiKeyConfig | undefined;

  /**
   * WebSocket URL override
   * @default 'wss://stt-rt.soniox.com/transcribe-websocket'
   * @deprecated Use `config.stt_ws_url` or `config.region` instead.
   */
  wsBaseUrl?: string | undefined;

  /**
   * Permission resolver.  Defaults to `BrowserPermissionResolver` when
   * `navigator.mediaDevices` is available (i.e. in browsers).
   * Pass `null` to explicitly disable.  In non-browser environments
   * (React Native, SSR) no resolver is set by default.
   */
  permissions?: PermissionResolver | null | undefined;

  /** Pre-built client — must NOT be set when using config props. */
  client?: undefined;
};

type SonioxProviderClientProps = {
  /** Pre-built SonioxClient instance. */
  client: SonioxClient;

  config?: undefined;
  apiKey?: undefined;
  wsBaseUrl?: undefined;
  permissions?: undefined;
};

function buildClient(props: SonioxProviderProps): SonioxClient {
  if (props.client != null) {
    return props.client;
  }

  const options: SonioxClientOptions = {};

  if (props.config !== undefined) {
    options.config = props.config;
  } else if (props.apiKey !== undefined) {
    options.api_key = props.apiKey;
    if (props.wsBaseUrl !== undefined) {
      options.ws_base_url = props.wsBaseUrl;
    }
  }

  if (props.permissions === null) {
    // Explicitly disabled — leave undefined.
  } else if (props.permissions !== undefined) {
    options.permissions = props.permissions;
  } else if (isBrowserEnvironment()) {
    options.permissions = new BrowserPermissionResolver();
  }

  return new SonioxClient(options);
}

export function SonioxProvider(props: SonioxProviderProps): ReactNode {
  const { children } = props;
  const clientRef = useRef<SonioxClient | undefined>(undefined);

  if (clientRef.current === undefined) {
    clientRef.current = buildClient(props);
  }

  // Dev-mode: warn if configuration props change after mount.
  if (process.env.NODE_ENV !== 'production') {
    const initialPropsRef = useRef({
      config: props.config,
      apiKey: props.apiKey,
      wsBaseUrl: props.wsBaseUrl,
      client: props.client,
    });
    const warnedRef = useRef(false);

    if (!warnedRef.current) {
      const init = initialPropsRef.current;
      if (
        init.config !== props.config ||
        init.apiKey !== props.apiKey ||
        init.wsBaseUrl !== props.wsBaseUrl ||
        init.client !== props.client
      ) {
        warnedRef.current = true;
        // eslint-disable-next-line no-console
        console.warn(
          '[@soniox/react] SonioxProvider props changed after mount. ' +
            'The client is created once and will not be recreated. ' +
            'To change configuration, remount the provider using a React key.'
        );
      }
    }
  }

  return createElement(SonioxContext.Provider, { value: clientRef.current }, children);
}
