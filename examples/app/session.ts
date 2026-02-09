import crypto from 'crypto';
import type http from 'http';

import { SonioxNodeClient } from '@soniox/node';
import type { Request, Response, NextFunction } from 'express';

// Extend Express Request with our session property
declare module 'express-serve-static-core' {
  interface Request {
    sessionId?: string;
  }
}

const SESSION_COOKIE = 'soniox_session';

// Session ID -> API key
const sessions = new Map<string, string>();

// API key -> cached SonioxNodeClient
const clients = new Map<string, SonioxNodeClient>();

// ENV-based fallback client (null if SONIOX_API_KEY is not set)
const envApiKey = process.env['SONIOX_API_KEY'];
let envClient: SonioxNodeClient | null = null;
if (envApiKey) {
  envClient = new SonioxNodeClient({ api_key: envApiKey });
}

// ---------------------------------------------------------------------------
// Cookie helpers
// ---------------------------------------------------------------------------

function parseCookies(cookieHeader: string): Record<string, string> {
  const cookies: Record<string, string> = {};
  for (const pair of cookieHeader.split(';')) {
    const [name, ...rest] = pair.trim().split('=');
    if (name) cookies[name] = decodeURIComponent(rest.join('='));
  }
  return cookies;
}

function getSessionIdFromCookies(cookieHeader: string | undefined): string | undefined {
  if (!cookieHeader) return undefined;
  return parseCookies(cookieHeader)[SESSION_COOKIE];
}

// ---------------------------------------------------------------------------
// Express middleware – ensures a session cookie exists
// ---------------------------------------------------------------------------

export function sessionMiddleware(req: Request, res: Response, next: NextFunction) {
  let sessionId = getSessionIdFromCookies(req.headers.cookie);
  if (!sessionId) {
    sessionId = crypto.randomUUID();
    res.cookie(SESSION_COOKIE, sessionId, { httpOnly: true, sameSite: 'lax' });
  }
  req.sessionId = sessionId;
  next();
}

// ---------------------------------------------------------------------------
// Session API key management
// ---------------------------------------------------------------------------

export function setSessionApiKey(sessionId: string, apiKey: string): void {
  sessions.set(sessionId, apiKey);
  if (!clients.has(apiKey)) {
    clients.set(apiKey, new SonioxNodeClient({ api_key: apiKey }));
  }
}

export function clearSessionApiKey(sessionId: string): void {
  sessions.delete(sessionId);
}

export type TokenSource = 'custom' | 'env' | 'none';

export function getSessionStatus(sessionId: string): { source: TokenSource } {
  if (sessions.has(sessionId)) return { source: 'custom' };
  if (envClient) return { source: 'env' };
  return { source: 'none' };
}

// ---------------------------------------------------------------------------
// Client resolution
// ---------------------------------------------------------------------------

function resolveClient(sessionId: string | undefined): SonioxNodeClient {
  if (sessionId) {
    const apiKey = sessions.get(sessionId);
    if (apiKey) {
      let client = clients.get(apiKey);
      if (!client) {
        client = new SonioxNodeClient({ api_key: apiKey });
        clients.set(apiKey, client);
      }
      return client;
    }
  }
  if (envClient) return envClient;
  const err = new Error('No API key configured. Please set one in the UI or via SONIOX_API_KEY env var.');
  (err as Error & { status: number }).status = 401;
  throw err;
}

/** Resolve a SonioxNodeClient from an Express request (uses middleware-set sessionId). */
export function getClientForRequest(req: Request): SonioxNodeClient {
  const sessionId = req.sessionId;
  return resolveClient(sessionId);
}

/** Resolve a SonioxNodeClient from a raw IncomingMessage (WebSocket upgrade). */
export function getClientForWsRequest(req: http.IncomingMessage): SonioxNodeClient {
  const sessionId = getSessionIdFromCookies(req.headers.cookie);
  return resolveClient(sessionId);
}
