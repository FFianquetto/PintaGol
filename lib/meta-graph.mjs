import https from 'https';

export function httpsGetJson(u) {
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

/** Valida que el token de usuario pertenezca a nuestra app Meta (Graph debug_token). */
export async function assertUserTokenForApp(userAccessToken, sec) {
  const appAccessToken = `${sec.id}|${sec.secret}`;
  const dbgUrl = `https://graph.facebook.com/debug_token?input_token=${encodeURIComponent(
    userAccessToken
  )}&access_token=${encodeURIComponent(appAccessToken)}`;
  const dbg = await httpsGetJson(dbgUrl);
  const d = dbg && dbg.data;
  if (!d || !d.is_valid || String(d.app_id) !== String(sec.id)) {
    throw new Error('invalid_token');
  }
}

export async function fetchMetaMe(accessToken) {
  const meUrl = `https://graph.facebook.com/me?fields=id,name,email&access_token=${encodeURIComponent(accessToken)}`;
  return httpsGetJson(meUrl);
}
