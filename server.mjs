import 'dotenv/config';
import http from 'http';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { WebSocketServer } from 'ws';
import { createMysqlPool } from './db/mysql-pool.mjs';
import { createJugadoresRepo } from './db/jugadores-repo.mjs';
import { httpsGetJson, assertUserTokenForApp, fetchMetaMe } from './lib/meta-graph.mjs';
import { createComunidadHandlers } from './api/comunidad-handlers.mjs';
import { handleComunidadShareOgIfNeeded } from './api/comunidad-share-og.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = __dirname;
const PORT = Number(process.env.PORT) || 3333;
const pendingMetaOauth = new Map();

const mysqlPool = createMysqlPool();
const jugadoresRepo = mysqlPool ? createJugadoresRepo(mysqlPool) : null;
const comunidadHandlers = mysqlPool && jugadoresRepo
  ? createComunidadHandlers({ pool: mysqlPool, jugadoresRepo, getMetaSecrets, ROOT })
  : null;
if (jugadoresRepo) {
  console.log('[scores] MySQL: tabla jugadores (MYSQL_HOST=' + process.env.MYSQL_HOST + ')');
} else {
  console.log('[scores] JSON local: data/scores-meta.json (define MYSQL_HOST para usar MySQL)');
}

const DATA_DIR = path.join(ROOT, 'data');
const SCORES_DB_PATH = path.join(DATA_DIR, 'scores-meta.json');

function ensureDataDir() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  } catch {
    /* no-op */
  }
}

function loadScoresDb() {
  ensureDataDir();
  try {
    const raw = fs.readFileSync(SCORES_DB_PATH, 'utf8');
    const o = JSON.parse(raw);
    if (o && typeof o.users === 'object') return o;
  } catch {
    /* nuevo */
  }
  return { users: {} };
}

function saveScoresDb(db) {
  ensureDataDir();
  fs.writeFileSync(SCORES_DB_PATH, JSON.stringify(db, null, 2), 'utf8');
}

/** @param {'facebook'|'instagram'} channel */
function upsertOAuthUser(db, userId, email, name, channel) {
  const id = String(userId || '').trim();
  if (!id) return null;
  const prev = db.users[id] || {};
  const u = {
    id,
    email: typeof prev.email === 'string' ? prev.email : '',
    name: typeof prev.name === 'string' ? prev.name : '',
    wins: typeof prev.wins === 'number' ? prev.wins : 0,
    linkedFacebook: !!prev.linkedFacebook,
    linkedInstagram: !!prev.linkedInstagram,
    updatedAt: prev.updatedAt || ''
  };
  if (email) u.email = email;
  if (name) u.name = name;
  if (channel === 'facebook') u.linkedFacebook = true;
  if (channel === 'instagram') u.linkedInstagram = true;
  u.updatedAt = new Date().toISOString();
  db.users[id] = u;
  saveScoresDb(db);
  return u;
}

function getLeaderboard(db, limit = 50) {
  const rows = Object.values(db.users).filter((x) => x && x.linkedFacebook);
  rows.sort((a, b) => (b.wins || 0) - (a.wins || 0));
  return rows.slice(0, limit).map((r, i) => ({
    rank: i + 1,
    userId: r.id,
    name: (r.name && String(r.name).trim()) || (r.email && String(r.email).trim()) || 'Jugador',
    wins: r.wins || 0
  }));
}

function incrementWin(db, userId) {
  const id = String(userId || '').trim();
  if (!id || !db.users[id]) return { ok: false, reason: 'unknown_user' };
  const u = db.users[id];
  if (!u.linkedFacebook) return { ok: false, reason: 'not_linked_facebook' };
  u.wins = (u.wins || 0) + 1;
  u.updatedAt = new Date().toISOString();
  saveScoresDb(db);
  return { ok: true, wins: u.wins };
}

/**
 * Tras login Meta/Facebook válido (antes de volver al menú): INSERT/UPDATE en tabla `jugadores`
 * si MYSQL_* está configurado; si no, persiste en data/scores-meta.json.
 * @param {'facebook'|'instagram'} channel
 */
async function guardarJugadorTrasLoginMeta(userId, email, displayName, channel) {
  if (jugadoresRepo) {
    await jugadoresRepo.upsertOAuthUser(userId, email, displayName, channel);
    return;
  }
  const db = loadScoresDb();
  upsertOAuthUser(db, userId, email, displayName, channel);
}

