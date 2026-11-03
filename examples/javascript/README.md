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
  wired to `client.realtime.record({ model: 'stt-rt-v6' })`.
- **Text-to-speech** – Generate speech from any text via:
  - `client.tts.generate(...)` (REST, one buffered response)
  - `client.realtime.tts(...)` (WebSocket, chunks streamed as generated)

  Audio is played back inline through an `<audio>` element.

- **Voice agent (agent text + echo cancellation)** – opens the microphone with
  `echoCancellation` on, speaks a line through realtime TTS, and sends each
  piece of it with `recording.sendAgentText()` 700ms before the caller hears it,
  scheduled off the TTS character timestamps and the `AudioContext` clock, so
  the agent's own voice is not transcribed as the user. "Barge in" stops the
  playback and closes the turn with what was actually heard. Use speakers rather
  than headphones, and note the model must report `supports_agent_text_input`.
