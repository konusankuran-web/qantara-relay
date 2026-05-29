const express = require('express');
const http = require('http');
const WebSocket = require('ws');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server, path: '/ws' });

const TOKEN = process.env.BRIDGE_TOKEN || 'qantara2026';
let nodeSocket = null;
const browserSockets = new Map();

app.get('/health', (req, res) => res.json({ status: 'ok', nodeConnected: !!nodeSocket }));

wss.on('connection', (ws) => {
  ws.on('message', (raw) => {
    try {
      const data = JSON.parse(raw);
      if (data.type === 'register' && data.token === TOKEN) {
        nodeSocket = ws;
        ws.isNode = true;
        ws.send(JSON.stringify({ type: 'registered', node: data.node }));
        console.log(`[${new Date().toISOString()}] Node registered: ${data.node}`);
      } else if (data.type === 'browser') {
        ws.isBrowser = true;
        browserSockets.set(ws, true);
        ws.send(JSON.stringify({ type: 'ready', nodeConnected: !!nodeSocket }));
      } else if (data.type === 'shell' && ws.isBrowser) {
        if (!nodeSocket) {
          ws.send(JSON.stringify({ type: 'result', id: data.id, output: '', error: 'Node not connected', code: -1 }));
          return;
        }
        nodeSocket._pendingSender = ws;
        data._browserId = [...browserSockets.keys()].indexOf(ws);
        nodeSocket.send(JSON.stringify(data));
      } else if (data.type === 'result' && ws.isNode) {
        browserSockets.forEach((_, bws) => {
          if (bws.readyState === WebSocket.OPEN) bws.send(JSON.stringify(data));
        });
      }
    } catch(e) { console.error(e); }
  });
  ws.on('close', () => {
    if (ws.isNode) { nodeSocket = null; console.log('Node disconnected'); }
    if (ws.isBrowser) browserSockets.delete(ws);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Relay running on ${PORT}`));
