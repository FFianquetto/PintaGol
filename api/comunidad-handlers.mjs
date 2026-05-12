import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import Busboy from 'busboy';
import { assertUserTokenForApp, fetchMetaMe } from '../lib/meta-graph.mjs';
import { createComunidadRepo } from '../db/comunidad-repo.mjs';

const MAX_TEXTO_PUBLICACION = 4000;
const MAX_TEXTO_COMENTARIO = 1000;
const MAX_ARCHIVO_BYTES = 4 * 1024 * 1024;
const MIME_EXT = {
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif'
};

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

function parseMultipart(req) {
  return new Promise((resolve, reject) => {
    const fields = {};
    let fileBuffer = null;
    let fileMime = '';
    let fileTooBig = false;

    const bb = Busboy({
      headers: req.headers,
      limits: { fileSize: MAX_ARCHIVO_BYTES, files: 1 }
    });

    bb.on('file', (name, file, info) => {
      if (name !== 'imagen') {
        file.resume();
        return;
      }
      const chunks = [];
      file.on('data', (d) => chunks.push(d));
      file.on('limit', () => {
        fileTooBig = true;
      });
      file.on('end', () => {
        if (!fileTooBig) {
          fileBuffer = Buffer.concat(chunks);
          fileMime = (info && info.mimeType) || '';
        }
      });
    });

    bb.on('field', (name, val) => {
      fields[name] = val != null ? String(val) : '';
    });

    bb.on('finish', () => {
      if (fileTooBig) {
        reject(new Error('file_too_large'));
        return;
      }
      resolve({ fields, fileBuffer, fileMime });
    });

    bb.on('error', reject);
    req.pipe(bb);
  });
}

/**
 * Rutas HTTP /api/comunidad/* (publicaciones y comentarios con validación de token Meta).
 * @param {{ pool: import('mysql2/promise').Pool, jugadoresRepo: object, getMetaSecrets: () => { id: string, secret: string } | null, ROOT: string }} opts
 */
