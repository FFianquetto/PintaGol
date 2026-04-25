/**
 * Inicializa Firebase (compat) y expone auth para otras pantallas.
 * Requiere: script anterior con var firebaseConfig = { ... }
 */
/* global firebase */
(function () {
  'use strict';

  var cfg = typeof window !== 'undefined' ? window.firebaseConfig : null;
  if (typeof firebase === 'undefined' || !cfg) {
    return;
  }
  if (!firebase.apps || firebase.apps.length === 0) {
    firebase.initializeApp(cfg);
  }
  window.__firebaseAuth = firebase.auth();
})();