function readJsonBody(req, maxLen = 65536) {
  return new Promise((resolve, reject) => {
    let buf = '';
    req.on('data', (chunk) => {
      buf += chunk;
      if (buf.length > maxLen) reject(new Error('too_large'));
    });
    req.on('end', () => {
      try {
        resolve(buf ? JSON.parse(buf) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

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

function handleVerifySdkToken(req, res) {
  const sec = getMetaSecrets();
  if (!sec) {
    res.writeHead(503, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: false, message: 'Servidor sin credenciales Meta.' }));
    return;
  }
  readJsonBody(req)
    .then(async (body) => {
      const accessToken = body && body.accessToken ? String(body.accessToken).trim() : '';
      const channel = body && body.channel === 'instagram' ? 'instagram' : 'facebook';
      if (!accessToken) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: false, message: 'Falta accessToken.' }));
        return;
      }
      try {
        await assertUserTokenForApp(accessToken, sec);
      } catch {
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: false, message: 'Token inválido o no pertenece a esta app.' }));
        return;
      }
      let me;
      try {
        me = await fetchMetaMe(accessToken);
      } catch {
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: false, message: 'No se pudo leer /me.' }));
        return;
      }
      const email = (me && me.email) || '';
      const userId = me && me.id != null ? String(me.id) : '';
      const displayName = (me && me.name) || '';
      if (!userId) {
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: false, message: 'Meta no devolvió id de usuario.' }));
        return;
      }
      const expectedRaw =
        body && body.expectedEmail != null ? String(body.expectedEmail).trim().toLowerCase() : '';
      const metaEmailNorm = String(email).trim().toLowerCase();
      if (expectedRaw) {
        if (!metaEmailNorm) {
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(
            JSON.stringify({
              ok: false,
              reason: 'no_email',
              message:
                'Meta no devolvió correo. Concede el permiso email y comprueba la cuenta de Facebook.'
            })
          );
          return;
        }
        if (metaEmailNorm !== expectedRaw) {
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(
            JSON.stringify({
              ok: false,
              reason: 'email_mismatch',
              message:
                'La cuenta de Facebook con la que entraste usa otro correo que el guardado en Pinta Gol.',
              metaEmail: email,
              expectedEmail: body.expectedEmail ? String(body.expectedEmail).trim() : ''
            })
          );
          return;
        }
      }
      try {
        await guardarJugadorTrasLoginMeta(userId, email, displayName, channel);
      } catch (err) {
        console.error('[jugadores] MySQL:', err && err.message ? err.message : err);
        res.writeHead(503, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(
          JSON.stringify({
            ok: false,
            message:
              'No se pudo guardar el jugador en MySQL. Revisa .env, que exista la tabla jugadores y que el servidor MySQL esté en marcha.'
          })
        );
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(
        JSON.stringify({
          ok: true,
          userId,
          name: displayName,
          email,
          channel
        })
      );
    })
    .catch(() => {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: false, message: 'Petición inválida.' }));
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
    if (pathname.startsWith('/data/')) {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Forbidden');
      return;
    }
    if (pathname === '/') pathname = '/index.html';
    if (pathname === '/astro-sync' || pathname === '/astro-sync/') pathname = '/astro-sync.html';
    if (pathname === '/zombie-sync' || pathname === '/zombie-sync/') pathname = '/zombie-sync.html';

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

/** @param {'facebook'|'instagram'} channel */
function handleMetaAuthorize(req, res, channel) {
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
  pendingMetaOauth.set(state, {
    exp: Date.now() + 10 * 60 * 1000,
    returnOrigin,
    redirectUri,
    channel
  });
  const scope = encodeURIComponent('email,public_profile');
  const url = `https://www.facebook.com/v19.0/dialog/oauth?client_id=${encodeURIComponent(sec.id)}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}&response_type=code&scope=${scope}&auth_type=reauthenticate`;
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
        {
          ok: false,
          message: 'Sesión de autorización expirada. Cierra e intenta de nuevo.',
          email: '',
          channel: rec && rec.channel ? rec.channel : 'instagram'
        },
        rec && rec.returnOrigin ? rec.returnOrigin : '*'
      )
    );
    return;
  }
  const oauthChannel = rec.channel || 'instagram';
  pendingMetaOauth.delete(state);
  const sec = getMetaSecrets();
  if (!sec) {
    res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(buildPostMessageHtml({ ok: false, message: 'Servidor sin credenciales.', channel: oauthChannel }, rec.returnOrigin));
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
          {
            ok: false,
            message: 'Error al canjear el token de Meta. Revisa redirect URI y App Secret.',
            email: '',
            channel: oauthChannel
          },
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
            email: '',
            channel: oauthChannel
          },
          targetOrigin
        )
      );
      return;
    }
    const meUrl = `https://graph.facebook.com/me?fields=id,name,email&access_token=${encodeURIComponent(tok.access_token)}`;
    let me;
    try {
      me = await httpsGetJson(meUrl);
    } catch {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(
        buildPostMessageHtml(
          {
            ok: false,
            message: 'No se pudo leer /me. Concede permisos de correo y perfil público a la app.',
            email: '',
            channel: oauthChannel
          },
          targetOrigin
        )
      );
      return;
    }
    const email = (me && me.email) || '';
    const userId = me && me.id != null ? String(me.id) : '';
    const displayName = (me && me.name) || '';
    if (!userId) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(
        buildPostMessageHtml(
          {
            ok: false,
            message: 'Meta no devolvió el id de usuario. Revisa permisos de la app.',
            email: '',
            channel: oauthChannel
          },
          targetOrigin
        )
      );
      return;
    }
    try {
      await guardarJugadorTrasLoginMeta(userId, email, displayName, oauthChannel);
    } catch (err) {
      console.error('[jugadores] MySQL (OAuth):', err && err.message ? err.message : err);
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(
        buildPostMessageHtml(
          {
            ok: false,
            message:
              'No se pudo guardar en MySQL. Revisa la base de datos y la tabla jugadores.',
            email: '',
            channel: oauthChannel
          },
          targetOrigin
        )
      );
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(
      buildPostMessageHtml(
        { ok: true, email, channel: oauthChannel, userId, name: displayName },
        targetOrigin
      )
    );
  })();
}

