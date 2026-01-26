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

    // Respond immediately to acknowledge receipt
    res.status(result.status).json(result.ok ? { received: true } : { error: result.error });

    // Then process in background
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

    // Respond immediately
    reply.status(result.status).send(result.ok ? { received: true } : { error: result.error });

    // Process in background
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

    // Process in background (non-blocking)
    if (result.ok && result.event?.status === 'completed' && result.fetchTranscript) {
        result.fetchTranscript()
            .then((transcript) => console.log('Text:', transcript?.text))
            .catch(console.error);
    }

    // Respond immediately
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

            // Process in background
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
