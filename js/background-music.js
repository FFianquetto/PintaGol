/**
 * Música de fondo: en <body> data-bgm="overture" (lobby y juego) o "halo" (multijugador).
 * Si el navegador bloquea autoplay, inicia con el primer clic o tecla.
 */
(function () {
  'use strict';

  var SRC = {
    overture: 'assets/sfx/Overture.MP3',
    halo: 'assets/sfx/Halo.MP3'
  };
  var VOLUME = 0.3;

  function getMode() {
    var b = document.body;
    if (!b) return 'overture';
    return (b.getAttribute('data-bgm') || '').toLowerCase() === 'halo' ? 'halo' : 'overture';
  }

  function init() {
    if (document.getElementById('pintagol-bgm')) return;
    var a = new Audio();
    a.id = 'pintagol-bgm';
    a.preload = 'auto';
    a.loop = true;
    a.volume = VOLUME;
    a.src = SRC[getMode()];
    document.body.appendChild(a);

    function cleanup() {
      document.removeEventListener('pointerdown', unlock, true);
      document.removeEventListener('keydown', unlock, true);
    }
    function unlock() {
      a.play()
        .then(cleanup)
        .catch(function () {});
    }
    a.play()
      .then(cleanup)
      .catch(function () {
        document.addEventListener('pointerdown', unlock, true);
        document.addEventListener('keydown', unlock, true);
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
