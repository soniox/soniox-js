import type http from 'http';

import { RealtimeUtteranceBuffer } from '@soniox/node';
import type { WebSocketServer, RawData } from 'ws';
import { WebSocket } from 'ws';

import { getClientForWsRequest } from '../session';

const DEFAULT_RT_MODEL = 'stt-rt-v4';
const DEFAULT_SAMPLE_RATE = 16000;

//
// Push-to-Talk WebSocket
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
//     - { type: "user_message", text }: user's finalized text (for agent flow)
//     - { type: "assistant_chunk", text }: streamed agent response word
//     - { type: "assistant_done", text }: complete agent response
//     - { type: "error", error }
//

// Simulated agent responses for demo purposes
// In a real application, replace this with your LLM/agent of choice
const SIMULATED_RESPONSES = [
  'I heard you say: "{utterance}". This is a simulated response to demonstrate the voice agent workflow.',
  'You said: "{utterance}". In a real application, this would be processed by your AI backend.',
  'Got it! You mentioned: "{utterance}". Replace this mock with your actual agent logic.',
];

async function simulateAgentResponse(userText: string, onChunk: (text: string) => void): Promise<string> {
  const template = SIMULATED_RESPONSES[Math.floor(Math.random() * SIMULATED_RESPONSES.length)];
  const response = template.replace('{utterance}', userText);

  const words = response.split(' ');
  for (let i = 0; i < words.length; i++) {
    const chunk = i === 0 ? words[i] : ' ' + words[i];
    await new Promise((resolve) => setTimeout(resolve, 50 + Math.random() * 100));
    onChunk(chunk);
  }

  return response;
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

export function register(wss: WebSocketServer) {
  wss.on('connection', (clientWs: WebSocket, req: http.IncomingMessage) => {
    console.log('[PTT] New connection');

    let soniox;
    try {
      soniox = getClientForWsRequest(req);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'No API key configured';
      clientWs.send(JSON.stringify({ type: 'error', error: { message } }));
      clientWs.close(4001, 'No API key configured');
      return;
    }

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
        // Use final_only: true since we wait for Soniox to finalize before flushing
        const utteranceBuffer = new RealtimeUtteranceBuffer({ final_only: true });

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
            const text = utterance?.text.trim() ?? '';
            sendJson({
              type: 'utterance',
              text,
              segments: utterance?.segments ?? [],
            });

            // Trigger agent response if there was speech
            if (text) {
              sendJson({ type: 'user_message', text });
              void simulateAgentResponse(text, (chunk) => {
                sendJson({ type: 'assistant_chunk', text: chunk });
              })
                .then((fullResponse) => {
                  sendJson({ type: 'assistant_done', text: fullResponse });
                })
                .catch((err) => {
                  handleError(err);
                });
            }
          }
        });

        session.on('disconnected', (reason) => {
          sendJson({ type: 'disconnected', reason });
        });

        session.on('error', handleError);

        clientWs.on('message', (data: RawData, isBinary: boolean) => {
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
}
