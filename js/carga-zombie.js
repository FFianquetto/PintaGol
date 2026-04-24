(function () {
  'use strict';

  var controller = null;
  var ZOMBIE_PLAYER_KEY = 'pintagol_zombie_selected_player';
  var ACTIVE_ZOMBIE_MATCH_KEY = 'pintagol_zombie_active_match';

  function getSelection() {
    var params = new URLSearchParams(window.location.search);
    var fromUrl = {
      weapon: params.get('weapon') || '',
      weaponLabel: params.get('weaponLabel') || '',
      name: params.get('playerName') || ''
    };
    if (fromUrl.weapon && fromUrl.weaponLabel && fromUrl.name) {
      window.sessionStorage.setItem(ZOMBIE_PLAYER_KEY, JSON.stringify(fromUrl));
      return fromUrl;
    }
    try {
      var cached = JSON.parse(window.sessionStorage.getItem(ZOMBIE_PLAYER_KEY) || 'null');
      if (cached && cached.weapon && cached.weaponLabel && cached.name) return cached;
    } catch (_error) {}
    return { weapon: '', weaponLabel: '', name: '' };
  }

  function renderSelection(data) {
    var player = document.getElementById('zombie-player');
    var weapon = document.getElementById('zombie-weapon');
    if (player) player.textContent = data.name ? 'Jugador: ' + data.name : 'Jugador: Sin nombre';
    if (weapon) weapon.textContent = data.weaponLabel ? 'Arma seleccionada: ' + data.weaponLabel : 'Arma seleccionada: Sin arma';
  }

  function init() {
    var btnCancelar = document.getElementById('btn-cancelar-zombie');
    if (btnCancelar) {
      btnCancelar.addEventListener('click', function () {
        if (controller) controller.cleanup();
        window.location.href = 'seleccion-arma-zombie.html';
      });
    }
    var selection = getSelection();
    if (!selection.weapon || !selection.weaponLabel || !selection.name) {
      var title = document.getElementById('zombie-title');
      var text = document.getElementById('zombie-text');
      if (title) title.textContent = 'No se encontró arma seleccionada';
      if (text) text.textContent = 'Vuelve a seleccionar tu arma para iniciar la búsqueda zombie.';
      return;
    }
    window.PintaGolZombieStore.prepareMatchmaking();
    window.sessionStorage.removeItem(ACTIVE_ZOMBIE_MATCH_KEY);
    renderSelection(selection);
    controller = window.PintaGolZombieMatchmaking.createController();
    controller.start(selection);
    controller.renderNow();
    window.addEventListener('storage', function (event) {
      controller.onStorage(event);
    });
    window.addEventListener('beforeunload', function () {
      if (controller) controller.cleanup();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
