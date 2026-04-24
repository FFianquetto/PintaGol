(function (window) {
  'use strict';

  var store = window.PintaGolZombieStore;

  function byAnyId(ids) {
    for (var i = 0; i < ids.length; i++) {
      var el = document.getElementById(ids[i]);
      if (el) return el;
    }
    return null;
  }

  function renderConnectedUsers(players) {
    var usersEl = byAnyId(['zombie-users', 'matchmaking-users']);
    var countEl = byAnyId(['zombie-count', 'matchmaking-count']);
    if (countEl) countEl.textContent = players.length + ' / ' + store.REQUIRED_PLAYERS + ' jugadores conectados';
    if (!usersEl) return;
    usersEl.innerHTML = '';
    players.forEach(function (player, index) {
      var row = document.createElement('div');
      row.className = 'matchmaking-user';
      row.innerHTML = '<strong>' + (player.name || ('Jugador ' + (index + 1))) + '</strong><span>' + (player.weaponLabel || 'Sin arma') + '</span>';
      usersEl.appendChild(row);
    });
  }

  function showStatus(title, text) {
    var titleEl = byAnyId(['zombie-title', 'matchmaking-title']);
    var textEl = byAnyId(['zombie-text', 'matchmaking-text']);
    if (titleEl) titleEl.textContent = title;
    if (textEl) textEl.textContent = text;
  }

  function createController() {
    var weapon = '';
    var weaponLabel = '';
    var playerName = '';
    var heartbeatInterval = null;
    var renderInterval = null;
    var redirected = false;
    var ACTIVE_MATCH_KEY = 'pintagol_zombie_active_match';
    var localPlayerId = store.getSessionId();

    function goToGame(game) {
      if (redirected || !game || !game.id) return;
      redirected = true;
      var safePlayerName = playerName || ('Jugador-' + String(localPlayerId || '').slice(-4));
      var safeWeaponLabel = weaponLabel || 'Sin arma';
      var safeWeaponKey = weapon || '';
      window.sessionStorage.setItem(ACTIVE_MATCH_KEY, JSON.stringify({
        gameId: game.id,
        weapon: safeWeaponKey,
        weaponLabel: safeWeaponLabel,
        playerName: safePlayerName,
        playerId: localPlayerId
      }));
      var cacheBust = Date.now();
      var basePath = window.location.protocol === 'file:' ? 'zombie-sync.html' : '/zombie-sync';
      // Misma firma de query params que astro-sync.
      window.location.href =
        basePath +
        '?v=' + encodeURIComponent(String(cacheBust)) +
        '&game=' + encodeURIComponent(game.id) +
        '&pais=' + encodeURIComponent(safeWeaponLabel) +
        '&countryKey=' + encodeURIComponent(safeWeaponKey) +
        '&playerName=' + encodeURIComponent(safePlayerName) +
        '&playerId=' + encodeURIComponent(localPlayerId);
    }

    function heartbeat() {
      store.upsertRoomPlayer({
        name: playerName,
        weapon: weapon,
        weaponLabel: weaponLabel,
        status: 'waiting'
      });
    }

    function refreshView() {
      var room = store.getRoom();
      var queuePlayers = store.getQueuePlayers(room);
      renderConnectedUsers(queuePlayers);
      if (queuePlayers.length < store.REQUIRED_PLAYERS) {
        showStatus('Buscando partida Zombie...', 'Esperando a que se conecten 4 jugadores.');
        return;
      }
      showStatus('Sala Zombie lista', 'Entrando al mapa zombie...');
      var game = store.createGameIfReady();
      if (game) {
        window.setTimeout(function () { goToGame(game); }, 350);
      }
    }

    return {
      start: function (selection) {
        weapon = selection.weapon;
        weaponLabel = selection.weaponLabel;
        playerName = selection.name || '';
        heartbeat();
        refreshView();
        heartbeatInterval = window.setInterval(heartbeat, 1200);
        renderInterval = window.setInterval(refreshView, 900);
      },
      onStorage: function (event) {
        if (event.key === store.ROOM_KEY || event.key === store.GAME_KEY) refreshView();
      },
      renderNow: refreshView,
      cleanup: function () {
        if (heartbeatInterval) window.clearInterval(heartbeatInterval);
        if (renderInterval) window.clearInterval(renderInterval);
        if (!redirected) store.removeRoomPlayer();
      }
    };
  }

  window.PintaGolZombieMatchmaking = {
    createController: createController
  };
})(window);
