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

// Fetch temporary API key from the server, so we can establish websocket connection.
// Read more on: https://soniox.com/docs/speech-to-text/guides/direct-stream#temporary-api-keys
export default async function getAPIKey() {
  const response = await fetch('/api/get-temporary-api-key', {
    method: 'POST',
  });
  const { apiKey } = await response.json();
  return apiKey;
}
