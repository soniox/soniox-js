# @soniox/node

Official Soniox SDK for Node

[Full Node SDK Documentation](https://soniox.com/docs/stt/SDKs/node-SDK)

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

## Environment variables

`SonioxNodeClient` reads the following environment variables when the
corresponding constructor option is not provided:

| Variable              | Maps to option         | Notes                                                        |
| --------------------- | ---------------------- | ------------------------------------------------------------ |
| `SONIOX_API_KEY`      | `api_key`              | Required if `api_key` is not passed explicitly.              |
| `SONIOX_REGION`       | `region`               | Only `'eu'` and `'jp'` are defined; US is the default.       |
| `SONIOX_BASE_DOMAIN`  | `base_domain`          | Overrides `region` and forms the default hosts.              |
| `SONIOX_API_BASE_URL` | `base_url`             | Overrides the REST API host (e.g. `https://api.soniox.com`). |
| `SONIOX_WS_URL`       | `realtime.ws_base_url` | Overrides the STT realtime WebSocket URL.                    |
| `SONIOX_TTS_API_URL`  | `tts_api_url`          | Overrides the REST TTS host.                                 |
| `SONIOX_TTS_WS_URL`   | `realtime.tts_ws_url`  | Overrides the TTS realtime WebSocket URL.                    |

Resolution precedence for every setting is:

1. Explicit option passed to `new SonioxNodeClient({ ... })`.
2. Environment variable from the table above.
3. Value derived from `region` / `base_domain`.
4. Root default (United States).

## Error handling

REST calls (including REST TTS) throw `SonioxHttpError` on non-2xx
responses, network failures, and aborted requests.

```typescript
import { SonioxNodeClient, SonioxHttpError } from '@soniox/node';

try {
  const audio = await client.tts.generate({
    text: 'Hello',
    voice: 'Adrian',
    language: 'en',
  });
} catch (err) {
  if (err instanceof SonioxHttpError) {
    console.error(err.code, err.statusCode, err.bodyText);
  }
}
```

For the full documentation please go to our docs: [Full Node SDK Documentation](https://soniox.com/docs/stt/SDKs/node-SDK)
