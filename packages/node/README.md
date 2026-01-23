# @soniox/node

Official Soniox SDK for Node.js - Speech-to-Text API

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

// Get file by ID
const file = await client.files.get('file-id');

// Delete a file
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
    model: 'soniox-precision',
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
    model: 'soniox-precision',
    file: buffer,
    filename: 'recording.mp3',
    wait: true,
});

console.log(await transcription.getTranscript());
```

### Transcription Options

```typescript
const transcription = await client.transcriptions.transcribe({
    model: 'soniox-precision',
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
    model: 'soniox-precision',
    audio_url: 'https://example.com/audio.mp3',
});

// From uploaded file
const file = await client.files.upload(buffer);
const transcription = await client.transcriptions.create({
    model: 'soniox-precision',
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

```typescript
const transcription = await client.transcriptions.get('transcription-id');
console.log(transcription.status);
```

### Get Transcript

```typescript
const transcript = await client.transcriptions.getTranscript('transcription-id');
console.log(transcript.text);

// Access detailed tokens with timing
for (const token of transcript.tokens) {
    console.log(token.text, token.start_ms, token.end_ms, token.confidence);
}
```

### Delete Transcription

```typescript
await client.transcriptions.delete('transcription-id');
// or
await transcription.delete();
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

## Models API

List available speech recognition models:

```typescript
const models = await client.models.list();
for (const model of models) {
    console.log(model.id, model.name);
}
```
