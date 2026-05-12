/**
 * SDK Meta (Facebook) para Comunidad: mismo App ID que el servidor.
 * Bandera de sesión (sessionStorage) alineada con pintagol_meta_user_id: evita FB.login
 * si ya hay token válido del SDK en esta pestaña.
 */
/* global FB */
(function () {
  'use strict';

  var LS_FB = 'pintagol_redes_facebook_ok';
  var LS_UID = 'pintagol_meta_user_id';

  var SS_SESION = 'pintagol_fb_sdk_sesion';
  var SS_TOKEN = 'pintagol_meta_access_token';
  var SS_TOKEN_UID = 'pintagol_meta_token_user';
  var SS_TOKEN_TS = 'pintagol_meta_token_ts';
  var TOKEN_MAX_MS = 45 * 60 * 1000;

  function isFacebookLinked() {
    try {
      return localStorage.getItem(LS_FB) === '1' && !!localStorage.getItem(LS_UID);
    } catch (e) {
      return false;
    }
  }

  function getLocalMetaUserId() {
    try {
      return (localStorage.getItem(LS_UID) || '').trim();
    } catch (e) {
      return '';
    }
  }

  function invalidateFbSessionCache() {
    try {
      sessionStorage.removeItem(SS_SESION);
      sessionStorage.removeItem(SS_TOKEN);
      sessionStorage.removeItem(SS_TOKEN_UID);
      sessionStorage.removeItem(SS_TOKEN_TS);
    } catch (e) {
      /* no-op */
    }
  }

  function readCachedToken() {
    var lsUid = getLocalMetaUserId();
    if (!lsUid) return null;
    try {
      if (sessionStorage.getItem(SS_SESION) !== '1') return null;
      var tok = sessionStorage.getItem(SS_TOKEN);
      var u = (sessionStorage.getItem(SS_TOKEN_UID) || '').trim();
      var ts = parseInt(sessionStorage.getItem(SS_TOKEN_TS) || '0', 10);
      if (!tok || u !== lsUid) return null;
      if (!ts || Date.now() - ts > TOKEN_MAX_MS) return null;
      return tok;
    } catch (e) {
      return null;
    }
  }

  function writeCachedToken(token, graphUserId) {
    try {
      sessionStorage.setItem(SS_SESION, '1');
      sessionStorage.setItem(SS_TOKEN, token);
      sessionStorage.setItem(SS_TOKEN_UID, String(graphUserId || '').trim());
      sessionStorage.setItem(SS_TOKEN_TS, String(Date.now()));
    } catch (e) {
      /* no-op */
    }
  }

  /**
   * Tras FB.init: sincroniza bandera + caché si el SDK ya trae sesión (sin ventana de login).
   * @param {(err?: Error) => void} [cb]
   */
  function primeFbSessionIfConnected(cb) {
    var done = typeof cb === 'function' ? cb : function () {};
    if (typeof FB === 'undefined') {
      done();
      return;
    }
    FB.getLoginStatus(function (resp) {
      if (resp.status === 'connected' && resp.authResponse && resp.authResponse.accessToken) {
        var uid = resp.authResponse.userID || getLocalMetaUserId();
        writeCachedToken(resp.authResponse.accessToken, String(uid));
      } else {
        invalidateFbSessionCache();
      }
      done();
    });
  }

  /**
   * @param {(err: Error | null) => void} onReady
   */
  function initSdk(onReady) {
    fetch('/api/redes/meta-app-id')
      .then(function (r) {
        return r.json();
      })
      .then(function (data) {
        var appId = data && data.appId && String(data.appId).trim();
        if (!appId) {
          onReady(new Error('no_app'));
          return;
        }
        window.fbAsyncInit = function () {
          if (typeof FB === 'undefined') {
            onReady(new Error('no_fb'));
            return;
          }
          FB.init({
            appId: appId,
            cookie: true,
            xfbml: false,
            version: 'v19.0'
          });
          onReady(null);
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
      .catch(function () {
        onReady(new Error('network'));
      });
  }

  /**
   * Token para API: usa caché de sesión si coincide con pintagol_meta_user_id;
   * si no, getLoginStatus; solo abre FB.login si hace falta y ya tienes Facebook vinculado en Pinta Gol.
   */
  function getAccessToken() {
    return new Promise(function (resolve, reject) {
      var cached = readCachedToken();
      if (cached) {
        resolve(cached);
        return;
      }
      if (typeof FB === 'undefined') {
        reject(new Error('no_fb'));
        return;
      }
      FB.getLoginStatus(function (resp) {
        if (resp.status === 'connected' && resp.authResponse && resp.authResponse.accessToken) {
          var uid = resp.authResponse.userID || getLocalMetaUserId();
          writeCachedToken(resp.authResponse.accessToken, String(uid));
          resolve(resp.authResponse.accessToken);
          return;
        }
        if (isFacebookLinked()) {
          FB.login(
            function (r2) {
              if (r2.status === 'connected' && r2.authResponse && r2.authResponse.accessToken) {
                var u2 = r2.authResponse.userID || getLocalMetaUserId();
                writeCachedToken(r2.authResponse.accessToken, String(u2));
                resolve(r2.authResponse.accessToken);
              } else {
                reject(new Error('login_cancelled'));
              }
            },
            { scope: 'email,public_profile' }
          );
          return;
        }
        reject(new Error('not_linked'));
      });
    });
  }

  window.PintaGolComunidadMeta = {
    initSdk: initSdk,
    getAccessToken: getAccessToken,
    isFacebookLinked: isFacebookLinked,
    primeFbSessionIfConnected: primeFbSessionIfConnected,
    invalidateFbSessionCache: invalidateFbSessionCache,
    getLocalMetaUserId: getLocalMetaUserId
  };
})();
