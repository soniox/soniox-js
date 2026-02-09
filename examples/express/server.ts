import http from 'http';
import path from 'path';

import { SonioxNodeClient } from '@soniox/node';
import express from 'express';
import { WebSocketServer } from 'ws';

import { register as registerAgent } from './routes/agent';
import { register as registerAuth } from './routes/auth';
import { register as registerFiles } from './routes/files';
import { register as registerModels } from './routes/models';
import { register as registerPushToTalk } from './routes/push-to-talk';
import { register as registerRealtime } from './routes/realtime';
import { register as registerTranscriptions } from './routes/transcriptions';
import { register as registerWebhooks } from './routes/webhooks';

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

// Serve built frontend (Vite output)
app.use(express.static(path.join(__dirname, 'public')));

// Register REST routes
registerAuth(app, soniox);
registerModels(app, soniox);
registerFiles(app, soniox);
registerTranscriptions(app, soniox);
registerWebhooks(app, soniox);

// Register WebSocket routes
registerRealtime(wss, soniox);
registerAgent(agentWss, soniox);
registerPushToTalk(pttWss, soniox);

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
