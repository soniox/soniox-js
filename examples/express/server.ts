import path from 'path';

import { SonioxNodeClient } from '@soniox/node';
import express from 'express';

const app = express();
app.use(express.json());

const soniox = new SonioxNodeClient();

// Serve static files
app.get('/', (_req, res) => {
    res.sendFile(path.join(__dirname, 'demo-web.html'));
});

// ============================================================================
// Auth API
// ============================================================================

app.get('/tmp-key', async (_req, res, next) => {
    try {
        const key = await soniox.auth.createTemporaryKey({
            usage_type: 'transcribe_websocket',
            expires_in_seconds: 3600,
        });
        res.json(key);
    } catch (err) { next(err); }
});

// ============================================================================
// Models API
// ============================================================================

app.get('/models', async (_req, res, next) => {
    try {
        const models = await soniox.models.list();
        res.json(models);
    } catch (err) { next(err); }
});

// ============================================================================
// Files API
// ============================================================================

app.post('/files', (req, res, next) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
        const buffer = Buffer.concat(chunks);
        const filename = (req.headers['x-filename'] as string) || 'audio.mp3';
        soniox.files.upload(buffer, { filename })
            .then((file) => res.status(201).json(file))
            .catch(next);
    });
    req.on('error', next);
});

app.get('/files', async (_req, res, next) => {
    try {
        const result = await soniox.files.list();
        const files = [];
        for await (const file of result) {
            files.push(file);
        }
        res.json(files);
    } catch (err) { next(err); }
});

app.get('/files/:id', async (req, res, next) => {
    try {
        const file = await soniox.files.get(req.params.id);
        if (!file) return res.status(404).json({ error: 'File not found' });
        res.json(file);
    } catch (err) { next(err); }
});

app.delete('/files/:id', async (req, res, next) => {
    try {
        await soniox.files.delete(req.params.id);
        res.status(204).end();
    } catch (err) { next(err); }
});

// ============================================================================
// Transcriptions API
// ============================================================================

interface TranscriptionBody {
    audio_url?: string;
    file_id?: string;
    wait?: boolean;
    enable_speaker_diarization?: boolean;
    enable_language_identification?: boolean;
}

app.post('/transcriptions', async (req, res, next) => {
    try {
        const body = req.body as TranscriptionBody;

        if (body.audio_url) {
            const transcription = await soniox.transcriptions.transcribeFromUrl(body.audio_url, {
                model: 'stt-async-v3',
                wait: body.wait,
                enable_speaker_diarization: body.enable_speaker_diarization,
                enable_language_identification: body.enable_language_identification,
            });
            return res.status(201).json(transcription);
        }

        if (body.file_id) {
            const transcription = await soniox.transcriptions.transcribeFromFileId(body.file_id, {
                model: 'stt-async-v3',
                wait: body.wait,
                enable_speaker_diarization: body.enable_speaker_diarization,
                enable_language_identification: body.enable_language_identification,
            });
            return res.status(201).json(transcription);
        }

        return res.status(400).json({ error: 'audio_url or file_id required' });
    } catch (err) { next(err); }
});

app.get('/transcriptions', async (req, res, next) => {
    try {
        const limit = req.query.limit ? Number(req.query.limit) : undefined;
        const result = await soniox.transcriptions.list({ limit });
        res.json({
            transcriptions: result.transcriptions,
            next_page_cursor: result.next_page_cursor,
        });
    } catch (err) { next(err); }
});

app.get('/transcriptions/:id', async (req, res, next) => {
    try {
        const transcription = await soniox.transcriptions.get(req.params.id);
        if (!transcription) return res.status(404).json({ error: 'Transcription not found' });
        res.json(transcription);
    } catch (err) { next(err); }
});

app.get('/transcriptions/:id/transcript', async (req, res, next) => {
    try {
        const transcript = await soniox.transcriptions.getTranscript(req.params.id);
        if (!transcript) return res.status(404).json({ error: 'Transcript not found' });
        res.json({
            id: transcript.id,
            parsed: transcript.segments(),
            text: transcript.text,
            raw: transcript.tokens
        });
    } catch (err) { next(err); }
});

interface WaitBody {
    timeout_ms?: number;
}

app.post('/transcriptions/:id/wait', async (req, res, next) => {
    try {
        const body = req.body as WaitBody;
        const transcription = await soniox.transcriptions.wait(req.params.id, {
            timeout_ms: body.timeout_ms,
        });
        res.json(transcription);
    } catch (err) { next(err); }
});

app.delete('/transcriptions/:id', async (req, res, next) => {
    try {
        await soniox.transcriptions.delete(req.params.id);
        res.status(204).end();
    } catch (err) { next(err); }
});

// ============================================================================
// Webhooks
// ============================================================================

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
        result.fetchTranscript()
            .then((t) => t && console.log('Transcript:', t.text))
            .catch(console.error);
    }
});

// ============================================================================
// Server
// ============================================================================

export { app, soniox };

if (require.main === module) {
    const port = process.env.PORT || 3000;
    app.listen(port, () => {
        console.log(`Soniox Express Demo: http://localhost:${port}`);
    });
}
