import type http from 'http';

import { RealtimeUtteranceBuffer, type RealtimeResult } from '@soniox/node';
import type { WebSocketServer, RawData } from 'ws';
import { WebSocket } from 'ws';

import { getClientForWsRequest } from '../session';

const DEFAULT_RT_MODEL = 'stt-rt-v4';
const DEFAULT_SAMPLE_RATE = 16000;

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

async function simulateAgentResponse(userText: string, onChunk: (text: string) => void): Promise<string> {
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
    console.log('[Agent] New connection');

    let soniox;
    try {
      soniox = getClientForWsRequest(req);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'No API key configured';
      clientWs.send(JSON.stringify({ type: 'error', error: { message } }));
      clientWs.close(4001, 'No API key configured');
      return;
    }

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
        const utteranceBuffer = new RealtimeUtteranceBuffer({ final_only: true });

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

        clientWs.on('message', (data: RawData, isBinary: boolean) => {
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
}
