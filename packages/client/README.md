# @soniox/client

Official Soniox Web SDK for client-side applications.

[Full Web SDK Documentation](https://soniox.com/docs/stt/SDKs/web-sdk)

## Installation

```bash
npm install @soniox/client
```

## Quick Start

```typescript
import { SonioxClient } from '@soniox/client';

// Create a client and fetch temporary API key from your backend
const client = new SonioxClient({
  api_key: async () => {
    const res = await fetch('/api/get-temporary-key', { method: 'POST' });
    const { api_key } = await res.json();
    return api_key;
  },
});
```

## Error handling

REST TTS and other HTTP-backed calls throw `SonioxHttpError` on non-2xx
responses, network failures, and aborted requests.

```typescript
import { SonioxClient, SonioxHttpError } from '@soniox/client';

try {
  const audio = await client.tts.generate({
    text: 'Hello',
    voice: 'Adrian',
    language: 'en',
  });
} catch (err) {
  if (err instanceof SonioxHttpError) {
    console.error(err.code, err.statusCode, err.bodyText);
  }
}
```

## Realtime TTS timestamps

The realtime (WebSocket) TTS API can return character-level audio timestamps.
Set `return_timestamps: true` on the stream; the alignment for each frame is
delivered as the second argument of the `audio` event (it is `undefined` for
audio-only frames). Timestamps are WebSocket-only — the REST endpoint ignores
the flag — and map to the model's preprocessed text, not your raw input.

```typescript
const stream = await client.realtime.tts({
  voice: 'Adrian',
  language: 'en',
  audio_format: 'pcm_s16le',
  sample_rate: 24000,
  return_timestamps: true,
});

stream.on('audio', (chunk, timestamps) => {
  play(chunk);
  if (timestamps) {
    timestamps.characters.forEach((char, i) => {
      console.log(char, timestamps.character_start_times_seconds[i], timestamps.character_end_times_seconds[i]);
    });
  }
});

stream.sendText('Hello world', { end: true });
```

For the full documentation please go to our docs: [Full Web SDK Documentation](https://soniox.com/docs/stt/SDKs/web-sdk)
