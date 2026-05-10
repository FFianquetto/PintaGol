/**
 * Envía una victoria al servidor usando el id de usuario Meta (Graph API /me?id), guardado tras FB.login.
 * Requiere npm start (API /api/scores/win).
 */
(function (w) {
  'use strict';

  var LS_UID = 'pintagol_meta_user_id';

  function getUserId() {
    try {
      return localStorage.getItem(LS_UID) || '';
    } catch (e) {
      return '';
    }
  }

  function report() {
    var uid = getUserId();
    if (!uid) return;
    fetch('/api/scores/win', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: uid })
    })
      .then(function (res) {
        return res.json().catch(function () {
          return {};
        });
      })
      .then(function (data) {
        if (data && data.ok) return;
        if (typeof console !== 'undefined' && console.warn) {
          if (!data || data.reason === 'unknown_user') {
            console.warn(
              '[Pinta Gol] Victoria no guardada: juega con cuenta vinculada en Redes sociales (Facebook).'
            );
          } else if (data.reason === 'not_linked_facebook') {
            console.warn('[Pinta Gol] Victoria no guardada: falta vincular Facebook en Redes sociales.');
          }
        }
      })
      .catch(function () {});
  }

  w.PintaGolScoreWin = { report: report, getMetaUserId: getUserId };
})(typeof window !== 'undefined' ? window : globalThis);
