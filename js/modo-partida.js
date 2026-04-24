(function () {
  'use strict';

  function init() {
    var btnBatalla = document.getElementById('btn-modo-batalla');
    var btnZombie = document.getElementById('btn-modo-zombie');
    var btnVolver = document.getElementById('btn-modo-volver');

    if (btnBatalla) {
      btnBatalla.addEventListener('click', function () {
        window.location.href = 'seleccion-pais.html';
      });
    }
    if (btnZombie) {
      btnZombie.addEventListener('click', function () {
        window.location.href = 'seleccion-arma-zombie.html';
      });
    }
    if (btnVolver) {
      btnVolver.addEventListener('click', function () {
        window.location.href = 'index.html';
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
