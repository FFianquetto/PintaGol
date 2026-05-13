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
  /** Debe coincidir con FB.init en initSdk. */
  var GRAPH_SDK_VERSION = 'v19.0';

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

  /** Meta inyecta el diálogo aquí; sin esto FB.ui suele quedarse en carga. */
  function ensureFbRoot() {
    if (document.getElementById('fb-root')) return;
    var root = document.createElement('div');
    root.id = 'fb-root';
    document.body.insertBefore(root, document.body.firstChild);
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
          ensureFbRoot();
          FB.init({
            appId: appId,
            cookie: true,
            xfbml: false,
            version: GRAPH_SDK_VERSION
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

  /* ----- Compartir publicación de Comunidad en el muro ----- */

  /**
   * Meta no puede hacer scraping de localhost (ni muchas IPs locales): FB.ui con ese href suele
   * quedarse en carga infinita. En esos hosts usamos el compartidor clásico (sin post_id).
   */
  function isFacebookShareLocalhost() {
    var h = (window.location.hostname || '').toLowerCase();
    return h === 'localhost' || h === '127.0.0.1' || h === '[::1]' || h.endsWith('.local');
  }

  function openClassicFacebookSharer(pageUrl, quote) {
    var u = 'https://www.facebook.com/sharer/sharer.php?u=' + encodeURIComponent(pageUrl);
    if (quote && String(quote).trim()) {
      u += '&quote=' + encodeURIComponent(String(quote).trim().slice(0, 500));
    }
    try {
      window.open(u, 'fb_sharer', 'width=640,height=520,scrollbars=yes,noopener,noreferrer');
    } catch (e) {
      window.location.href = u;
    }
  }

  function facebookPermalinkFromPostId(postId) {
    if (postId == null) return '';
    var s = String(postId)
      .trim()
      .replace(/\s/g, '');
    if (!s) return '';
    var idx = s.indexOf('_');
    if (idx <= 0 || idx === s.length - 1) return '';
    var a = s.slice(0, idx);
    var b = s.slice(idx + 1);
    if (!/^\d+$/.test(a) || !/^\d+$/.test(b)) return '';
    return 'https://www.facebook.com/' + a + '/posts/' + b;
  }

  function shareComunidadPublicacion(opts, callback) {
    opts = opts || {};
    var pubId = opts.pubId;
    var quote = opts.quote != null ? String(opts.quote) : '';

    function done(resp) {
      if (typeof callback === 'function') callback(resp || {});
    }

    if (!pubId) {
      done({});
      return;
    }

    ensureFbRoot();
    var origin = window.location.protocol + '//' + window.location.host;
    var href = origin + '/share/comunidad/' + encodeURIComponent(String(pubId));

    if (isFacebookShareLocalhost()) {
      openClassicFacebookSharer(href, quote);
      done({});
      return;
    }

    if (typeof FB === 'undefined') {
      openClassicFacebookSharer(href, quote);
      done({});
      return;
    }

    /* Solo href: el parámetro quote a veces bloquea el diálogo o exige permisos extra. */
    try {
      FB.ui({ method: 'share', href: href }, function (response) {
        done(response || {});
      });
    } catch (e) {
      openClassicFacebookSharer(href, quote);
      done({});
    }
  }

  /* ----- Token para la API del juego ----- */

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
    getLocalMetaUserId: getLocalMetaUserId,
    shareComunidadPublicacion: shareComunidadPublicacion,
    facebookPermalinkFromPostId: facebookPermalinkFromPostId,
    isFacebookShareLocalhost: isFacebookShareLocalhost
  };
})();
