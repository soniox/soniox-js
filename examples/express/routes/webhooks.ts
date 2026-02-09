import type { SonioxNodeClient } from '@soniox/node';
import type { Express } from 'express';

export function register(app: Express, soniox: SonioxNodeClient) {
  app.post('/webhook', (req, res) => {
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
