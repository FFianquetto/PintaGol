(function () {
  'use strict';

  var controller = null;
  var unsubscribeRealtime = function () {};
  var SELECTED_PLAYER_KEY = 'pintagol_selected_player';
  var ZOMBIE_PLAYER_KEY = 'pintagol_zombie_selected_player';
  var ACTIVE_MATCH_KEY = 'pintagol_active_match';
  var ACTIVE_ZOMBIE_MATCH_KEY = 'pintagol_zombie_active_match';

  function getMode() {
    var params = new URLSearchParams(window.location.search);
    return params.get('modo') === 'zombie' ? 'zombie' : 'batalla';
  }

  function getSelectionData(mode) {
    var params = new URLSearchParams(window.location.search);
    if (mode === 'zombie') {
      var zombieFromUrl = {
        weapon: params.get('weapon') || '',
        weaponLabel: params.get('weaponLabel') || '',
        name: params.get('playerName') || ''
      };
      if (zombieFromUrl.weapon && zombieFromUrl.weaponLabel && zombieFromUrl.name) {
        window.sessionStorage.setItem(ZOMBIE_PLAYER_KEY, JSON.stringify(zombieFromUrl));
        return zombieFromUrl;
      }
      try {
        var zombieCached = JSON.parse(window.sessionStorage.getItem(ZOMBIE_PLAYER_KEY) || 'null');
        if (zombieCached && zombieCached.weapon && zombieCached.weaponLabel && zombieCached.name) {
          return zombieCached;
        }
      } catch (_zErr) {}
      return { weapon: '', weaponLabel: '', name: '' };
    }

    var fromUrl = {
      label: params.get('pais') || '',
      key: params.get('countryKey') || '',
      name: params.get('playerName') || ''
    };
    if (fromUrl.label && fromUrl.key && fromUrl.name) {
      window.sessionStorage.setItem(SELECTED_PLAYER_KEY, JSON.stringify(fromUrl));
      return fromUrl;
    }
    try {
      var cached = JSON.parse(window.sessionStorage.getItem(SELECTED_PLAYER_KEY) || 'null');
      if (cached && cached.label && cached.key && cached.name) {
        return cached;
      }
    } catch (error) {
      // continuar con retorno vacío
    }

    return { label: '', key: '', name: '' };
  }

  function renderSelection(data, mode) {
    var playerEl = document.getElementById('matchmaking-player');
    var el = document.getElementById('matchmaking-country');
    if (playerEl) {
      playerEl.textContent = data.name ? 'Jugador: ' + data.name : 'Jugador: Sin nombre';
    }
    if (!el) return;
    if (mode === 'zombie') {
      el.textContent = data.weaponLabel ? 'Arma seleccionada: ' + data.weaponLabel : 'Arma seleccionada: Sin arma';
      return;
    }
    el.textContent = data.label ? 'País seleccionado: ' + data.label : 'País seleccionado: Sin país';
  }

  function init() {
    var mode = getMode();
    var isZombie = mode === 'zombie';
    var btnCancelar = document.getElementById('btn-cancelar-busqueda');
    if (btnCancelar) {
      btnCancelar.addEventListener('click', function () {
        unsubscribeRealtime();
        if (controller) controller.cleanup();
        window.location.href = isZombie ? 'seleccion-arma-zombie.html' : 'seleccion-pais.html';
      });
    }

    var data = getSelectionData(mode);
    var invalid = isZombie
      ? (!data.weapon || !data.weaponLabel || !data.name)
      : (!data.label || !data.key || !data.name);
    if (invalid) {
      var title = document.getElementById('matchmaking-title');
      var text = document.getElementById('matchmaking-text');
      if (title) title.textContent = isZombie ? 'No se encontró arma seleccionada' : 'No se encontró país seleccionado';
      if (text) text.textContent = isZombie
        ? 'Vuelve a seleccionar tu arma para iniciar la búsqueda.'
        : 'Vuelve a seleccionar tu país para iniciar la búsqueda.';
      return;
    }

    if (isZombie) {
      window.PintaGolZombieStore.prepareMatchmaking();
      window.sessionStorage.removeItem(ACTIVE_ZOMBIE_MATCH_KEY);
      var textZombie = document.getElementById('matchmaking-text');
      if (textZombie) textZombie.textContent = 'Emparejando jugadores en el lobby zombie.';
      controller = window.PintaGolZombieMatchmaking.createController();
    } else {
      window.PintaGolMultiplayerStore.prepareMatchmaking();
      window.sessionStorage.removeItem(ACTIVE_MATCH_KEY);
      controller = window.PintaGolMatchmaking.createController();
    }
    renderSelection(data, mode);
    controller.start(data);
    controller.renderNow();

    window.addEventListener('storage', function (event) {
      controller.onStorage(event);
    });
    if (!isZombie) {
      unsubscribeRealtime = window.PintaGolMultiplayerStore.subscribeRealtime(function () {
        controller.renderNow();
      });
    }

    window.addEventListener('beforeunload', function () {
      unsubscribeRealtime();
      if (controller) controller.cleanup();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
