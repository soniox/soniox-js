import type { Express } from 'express';

import { getClientForRequest } from '../session';

export function register(app: Express) {
  app.post('/webhook', (req, res) => {
    const soniox = getClientForRequest(req);
    const result = soniox.webhooks.handleExpress(req);
    res.status(result.status).json(result.ok ? { received: true } : { error: result.error });

    if (!result.ok || !result.event) {
      console.error('Webhook error:', result.error);
      return;
    }

    const { id, status } = result.event;
    console.log(`Webhook: transcription ${id} status=${status}`);

    if (status === 'completed' && result.fetchTranscript) {
      result
        .fetchTranscript()
        .then((t) => t && console.log('Transcript:', t.text))
        .catch(console.error);
    }
  });
}
