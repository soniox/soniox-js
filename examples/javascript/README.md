# Soniox Web SDK Example

This is a minimal example of how to use the `@soniox/client` library in a
vanilla JavaScript project. It demonstrates real-time speech-to-text from
the microphone and text-to-speech via both the REST and WebSocket APIs.

## Usage

1. Install the dependencies:

```bash
npm install
```

2. Run the example:

```bash
npm run dev
```

3. Open your browser and navigate to `http://localhost:5173`.

4. Paste your Soniox API key in the input at the top. The client reads it
   lazily through the `config` callback when a session is started, so you
   can swap your backend-minted temporary key implementation in later.

## What's in the demo

- **Real-time transcription** – Start/Stop/Pause/Resume/Cancel controls
  wired to `client.realtime.record({ model: 'stt-rt-v4' })`.
- **Text-to-speech** – Generate speech from any text via:
  - `client.tts.generate(...)` (REST, one buffered response)
  - `client.realtime.tts(...)` (WebSocket, chunks streamed as generated)

  Audio is played back inline through an `<audio>` element.
