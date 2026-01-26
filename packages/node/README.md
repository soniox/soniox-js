# @soniox/node

Official Soniox SDK for Node.js - Speech-to-Text API

## Contents

- [Installation](#installation)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [Temporary API Keys](#temporary-api-keys)
- [Files API](#files-api)
- [Transcriptions API](#transcriptions-api)
- [Webhooks](#webhooks)
- [Models API](#models-api)

## Installation

```bash
npm install @soniox/node
```

## Getting Started

```typescript
import { SonioxNodeClient } from '@soniox/node';

const client = new SonioxNodeClient({
    apiKey: 'your-api-key', // or set SONIOX_API_KEY env var
});
```

## Compact API Reference

**Client**
- `new SonioxNodeClient({ apiKey?, baseURL?, httpClient? })`

**Files**
- `client.files.upload(file, options?)`
- `client.files.list(options?)`
- `client.files.get(fileId | file)`
- `client.files.delete(fileId | file)`

**Transcriptions**
- `client.transcriptions.transcribe(options)` (exactly one of `file`, `file_id`, `audio_url`)
- `client.transcriptions.transcribeFromUrl(audioUrl, options)`
- `client.transcriptions.transcribeFromFile(file, options)`
- `client.transcriptions.transcribeFromFileId(fileId, options)`
- `client.transcriptions.create(options)`
- `client.transcriptions.list(options?)`
- `client.transcriptions.get(id | transcription)`
- `client.transcriptions.getTranscript(id | transcription)`
- `client.transcriptions.wait(id | transcription, options?)`
- `client.transcriptions.delete(id | transcription)`
- `client.transcriptions.destroy(id | transcription)`
- `transcript.segments(options?)` - group tokens by speaker/language
- `segmentTranscript(tokens, options?)` - standalone segmentation utility

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
- `client.realtime.createSession()`

## Environment Variables

The SDK supports the following environment variables:

| Variable | Description | Default |
| --- | --- | --- |
| `SONIOX_API_KEY` | API key for authentication. Used when `apiKey` is not provided in client options. | — |
| `SONIOX_API_BASE_URL` | Base URL for API requests. Used when `baseURL` is not provided in client options. | `https://api.soniox.com` |
| `SONIOX_API_WEBHOOK_HEADER` | Header name for webhook authentication. Used by webhook handlers when `auth` is not provided. | — |
| `SONIOX_API_WEBHOOK_SECRET` | Header value for webhook authentication. Used by webhook handlers when `auth` is not provided. | — |

**Example:**

```bash
export SONIOX_API_KEY=your-api-key
export SONIOX_API_WEBHOOK_HEADER=X-Webhook-Secret
export SONIOX_API_WEBHOOK_SECRET=your-webhook-secret
```

```typescript
// No need to pass apiKey when SONIOX_API_KEY is set
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

## Transcriptions API

### Quick Start with `transcribe()`

The `transcribe()` method is the easiest way to transcribe audio:

```typescript
// Transcribe from URL and wait for completion
const transcription = await client.transcriptions.transcribe({
    model: 'stt-async-v3',
    audio_url: 'https://example.com/audio.mp3',
    wait: true,
});

const transcript = await transcription.getTranscript();
console.log(transcript.text);
```

If you want to avoid the "one-of" audio source options, use the convenience wrappers:

```typescript
const transcription = await client.transcriptions.transcribeFromUrl(
    'https://example.com/audio.mp3',
    { model: 'stt-async-v3', wait: true }
);
```

### Upload and Transcribe in One Call

```typescript
import { readFile } from 'fs/promises';

const buffer = await readFile('recording.mp3');

const transcription = await client.transcriptions.transcribe({
    model: 'stt-async-v3',
    file: buffer,
    filename: 'recording.mp3',
    wait: true,
});

console.log(await transcription.getTranscript());
```

### Transcription Options

```typescript
const transcription = await client.transcriptions.transcribe({
    model: 'stt-async-v3',
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
});
```

### Create Transcription (without waiting)

```typescript
// From URL
const transcription = await client.transcriptions.create({
    model: 'stt-async-v3',
    audio_url: 'https://example.com/audio.mp3',
});

// From uploaded file
const file = await client.files.upload(buffer);
const transcription = await client.transcriptions.create({
    model: 'stt-async-v3',
    file_id: file.id,
});

// Poll for completion
const completed = await transcription.wait();
```

### List Transcriptions

```typescript
// Get first page
const result = await client.transcriptions.list({ limit: 50 });

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
const transcription = await client.transcriptions.get('transcription-id');
if (transcription) {
    console.log(transcription.status);
}
```

### Get Transcript

Returns `null` if the transcription or transcript doesn't exist:

```typescript
const transcript = await client.transcriptions.getTranscript('transcription-id');
if (transcript) {
    console.log(transcript.text);

    // Access detailed tokens with timing
    for (const token of transcript.tokens) {
        console.log(token.text, token.start_ms, token.end_ms, token.confidence);
    }
}
```

### Segment Transcript by Speaker/Language

Group tokens into segments by speaker and language changes:

```typescript
const transcript = await client.transcriptions.getTranscript('transcription-id');
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

Control grouping with the `groupBy` option:

```typescript
// Group by speaker only (ignore language changes)
const bySpeaker = transcript.segments({ groupBy: ['speaker'] });

// Group by language only (ignore speaker changes)
const byLanguage = transcript.segments({ groupBy: ['language'] });

// Group by both (default)
const byBoth = transcript.segments({ groupBy: ['speaker', 'language'] });

// No grouping (all tokens in one segment)
const all = transcript.segments({ groupBy: [] });
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
await client.transcriptions.delete('transcription-id');
// or
await transcription.delete();
```

### Destroy Transcription and File

Deletes both transcription and its associated uploaded file. Idempotent - succeeds even if resources don't exist:

```typescript
await transcription.destroy();
// or
await client.transcriptions.destroy('transcription-id');
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
const transcription = await client.transcriptions.transcribe({
    model: 'stt-async-v3',
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
