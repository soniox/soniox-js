# Soniox Speech-to-Text Example in Next.js

This minimal example shows how to use `@soniox/react` for real-time speech-to-text in a Next.js application.
If you want to see a more advanced example, check the [React example from soniox_examples repository](https://github.com/soniox/soniox_examples/tree/master/speech_to_text/apps/react).

## Getting Started

First install dependencies:

```bash
npm install
```

Prepare your `.env` file:

```bash
cp .env.example .env
```

Edit the `.env` file and add your Soniox API key.

```bash
SONIOX_API_KEY=<SONIOX_API_KEY>
```

Then run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Setup

Wrap your app with the `SonioxProvider` and pass a `config` callback that
fetches a temporary API key from your backend. The SDK invokes the callback
with a `ConfigContext` whose `usage` field is either `'transcribe_websocket'`
(for STT) or `'tts_rt'` (for TTS), so your server can mint a correctly scoped
temporary key.

```tsx
import { SonioxProvider } from '@soniox/react';

async function getSonioxConfig(context) {
  const res = await fetch('/api/get-temporary-api-key', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ usage_type: context?.usage ?? 'transcribe_websocket' }),
  });
  // Forward region / base_domain from the server so the browser connects to
  // the same regional endpoints the temporary key is scoped to (EU / JP / US).
  const { apiKey, region, baseDomain } = await res.json();
  return {
    api_key: apiKey,
    ...(region ? { region } : {}),
    ...(baseDomain ? { base_domain: baseDomain } : {}),
  };
}

function App() {
  return <SonioxProvider config={getSonioxConfig}>{/* your app */}</SonioxProvider>;
}
```

### Running in a non-US region

If you deploy against EU or JP, set `SONIOX_REGION` (or `SONIOX_BASE_DOMAIN`)
on the server. The `/api/get-temporary-api-key` route echoes those values back
to the browser so `getSonioxConfig` can forward them to the SDK — otherwise
the browser falls back to US endpoints and the regional key fails to auth.

```bash
# .env
SONIOX_API_KEY=<SONIOX_API_KEY>
SONIOX_REGION=eu     # or 'jp'; leave unset for US
```

## Transcribing microphone stream

Use the `useRecording` hook to transcribe a microphone stream. See the `Transcribe` component in `src/app/transcribe.tsx` for a full example.

```tsx
import { useRecording } from '@soniox/react';

function Transcribe() {
  const { isActive, finalText, partialText, start, stop } = useRecording({
    model: 'stt-rt-v4',
  });

  return (
    <div>
      <span>{finalText}</span>
      <span style={{ color: 'gray' }}>{partialText}</span>

      {isActive ? <button onClick={stop}>Stop</button> : <button onClick={start}>Start</button>}
    </div>
  );
}
```

## Live translation

To enable live translation, pass a `translation` config to `useRecording` and use `groupBy` to separate original and translated text.

```tsx
const { groups, start, stop } = useRecording({
  model: 'stt-rt-v4',
  translation: {
    type: 'one_way',
    target_language: 'es',
  },
  groupBy: 'translation',
});

// Access original and translated text
groups.original?.finalText;
groups.translation?.finalText;
```

Full example can be found in `src/app/translate-to.tsx`.

You can enable two-way translation in a similar way:

```tsx
const { groups, start, stop } = useRecording({
  model: 'stt-rt-v4',
  translation: {
    type: 'two_way',
    language_a: 'en',
    language_b: 'de',
  },
  groupBy: 'language',
});

// Access language-specific text
groups.en?.finalText;
groups.de?.finalText;
```

Full example can be found in `src/app/translate-between.tsx`.

You can learn more about translation concepts [here](https://soniox.com/docs/stt/rt/real-time-translation).

## Text-to-speech

Use the `useTts` hook to generate speech from text. By default it uses the
realtime WebSocket TTS API and streams audio chunks as they are generated.
Collect them via the `onAudio` callback and play the result back through an
`<audio>` element.

```tsx
import { useTts } from '@soniox/react';

function TextToSpeech() {
  const chunks = useRef<Uint8Array[]>([]);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);

  const { speak, isSpeaking } = useTts({
    voice: 'Adrian',
    model: 'tts-rt-v1',
    language: 'en',
    audio_format: 'wav',
    onAudio: (chunk) => {
      chunks.current.push(chunk);
    },
    onTerminated: () => {
      const blob = new Blob(chunks.current, { type: 'audio/wav' });
      setAudioUrl(URL.createObjectURL(blob));
    },
  });

  return (
    <>
      <button onClick={() => speak('Hello world.')} disabled={isSpeaking}>
        Speak
      </button>
      {audioUrl && <audio src={audioUrl} controls autoPlay />}
    </>
  );
}
```

Full example can be found in `src/app/text-to-speech.tsx`.

When using `useTts` from within a `<SonioxProvider>`, it automatically picks
up the provider's `config` callback — the SDK invokes it with
`ConfigContext.usage === 'tts_rt'`, so the backend can mint a scoped TTS key.

## Why Next.js and not pure React?

This is a complete example which shows best practice on how to use temporary API keys (to not expose API keys to the client). For that, we use Next.js API routes (but could as well use any other backend, see a [FastAPI example](https://github.com/soniox/soniox_examples/tree/master/speech_to_text/apps/server)).