export function createComunidadHandlers(opts) {
  const { pool, jugadoresRepo, getMetaSecrets, ROOT } = opts;
  const repo = createComunidadRepo(pool);
  const uploadDir = path.join(ROOT, 'uploads', 'comunidad');
  const uploadUrlPrefix = '/uploads/comunidad/';

  function ensureUploadDir() {
    try {
      fs.mkdirSync(uploadDir, { recursive: true });
    } catch {
      /* no-op */
    }
  }

  async function resolveFacebookJugador(accessToken) {
    const sec = getMetaSecrets();
    if (!sec) throw new Error('no_meta_secrets');
    await assertUserTokenForApp(accessToken, sec);
    const me = await fetchMetaMe(accessToken);
    const userId = me && me.id != null ? String(me.id) : '';
    if (!userId) throw new Error('no_user_id');
    const ok = await jugadoresRepo.hasFacebookLink(userId);
    if (!ok) throw new Error('not_facebook_jugador');
    return { userId, name: (me && me.name) || '', email: (me && me.email) || '' };
  }

  function json(res, status, obj) {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(obj));
  }

  function saveImagen(buffer, mime) {
    const ext = MIME_EXT[String(mime).toLowerCase()];
    if (!ext || !buffer || buffer.length === 0) return '';
    ensureUploadDir();
    const name = crypto.randomBytes(16).toString('hex') + ext;
    const full = path.join(uploadDir, name);
    fs.writeFileSync(full, buffer);
    return uploadUrlPrefix + name;
  }

  function tryRemoveImagenFile(imagenUrl) {
    if (!imagenUrl || !String(imagenUrl).startsWith(uploadUrlPrefix)) return;
    const base = path.basename(String(imagenUrl));
    if (!/^[a-f0-9]{32}\.(jpg|jpeg|png|webp|gif)$/i.test(base)) return;
    const full = path.join(uploadDir, base);
    try {
      fs.unlinkSync(full);
    } catch {
      /* no-op */
    }
  }

  /**
   * @returns {Promise<boolean>}
   */
  return async function handleComunidad(req, res, u) {
    const pathname = u.pathname || '';
    const method = req.method || 'GET';

    if (pathname === '/api/comunidad/publicaciones' && method === 'GET') {
      try {
        const limit = u.searchParams.get('limit');
        const list = await repo.listPublicaciones(limit ? Number(limit) : 30);
        json(res, 200, { ok: true, publicaciones: list });
      } catch (e) {
        console.error('[comunidad] list:', e && e.message ? e.message : e);
        json(res, 500, { ok: false, message: 'No se pudieron cargar las publicaciones.' });
      }
      return true;
    }

    if (pathname === '/api/comunidad/publicaciones' && method === 'POST') {
      let fields;
      let fileBuffer;
      let fileMime;
      try {
        ({ fields, fileBuffer, fileMime } = await parseMultipart(req));
      } catch (e) {
        if (e && e.message === 'file_too_large') {
          json(res, 400, { ok: false, message: 'La imagen supera el tamaño máximo (4 MB).' });
          return true;
        }
        json(res, 400, { ok: false, message: 'Formulario inválido.' });
        return true;
      }

      const accessToken = fields.accessToken ? String(fields.accessToken).trim() : '';
      const texto = fields.texto != null ? String(fields.texto).trim() : '';
      if (!accessToken) {
        json(res, 400, { ok: false, message: 'Falta accessToken (inicia sesión con Facebook).' });
        return true;
      }
      if (texto.length > MAX_TEXTO_PUBLICACION) {
        json(res, 400, { ok: false, message: 'El texto es demasiado largo.' });
        return true;
      }

      let imagenUrl = '';
      if (fileBuffer && fileBuffer.length && fileMime) {
        try {
          imagenUrl = saveImagen(fileBuffer, fileMime);
        } catch {
          json(res, 400, { ok: false, message: 'No se pudo guardar la imagen. Usa JPG, PNG, WebP o GIF.' });
          return true;
        }
      }

      if (!texto && !imagenUrl) {
        json(res, 400, { ok: false, message: 'Escribe un mensaje o adjunta una foto.' });
        return true;
      }

      let userId;
      try {
        ({ userId } = await resolveFacebookJugador(accessToken));
      } catch (e) {
        const code = e && e.message;
        if (code === 'invalid_token' || code === 'no_user_id') {
          json(res, 401, {
            ok: false,
            reason: 'invalid_token',
            message: 'Sesión de Facebook no válida. Vuelve a entrar con Facebook.'
          });
          return true;
        }
        if (code === 'not_facebook_jugador') {
          json(res, 403, {
            ok: false,
            message: 'Tu cuenta no está registrada con Facebook en Pinta Gol. Vincula Facebook en Redes sociales.'
          });
          return true;
        }
        if (code === 'no_meta_secrets') {
          json(res, 503, { ok: false, message: 'Servidor sin credenciales Meta.' });
          return true;
        }
        json(res, 401, { ok: false, reason: 'invalid_token', message: 'No se pudo validar el token.' });
        return true;
      }

      try {
        const id = await repo.insertPublicacion(userId, texto, imagenUrl);
        json(res, 200, { ok: true, id });
      } catch (e) {
        console.error('[comunidad] insert pub:', e && e.message ? e.message : e);
        json(res, 500, { ok: false, message: 'No se pudo guardar la publicación.' });
      }
      return true;
    }

    const mComent = pathname.match(/^\/api\/comunidad\/publicaciones\/(\d+)\/comentarios$/);
    if (mComent) {
      const pubId = Number(mComent[1]);
      if (method === 'GET') {
        try {
          const exists = await repo.existsPublicacion(pubId);
          if (!exists) {
            json(res, 404, { ok: false, message: 'Publicación no encontrada.' });
            return true;
          }
          const comentarios = await repo.listComentarios(pubId);
          json(res, 200, { ok: true, comentarios });
        } catch (e) {
          console.error('[comunidad] list com:', e && e.message ? e.message : e);
          json(res, 500, { ok: false, message: 'Error al cargar comentarios.' });
        }
        return true;
      }

      if (method === 'POST') {
        let body;
        try {
          body = await readJsonBody(req);
        } catch {
          json(res, 400, { ok: false, message: 'JSON inválido.' });
          return true;
        }
        const accessToken = body && body.accessToken ? String(body.accessToken).trim() : '';
        const cuerpo = body && body.texto != null ? String(body.texto).trim() : '';
        if (!accessToken) {
          json(res, 400, { ok: false, message: 'Falta accessToken.' });
          return true;
        }
        if (!cuerpo) {
          json(res, 400, { ok: false, message: 'Escribe un comentario.' });
          return true;
        }
        if (cuerpo.length > MAX_TEXTO_COMENTARIO) {
          json(res, 400, { ok: false, message: 'Comentario demasiado largo.' });
          return true;
        }

        const exists = await repo.existsPublicacion(pubId);
        if (!exists) {
          json(res, 404, { ok: false, message: 'Publicación no encontrada.' });
          return true;
        }

        let userId;
        try {
          ({ userId } = await resolveFacebookJugador(accessToken));
        } catch (e) {
          const code = e && e.message;
          if (code === 'not_facebook_jugador') {
            json(res, 403, {
              ok: false,
              message: 'Vincula Facebook en Redes sociales para comentar.'
            });
            return true;
          }
          if (code === 'no_meta_secrets') {
            json(res, 503, { ok: false, message: 'Servidor sin credenciales Meta.' });
            return true;
          }
          json(res, 401, { ok: false, reason: 'invalid_token', message: 'Sesión de Facebook no válida.' });
          return true;
        }

        try {
          const id = await repo.insertComentario(pubId, userId, cuerpo);
          json(res, 200, { ok: true, id });
        } catch (e) {
          console.error('[comunidad] insert com:', e && e.message ? e.message : e);
          json(res, 500, { ok: false, message: 'No se pudo guardar el comentario.' });
        }
        return true;
      }
    }

    const mDeletePub = pathname.match(/^\/api\/comunidad\/publicaciones\/(\d+)$/);
    if (mDeletePub && method === 'DELETE') {
      const pubId = Number(mDeletePub[1]);
      let body;
      try {
        body = await readJsonBody(req);
      } catch {
        json(res, 400, { ok: false, message: 'JSON inválido.' });
        return true;
      }
      const metaUserId =
        body && body.meta_user_id != null
          ? String(body.meta_user_id).trim()
          : body && body.metaUserId != null
            ? String(body.metaUserId).trim()
            : '';
      if (!metaUserId || metaUserId.length > 64) {
        json(res, 400, { ok: false, message: 'Falta meta_user_id del jugador.' });
        return true;
      }

      try {
        const out = await repo.deletePublicacionAsOwner(pubId, metaUserId);
        if (!out.ok) {
          const st = out.reason === 'not_found' ? 404 : 400;
          json(res, st, {
            ok: false,
            message:
              out.reason === 'not_found'
                ? 'Publicación no encontrada o no coincide con tu usuario.'
                : 'No se pudo borrar.'
          });
          return true;
        }
        if (out.imagen_url) tryRemoveImagenFile(out.imagen_url);
        json(res, 200, { ok: true });
      } catch (e) {
        console.error('[comunidad] delete pub:', e && e.message ? e.message : e);
        json(res, 500, { ok: false, message: 'Error al borrar la publicación.' });
      }
      return true;
    }

    return false;
  };
}
