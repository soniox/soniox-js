import type { SonioxConnectionConfig } from '@soniox/client';
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

// Fetch temporary API key and connection config from the server.
// Read more on: https://soniox.com/docs/speech-to-text/guides/direct-stream#temporary-api-keys
export default async function getConfig(): Promise<SonioxConnectionConfig> {
  const response = await fetch('/api/get-temporary-api-key', {
    method: 'POST',
  });
  const { apiKey } = await response.json();
  return { api_key: apiKey };
}
