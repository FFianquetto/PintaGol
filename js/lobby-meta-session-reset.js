/**
 * Solo en local: al abrir el lobby se reinicia la sesión del SDK Meta y los flags UI de FB/IG.
 * Conserva pintagol_meta_user_id y pintagol_meta_name para que las victorias (score-win) sigan ligadas a la cuenta.
 * No borra el correo de referencia (pintagol_redes_email).
 * Si acabas de vincular (sessionStorage pintagol_lobby_redes_ok), no hace nada.
 */
(function () {
  'use strict';

  var h = typeof location !== 'undefined' ? location.hostname : '';
  if (h !== 'localhost' && h !== '127.0.0.1') return;

  try {
    if (sessionStorage.getItem('pintagol_lobby_redes_ok')) return;
  } catch (e) {}

  var LS_FB = 'pintagol_redes_facebook_ok';
  var LS_IG = 'pintagol_redes_instagram_ok';

  try {
    localStorage.removeItem(LS_FB);
    localStorage.removeItem(LS_IG);
  } catch (e) {}

  fetch('/api/redes/meta-app-id')
    .then(function (r) {
      return r.json();
    })
    .then(function (data) {
      var appId = data && data.appId && String(data.appId).trim();
      if (!appId) return;

      window.fbAsyncInit = function () {
        if (typeof FB === 'undefined') return;
        FB.init({
          appId: appId,
          cookie: true,
          xfbml: false,
          version: 'v19.0'
        });
        try {
          FB.logout(function () {});
        } catch (e2) {}
      };

      if (document.getElementById('facebook-jssdk')) {
        if (typeof FB !== 'undefined') window.fbAsyncInit();
        return;
      }
      var js = document.createElement('script');
      js.id = 'facebook-jssdk';
      js.async = true;
      js.crossOrigin = 'anonymous';
      js.src = 'https://connect.facebook.net/es_LA/sdk.js';
      document.body.appendChild(js);
    })
    .catch(function () {});
})();
