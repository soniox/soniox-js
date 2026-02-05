import http from 'http';
import path from 'path';

import {
    SonioxNodeClient,
    segmentRealtimeTokens,
    RealtimeSegmentBuffer,
    RealtimeUtteranceBuffer,
    type RealtimeResult,
    type SegmentGroupKey,
} from '@soniox/node';
import express from 'express';
import { WebSocketServer, WebSocket } from 'ws';

const app = express();
app.use(express.json());

const soniox = new SonioxNodeClient();
const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true });
const agentWss = new WebSocketServer({ noServer: true });
const pttWss = new WebSocketServer({ noServer: true });

// Log WebSocket server errors
wss.on('error', (err) => console.error('[WS /realtime] Server error:', err));
agentWss.on('error', (err) => console.error('[WS /agent] Server error:', err));
pttWss.on('error', (err) => console.error('[WS /push-to-talk] Server error:', err));

// Handle WebSocket upgrades manually
server.on('upgrade', (request, socket, head) => {
    const { pathname } = new URL(request.url ?? '', `http://${request.headers.host}`);

    if (pathname === '/realtime') {
        wss.handleUpgrade(request, socket, head, (ws) => {
            wss.emit('connection', ws, request);
        });
    } else if (pathname === '/agent') {
        agentWss.handleUpgrade(request, socket, head, (ws) => {
            agentWss.emit('connection', ws, request);
        });
    } else if (pathname === '/push-to-talk') {
        pttWss.handleUpgrade(request, socket, head, (ws) => {
            pttWss.emit('connection', ws, request);
        });
    } else {
        socket.destroy();
    }
});

const DEFAULT_RT_MODEL = 'stt-rt-v3';
const DEFAULT_SAMPLE_RATE = 16000;

type SegmentMode = 'raw' | 'segments' | 'buffer';

type RealtimeQueryParams = {
    model: string;
    language: string | undefined;
    endpoint: boolean;
    diarization: boolean;
    languageId: boolean;
    segmentMode: SegmentMode;
    groupBy: SegmentGroupKey[];
};

function parseQueryParams(req: http.IncomingMessage): RealtimeQueryParams {
    const url = new URL(req.url ?? '', `http://${req.headers.host ?? 'localhost'}`);
    const model = url.searchParams.get('model') || DEFAULT_RT_MODEL;
    const language = url.searchParams.get('language') || undefined;
    const endpoint = url.searchParams.get('endpoint') !== 'false';
    const diarization = url.searchParams.get('diarization') === 'true';
    const languageId = url.searchParams.get('languageId') === 'true';
    const segmentMode = (url.searchParams.get('segmentMode') || 'raw') as SegmentMode;
    const groupByParam = url.searchParams.get('groupBy');
    const groupBy: SegmentGroupKey[] = groupByParam
        ? (groupByParam.split(',').filter(Boolean) as SegmentGroupKey[])
        : ['speaker', 'language'];

    return { model, language, endpoint, diarization, languageId, segmentMode, groupBy };
}

function buildRealtimeConfig(params: RealtimeQueryParams) {
    return {
        model: params.model,
        audio_format: 'pcm_s16le' as const,
        sample_rate: DEFAULT_SAMPLE_RATE,
        num_channels: 1,
        enable_endpoint_detection: params.endpoint,
        enable_speaker_diarization: params.diarization,
        enable_language_identification: params.languageId,
        language_hints: params.language ? [params.language] : undefined,
    };
}

function serializeError(error: unknown) {
    if (error instanceof Error) {
        const withCode = error as Error & { code?: number };
        return {
            name: error.name,
            message: error.message,
            code: withCode.code,
        };
    }

    return { name: 'Error', message: 'Unknown error' };
}

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
            const transcription = await soniox.stt.transcribeFromUrl(body.audio_url, {
                model: 'stt-async-v4',
                wait: body.wait,
                enable_speaker_diarization: body.enable_speaker_diarization,
                enable_language_identification: body.enable_language_identification,
            });
            return res.status(201).json(transcription);
        }

        if (body.file_id) {
            const transcription = await soniox.stt.transcribeFromFileId(body.file_id, {
                model: 'stt-async-v4',
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
        const result = await soniox.stt.list({ limit });
        res.json({
            transcriptions: result.transcriptions,
            next_page_cursor: result.next_page_cursor,
        });
    } catch (err) { next(err); }
});

