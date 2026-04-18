import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer } from 'ws';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = __dirname;
const PORT = Number(process.env.PORT) || 3333;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.fbx': 'application/octet-stream',
  '.obj': 'text/plain; charset=utf-8',
  '.mtl': 'text/plain; charset=utf-8',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm'
};

function serveStatic(req, res) {
  try {
    const u = new URL(req.url || '/', 'http://localhost');
    let pathname = decodeURIComponent(u.pathname);
    if (pathname === '/') pathname = '/index.html';

    const filePath = path.normalize(path.join(ROOT, pathname));
    if (!filePath.startsWith(ROOT)) {
      res.writeHead(403).end();
      return;
    }

    fs.stat(filePath, (err, st) => {
      if (err || !st.isFile()) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('No encontrado');
        return;
      }
      fs.readFile(filePath, (readErr, data) => {
        if (readErr) {
          res.writeHead(500).end();
          return;
        }
        const ext = path.extname(filePath).toLowerCase();
        res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
        res.end(data);
      });
    });
  } catch {
    res.writeHead(400).end();
  }
}

const rooms = new Map();

function addToRoom(gameId, client) {
  if (!rooms.has(gameId)) rooms.set(gameId, new Set());
  rooms.get(gameId).add(client);
}

function removeFromRoom(gameId, client) {
  const set = rooms.get(gameId);
  if (!set) return;
  set.delete(client);
  if (set.size === 0) rooms.delete(gameId);
}

const server = http.createServer(serveStatic);
const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (ws) => {
  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }

    /* Vista dual (astro-sync): mensajes con `tipo` → todos los demás clientes en /ws */
    if (msg.tipo != null) {
      const payload = JSON.stringify(msg);
      for (const client of wss.clients) {
        if (client !== ws && client.readyState === 1) {
          client.send(payload);
        }
      }
      return;
    }

    if (msg.type === 'join' && msg.gameId && msg.playerId) {
      if (ws.gameId) removeFromRoom(ws.gameId, ws);
      ws.gameId = String(msg.gameId);
      ws.playerId = String(msg.playerId);
      addToRoom(ws.gameId, ws);
      return;
    }

    if (msg.type === 'playerUpdate' && msg.gameId && ws.gameId === String(msg.gameId)) {
      const set = rooms.get(ws.gameId);
      if (!set) return;
      const payload = JSON.stringify(msg);
      for (const peer of set) {
        if (peer !== ws && peer.readyState === 1) {
          peer.send(payload);
        }
      }
    }
  });

  ws.on('close', () => {
    if (ws.gameId) removeFromRoom(ws.gameId, ws);
  });
});

server.listen(PORT, () => {
  console.log('Servidor listo: http://localhost:' + PORT + '/');
  console.log('WebSocket: ws://localhost:' + PORT + '/ws');
});
