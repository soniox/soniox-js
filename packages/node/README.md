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

## Models API

List available speech recognition models:

```typescript
const models = await client.models.list();
for (const model of models) {
    console.log(model.id, model.name);
}
```
