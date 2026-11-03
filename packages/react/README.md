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

## Agent text input (voice agents)

`useRecording` exposes `sendAgentText` for voice agents: it tells Soniox what
your agent is saying, so those words are recognized when the user says them back
and the agent's own voice is not transcribed as the user. Set
`enable_agent_text_input` on the session config and send each piece a little
before the caller hears it - 500ms to 1s ahead of playback - because the server
places it by where it sits among the audio frames. Close every turn with
`end_of_segment: true`, which is also how a barge-in is handled: send what was
already heard, close the turn, and drop the rest of the reply.

```tsx
const { start, sendAgentText } = useRecording({
  config,
  model: 'stt-rt-v6',
  enable_agent_text_input: true,
});

const { speak } = useTts({
  config,
  voice: 'Adrian',
  return_timestamps: true,
  onAudio: (chunk, timestamps) => {
    queueForPlayback(chunk);
    // Character times run from the start of the stream, so schedule each piece
    // for 700ms before its playback position, rather than sending it now.
    if (timestamps) scheduleAgentText(timestamps, sendAgentText);
  },
});
```

The model must report `supports_agent_text_input`, and calls are dropped while
no session is connected - before the connection opens, or during a reconnect -
because text sent then would land beside the wrong audio.

For the full documentation please go to our docs: [Full React SDK Documentation](https://soniox.com/docs/stt/SDKs/react-SDK)
