# @soniox/client

Official Soniox Web SDK for client-side applications.

[Full Web SDK Documentation](https://soniox.com/docs/stt/SDKs/web-sdk)

## Installation

```bash
npm install @soniox/client
```

## Quick Start

```typescript
import { SonioxClient } from '@soniox/client';

// Create a client and fetch temporary API key from your backend
const client = new SonioxClient({
  api_key: async () => {
    const res = await fetch('/api/get-temporary-key', { method: 'POST' });
    const { api_key } = await res.json();
    return api_key;
  },
});
```

For the full documentation please go to our docs: [Full Web SDK Documentation](https://soniox.com/docs/stt/SDKs/web-sdk)
