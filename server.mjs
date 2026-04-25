import http from 'http';
import https from 'https';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { WebSocketServer } from 'ws';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = __dirname;
const PORT = Number(process.env.PORT) || 3333;
const pendingMetaOauth = new Map();

function loadMetaSecrets() {
  const p = path.join(ROOT, 'redes-secrets.json');
  try {
    const raw = fs.readFileSync(p, 'utf8');
    const o = JSON.parse(raw);
    if (o && o.metaAppId && o.metaAppSecret) {
      return { id: String(o.metaAppId).trim(), secret: String(o.metaAppSecret).trim() };
    }
  } catch {
    /* no configurado */
  }
  return null;
}

let metaCached = null;
function getMetaSecrets() {
  if (!metaCached) metaCached = loadMetaSecrets();
  return metaCached;
}

function httpsGetJson(u) {
  return new Promise((resolve, reject) => {
    https
      .get(u, (r) => {
        let b = '';
        r.on('data', (c) => {
          b += c;
        });
        r.on('end', () => {
          try {
            resolve(JSON.parse(b));
          } catch (e) {
            reject(new Error('Respuesta no JSON'));
          }
        });
      })
      .on('error', reject);
  });
}

function buildPostMessageHtml(payload, postMessageTarget) {
  const p = { type: 'redes-meta-ok', ...payload };
  const dataJson = JSON.stringify(p);
  const targetJson = JSON.stringify(postMessageTarget || '*');
  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><title>Meta</title></head>
<body>
<script>
(function() {
  var o = null;
  try { o = window.opener; } catch (e) {}
  var d = ${dataJson};
  if (o) o.postMessage(d, ${targetJson});
  setTimeout(function() { try { window.close(); } catch (e2) {} }, 200);
})();
</script>
<p>Redes (Meta). Puedes cerrar esta ventana.</p>
</body>
</html>`;
}

function cleanupPendingMeta() {
  const now = Date.now();
  for (const [k, v] of pendingMetaOauth) {
    if (v && v.exp < now) pendingMetaOauth.delete(k);
  }
}

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
    if (pathname === '/astro-sync' || pathname === '/astro-sync/') pathname = '/astro-sync.html';

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

function handleInstagramAuthorize(req, res) {
  const sec = getMetaSecrets();
  if (!sec) {
    res.writeHead(503, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(
      '<!DOCTYPE html><html><body><p>Configura <code>redes-secrets.json</code> (copia desde <code>redes-secrets.example.json</code>).</p></body></html>'
    );
    return;
  }
  cleanupPendingMeta();
  const state = crypto.randomBytes(24).toString('hex');
  const ref = req.headers.referer || '';
  let returnOrigin = `http://localhost:${PORT}`;
  try {
    if (ref) {
      returnOrigin = new URL(ref).origin;
    }
  } catch {
    returnOrigin = `http://localhost:${PORT}`;
  }
  const redirectUri = `${returnOrigin}/oauth/meta/callback`;
  pendingMetaOauth.set(state, { exp: Date.now() + 10 * 60 * 1000, returnOrigin, redirectUri });
  const scope = encodeURIComponent('email,public_profile');
  const url = `https://www.facebook.com/v19.0/dialog/oauth?client_id=${encodeURIComponent(sec.id)}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}&response_type=code&scope=${scope}`;
  res.writeHead(302, { Location: url });
  res.end();
}

function handleMetaCallback(req, res, u) {
  const err = u.searchParams.get('error');
  if (err) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(
      buildPostMessageHtml(
        { ok: false, email: '', channel: 'instagram', message: u.searchParams.get('error_description') || err },
        '*'
      )
    );
    return;
  }
  const code = u.searchParams.get('code');
  const state = u.searchParams.get('state');
  if (!code || !state) {
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Faltan parámetros');
    return;
  }
  const rec = pendingMetaOauth.get(state);
  if (!rec || rec.exp < Date.now()) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(
      buildPostMessageHtml(
        { ok: false, message: 'Sesión de autorización expirada. Cierra e intenta de nuevo.', email: '' },
        rec && rec.returnOrigin ? rec.returnOrigin : '*'
      )
    );
    return;
  }
  pendingMetaOauth.delete(state);
  const sec = getMetaSecrets();
  if (!sec) {
    res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(buildPostMessageHtml({ ok: false, message: 'Servidor sin credenciales.' }, rec.returnOrigin));
    return;
  }
  const redirectUri = rec.redirectUri;
  const targetOrigin = rec.returnOrigin;
  const tokenUrl = `https://graph.facebook.com/v19.0/oauth/access_token?client_id=${encodeURIComponent(sec.id)}&client_secret=${encodeURIComponent(
    sec.secret
  )}&code=${encodeURIComponent(code)}&redirect_uri=${encodeURIComponent(redirectUri)}`;
  (async () => {
    let tok;
    try {
      tok = await httpsGetJson(tokenUrl);
    } catch {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(
        buildPostMessageHtml(
          { ok: false, message: 'Error al canjear el token de Meta. Revisa redirect URI y App Secret.', email: '' },
          targetOrigin
        )
      );
      return;
    }
    if (!tok.access_token) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(
        buildPostMessageHtml(
          {
            ok: false,
            message: (tok && tok.error && tok.error.message) || 'Meta no devolvió el token de acceso.',
            email: ''
          },
          targetOrigin
        )
      );
      return;
    }
    const meUrl = `https://graph.facebook.com/me?fields=email&access_token=${encodeURIComponent(tok.access_token)}`;
    let me;
    try {
      me = await httpsGetJson(meUrl);
    } catch {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(
        buildPostMessageHtml(
          { ok: false, message: 'No se pudo leer /me. Concede permisos de correo a la app.', email: '' },
          targetOrigin
        )
      );
      return;
    }
    const email = (me && me.email) || '';
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(buildPostMessageHtml({ ok: true, email, channel: 'instagram' }, targetOrigin));
  })();
}

const server = http.createServer((req, res) => {
  try {
    const u = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    if (u.pathname === '/api/redes/instagram/authorize' && req.method === 'GET') {
      return handleInstagramAuthorize(req, res);
    }
    if (u.pathname === '/oauth/meta/callback' && req.method === 'GET') {
      return handleMetaCallback(req, res, u);
    }
  } catch (e) {
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Error en rutas de redes');
    return;
  }
  serveStatic(req, res);
});
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
