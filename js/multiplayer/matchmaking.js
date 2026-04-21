(function (window) {
  'use strict';

  var store = window.PintaGolMultiplayerStore;

  function renderConnectedUsers(players) {
    var usersEl = document.getElementById('matchmaking-users');
    var countEl = document.getElementById('matchmaking-count');
    if (countEl) {
      countEl.textContent = players.length + ' / ' + store.REQUIRED_PLAYERS + ' jugadores conectados';
    }
    if (!usersEl) return;

    usersEl.innerHTML = '';
    players.forEach(function (player, index) {
      var row = document.createElement('div');
      row.className = 'matchmaking-user';
      row.innerHTML =
        '<strong>' + (player.name || ('Jugador ' + (index + 1))) + '</strong>' +
        '<span>' + (player.countryLabel || player.country || 'Sin país') + '</span>';
      usersEl.appendChild(row);
    });
  }

  function showStatus(title, text) {
    var overlay = document.getElementById('matchmaking-overlay');
    var titleEl = document.getElementById('matchmaking-title');
    var textEl = document.getElementById('matchmaking-text');

    if (titleEl) titleEl.textContent = title;
    if (textEl) textEl.textContent = text;
    if (overlay) overlay.hidden = false;
  }

  function createController(options) {
    var selectedCountry = '';
    var selectedCountryKey = '';
    var playerName = '';
    var heartbeatInterval = null;
    var renderInterval = null;
    var redirectedToGame = false;
    var localPlayerId = store.getSessionId();
    var ACTIVE_MATCH_KEY = 'pintagol_active_match';

    function isLocalPlayerInGame(game) {
      if (!game || !Array.isArray(game.players)) return false;
      for (var i = 0; i < game.players.length; i++) {
        if (game.players[i].id === localPlayerId) return true;
      }
      return false;
    }

    function isGameReadyForRedirect(game) {
      if (!game || game.status !== 'active' || !Array.isArray(game.players)) return false;
      return game.players.length >= store.REQUIRED_PLAYERS;
    }

    function resolveLocalPlayerIdForGame(game) {
      if (!game || !Array.isArray(game.players)) return localPlayerId;
      if (isLocalPlayerInGame(game)) return localPlayerId;
      for (var i = 0; i < game.players.length; i++) {
        var player = game.players[i];
        if (!player) continue;
        var sameName = playerName && player.name === playerName;
        var sameCountry = selectedCountryKey && player.country === selectedCountryKey;
        if (sameName || sameCountry) {
          return player.id || localPlayerId;
        }
      }
      return localPlayerId;
    }

    function goToGame(game) {
      if (redirectedToGame || !game || !game.id) return;
      localPlayerId = resolveLocalPlayerIdForGame(game);
      redirectedToGame = true;
      window.sessionStorage.setItem(ACTIVE_MATCH_KEY, JSON.stringify({
        gameId: game.id,
        country: selectedCountry,
        countryKey: selectedCountryKey,
        playerName: playerName,
        playerId: localPlayerId
      }));
      var cacheBust = Date.now();
      var dest =
        window.location.protocol === 'file:'
          ? new URL('astro-sync.html', window.location.href)
          : new URL('/astro-sync', window.location.origin);
      dest.searchParams.set('v', String(cacheBust));
      dest.searchParams.set('game', game.id);
      dest.searchParams.set('pais', selectedCountry);
      dest.searchParams.set('countryKey', selectedCountryKey);
      dest.searchParams.set('playerName', playerName);
      dest.searchParams.set('playerId', localPlayerId);
      window.location.href = dest.toString();
    }

    function heartbeat() {
      if (!selectedCountry) return;
      store.upsertRoomPlayer({
        name: playerName,
        country: selectedCountryKey,
        countryLabel: selectedCountry,
        status: 'waiting'
      });
    }

    function refreshView() {
      if (!selectedCountry) return;
      var room = store.getRoom();
      var queuePlayers = store.getQueuePlayers(room);

      renderConnectedUsers(queuePlayers);

      if (queuePlayers.length < store.REQUIRED_PLAYERS) {
        showStatus(
          'Buscando partida...',
          'Esperando a que se conecten ' + store.REQUIRED_PLAYERS + ' jugadores para iniciar.'
        );
        return;
      }

      var activeGame = store.getGame();
      if (isGameReadyForRedirect(activeGame)) {
        goToGame(activeGame);
        if (redirectedToGame) return;
      }

      showStatus('Sala lista', 'Ya hay ' + store.REQUIRED_PLAYERS + ' jugadores conectados. Entrando a la partida.');
      var game = store.createGameIfReady();
      if (game) {
        window.setTimeout(function () {
          goToGame(game);
        }, 400);
      }
    }

    return {
      start: function (countryName) {
        selectedCountry = countryName.label;
        selectedCountryKey = countryName.key;
        playerName = countryName.name;
        showStatus('Buscando partida...', 'Conectando a la sala multijugador con ' + selectedCountry + '.');
        heartbeat();
        refreshView();
        if (heartbeatInterval) window.clearInterval(heartbeatInterval);
        heartbeatInterval = window.setInterval(heartbeat, 1200);
        if (renderInterval) window.clearInterval(renderInterval);
        renderInterval = window.setInterval(refreshView, 900);
      },
      onStorage: function (event) {
        if (event.key === store.ROOM_KEY || event.key === store.GAME_KEY) {
          refreshView();
          var game = store.getGame();
          if (isGameReadyForRedirect(game)) {
            goToGame(game);
          }
        }
      },
      renderNow: function () {
        refreshView();
      },
      cleanup: function () {
        if (heartbeatInterval) window.clearInterval(heartbeatInterval);
        if (renderInterval) window.clearInterval(renderInterval);
        if (!redirectedToGame) {
          store.removeRoomPlayer();
        }
      }
    };
  }

  window.PintaGolMatchmaking = {
    createController: createController,
    renderConnectedUsers: renderConnectedUsers
  };
})(window);
