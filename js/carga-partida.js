(function () {
  'use strict';

  var controller = null;
  var unsubscribeRealtime = function () {};
  var SELECTED_PLAYER_KEY = 'pintagol_selected_player';
  var ACTIVE_MATCH_KEY = 'pintagol_active_match';

  function getCountryData() {
    var params = new URLSearchParams(window.location.search);
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

  function renderCountry(countryData) {
    var playerEl = document.getElementById('matchmaking-player');
    var el = document.getElementById('matchmaking-country');
    if (playerEl) {
      playerEl.textContent = countryData.name ? 'Jugador: ' + countryData.name : 'Jugador: Sin nombre';
    }
    if (!el) return;
    el.textContent = countryData.label ? 'País seleccionado: ' + countryData.label : 'País seleccionado: Sin país';
  }

  function init() {
    var btnCancelar = document.getElementById('btn-cancelar-busqueda');
    if (btnCancelar) {
      btnCancelar.addEventListener('click', function () {
        unsubscribeRealtime();
        if (controller) controller.cleanup();
        window.location.href = 'seleccion-pais.html';
      });
    }

    var countryData = getCountryData();
    if (!countryData.label || !countryData.key || !countryData.name) {
      var title = document.getElementById('matchmaking-title');
      var text = document.getElementById('matchmaking-text');
      if (title) title.textContent = 'No se encontró país seleccionado';
      if (text) text.textContent = 'Vuelve a seleccionar tu país para iniciar la búsqueda.';
      return;
    }

    window.PintaGolMultiplayerStore.prepareMatchmaking();
    window.sessionStorage.removeItem(ACTIVE_MATCH_KEY);
    renderCountry(countryData);
    controller = window.PintaGolMatchmaking.createController();
    controller.start(countryData);
    controller.renderNow();

    window.addEventListener('storage', function (event) {
      controller.onStorage(event);
    });
    unsubscribeRealtime = window.PintaGolMultiplayerStore.subscribeRealtime(function () {
      controller.renderNow();
    });

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
