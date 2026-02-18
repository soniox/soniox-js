/**
 * useSoniox — access the SonioxClient from context
 */

import type { SonioxClient } from '@soniox/client';
import { useContext } from 'react';

import { SonioxContext } from './context.js';

/**
 * Returns the `SonioxClient` instance provided by the nearest `SonioxProvider`
 *
 * @throws Error if called outside a `SonioxProvider`
 */
export function useSoniox(): SonioxClient {
  const client = useContext(SonioxContext);
  if (client === null) {
    throw new Error(
      'useSoniox must be used within a <SonioxProvider>. Wrap your component tree with <SonioxProvider>.'
    );
  }
  return client;
}
