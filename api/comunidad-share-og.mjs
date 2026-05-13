import { createComunidadRepo } from '../db/comunidad-repo.mjs';

const DESC_MAX = 400;

function escapeHtmlAttr(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\r?\n/g, ' ');
}

/** Texto seguro dentro de nodos HTML (no atributos). */
function escapeHtmlBody(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\r\n|\n|\r/g, '<br>');
}

function truncate(s, max) {
  const t = String(s || '').trim();
  if (t.length <= max) return t;
  return t.slice(0, max - 1) + '…';
}

/** @param {import('http').IncomingMessage} req */
function siteBaseUrl(req, u) {
  const xf = req.headers['x-forwarded-proto'];
  const proto =
    typeof xf === 'string' && xf.split(',')[0].trim()
      ? xf.split(',')[0].trim()
      : u.protocol
        ? u.protocol.replace(':', '')
        : 'http';
  const host = req.headers.host || 'localhost';
  return `${proto}://${host}`;
}

function absoluteImageUrl(imagenUrl, base) {
  const s = String(imagenUrl || '').trim();
  if (!s) return '';
  if (/^https?:\/\//i.test(s)) return s;
  if (s.startsWith('/')) return base + s;
  return base + '/' + s;
}

/**
 * Página mínima con Open Graph para que Facebook rellene título, texto e imagen al compartir.
 * @param {import('http').IncomingMessage} req
 * @param {import('http').ServerResponse} res
 * @param {URL} u
 * @param {import('mysql2/promise').Pool | null} pool
 * @returns {Promise<boolean>} true si respondió (GET /share/comunidad/:id)
 */
export async function handleComunidadShareOgIfNeeded(req, res, u, pool) {
  const m = u.pathname.match(/^\/share\/comunidad\/(\d+)$/);
  if (!m || req.method !== 'GET') return false;

  const pubId = Number(m[1]);
  if (!Number.isFinite(pubId) || pubId <= 0) {
    res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end('<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title>Error</title></head><body><p>Solicitud inválida.</p></body></html>');
    return true;
  }

  if (!pool) {
    res.writeHead(503, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end('<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title>Pinta Gol</title></head><body><p>Comunidad no disponible (MySQL).</p></body></html>');
    return true;
  }

  const repo = createComunidadRepo(pool);
  let row;
  try {
    row = await repo.getPublicacionForOgShare(pubId);
  } catch (e) {
    console.error('[share-og] db:', e && e.message ? e.message : e);
    res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end('<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title>Error</title></head><body><p>Error al cargar la publicación.</p></body></html>');
    return true;
  }

  if (!row) {
    res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end('<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title>No encontrada</title></head><body><p>Publicación no encontrada.</p></body></html>');
    return true;
  }

  const base = siteBaseUrl(req, u);
  const canonical = `${base}/share/comunidad/${pubId}`;
  const author = String(row.autor_nombre || 'Jugador').trim();
  const titleOg = escapeHtmlAttr(`Pinta Gol · ${author}`);
  const rawDesc = row.cuerpo && String(row.cuerpo).trim() ? String(row.cuerpo) : 'Publicación de la comunidad de Pinta Gol.';
  const descOg = escapeHtmlAttr(truncate(rawDesc, DESC_MAX));
  const imgAbs = absoluteImageUrl(row.imagen_url, base);
  const imgAlt = escapeHtmlAttr(truncate(`${author} — ${rawDesc}`, 200));
  const imgTag =
    imgAbs && !/\s/.test(imgAbs)
      ? `<meta property="og:image" content="${escapeHtmlAttr(imgAbs)}">\n<meta property="og:image:alt" content="${imgAlt}">\n<meta name="twitter:image" content="${escapeHtmlAttr(imgAbs)}">\n`
      : '';

  const h1Html = escapeHtmlBody(`Pinta Gol · ${author}`);
  const bodyHtml = escapeHtmlBody(truncate(String(row.cuerpo || ''), 4000));
  const comunidadUrl = `${base}/comunidad.html?pub=${pubId}`;

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${titleOg}</title>
  <link rel="canonical" href="${escapeHtmlAttr(canonical)}">
  <meta property="og:type" content="article">
  <meta property="og:title" content="${titleOg}">
  <meta property="og:description" content="${descOg}">
  <meta property="og:url" content="${escapeHtmlAttr(canonical)}">
  <meta property="og:locale" content="es_ES">
  <meta property="og:site_name" content="Pinta Gol">
  ${imgTag}<meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${titleOg}">
  <meta name="twitter:description" content="${descOg}">
</head>
<body style="font-family:system-ui,sans-serif;max-width:40rem;margin:2rem auto;padding:0 1rem;">
  <p style="opacity:.75;font-size:.9rem;">Vista previa para compartir en Facebook</p>
  <h1 style="font-size:1.15rem;">${h1Html}</h1>
  <p>${bodyHtml || '<em>Sin texto</em>'}</p>
  <p><a href="${escapeHtmlAttr(comunidadUrl)}">Abrir en Pinta Gol (Comunidad)</a></p>
</body>
</html>`;

  res.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'public, max-age=120'
  });
  res.end(html);
  return true;
}