const server = http.createServer((req, res) => {
  try {
    const u = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    if (u.pathname === '/api/scores' && req.method === 'GET') {
      if (jugadoresRepo) {
        jugadoresRepo
          .getLeaderboard(50)
          .then((leaderboard) => {
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ leaderboard }));
          })
          .catch(() => {
            res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ leaderboard: [], error: 'mysql' }));
          });
      } else {
        const db = loadScoresDb();
        const leaderboard = getLeaderboard(db);
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ leaderboard }));
      }
      return;
    }
    if (u.pathname === '/api/scores/win' && req.method === 'POST') {
      readJsonBody(req)
        .then(async (body) => {
          let out;
          if (jugadoresRepo) {
            out = await jugadoresRepo.incrementWin(body && body.userId);
          } else {
            const db = loadScoresDb();
            out = incrementWin(db, body && body.userId);
          }
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify(out));
        })
        .catch(() => {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ ok: false, reason: 'bad_json' }));
        });
      return;
    }
    if (u.pathname === '/api/redes/meta-configured' && req.method === 'GET') {
      const ok = !!getMetaSecrets();
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok }));
      return;
    }
    if (u.pathname === '/api/redes/meta-app-id' && req.method === 'GET') {
      const sec = getMetaSecrets();
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ appId: sec ? sec.id : '' }));
      return;
    }
    if (u.pathname === '/api/redes/verify-sdk-token' && req.method === 'POST') {
      return handleVerifySdkToken(req, res);
    }
    if (u.pathname === '/api/redes/facebook/authorize' && req.method === 'GET') {
      return handleMetaAuthorize(req, res, 'facebook');
    }
    if (u.pathname === '/api/redes/instagram/authorize' && req.method === 'GET') {
      return handleMetaAuthorize(req, res, 'instagram');
    }
    if (u.pathname === '/oauth/meta/callback' && req.method === 'GET') {
      return handleMetaCallback(req, res, u);
    }
    if (u.pathname.match(/^\/share\/comunidad\/\d+$/) && req.method === 'GET') {
      (async () => {
        try {
          const done = await handleComunidadShareOgIfNeeded(req, res, u, mysqlPool);
          if (!done) serveStatic(req, res);
        } catch (e) {
          console.error('[share-og]', e && e.message ? e.message : e);
          if (!res.headersSent) {
            res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end('<!DOCTYPE html><html lang="es"><body><p>Error al generar la vista previa.</p></body></html>');
          }
        }
      })();
      return;
    }
    if (u.pathname.startsWith('/api/comunidad/')) {
      if (!comunidadHandlers) {
        res.writeHead(503, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(
          JSON.stringify({
            ok: false,
            message:
              'Comunidad requiere MySQL. Configura MYSQL_* en .env y ejecuta sql/comunidad.sql.'
          })
        );
        return;
      }
      comunidadHandlers(req, res, u)
        .then((handled) => {
          if (!handled) serveStatic(req, res);
        })
        .catch((err) => {
          console.error('[comunidad]', err && err.message ? err.message : err);
          if (!res.headersSent) {
            res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ ok: false, message: 'Error interno.' }));
          }
        });
      return;
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
  if (mysqlPool) {
    mysqlPool
      .query('SELECT 1')
      .then(() =>
        console.log('[mysql] Conexión OK — los logins de Facebook escriben en la tabla jugadores.')
      )
      .catch((err) =>
        console.error('[mysql] Error de conexión:', err && err.message ? err.message : err)
      );
  }
  if (comunidadHandlers) {
    console.log('[comunidad] API activa (/api/comunidad/*). Vista previa OG: GET /share/comunidad/:id. Imágenes en uploads/comunidad/.');
  }
});
