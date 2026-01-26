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
app.post('/webhook', (req, res) => {
    const result = soniox.webhooks.handleExpress(req);

    res.status(result.status).json(result.ok ? { received: true } : { error: result.error });

    if (!result.ok || !result.event) {
        console.error('Webhook error:', result.error);
        return;
    }

    const { id, status } = result.event;
    console.log(`Received webhook for transcription ${id} with status: ${status}`);

    if (status === 'completed' && result.fetchTranscript) {
        result.fetchTranscript()
            .then((transcript) => {
                if (transcript) {
                    console.log('Transcription text:', transcript.text);
                }
            })
            .catch(console.error);
    } else if (status === 'error' && result.fetchTranscription) {
        result.fetchTranscription()
            .then((transcription) => {
                if (transcription) {
                    console.error('Transcription failed:', transcription.error_type, transcription.error_message);
                }
            })
            .catch(console.error);
    }
});

app.listen(port, () => {
    console.log(`Soniox Express Example app listening on port ${port}`)
    console.log(`Webhook endpoint: http://localhost:${port}/webhook`)
})