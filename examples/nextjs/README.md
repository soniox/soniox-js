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

Wrap your app with the `SonioxProvider` and pass your API key (or a function that returns a temporary key).

```tsx
import { SonioxProvider } from '@soniox/react';

function App() {
  return <SonioxProvider apiKey={getAPIKey}>{/* your app */}</SonioxProvider>;
}
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

## Why Next.js and not pure React?

This is a complete example which shows best practice on how to use temporary API keys (to not expose API keys to the client). For that, we use Next.js API routes (but could as well use any other backend, see a [FastAPI example](https://github.com/soniox/soniox_examples/tree/master/speech_to_text/apps/server)).
