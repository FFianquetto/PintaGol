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

  /** Quita solo flags Meta/Facebook en localStorage (no el correo). Tras cambiar correo o cerrar sesión en Meta. */
  function resetMetaLinkLocalOnly() {
    try {
      localStorage.removeItem(LS_FB);
      localStorage.removeItem(LS_IG);
      localStorage.removeItem(LS_UID);
      localStorage.removeItem(LS_NAME);
    } catch (e) {}
  }

  function logoutFacebookSdk(done) {
    if (typeof FB === 'undefined' || !FB.logout) {
      if (done) done();
      return;
    }
    try {
      FB.logout(function () {
        if (done) done();
      });
    } catch (e) {
      if (done) done();
    }
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

  function correoEnInputValido() {
    var v = (emailInp && emailInp.value && emailInp.value.trim()) || '';
    return v && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
  }

  /** El correo del campo coincide con el guardado en localStorage (tras Guardar). */
  function correoGuardadoCoincideConInput() {
    var inp = (emailInp && emailInp.value.trim()) || '';
    var st = getStoredEmail();
    if (!inp || !st) return false;
    return inp.toLowerCase() === st.toLowerCase();
  }

  /** Si el usuario escribe otro correo distinto al guardado, no pisar el campo al sincronizar. */
  function usuarioEditandoCorreoDistintoAlGuardado() {
    if (!emailInp) return false;
    var typed = emailInp.value.trim();
    if (!typed) return false;
    var st = getStoredEmail();
    if (!st) return true;
    return typed.toLowerCase() !== st.toLowerCase();
  }

  function refrescarTextoVinculacion() {
    var em = getStoredEmail();
    if (!em && !correoEnInputValido()) {
      setEstado('Escribe un correo y pulsa «Guardar correo» para habilitar los enlaces.', 'ok');
      return;
    }
    if (usuarioEditandoCorreoDistintoAlGuardado()) {
      setEstado(
        'Has cambiado el correo en el campo. Pulsa «Guardar correo» para usar este email con Meta.',
        'aviso'
      );
      return;
    }
    if (!em) {
      setEstado('Guarda un correo válido con el botón verde.', 'ok');
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
    var ok = correoGuardadoCoincideConInput() && fbSdkReady && !!metaAppId;
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
    try {
      sessionStorage.setItem(
        'pintagol_lobby_redes_ok',
        JSON.stringify({
          name: data.name ? String(data.name) : '',
          channel: channelLabel
        })
      );
    } catch (e2) {}
    window.location.href = 'index.html';
  }

  function enviarTokenAlServidor(accessToken, channel) {
    fetch('/api/redes/verify-sdk-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        accessToken: accessToken,
        channel: channel,
        expectedEmail: getStoredEmail()
      })
    })
      .then(function (r) {
        return r.json();
      })
      .then(function (data) {
        if (!data || !data.ok) {
          if (data && data.reason === 'email_mismatch') {
            setEstado(
              'Facebook devolvió otro correo (' +
                (data.metaEmail || '?') +
                '). Guarda en Pinta Gol el mismo correo que esa cuenta de Meta, o en la ventana de Meta pulsa Cancelar y entra con la cuenta correcta.',
              'err'
            );
            log(
              'Correo Meta distinto al guardado. Meta: ' +
                (data.metaEmail || '') +
                ' · guardado: ' +
                (data.expectedEmail || getStoredEmail())
            );
            return;
          }
          if (data && data.reason === 'no_email') {
            setEstado((data && data.message) || 'Meta no devolvió correo.', 'err');
            log((data && data.message) || '');
            return;
          }
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
    if (!correoGuardadoCoincideConInput()) {
      log('Pulsa «Guardar correo» para fijar el email que debe coincidir con tu cuenta de Meta.');
      return;
    }
    if (typeof FB === 'undefined' || !fbSdkReady) {
      log('SDK de Meta no listo. Espera un momento y reintenta.');
      return;
    }
    /**
     * No encadenar FB.logout → esperar → FB.login: el callback de logout a veces no se ejecuta
     * y el login nunca abre; además el retraso hace que el navegador bloquee el popup del login.
     * logout en segundo plano + login en el mismo clic mantiene el popup permitido.
     */
    try {
      FB.logout(function () {});
    } catch (e) {}
    log('Abriendo ventana de Meta (si no ves popup, permite ventanas emergentes para localhost).');
    FB.login(
      function (response) {
        if (!response.authResponse || !response.authResponse.accessToken) {
          log('Inicio de sesión cancelado o sin token.');
          return;
        }
        enviarTokenAlServidor(response.authResponse.accessToken, channel);
      },
      { scope: 'email,public_profile' }
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

  /**
   * @param {{ alwaysApplyEmail?: boolean }} opts - Si true, el input copia siempre localStorage (tras Guardar/Cerrar sesión).
   */
  function syncFormularioDesdeStorage(opts) {
    opts = opts || {};
    var em = getStoredEmail();
    if (emailInp) {
      if (opts.alwaysApplyEmail) {
        emailInp.value = em || '';
      } else if (!usuarioEditandoCorreoDistintoAlGuardado()) {
        emailInp.value = em || '';
      }
    }
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

  if (emailInp) {
    emailInp.addEventListener('input', function () {
      actualizarBotonesVincular();
      refrescarTextoVinculacion();
    });
  }

  if (btnGuardar) {
    btnGuardar.addEventListener('click', function () {
      var e = (emailInp && emailInp.value && emailInp.value.trim()) || '';
      if (!e || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) {
        log('Introduce un correo válido.');
        return;
      }
      var anterior = getStoredEmail();
      var nuevoNorm = e.toLowerCase();
      var cambioCorreo =
        anterior && anterior.toLowerCase().trim() !== nuevoNorm;

      setStoredEmail(e);

      if (cambioCorreo) {
        resetMetaLinkLocalOnly();
        log(
          'Correo actualizado. Se reinició la vinculación anterior y la sesión de Meta en esta página.'
        );
        logoutFacebookSdk(function () {
          log('Puedes pulsar Facebook o Instagram con la cuenta que use este correo.');
          syncFormularioDesdeStorage({ alwaysApplyEmail: true });
        });
        return;
      }

      log('Correo guardado. Con el SDK de Meta puedes vincular Facebook e Instagram.');
      syncFormularioDesdeStorage({ alwaysApplyEmail: true });
    });
  }

  if (btnLogout) {
    btnLogout.addEventListener('click', function () {
      resetMetaLinkLocalOnly();
      logoutFacebookSdk(function () {});
      setStoredEmail('');
      if (emailInp) emailInp.value = '';
      log('Sesión local borrada y Facebook desconectado en esta app.');
      syncFormularioDesdeStorage({ alwaysApplyEmail: true });
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
