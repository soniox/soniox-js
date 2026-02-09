import type http from 'http';

import { segmentRealtimeTokens, RealtimeSegmentBuffer, type RealtimeResult, type SegmentGroupKey } from '@soniox/node';
import type { WebSocketServer, RawData } from 'ws';
import { WebSocket } from 'ws';

import { getClientForWsRequest } from '../session';

const DEFAULT_RT_MODEL = 'stt-rt-v4';
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

export function register(wss: WebSocketServer) {
  wss.on('connection', (clientWs: WebSocket, req: http.IncomingMessage) => {
    let soniox;
    try {
      soniox = getClientForWsRequest(req);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'No API key configured';
      clientWs.send(JSON.stringify({ type: 'error', error: { message } }));
      clientWs.close(4001, 'No API key configured');
      return;
    }

    const params = parseQueryParams(req);
    const config = buildRealtimeConfig(params);
    const session = soniox.realtime.stt(config);
    const pendingAudio: Buffer<ArrayBufferLike>[] = [];
    let connected = false;

    // Create segment buffer if using buffer mode
    const segmentBuffer =
      params.segmentMode === 'buffer'
        ? new RealtimeSegmentBuffer({ group_by: params.groupBy, final_only: true })
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
            group_by: params.groupBy,
            final_only: true,
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
      if (segmentBuffer) {
        const endpointSegments = segmentBuffer.flushAll();
        sendJson({ type: 'endpoint', segments: endpointSegments });
      } else {
        sendJson({ type: 'endpoint' });
      }
    });

    session.on('disconnected', (reason) => {
      sendJson({ type: 'disconnected', reason });
    });

    session.on('error', (error) => {
      handleError(error);
    });

    clientWs.on('message', (data: RawData, isBinary: boolean) => {
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
}
