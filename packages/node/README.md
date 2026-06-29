# @soniox/node

Official Soniox SDK for Node

[Full Node SDK Documentation](https://soniox.com/docs/stt/SDKs/node-SDK)

## Installation

```bash
npm install @soniox/node
```

## Getting Started

```typescript
import { SonioxNodeClient } from '@soniox/node';

const client = new SonioxNodeClient({
  api_key: 'your-api-key', // or set SONIOX_API_KEY env var
});
```

## Environment variables

`SonioxNodeClient` reads the following environment variables when the
corresponding constructor option is not provided:

| Variable              | Maps to option         | Notes                                                        |
| --------------------- | ---------------------- | ------------------------------------------------------------ |
| `SONIOX_API_KEY`      | `api_key`              | Required if `api_key` is not passed explicitly.              |
| `SONIOX_REGION`       | `region`               | Only `'eu'` and `'jp'` are defined; US is the default.       |
| `SONIOX_BASE_DOMAIN`  | `base_domain`          | Overrides `region` and forms the default hosts.              |
| `SONIOX_API_BASE_URL` | `base_url`             | Overrides the REST API host (e.g. `https://api.soniox.com`). |
| `SONIOX_WS_URL`       | `realtime.ws_base_url` | Overrides the STT realtime WebSocket URL.                    |
| `SONIOX_TTS_API_URL`  | `tts_api_url`          | Overrides the REST TTS host.                                 |
| `SONIOX_TTS_WS_URL`   | `realtime.tts_ws_url`  | Overrides the TTS realtime WebSocket URL.                    |

Resolution precedence for every setting is:

1. Explicit option passed to `new SonioxNodeClient({ ... })`.
2. Environment variable from the table above.
3. Value derived from `region` / `base_domain`.
4. Root default (United States).

## Error handling

REST calls (including REST TTS) throw `SonioxHttpError` on non-2xx
responses, network failures, and aborted requests.

```typescript
import { SonioxNodeClient, SonioxHttpError } from '@soniox/node';

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

## Voice cloning

Create custom voices from a short reference clip and use them anywhere a
built-in voice name is accepted. Manage voices via `client.tts.voices`.

A voice is processed asynchronously per TTS model. Poll until the model you
intend to use reports `ready`, then pass the voice `id` as the `voice` value in
any TTS request (REST or realtime).

```typescript
import * as fs from 'node:fs';
import { SonioxNodeClient } from '@soniox/node';

const client = new SonioxNodeClient();

// 1. Create a voice from a short (up to 20s, max 10 MB) reference clip.
const reference = await fs.promises.readFile('reference.wav');
const voice = await client.tts.voices.create({
  name: 'My narrator',
  file: reference,
  filename: 'reference.wav',
});

// 2. Wait until it is ready for the model you want to use.
let ready = voice.isReady('tts-rt-v1');
while (!ready) {
  await new Promise((r) => setTimeout(r, 2000));
  const refreshed = await client.tts.voices.get(voice.id);
  ready = refreshed?.isReady('tts-rt-v1') ?? false;
}

// 3. Use the cloned voice by its ID.
const audio = await client.tts.generate({
  text: 'Hello from my cloned voice.',
  voice: voice.id,
  model: 'tts-rt-v1',
  language: 'en',
});
```

Other operations:

```typescript
// List voices (async-iterable, auto-pages across all results).
const result = await client.tts.voices.list();
for await (const v of result) {
  console.log(v.id, v.name, v.models);
}

// Total number of voices in your project.
const { total } = await client.tts.voices.count();

// Prepare an existing voice for a newly released model.
await client.tts.voices.recompute(voice.id, { model: 'tts-rt-next' });

// Delete a voice (idempotent).
await client.tts.voices.delete(voice.id);
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

For the full documentation please go to our docs: [Full Node SDK Documentation](https://soniox.com/docs/stt/SDKs/node-SDK)
