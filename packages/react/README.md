# @soniox/client

Official Soniox React SDK for React, React Native and Next.js

[Full React SDK Documentation](https://soniox.com/docs/stt/SDKs/react-SDK)

## Installation

```bash
npm install @soniox/react
```

## Realtime TTS timestamps

In WebSocket mode, `useTts` can return character-level audio timestamps. Set
`return_timestamps: true` on the hook config; the alignment for each frame is
delivered as the second argument of `onAudio` (it is `undefined` for audio-only
frames). Timestamps are WebSocket-only — REST mode never provides them — and map
to the model's preprocessed text, not your raw input.

```tsx
const { speak } = useTts({
  config,
  voice: 'Adrian',
  return_timestamps: true,
  onAudio: (chunk, timestamps) => {
    play(chunk);
    if (timestamps) {
      // timestamps.characters / character_start_times_seconds / character_end_times_seconds
    }
  },
});

speak('Hello world');
```

For the full documentation please go to our docs: [Full React SDK Documentation](https://soniox.com/docs/stt/SDKs/react-SDK)
