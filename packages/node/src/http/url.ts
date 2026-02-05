/**
 * URL utilities for the HTTP client.
 */

import type { QueryParams } from '../types/public/http.js';

/**
 * Builds a complete URL from base URL, path, and query parameters
 */
export function buildUrl(baseUrl: string | undefined, path: string, query?: QueryParams): string {
  // Join base URL and path
  let url = joinUrl(baseUrl ?? '', path);

  // Append query string if provided
  if (query) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) {
        params.append(key, String(value));
      }
    }
    const queryString = params.toString();
    if (queryString) {
      url += (url.includes('?') ? '&' : '?') + queryString;
    }
  }

  return url;
}

/**
 * Joins a base URL with a path
 */
function joinUrl(baseUrl: string, path: string): string {
  if (!baseUrl) return path;
  if (!path) return baseUrl;
  if (/^https?:\/\//i.test(path)) return path;

  const base = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  const suffix = path.startsWith('/') ? path : `/${path}`;
  return base + suffix;
}

/**
 * Normalizes fetch Headers to a plain object with lowercase keys
 */
export function normalizeHeaders(headers: Headers): Record<string, string> {
  const result: Record<string, string> = {};
  headers.forEach((value, key) => {
    result[key.toLowerCase()] = value;
  });
  return result;
}

/**
 * Merges header objects
 */
export function mergeHeaders(...headerObjects: (Record<string, string> | undefined)[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (const headers of headerObjects) {
    if (headers) {
      for (const [key, value] of Object.entries(headers)) {
        result[key.toLowerCase()] = value;
      }
    }
  }
  return result;
}
