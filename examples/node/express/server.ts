import type { SonioxNodeClientOptions } from '@soniox/node';
import { SonioxNodeClient } from '@soniox/node';
import express from 'express'

const app = express()
const port = 3000

app.use(express.json())

const sonioxOptions: SonioxNodeClientOptions = {}

const soniox = new SonioxNodeClient(sonioxOptions);

app.get('/', (req, res) => {
    res.send('Hello World!')
})

app.get('/tmp-key', async (req, res) => {
    const key = await soniox.auth.createTemporaryKey({
        usage_type: 'transcribe_websocket',
        expires_in_seconds: 3600,
    });
    res.json(key);
});

/**
 * Webhook endpoint for receiving transcription status notifications
 */
app.post('/webhook', async (req, res) => {
    // Handle the webhook using the SDK's built-in handler
    const result = soniox.webhooks.handleExpress(req);

    if (!result.ok) {
        console.error('Webhook error:', result.error);
        res.status(result.status).json({ error: result.error });
        return;
    }

    // The webhook event contains the transcription ID and status
    const event = result.event;
    if (!event) {
        res.status(500).json({ error: 'Unexpected: event missing' });
        return;
    }

    const { id, status } = event;
    console.log(`Received webhook for transcription ${id} with status: ${status}`);

    if (status === 'completed') {
        // Transcription completed successfully - fetch the transcript
        try {
            const transcript = await soniox.transcriptions.getTranscript(id);
            if (transcript) {
                console.log('Transcription text:', transcript.text);

                // Access detailed token information if needed
                // transcript.tokens contains timing and confidence data
            }

            // Process the transcription result as needed
            // e.g., save to database, notify users, etc.
        } catch (error) {
            console.error('Failed to fetch transcript:', error);
        }
    } else if (status === 'error') {
        // Transcription failed - handle the error
        try {
            const transcription = await soniox.transcriptions.get(id);
            if (transcription) {
                console.error('Transcription failed:', {
                    error_type: transcription.error_type,
                    error_message: transcription.error_message,
                });
            }

            // Handle the failure as needed
            // e.g., retry, notify admins, etc.
        } catch (error) {
            console.error('Failed to fetch transcription error details:', error);
        }
    }

    // Always respond with 200 to acknowledge receipt
    res.status(result.status).json({ received: true });
});

app.listen(port, () => {
    console.log(`Soniox Express Example app listening on port ${port}`)
    console.log(`Webhook endpoint: http://localhost:${port}/webhook`)
})