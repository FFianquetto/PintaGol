/**
 * Redes sociales: correo (Firebase) + vincular Facebook (Firebase) + Instagram (OAuth Meta, servidor).
 */
(function () {
  'use strict';

  var auth = window.__firebaseAuth;
  var LS_IG = 'pintagol_redes_instagram_ok';
  var emailInp = document.getElementById('email');
  var passInp = document.getElementById('password');
  var btnReg = document.getElementById('btn-registro');
  var btnLogin = document.getElementById('btn-login');
  var btnLogout = document.getElementById('btn-logout');
  var btnFb = document.getElementById('btn-facebook');
  var btnIg = document.getElementById('btn-instagram');
  var estado = document.getElementById('estado-sesion');
  var logLineas = document.getElementById('log-lineas');
  var avisoConfig = document.getElementById('aviso-config');
  var btnVolver = document.getElementById('btn-volver');

  function log(msg) {
    if (!logLineas) return;
    var t = new Date().toLocaleTimeString();
    logLineas.textContent = (logLineas.textContent ? logLineas.textContent + '\n' : '') + '[' + t + '] ' + msg;
  }

  function mostrarAvisoFirebase() {
    if (!avisoConfig) return;
    if (typeof firebase === 'undefined' || !window.firebaseConfig || /SUSTITUIR/.test(String(firebaseConfig.apiKey || ''))) {
      avisoConfig.classList.add('visible');
      avisoConfig.textContent = 'Configura config/firebase.config.js con las claves de tu proyecto Firebase (ver config/INSTRUCCIONES-REDES.txt).';
    }
  }

  function proveedorFacebook() {
    return new firebase.auth.FacebookAuthProvider();
  }

  function setEstado(texto, clase) {
    if (!estado) return;
    estado.className = clase || 'ok';
    estado.textContent = texto;
  }

  function actualizarBotonesVincular(user) {
    var ok = !!user;
    if (btnFb) btnFb.disabled = !ok;
    if (btnIg) btnIg.disabled = !ok;
    if (btnLogout) btnLogout.hidden = !ok;
    if (btnReg) btnReg.disabled = ok;
    if (btnLogin) btnLogin.disabled = ok;
    if (emailInp) emailInp.disabled = ok;
    if (passInp) passInp.disabled = ok;
  }

  function yaVinculadoFacebook(user) {
    if (!user || !user.providerData) return false;
    for (var i = 0; i < user.providerData.length; i++) {
      if (user.providerData[i].providerId === 'facebook.com') return true;
    }
    return false;
  }

  function yaVinculadoInstagram() {
    try {
      return localStorage.getItem(LS_IG) === '1';
    } catch (e) {
      return false;
    }
  }

  function refrescarTextoVinculacion(user) {
    if (!user) {
      setEstado('Inicia sesión con correo para habilitar los enlaces.', 'ok');
      return;
    }
    var partes = [];
    partes.push('Sesión: ' + (user.email || user.uid) + '.');
    partes.push(yaVinculadoFacebook(user) ? 'Facebook: vinculado.' : 'Facebook: no vinculado.');
    partes.push(yaVinculadoInstagram() ? 'Instagram (Meta): vinculado por correo.' : 'Instagram (Meta): pendiente de vincular.');
    setEstado(partes.join(' '), 'ok');
  }

  if (!auth) {
    setEstado('No se pudo iniciar Firebase. Revisa config/firebase.config.js.', 'err');
    mostrarAvisoFirebase();
    if (btnFb) btnFb.disabled = true;
    if (btnIg) btnIg.disabled = true;
  } else {
    mostrarAvisoFirebase();
    auth.onAuthStateChanged(function (user) {
      actualizarBotonesVincular(user);
      refrescarTextoVinculacion(user);
    });
  }

  if (btnReg && auth) {
    btnReg.addEventListener('click', function () {
      var e = (emailInp && emailInp.value) || '';
      var p = (passInp && passInp.value) || '';
      auth.createUserWithEmailAndPassword(e, p).then(function () {
        log('Cuenta creada. Puedes vincular Facebook e Instagram.');
      }).catch(function (err) {
        log('Error registro: ' + (err && err.message));
      });
    });
  }

  if (btnLogin && auth) {
    btnLogin.addEventListener('click', function () {
      var e = (emailInp && emailInp.value) || '';
      var p = (passInp && passInp.value) || '';
      auth.signInWithEmailAndPassword(e, p).then(function () {
        log('Sesión iniciada.');
      }).catch(function (err) {
        log('Error inicio: ' + (err && err.message));
      });
    });
  }

  if (btnLogout && auth) {
    btnLogout.addEventListener('click', function () {
      auth.signOut().then(function () {
        try { localStorage.removeItem(LS_IG); } catch (e2) {}
        log('Sesión cerrada.');
      });
    });
  }

  if (btnFb && auth) {
    btnFb.addEventListener('click', function () {
      var u = auth.currentUser;
      if (!u) return;
      if (yaVinculadoFacebook(u)) {
        log('Facebook ya estaba vinculado.');
        return;
      }
      var p = proveedorFacebook();
      p.addScope('email');
      p.setCustomParameters({ display: 'popup' });
      u.linkWithPopup(p).then(function () {
        log('Facebook vinculado correctamente.');
        refrescarTextoVinculacion(auth.currentUser);
      }).catch(function (err) {
        log('Facebook: ' + (err && err.message));
      });
    });
  }

  if (btnIg && auth) {
    btnIg.addEventListener('click', function () {
      var u = auth.currentUser;
      if (!u || !u.email) {
        log('Instagram: necesitas una sesión con correo para comprobar la misma identidad.');
        return;
      }
      if (yaVinculadoInstagram()) {
        log('Instagram (Meta) ya constaba como vinculado en este dispositivo.');
        return;
      }
      var w = window.open('/api/redes/instagram/authorize', 'metaOauth', 'width=600,height=700,scrollbars=yes');
      if (!w) {
        log('Permite ventanas emergentes para Instagram / Meta.');
      }
    });
  }

  window.addEventListener('message', function (ev) {
    if (!ev || !ev.data || ev.data.type !== 'redes-meta-ok') return;
    if (ev.origin !== window.location.origin) return;
    if (ev.data.ok === false) {
      log('Meta: ' + (ev.data.message || 'autorización cancelada o con error.'));
      return;
    }
    if (!auth) return;
    var u = auth.currentUser;
    if (!u) {
      log('Meta: inicia sesión con correo antes de aceptar el enlace.');
      return;
    }
    var em = (ev.data.email || '').toLowerCase().trim();
    var mine = (u.email || '').toLowerCase().trim();
    if (!em || em !== mine) {
      setEstado('El correo de Meta no coincide con el de la sesión. Usa el mismo email en Facebook/Instagram y en Pinta Gol.', 'err');
      log('Correo Meta distinto o vacío. Meta: ' + (em || '(vacío)') + ' · local: ' + (mine || '(sin email)'));
      return;
    }
    try {
      localStorage.setItem(LS_IG, '1');
    } catch (e) {}
    log('Instagram (Meta) vinculado: correo verificado.');
    refrescarTextoVinculacion(u);
  });

  if (btnVolver) {
    btnVolver.addEventListener('click', function () {
      window.location.href = 'index.html';
    });
  }
})();
