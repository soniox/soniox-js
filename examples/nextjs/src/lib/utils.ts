import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Spanish' },
  { code: 'fr', label: 'French' },
  { code: 'de', label: 'German' },
  { code: 'zh', label: 'Chinese' },
  { code: 'ja', label: 'Japanese' },
  { code: 'ko', label: 'Korean' },
  { code: 'pt', label: 'Portuguese' },
  { code: 'ru', label: 'Russian' },
  { code: 'ar', label: 'Arabic' },
] as const;

// Fetch Soniox connection config (temporary API key) from our backend.
// The SDK passes a ConfigContext with `usage` so the server can mint a
// scoped temporary key for STT (`transcribe_websocket`) or TTS (`tts_rt`).
// Read more on: https://soniox.com/docs/speech-to-text/guides/direct-stream#temporary-api-keys
//
// We also forward the region / base_domain that the server is using, so the
// browser SDK connects to the matching regional endpoints (e.g. the EU key
// must be used against `stt-rt.eu.soniox.com` / `tts-rt.eu.soniox.com`). Without
// this, the browser would fall back to the default US endpoints and auth would
// fail whenever the server is running in a non-US region.
export default async function getSonioxConfig(context?: { usage?: 'transcribe_websocket' | 'tts_rt' }) {
  const response = await fetch('/api/get-temporary-api-key', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ usage_type: context?.usage ?? 'transcribe_websocket' }),
  });
  const { apiKey, region, baseDomain } = await response.json();
  return {
    api_key: apiKey,
    ...(region ? { region } : {}),
    ...(baseDomain ? { base_domain: baseDomain } : {}),
  };
}
