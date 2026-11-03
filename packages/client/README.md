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

## Agent text input (voice agents)

Tell Soniox what your agent is saying, so those words are recognized when the
user says them back and the agent's own voice bleeding into the microphone is
not transcribed as the user. Set `enable_agent_text_input` on the recording and
call `recording.sendAgentText()` as the reply is spoken. Agent text carries no
timestamps: the server places each piece where it sits among the audio frames,
so send it a little before the caller hears it - 500ms to 1s ahead of playback -
paced by how much has really been played, not by how fast the model or the
Text-to-Speech produced it. The model must report `supports_agent_text_input`.

```typescript
const recording = client.realtime.record({
  model: 'stt-rt-v6',
  language_hints: ['en'],
  enable_agent_text_input: true,
  source: new MicrophoneSource({ constraints: { echoCancellation: true, channelCount: 1 } }),
});

// Realtime TTS supplies the alignment: character times run from the start of
// the stream, so anchoring position 0 to the playback clock says when the caller
// hears each one. Queue the audio, then send each piece LEAD_MS before that.
stream.on('audio', (chunk, timestamps) => {
  queueForPlayback(chunk);
  if (timestamps) scheduleAgentText(timestamps);
});

// Every turn ends with end_of_segment - also how a barge-in is handled: send
// what the caller already heard, close the turn, drop the rest of the reply.
recording.sendAgentText('', { end_of_segment: true });
```

Agent text is recognition context, not a substitute for echo cancellation: keep
`echoCancellation: true` on `MicrophoneSource` (it defaults to `false`), and
prefer speakers plus the platform's canceller over feeding the agent's audio
back in. See `examples/javascript` for a working loop.

For the full documentation please go to our docs: [Full Web SDK Documentation](https://soniox.com/docs/stt/SDKs/web-sdk)
