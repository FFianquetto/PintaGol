/**
 * Redes sociales: Meta JavaScript SDK (FB.login) + registro en servidor por id de Graph API (/me?id).
 * El token del SDK se valida en el servidor con debug_token antes de guardar usuario y flags FB/IG.
 */
/* global FB */
(function () {
  'use strict';

  var LS_EMAIL = 'pintagol_redes_email';
  var LS_FB = 'pintagol_redes_facebook_ok';
  var LS_IG = 'pintagol_redes_instagram_ok';
  var LS_UID = 'pintagol_meta_user_id';
  var LS_NAME = 'pintagol_meta_name';

  var emailInp = document.getElementById('email');
  var btnGuardar = document.getElementById('btn-guardar-correo');
  var btnLogout = document.getElementById('btn-logout');
  var btnFb = document.getElementById('btn-facebook');
  var btnIg = document.getElementById('btn-instagram');
  var estado = document.getElementById('estado-sesion');
  var logLineas = document.getElementById('log-lineas');
  var avisoConfig = document.getElementById('aviso-config');
  var btnVolver = document.getElementById('btn-volver');

  var metaAppId = '';
  var fbSdkReady = false;

  function log(msg) {
    if (!logLineas) return;
    var t = new Date().toLocaleTimeString();
    logLineas.textContent = (logLineas.textContent ? logLineas.textContent + '\n' : '') + '[' + t + '] ' + msg;
  }

  function getStoredEmail() {
    try {
      var e = localStorage.getItem(LS_EMAIL);
      return e ? String(e).trim() : '';
    } catch (e2) {
      return '';
    }
  }

  function setStoredEmail(val) {
    try {
      if (val) localStorage.setItem(LS_EMAIL, val);
      else localStorage.removeItem(LS_EMAIL);
    } catch (e) {}
  }

  function yaVinculadoFacebook() {
    try {
      return localStorage.getItem(LS_FB) === '1';
    } catch (e) {
      return false;
    }
  }

  function yaVinculadoInstagram() {
    try {
      return localStorage.getItem(LS_IG) === '1';
    } catch (e) {
      return false;
    }
  }

  function setEstado(texto, clase) {
    if (!estado) return;
    estado.className = clase || 'ok';
    estado.textContent = texto;
  }

  function refrescarTextoVinculacion() {
    var em = getStoredEmail();
    if (!em) {
      setEstado('Guarda un correo para habilitar los enlaces.', 'ok');
      return;
    }
    var uid = '';
    try {
      uid = localStorage.getItem(LS_UID) || '';
    } catch (e) {}
    var partes = [];
    partes.push('Correo guardado: ' + em + '.');
    if (uid) partes.push('ID Meta (Graph): ' + uid + '.');
    partes.push(yaVinculadoFacebook() ? 'Facebook: vinculado.' : 'Facebook: no vinculado.');
    partes.push(yaVinculadoInstagram() ? 'Instagram: vinculado.' : 'Instagram: pendiente.');
    setEstado(partes.join(' '), 'ok');
  }

  function actualizarBotonesVincular() {
    var ok = !!getStoredEmail() && fbSdkReady && !!metaAppId;
    if (btnFb) btnFb.disabled = !ok;
    if (btnIg) btnIg.disabled = !ok;
    if (btnLogout) btnLogout.hidden = !getStoredEmail();
    if (btnGuardar) btnGuardar.disabled = false;
    if (emailInp) emailInp.disabled = false;
  }

  function mostrarAvisoMetaServidor(ok, tieneAppId) {
    if (!avisoConfig) return;
    if (!ok || !tieneAppId) {
      avisoConfig.classList.add('visible');
      avisoConfig.textContent =
        'Configura redes-secrets.json con metaAppId y metaAppSecret, reinicia npm start y recarga. El SDK usa el mismo App ID que el servidor.';
    } else {
      avisoConfig.classList.remove('visible');
      avisoConfig.textContent = '';
    }
  }

  function aplicarExitoServidor(data, channelLabel) {
    var mine = getStoredEmail().toLowerCase().trim();
    if (!mine) {
      log('Guarda un correo de referencia antes de vincular.');
      return;
    }
    var em = (data.email || '').toLowerCase().trim();
    if (!em || em !== mine) {
      setEstado(
        'El correo de Meta no coincide con el guardado. Usa el mismo email en Facebook/Instagram y en Pinta Gol.',
        'err'
      );
      log('Correo Meta distinto. Meta: ' + (em || '(vacío)') + ' · local: ' + mine);
      return;
    }
    var uid = data.userId ? String(data.userId) : '';
    if (!uid) {
      log('El servidor no devolvió userId (Graph id).');
      return;
    }
    try {
      if (channelLabel === 'facebook') localStorage.setItem(LS_FB, '1');
      else localStorage.setItem(LS_IG, '1');
      localStorage.setItem(LS_UID, uid);
      if (data.name) localStorage.setItem(LS_NAME, String(data.name));
    } catch (e) {}
    log(
      'Meta (' +
        channelLabel +
        '): sesión SDK verificada. Usuario registrado por id de Graph API: ' +
        uid +
        '.'
    );
    refrescarTextoVinculacion();
  }

  function enviarTokenAlServidor(accessToken, channel) {
    fetch('/api/redes/verify-sdk-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accessToken: accessToken, channel: channel })
    })
      .then(function (r) {
        return r.json();
      })
      .then(function (data) {
        if (!data || !data.ok) {
          log((data && data.message) || 'Error al registrar en el servidor.');
          return;
        }
        aplicarExitoServidor(data, channel);
      })
      .catch(function () {
        log('Error de red al validar el token con el servidor.');
      });
  }

  function loginSdkYRegistrar(channel) {
    if (!getStoredEmail()) return;
    if (typeof FB === 'undefined' || !fbSdkReady) {
      log('SDK de Meta no listo. Espera un momento y reintenta.');
      return;
    }
    FB.login(
      function (response) {
        if (!response.authResponse || !response.authResponse.accessToken) {
          log('Inicio de sesión cancelado o sin token.');
          return;
        }
        enviarTokenAlServidor(response.authResponse.accessToken, channel);
      },
      { scope: 'email,public_profile', auth_type: 'rerequest' }
    );
  }

  function ensureFbSdk(appId, onReady) {
    if (typeof FB !== 'undefined' && window.__FB_INIT_DONE) {
      fbSdkReady = true;
      onReady();
      return;
    }
    window.fbAsyncInit = function () {
      FB.init({
        appId: appId,
        cookie: true,
        xfbml: false,
        version: 'v19.0'
      });
      window.__FB_INIT_DONE = true;
      fbSdkReady = true;
      onReady();
    };
    if (!document.getElementById('facebook-jssdk')) {
      var js = document.createElement('script');
      js.id = 'facebook-jssdk';
      js.async = true;
      js.defer = true;
      js.crossOrigin = 'anonymous';
      js.src = 'https://connect.facebook.net/es_LA/sdk.js';
      document.body.appendChild(js);
    }
  }

  function syncFormularioDesdeStorage() {
    var em = getStoredEmail();
    if (emailInp && em) emailInp.value = em;
    actualizarBotonesVincular();
    refrescarTextoVinculacion();
  }

  Promise.all([
    fetch('/api/redes/meta-configured')
      .then(function (r) {
        return r.json();
      })
      .catch(function () {
        return { ok: false };
      }),
    fetch('/api/redes/meta-app-id')
      .then(function (r) {
        return r.json();
      })
      .catch(function () {
        return { appId: '' };
      })
  ]).then(function (results) {
    var cfg = results[0];
    var ids = results[1];
    metaAppId = (ids && ids.appId && String(ids.appId).trim()) || '';
    mostrarAvisoMetaServidor(!!(cfg && cfg.ok), !!metaAppId);
    if (metaAppId) {
      ensureFbSdk(metaAppId, function () {
        actualizarBotonesVincular();
      });
    }
    syncFormularioDesdeStorage();
  });

  if (btnGuardar) {
    btnGuardar.addEventListener('click', function () {
      var e = (emailInp && emailInp.value && emailInp.value.trim()) || '';
      if (!e || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) {
        log('Introduce un correo válido.');
        return;
      }
      setStoredEmail(e);
      log('Correo guardado. Con el SDK de Meta puedes vincular Facebook e Instagram.');
      syncFormularioDesdeStorage();
    });
  }

  if (btnLogout) {
    btnLogout.addEventListener('click', function () {
      try {
        if (typeof FB !== 'undefined' && FB.logout) {
          FB.logout(function () {});
        }
      } catch (e) {}
      setStoredEmail('');
      try {
        localStorage.removeItem(LS_FB);
        localStorage.removeItem(LS_IG);
        localStorage.removeItem(LS_UID);
        localStorage.removeItem(LS_NAME);
      } catch (e2) {}
      if (emailInp) emailInp.value = '';
      log('Sesión local borrada.');
      syncFormularioDesdeStorage();
    });
  }

  if (btnFb) {
    btnFb.addEventListener('click', function () {
      if (!getStoredEmail()) return;
      if (yaVinculadoFacebook()) {
        log('Facebook ya estaba vinculado en este dispositivo.');
        return;
      }
      loginSdkYRegistrar('facebook');
    });
  }

  if (btnIg) {
    btnIg.addEventListener('click', function () {
      if (!getStoredEmail()) return;
      if (yaVinculadoInstagram()) {
        log('Instagram ya estaba vinculado en este dispositivo.');
        return;
      }
      loginSdkYRegistrar('instagram');
    });
  }

  if (btnVolver) {
    btnVolver.addEventListener('click', function () {
      window.location.href = 'index.html';
    });
  }
})();
