# @soniox/node

Official Soniox SDK for Node.js - Speech-to-Text API

## Contents

- [Installation](#installation)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [Temporary API Keys](#temporary-api-keys)
- [Files API](#files-api)
- [Speech-To-Text API](#speech-to-text-api)
- [Webhooks](#webhooks)
- [Models API](#models-api)
- [Realtime API](#realtime-api)

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

## Compact API Reference

**Client**
- `new SonioxNodeClient({ api_key?, base_url?, http_client? })`

**Files**
- `client.files.upload(file, options?)`
- `client.files.list(options?)`
- `client.files.get(fileId | file)`
- `client.files.delete(fileId | file)`

**Speech-To-Text**
- `client.stt.transcribe(options)` (exactly one of `file`, `file_id`, `audio_url`)
- `client.stt.transcribeFromUrl(audioUrl, options)`
- `client.stt.transcribeFromFile(file, options)`
- `client.stt.transcribeFromFileId(fileId, options)`
- `client.stt.create(options)`
- `client.stt.list(options?)`
- `client.stt.get(id | transcription)`
- `client.stt.getTranscript(id | transcription)`
- `client.stt.wait(id | transcription, options?)`
- `client.stt.delete(id | transcription)`
- `client.stt.destroy(id | transcription)`

**Transcript Methods**
- `transcript.segments(options?)` - group tokens by speaker/language

**Webhooks**
- `client.webhooks.handle(options)`
- `client.webhooks.handleRequest(request, auth?)`
- `client.webhooks.handleExpress(req, auth?)`
- `client.webhooks.handleFastify(req, auth?)`
- `client.webhooks.handleNestJS(req, auth?)`
- `client.webhooks.handleHono(c, auth?)`
- `client.webhooks.getAuthFromEnv()`
- `client.webhooks.isEvent(payload)`
- `client.webhooks.parseEvent(payload)`
- `client.webhooks.verifyAuth(headers, auth)`

**Models**
- `client.models.list()`

**Auth**
- `client.auth.createTemporaryKey(request)`

**Realtime**
- `client.realtime.stt(config, options?)` - Create realtime Speech-To-Text session
- `segmentRealtimeTokens(tokens, options?)` - Group realtime tokens into segments
- `new RealtimeSegmentBuffer(options?)` - Rolling buffer for stable segments
- `new RealtimeUtteranceBuffer(options?)` - Collect segments into utterances

**Realtime Session**
- `session.connect()` - Connect to WebSocket
- `session.sendAudio(data)` - Send audio data
- `session.finish()` - Gracefully end session
- `session.close()` - Close immediately
- `session.finalize(options?)` - Request finalization
- `session.keepAlive()` - Send keepalive
- `session.pause()` / `session.resume()` - Pause/resume with auto-keepalive
- `session.on(event, handler)` / `session.off()` / `session.once()` - Event handlers
- `for await (const event of session)` - Async iteration

## Environment Variables

The SDK supports the following environment variables:

| Variable | Description | Default |
| --- | --- | --- |
| `SONIOX_API_KEY` | API key for authentication. Used when `api_key` is not provided in client options. | — |
| `SONIOX_API_BASE_URL` | Base URL for API requests. Used when `base_url` is not provided in client options. | `https://api.soniox.com` |
| `SONIOX_WS_URL` | WebSocket URL for realtime API. Used when `realtime.ws_base_url` is not provided. | `wss://stt-rt.soniox.com/transcribe-websocket` |
| `SONIOX_API_WEBHOOK_HEADER` | Header name for webhook authentication. Used by webhook handlers when `auth` is not provided. | — |
| `SONIOX_API_WEBHOOK_SECRET` | Header value for webhook authentication. Used by webhook handlers when `auth` is not provided. | — |

**Example:**

```bash
export SONIOX_API_KEY=your-api-key
export SONIOX_API_WEBHOOK_HEADER=X-Webhook-Secret
export SONIOX_API_WEBHOOK_SECRET=your-webhook-secret
```

```typescript
// No need to pass api_key when SONIOX_API_KEY is set
const client = new SonioxNodeClient();

// No need to pass auth when webhook env vars are set
app.post('/webhook', (req, res) => {
    const result = webhooks.handleWebhookExpress(req);
    // ...
});
```

## Temporary API Keys

Generate short-lived API keys for client-side use (e.g., browser WebSocket connections):

```typescript
const { api_key, expires_at } = await client.auth.createTemporaryKey({
    usage_type: 'transcribe_websocket',
    expires_in_seconds: 3600,
});
```

## Files API

Upload files for async transcription:

```typescript
// Upload a buffer
const file = await client.files.upload(buffer, { filename: 'audio.mp3' });

// Upload a Blob (works with Bun.file() too)
const file = await client.files.upload(blob);

// List uploaded files
const result = await client.files.list();
for await (const file of result) {
    console.log(file.filename, file.size);
}

// Get file by ID (returns null if not found)
const file = await client.files.get('file-id');
if (file) {
    console.log(file.filename, file.size);
}

// Delete a file (idempotent - succeeds even if file doesn't exist)
await client.files.delete('file-id');
// or
await file.delete();
```

## Speech-To-Text API

### Quick Start with `transcribe()`

The `transcribe()` method is the easiest way to transcribe audio:

```typescript
// Transcribe from URL and wait for completion
const transcription = await client.stt.transcribe({
    model: 'stt-async-v4',
    audio_url: 'https://example.com/audio.mp3',
    wait: true,
});

const transcript = await transcription.getTranscript();
console.log(transcript.text);
```

If you want to avoid the "one-of" audio source options, use the convenience wrappers:

```typescript
const transcription = await client.stt.transcribeFromUrl(
    'https://example.com/audio.mp3',
    { model: 'stt-async-v4', wait: true }
);
```

### Upload and Transcribe in One Call

```typescript
import { readFile } from 'fs/promises';

const buffer = await readFile('recording.mp3');

const transcription = await client.stt.transcribe({
    model: 'stt-async-v4',
    file: buffer,
    filename: 'recording.mp3',
    wait: true,
});

console.log(await transcription.getTranscript());
```

### Transcription Options

```typescript
const transcription = await client.stt.transcribe({
    model: 'stt-async-v4',
    audio_url: 'https://example.com/audio.mp3',
    
    // Enable speaker diarization
    enable_speaker_diarization: true,
    
    // Enable language identification
    enable_language_identification: true,
    
    // Provide language hints
    language_hints: ['en', 'es'],
    
    // Add context for better accuracy
    context: {
        text: 'Medical consultation about diabetes treatment',
        terms: ['metformin', 'A1C', 'glucose'],
    },
    
    // Webhook notifications
    webhook_url: 'https://your-server.com/webhook',
    webhook_auth_header_name: 'X-Webhook-Secret',
    webhook_auth_header_value: 'your-secret-token',
    
    // Wait for completion
    wait: true,
    wait_options: {
        timeout_ms: 300000,  // 5 minutes
        interval_ms: 2000,   // Poll every 2 seconds
        on_status_change: (status) => console.log(`Status: ${status}`),
    },

    // Skip auto-fetching the full transcript payload
    fetch_transcript: false,
    
    // Auto-cleanup after completion (requires wait: true)
    cleanup: ['file', 'transcription'],
});
```

### Auto-Cleanup

When using `wait: true` and `fetch_transcript` is not set to `false`, the transcript is automatically fetched and attached to the result before any cleanup runs. This means you can safely use `cleanup: ['file', 'transcription']` and still access the transcript:

```typescript
const transcription = await client.stt.transcribe({
    model: 'stt-async-v4',
    file: buffer,
    wait: true,
    cleanup: ['file', 'transcription'],  // Both are deleted after transcript is fetched
});

// Transcript is pre-fetched and attached to the result
console.log(transcription.transcript?.text);

// No need to call getTranscript() - it's already available
for (const segment of transcription.transcript?.segments() ?? []) {
    console.log(`[${segment.speaker}] ${segment.text}`);
}
```

You can also clean up just the file if you want to keep the transcription record:

```typescript
const transcription = await client.stt.transcribe({
    model: 'stt-async-v4',
    file: buffer,
    wait: true,
    cleanup: ['file'],  // Only delete the uploaded file
});

// Transcript is available via the pre-fetched property
console.log(transcription.transcript?.text);

// Or fetch it again later (transcription record still exists)
const transcript = await transcription.getTranscript();
```

**Note:** The `transcript` property is only available when using `wait: true` and `fetch_transcript` is not set to `false`. When the transcription status is `'error'`, `transcript` will be `null`.

Cleanup runs in all cases when `wait: true`:
- After successful completion (transcript is fetched first)
- After transcription errors (status: 'error')
- On timeout or abort

This ensures no orphaned resources are left behind, even when something goes wrong.

### Create Transcription (without waiting)

```typescript
// From URL
const transcription = await client.stt.create({
    model: 'stt-async-v4',
    audio_url: 'https://example.com/audio.mp3',
});

// From uploaded file
const file = await client.files.upload(buffer);
const transcription = await client.stt.create({
    model: 'stt-async-v4',
    file_id: file.id,
});

// Poll for completion
const completed = await transcription.wait();
```

### List Transcriptions

```typescript
// Get first page
const result = await client.stt.list({ limit: 50 });

// Iterate through all pages automatically
for await (const transcription of result) {
    console.log(transcription.id, transcription.status);
}

// Or access just the first page
for (const transcription of result.transcriptions) {
    console.log(transcription.id);
}
```

### Get Transcription by ID

Returns `null` if the transcription doesn't exist:

```typescript
const transcription = await client.stt.get('transcription-id');
if (transcription) {
    console.log(transcription.status);
}
```

### Get Transcript

Returns `null` if the transcription or transcript doesn't exist:

```typescript
const transcript = await client.stt.getTranscript('transcription-id');
if (transcript) {
    console.log(transcript.text);

    // Access detailed tokens with timing
    for (const token of transcript.tokens) {
        console.log(token.text, token.start_ms, token.end_ms, token.confidence);
    }
}
```

When using `transcribe()` with `wait: true`, the transcript is pre-fetched and cached. Calling `getTranscript()` on the returned transcription returns the cached value without making an HTTP request:

```typescript
const transcription = await client.stt.transcribe({
    model: 'stt-async-v4',
    audio_url: 'https://example.com/audio.mp3',
    wait: true,
});

// Returns cached transcript - no HTTP request
const transcript = await transcription.getTranscript();

// Force re-fetch from API
const freshTranscript = await transcription.getTranscript({ force: true });
```

### Segment Transcript by Speaker/Language

Group tokens into segments by speaker and language changes:

```typescript
const transcript = await client.stt.getTranscript('transcription-id');
if (transcript) {
    // Using the method on SonioxTranscript
    const segments = transcript.segments();

    for (const seg of segments) {
        console.log(`[Speaker ${seg.speaker}][${seg.language}] ${seg.text}`);
        console.log(`  Time: ${seg.start_ms}ms - ${seg.end_ms}ms`);
    }
}

// Or use the standalone function
import { segmentTranscript } from '@soniox/node';

const segments = segmentTranscript(transcript.tokens);
```

Control grouping with the `group_by` option:

```typescript
// Group by speaker only (ignore language changes)
const bySpeaker = transcript.segments({ group_by: ['speaker'] });

// Group by language only (ignore speaker changes)
const byLanguage = transcript.segments({ group_by: ['language'] });

// Group by both (default)
const byBoth = transcript.segments({ group_by: ['speaker', 'language'] });

// No grouping (all tokens in one segment)
const all = transcript.segments({ group_by: [] });
```

Each segment contains:
- `text` - Concatenated text of all tokens
- `start_ms`, `end_ms` - Timing from first/last token
- `speaker` - Speaker ID (if diarization enabled)
- `language` - Language code (if identification enabled)
- `tokens` - Original tokens array

### Delete Transcription

Deletion is idempotent - succeeds even if the transcription doesn't exist:

```typescript
await client.stt.delete('transcription-id');
// or
await transcription.delete();
```

### Destroy Transcription and File

Deletes both transcription and its associated uploaded file. Idempotent - succeeds even if resources don't exist:

```typescript
await transcription.destroy();
// or
await client.stt.destroy('transcription-id');
```

### Wait with AbortController

```typescript
const controller = new AbortController();

// Cancel after 30 seconds
setTimeout(() => controller.abort(), 30000);

try {
    const completed = await transcription.wait({
        signal: controller.signal,
    });
} catch (error) {
    console.log('Wait was aborted or timed out');
}
```

## Webhooks

Configure webhooks to receive notifications when transcriptions complete:

```typescript
const transcription = await client.stt.transcribe({
    model: 'stt-async-v4',
    audio_url: 'https://example.com/audio.mp3',
    webhook_url: 'https://your-server.com/webhook',
    // Both auth headers must be provided together (or neither)
    webhook_auth_header_name: 'X-Webhook-Secret',
    webhook_auth_header_value: 'your-secret-token',
    // Optionally append metadata as query params
    webhook_query: { transcription_id: transcription.id },
});
```

### Handling Webhooks

Use `client.webhooks` to handle incoming webhook requests.

**Authentication** is automatically read from environment variables (`SONIOX_API_WEBHOOK_HEADER` and `SONIOX_API_WEBHOOK_SECRET`). You can also pass explicit auth to override.

#### Express

```typescript
import express from 'express';
import { SonioxNodeClient } from '@soniox/node';

const app = express();
app.use(express.json());

const client = new SonioxNodeClient();

app.post('/webhook', (req, res) => {
    const result = client.webhooks.handleExpress(req);

    res.status(result.status).json(result.ok ? { received: true } : { error: result.error });

    if (result.ok && result.event?.status === 'completed' && result.fetchTranscript) {
        result.fetchTranscript()
            .then((transcript) => console.log('Text:', transcript?.text))
            .catch(console.error);
    }
});
```

#### Fastify

```typescript
import Fastify from 'fastify';
import { SonioxNodeClient } from '@soniox/node';

const fastify = Fastify();
const client = new SonioxNodeClient();

fastify.post('/webhook', (req, reply) => {
    const result = client.webhooks.handleFastify(req);

    reply.status(result.status).send(result.ok ? { received: true } : { error: result.error });

    if (result.ok && result.event?.status === 'completed' && result.fetchTranscript) {
        result.fetchTranscript()
            .then((transcript) => console.log('Text:', transcript?.text))
            .catch(console.error);
    }
});
```

#### Hono

```typescript
import { Hono } from 'hono';
import { SonioxNodeClient } from '@soniox/node';

const app = new Hono();
const client = new SonioxNodeClient();

app.post('/webhook', async (c) => {
    const result = await client.webhooks.handleHono(c);

    if (result.ok && result.event?.status === 'completed' && result.fetchTranscript) {
        result.fetchTranscript()
            .then((transcript) => console.log('Text:', transcript?.text))
            .catch(console.error);
    }

    return c.json(result.ok ? { received: true } : { error: result.error }, result.status);
});
```

#### Fetch API (Bun/Deno/Node 18+)

```typescript
import { SonioxNodeClient } from '@soniox/node';

const client = new SonioxNodeClient();

Bun.serve({
    async fetch(req) {
        if (new URL(req.url).pathname === '/webhook') {
            const result = await client.webhooks.handleRequest(req);

            if (result.ok && result.event?.status === 'completed' && result.fetchTranscript) {
                result.fetchTranscript()
                    .then((transcript) => console.log('Text:', transcript?.text))
                    .catch(console.error);
            }

            return new Response(
                JSON.stringify(result.ok ? { received: true } : { error: result.error }),
                { status: result.status, headers: { 'Content-Type': 'application/json' } }
            );
        }
        return new Response('Not found', { status: 404 });
    },
});
```

### Fetch Helpers

The webhook result includes helpers to fetch transcript or transcription details:

| Helper | Available When | Returns |
| --- | --- | --- |
| `fetchTranscript()` | `status === 'completed'` | Transcript with `text` and `tokens` |
| `fetchTranscription()` | Always (when `ok`) | Full transcription object (useful for error details) |

```typescript
// Handle errors
if (result.event?.status === 'error' && result.fetchTranscription) {
    result.fetchTranscription()
        .then((t) => console.error('Error:', t?.error_type, t?.error_message))
        .catch(console.error);
}
```

### Explicit Auth

Pass auth explicitly to override environment variables:

```typescript
const result = client.webhooks.handleExpress(req, {
    name: 'X-Webhook-Secret',
    value: 'your-secret-token',
});
```

## Models API

List available speech recognition models:

```typescript
const models = await client.models.list();
for (const model of models) {
    console.log(model.id, model.name);
}
```

## Realtime API
WebSocket-based streaming transcription for real-time audio processing

### Quick Start

```typescript
const session = client.realtime.stt({
    model: 'stt-rt-v3',
    audio_format: 'pcm_s16le',
    sample_rate: 16000,
});

session.on('result', (result) => {
    const text = result.tokens.map(t => t.text).join('');
    console.log(text);
});

session.on('endpoint', () => {
    console.log('--- speaker paused ---');
});

await session.connect();

for (const chunk of audioChunks) {
    session.sendAudio(chunk);
}

await session.finish();
```

### Session Configuration

```typescript
const session = client.realtime.stt({
    // Required
    model: 'stt-rt-v3',
    
    // Audio format (default: 'auto')
    audio_format: 'pcm_s16le',  // or 'auto', 'mp3', 'wav', 'webm', 'ogg', 'flac', 'aac', 'aiff', etc.
    sample_rate: 16000,         // Required for PCM formats
    num_channels: 1,
    
    // Language settings
    language_hints: ['en', 'es'],
    language_hints_strict: false,
    
    // Features
    enable_speaker_diarization: true,
    enable_language_identification: true,
    enable_endpoint_detection: true,  // Emits 'endpoint' events
    
    // Context for improved accuracy
    context: {
        text: 'Customer support call about billing',
        terms: ['invoice', 'refund', 'subscription'],
    },
    
    // Translation
    translation: {
        target_languages: ['es'],
    },
    
    // Tracking
    client_reference_id: 'call-123',
}, {
    // SDK options
    signal: abortController.signal,
    keepalive: true,
    keepalive_interval_ms: 5000,
});
```

### Event-Based Consumption

```typescript
// Transcription results
session.on('result', (result) => {
    for (const token of result.tokens) {
        console.log(token.text, token.confidence, token.is_final);
    }
});

// Individual tokens
session.on('token', (token) => {
    process.stdout.write(token.text);
});

// Endpoint detection
session.on('endpoint', () => {
    console.log('\n[endpoint detected]');
});

// Finalization complete
session.on('finalized', () => {
    console.log('[segment finalized]');
});

// Session finished
session.on('finished', () => {
    console.log('[session finished]');
});

// Connection events
session.on('connected', () => console.log('Connected'));
session.on('disconnected', (reason) => console.log('Disconnected:', reason));

// State transitions
session.on('state_change', ({ old_state, new_state }) => {
    console.log(`State: ${old_state} -> ${new_state}`);
});

// Errors
session.on('error', (error) => console.error('Error:', error));
```

### Segment Realtime Tokens

Group realtime tokens into segments by speaker/language changes:

```typescript
import { segmentRealtimeTokens } from '@soniox/node';

session.on('result', (result) => {
    const segments = segmentRealtimeTokens(result.tokens, { final_only: true });

    for (const seg of segments) {
        console.log(`[Speaker ${seg.speaker}] ${seg.text}`);
    }
});
```

Important notes:
- Set `final_only: true` to avoid partial tokens
- Use `group_by: ['speaker']`, `['language']`, or `[]` to control grouping
- `start_ms`/`end_ms` may be undefined if timing is missing

### Rolling Segment Buffer

If you want stable segments during live transcription, use the rolling buffer:

```typescript
import { RealtimeSegmentBuffer } from '@soniox/node';

const buffer = new RealtimeSegmentBuffer({
    final_only: true,
    max_tokens: 2000,
    max_ms: 60000,
});

session.on('result', (result) => {
    const stableSegments = buffer.add(result);
    for (const seg of stableSegments) {
        console.log(`[Speaker ${seg.speaker}] ${seg.text}`);
    }
});
```

Notes:
- The buffer is bounded by `max_tokens` (default 2000) and/or `max_ms`
- Stable segments are emitted when their end time is finalized
- Call `buffer.reset()` to drop all buffered tokens

### Utterance Buffer

Collect segments into utterances for endpoint-driven workflows:

```typescript
import { RealtimeUtteranceBuffer } from '@soniox/node';

const buffer = new RealtimeUtteranceBuffer({
    final_only: true,
    max_tokens: 2000,
});

session.on('result', (result) => {
    buffer.addResult(result);
});

session.on('endpoint', () => {
    const utterance = buffer.markEndpoint();
    if (!utterance) {
        return;
    }
    console.log(utterance.text);
});
```

Notes:
- `markEndpoint()` flushes buffered tokens into a single utterance
- For a more conservative boundary, call `markEndpoint()` on `finalized`

### Async Iterator Consumption

```typescript
await session.connect();

// Start sending audio in background
sendAudioInBackground(session);

// Consume events with for-await-of
for await (const event of session) {
    switch (event.kind) {
        case 'result':
            console.log(event.data.tokens.map(t => t.text).join(''));
            break;
        case 'endpoint':
            console.log('--- endpoint ---');
            break;
        case 'finalized':
            console.log('--- finalized ---');
            break;
        case 'finished':
            console.log('Session complete');
            break;
    }
}
```

### Session Lifecycle

```typescript
// Create session (state: 'idle')
const session = client.realtime.stt({ model: 'stt-rt-v3' });

// Connect (state: 'connecting' → 'connected')
await session.connect();

// Send audio
session.sendAudio(audioChunk);

// Graceful finish (state: 'finishing' → 'finished')
await session.finish();  // Waits for server to confirm

// Or immediate close/cancel (state: 'canceled')
session.close();  // Doesn't wait

// Check state anytime
console.log(session.state);  // 'idle' | 'connecting' | 'connected' | 'finishing' | 'finished' | 'canceled' | 'closed' | 'error'
```

### Pause and Resume

Pause audio transmission while keeping the connection alive:
IMPORTANT: You are still charged for the full stream duration even when audio is paused, not just for the audio processed

To send keepalive continuously while connected (not only when paused), set `keepalive: true`.

```typescript
// Pause - stops sending audio, starts automatic keepalive
session.pause();
console.log(session.paused);  // true

// Audio sent while paused is silently dropped
session.sendAudio(chunk);  // No-op

// Resume - stops keepalive, resumes normal operation
session.resume();
```

### Manual Control Messages

```typescript
// Request finalization of current segment
session.finalize();
session.finalize({ trailing_silence_ms: 300 });

// Send keepalive (automatic during pause)
session.keepAlive();
```

### Cancellation with AbortSignal

```typescript
const controller = new AbortController();

const session = client.realtime.stt(
    { model: 'stt-rt-v3' },
    { signal: controller.signal }
);

// Cancel anytime
controller.abort();

// Operations throw AbortError when cancelled
try {
    await session.connect();
} catch (error) {
    if (error instanceof AbortError) {
        console.log('Connection cancelled');
    }
}
```

### Error Handling

```typescript
import {
    RealtimeError,
    AuthError,
    BadRequestError,
    QuotaError,
    ConnectionError,
    NetworkError,
    AbortError,
    StateError,
} from '@soniox/node';

session.on('error', (error) => {
    if (error instanceof AuthError) {
        console.error('Invalid API key');
    } else if (error instanceof QuotaError) {
        console.error('Rate limit exceeded');
    } else if (error instanceof ConnectionError) {
        console.error('WebSocket connection failed');
    } else if (error instanceof NetworkError) {
        console.error('Server error:', error.code);  // 408, 500, 503
    } else if (error instanceof AbortError) {
        console.error('Cancelled');
    } else if (error instanceof StateError) {
        console.error('Invalid operation for current state');
    }
});
```

### WebSocket Proxy Example

Forward browser WebSocket connections through your server:

```typescript
import { WebSocketServer } from 'ws';

const wss = new WebSocketServer({ port: 8080 });

wss.on('connection', async (clientWs) => {
    const session = client.realtime.stt({
        model: 'stt-rt-v3',
        enable_endpoint_detection: true,
    });

    session.on('result', (result) => {
        clientWs.send(JSON.stringify(result));
    });

    session.on('endpoint', () => {
        clientWs.send(JSON.stringify({ type: 'endpoint' }));
    });

    await session.connect();

    clientWs.on('message', (data) => {
        if (data instanceof Buffer) {
            session.sendAudio(data);
        }
    });

    clientWs.on('close', () => {
        session.close();
    });
});
```

### AI Voice Agent Example

Handle turn-based conversation with endpoint detection:

```typescript
const session = client.realtime.stt({
    model: 'stt-rt-v3',
    enable_endpoint_detection: true,
});

const utteranceBuffer = new RealtimeUtteranceBuffer({ final_only: true });

session.on('result', (result) => {
    utteranceBuffer.addResult(result);
});

session.on('endpoint', async () => {
    // User stopped speaking - process the utterance
    const utterance = utteranceBuffer.markEndpoint();
    const userInput = utterance?.text.trim() ?? '';

    if (userInput) {
        // Pause while processing
        session.pause();
        
        const response = await processWithLLM(userInput);
        await playAudioResponse(response);
        
        // Resume listening
        session.resume();
    }
});

await session.connect();
startMicrophoneCapture(session);
```