app.get('/transcriptions/:id', async (req, res, next) => {
    try {
        const transcription = await soniox.stt.get(req.params.id);
        if (!transcription) return res.status(404).json({ error: 'Transcription not found' });
        res.json(transcription);
    } catch (err) { next(err); }
});

app.get('/transcriptions/:id/transcript', async (req, res, next) => {
    try {
        const transcript = await soniox.stt.getTranscript(req.params.id);
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
        const transcription = await soniox.stt.wait(req.params.id, {
            timeout_ms: body.timeout_ms,
        });
        res.json(transcription);
    } catch (err) { next(err); }
});

app.delete('/transcriptions/:id', async (req, res, next) => {
    try {
        await soniox.stt.delete(req.params.id);
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
// Realtime WebSocket Proxy
// ============================================================================

wss.on('connection', (clientWs: WebSocket, req: http.IncomingMessage) => {
    const params = parseQueryParams(req);
    const config = buildRealtimeConfig(params);
    const session = soniox.realtime.stt(config);
    const pendingAudio: Buffer<ArrayBufferLike>[] = [];
    let connected = false;

    // Create segment buffer if using buffer mode
    const segmentBuffer = params.segmentMode === 'buffer'
        ? new RealtimeSegmentBuffer({ groupBy: params.groupBy, finalOnly: true })
        : null;

    const sendJson = (payload: Record<string, unknown>) => {
        if (clientWs.readyState === WebSocket.OPEN) {
            clientWs.send(JSON.stringify(payload));
        }
    };

    const handleError = (error: unknown) => {
        sendJson({ type: 'error', error: serializeError(error) });
    };

    const handleResult = (result: RealtimeResult) => {
        switch (params.segmentMode) {
            case 'segments': {
                // Stateless segmentation - segment current result tokens
                const segments = segmentRealtimeTokens(result.tokens, {
                    groupBy: params.groupBy,
                    finalOnly: true,
                });
                sendJson({ type: 'result', result, segments });
                break;
            }
            case 'buffer': {
                // Rolling buffer - emit stable segments only
                const stableSegments = segmentBuffer!.add(result);
                sendJson({
                    type: 'result',
                    result,
                    segments: stableSegments,
                    bufferSize: segmentBuffer!.size,
                });
                break;
            }
            default:
                // Raw mode - send tokens as-is
                sendJson({ type: 'result', result });
        }
    };

    session.on('result', handleResult);

    session.on('endpoint', () => {
        sendJson({ type: 'endpoint' });
    });

    session.on('disconnected', (reason) => {
        sendJson({ type: 'disconnected', reason });
    });

    session.on('error', (error) => {
        handleError(error);
    });

    clientWs.on('message', (data: WebSocket.RawData, isBinary: boolean) => {
        if (isBinary) {
            const chunk = data instanceof Buffer ? data : Buffer.from(data as ArrayBuffer);
            if (!connected) {
                pendingAudio.push(chunk as Buffer<ArrayBufferLike>);
                return;
            }
            try {
                session.sendAudio(chunk);
            } catch (error) {
                handleError(error);
            }
            return;
        }

        const text = typeof data === 'string' ? data : Buffer.from(data as ArrayBuffer).toString();
        try {
            const message = JSON.parse(text) as { type?: string; trailing_silence_ms?: number };
            if (message.type === 'finalize') {
                session.finalize({ trailing_silence_ms: message.trailing_silence_ms });
            } else if (message.type === 'finish') {
                session
                    .finish()
                    .then(() => clientWs.close(1000, 'finished'))
                    .catch(handleError);
            } else if (message.type === 'pause') {
                session.pause();
            } else if (message.type === 'resume') {
                session.resume();
            }
        } catch {
            // Ignore non-JSON control messages
        }
    });

    clientWs.on('close', () => {
        session.close();
    });

    clientWs.on('error', () => {
        session.close();
    });

    void (async () => {
        try {
            await session.connect();
            connected = true;
            sendJson({
                type: 'connected',
                config,
                segmentMode: params.segmentMode,
                groupBy: params.groupBy,
            });
            for (const chunk of pendingAudio) {
                session.sendAudio(chunk);
            }
            pendingAudio.length = 0;
        } catch (error) {
            handleError(error);
            clientWs.close(1011, 'Failed to connect to Soniox');
        }
    })();
});

// ============================================================================
// Agent WebSocket (Voice AI Demo)
// ============================================================================

type AgentState = 'listening' | 'endpoint_detected' | 'processing' | 'responding';

type AgentQueryParams = {
    model: string;
    language: string | undefined;
};

function parseAgentQueryParams(req: http.IncomingMessage): AgentQueryParams {
    const url = new URL(req.url ?? '', `http://${req.headers.host ?? 'localhost'}`);
    return {
        model: url.searchParams.get('model') || DEFAULT_RT_MODEL,
        language: url.searchParams.get('language') || undefined,
    };
}

// Simulated agent responses for demo purposes
// In a real application, replace this with your LLM/agent of choice
const SIMULATED_RESPONSES = [
    'I heard you say: "{utterance}". This is a simulated response to demonstrate the voice agent workflow.',
    'You said: "{utterance}". In a real application, this would be processed by your AI backend.',
    'Got it! You mentioned: "{utterance}". Replace this mock with your actual agent logic.',
];

async function simulateAgentResponse(
    userText: string,
    onChunk: (text: string) => void
): Promise<string> {
    // Pick a random response template
    const template = SIMULATED_RESPONSES[Math.floor(Math.random() * SIMULATED_RESPONSES.length)];
    const response = template.replace('{utterance}', userText);

    // Simulate streaming with random delays (50-150ms per word)
    const words = response.split(' ');
    for (let i = 0; i < words.length; i++) {
        const chunk = i === 0 ? words[i] : ' ' + words[i];
        await new Promise((resolve) => setTimeout(resolve, 50 + Math.random() * 100));
        onChunk(chunk);
    }

    return response;
}

agentWss.on('connection', (clientWs: WebSocket, req: http.IncomingMessage) => {
    console.log('[Agent] New connection');

    // Wrap entire handler in async IIFE with error handling
    (async () => {
        try {
            const params = parseAgentQueryParams(req);
            console.log('[Agent] Params:', { model: params.model });

            // STT session config - endpoint detection is required for agent mode
            const sttConfig = {
                model: params.model,
                audio_format: 'pcm_s16le' as const,
                sample_rate: DEFAULT_SAMPLE_RATE,
                num_channels: 1,
                enable_endpoint_detection: true,
                language_hints: params.language ? [params.language] : undefined,
            };

            const session = soniox.realtime.stt(sttConfig);
    const pendingAudio: Buffer<ArrayBufferLike>[] = [];
    let connected = false;
    let currentState: AgentState = 'listening';

    // Conversation history for multi-turn
    const conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }> = [];

    // Buffer to collect utterances for endpoint-driven workflow
    const utteranceBuffer = new RealtimeUtteranceBuffer({ finalOnly: true });

    const sendJson = (payload: Record<string, unknown>) => {
        if (clientWs.readyState === WebSocket.OPEN) {
            clientWs.send(JSON.stringify(payload));
        }
    };

    const sendState = (state: AgentState) => {
        currentState = state;
        sendJson({ type: 'state', state });
    };

    const handleError = (error: unknown) => {
        sendJson({ type: 'error', error: serializeError(error) });
    };

    const handleEndpoint = async () => {
        try {
            sendState('endpoint_detected');

            // Pause STT while processing
            session.pause();
            sendJson({ type: 'stt_paused' });

            const utterance = utteranceBuffer.markEndpoint();
            const userText = utterance?.text.trim() ?? '';

            if (!userText) {
                // No speech detected, resume listening
                sendState('listening');
                session.resume();
                sendJson({ type: 'stt_resumed' });
                return;
            }

            // Send user message to client
            sendJson({ type: 'user_message', text: userText });
            conversationHistory.push({ role: 'user', content: userText });

            sendState('processing');
            sendState('responding');

            // Simulate agent response (replace with your LLM/agent in production)
            const fullResponse = await simulateAgentResponse(userText, (chunk) => {
                sendJson({ type: 'assistant_chunk', text: chunk });
            });

            // Store assistant response in history
            conversationHistory.push({ role: 'assistant', content: fullResponse });
            sendJson({ type: 'assistant_done', text: fullResponse });
        } catch (error) {
            console.error('Agent endpoint error:', error);
            handleError(error);
        } finally {
            // Always resume listening
            if (clientWs.readyState === WebSocket.OPEN) {
                sendState('listening');
                session.resume();
                sendJson({ type: 'stt_resumed' });
            }
        }
    };

    // Handle STT results - collect segments and send partial text
    session.on('result', (result: RealtimeResult) => {
        utteranceBuffer.addResult(result);

        // Send partial text for live display
        const partialText = result.tokens.map((t) => t.text).join('');
        if (partialText) {
            sendJson({ type: 'partial', text: partialText });
        }
    });

    // Handle endpoint - user finished speaking
    session.on('endpoint', () => {
        void handleEndpoint();
    });

    session.on('disconnected', (reason) => {
        console.log('[Agent] STT disconnected:', reason);
        sendJson({ type: 'disconnected', reason });
    });

    session.on('error', (error) => {
        console.error('[Agent] STT error:', error);
        handleError(error);
    });

    clientWs.on('message', (data: WebSocket.RawData, isBinary: boolean) => {
        if (isBinary) {
            const chunk = data instanceof Buffer ? data : Buffer.from(data as ArrayBuffer);
            if (!connected) {
                pendingAudio.push(chunk as Buffer<ArrayBufferLike>);
                return;
            }
            // Only send audio if we're in listening state
            if (currentState === 'listening') {
                try {
                    session.sendAudio(chunk);
                } catch (error) {
                    handleError(error);
                }
            }
            return;
        }

        const text = typeof data === 'string' ? data : Buffer.from(data as ArrayBuffer).toString();
        try {
            const message = JSON.parse(text) as { type?: string };
            if (message.type === 'finish') {
                session
                    .finish()
                    .then(() => clientWs.close(1000, 'finished'))
                    .catch(handleError);
            } else if (message.type === 'clear_history') {
                conversationHistory.length = 0;
                sendJson({ type: 'history_cleared' });
            }
        } catch {
            // Ignore non-JSON messages
        }
    });

    clientWs.on('close', (code, reason) => {
        console.log('[Agent] Client WebSocket closed:', code, reason?.toString());
        session.close();
    });

    clientWs.on('error', (err) => {
        console.error('[Agent] Client WebSocket error:', err);
        session.close();
    });

    console.log('[Agent] Connecting to Soniox...');
    await session.connect();
    console.log('[Agent] Connected to Soniox');
    connected = true;
    sendJson({
        type: 'connected',
        config: {
            sttModel: params.model,
            language: params.language,
        },
    });
    sendState('listening');
    sendJson({ type: 'stt_resumed' });

    for (const chunk of pendingAudio) {
        session.sendAudio(chunk);
    }
    pendingAudio.length = 0;

        } catch (error) {
            console.error('[Agent] Connection error:', error);
            if (clientWs.readyState === WebSocket.OPEN) {
                clientWs.send(JSON.stringify({ type: 'error', error: serializeError(error) }));
                clientWs.close(1011, 'Failed to connect to Soniox');
            }
        }
    })().catch((error: unknown) => {
        console.error('[Agent] Unhandled error:', error);
        if (clientWs.readyState === WebSocket.OPEN) {
            clientWs.close(1011, 'Internal error');
        }
    });
});

// ============================================================================
// Push-to-Talk WebSocket
// ============================================================================
//
// This example demonstrates RealtimeUtteranceBuffer with manual endpoint control.
// Unlike the /agent endpoint which uses server-side endpoint detection, here the
// client controls when an utterance ends by sending "stop" (e.g., releasing a button).
//
// Protocol:
//   Client -> Server:
//     - Binary: audio chunks (only processed while recording)
//     - { type: "start" }: begin recording
//     - { type: "stop" }: end recording, flush utterance
//     - { type: "finish" }: close session
//
//   Server -> Client:
//     - { type: "connected", config }
//     - { type: "recording", active: boolean }
//     - { type: "partial", text }: live transcription while recording
//     - { type: "utterance", text, segments }: complete utterance after "stop"
//     - { type: "error", error }
//

pttWss.on('connection', (clientWs: WebSocket, req: http.IncomingMessage) => {
    console.log('[PTT] New connection');

    (async () => {
        try {
            const url = new URL(req.url ?? '', `http://${req.headers.host ?? 'localhost'}`);
            const model = url.searchParams.get('model') || DEFAULT_RT_MODEL;
            const language = url.searchParams.get('language') || undefined;

            // Key difference: endpoint detection is DISABLED
            // The client controls when utterances end via "stop" message
            const session = soniox.realtime.stt({
                model,
                audio_format: 'pcm_s16le',
                sample_rate: DEFAULT_SAMPLE_RATE,
                num_channels: 1,
                enable_endpoint_detection: false, // <-- Manual control
                language_hints: language ? [language] : undefined,
            });

            const pendingAudio: Buffer<ArrayBufferLike>[] = [];
            let connected = false;
            let recording = false;
            let waitingForFinalize = false;

            // UtteranceBuffer collects tokens; we flush after finalization
            // Use finalOnly: true since we wait for Soniox to finalize before flushing
            const utteranceBuffer = new RealtimeUtteranceBuffer({ finalOnly: true });

            const sendJson = (payload: Record<string, unknown>) => {
                if (clientWs.readyState === WebSocket.OPEN) {
                    clientWs.send(JSON.stringify(payload));
                }
            };

            const handleError = (error: unknown) => {
                sendJson({ type: 'error', error: serializeError(error) });
            };

            // Collect tokens for live partial display
            session.on('result', (result) => {
                utteranceBuffer.addResult(result);

                // Send partial text while recording (include all tokens for live feedback)
                if (recording || waitingForFinalize) {
                    const partialText = result.tokens.map((t) => t.text).join('');
                    if (partialText) {
                        sendJson({ type: 'partial', text: partialText });
                    }
                }
            });

            // Finalized event: Soniox has processed all audio up to finalize() call
            session.on('finalized', () => {
                if (waitingForFinalize) {
                    waitingForFinalize = false;
                    const utterance = utteranceBuffer.markEndpoint();
                    sendJson({
                        type: 'utterance',
                        text: utterance?.text.trim() ?? '',
                        segments: utterance?.segments ?? [],
                    });
                }
            });

            session.on('disconnected', (reason) => {
                sendJson({ type: 'disconnected', reason });
            });

            session.on('error', handleError);

            clientWs.on('message', (data: WebSocket.RawData, isBinary: boolean) => {
                if (isBinary) {
                    const chunk = data instanceof Buffer ? data : Buffer.from(data as ArrayBuffer);
                    if (!connected) {
                        pendingAudio.push(chunk as Buffer<ArrayBufferLike>);
                        return;
                    }
                    // Only process audio while recording
                    if (recording) {
                        try {
                            session.sendAudio(chunk);
                        } catch (error) {
                            handleError(error);
                        }
                    }
                    return;
                }

                const text = typeof data === 'string' ? data : Buffer.from(data as ArrayBuffer).toString();
                try {
                    const message = JSON.parse(text) as { type?: string };

                    if (message.type === 'start') {
                        // Button pressed - start recording
                        recording = true;
                        waitingForFinalize = false;
                        utteranceBuffer.reset(); // Clear any previous data
                        sendJson({ type: 'recording', active: true });
                    } else if (message.type === 'stop') {
                        // Button released - stop recording and request finalization
                        recording = false;
                        sendJson({ type: 'recording', active: false });
                        sendJson({ type: 'finalizing' }); // Indicate we're waiting for finalization

                        // Tell Soniox to finalize any pending audio
                        // The 'finalized' event will trigger when complete
                        waitingForFinalize = true;
                        session.finalize();
                    } else if (message.type === 'finish') {
                        session
                            .finish()
                            .then(() => clientWs.close(1000, 'finished'))
                            .catch(handleError);
                    }
                } catch {
                    // Ignore non-JSON messages
                }
            });

            clientWs.on('close', () => session.close());
            clientWs.on('error', () => session.close());

            await session.connect();
            connected = true;
            sendJson({
                type: 'connected',
                config: { model, language, endpointDetection: false },
            });

            for (const chunk of pendingAudio) {
                if (recording) session.sendAudio(chunk);
            }
            pendingAudio.length = 0;
        } catch (error) {
            console.error('[PTT] Connection error:', error);
            clientWs.close(1011, 'Failed to connect');
        }
    })().catch((error) => {
        console.error('[PTT] Unhandled error:', error);
        if (clientWs.readyState === WebSocket.OPEN) {
            clientWs.close(1011, 'Internal error');
        }
    });
});

// ============================================================================
// Server
// ============================================================================

export { app, server, soniox };

if (require.main === module) {
    const port = process.env.PORT || 3000;
    server.listen(port, () => {
        console.log(`Soniox Express Demo: http://localhost:${port}`);
        console.log(`  - Transcription WebSocket: ws://localhost:${port}/realtime`);
        console.log(`  - Agent WebSocket: ws://localhost:${port}/agent`);
        console.log(`  - Push-to-Talk WebSocket: ws://localhost:${port}/push-to-talk`);
    });
}
