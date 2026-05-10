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
    }).catch(function () {});
  }

  w.PintaGolScoreWin = { report: report, getMetaUserId: getUserId };
})(typeof window !== 'undefined' ? window : globalThis);
