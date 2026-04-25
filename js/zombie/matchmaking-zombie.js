(function (window) {
  'use strict';

  var store = window.PintaGolZombieStore;
  var MAP_LABELS = {
    invierno: 'Invierno',
    primavera: 'Primavera',
    otono: 'Otono'
  };

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
        seasonKey: game.seasonKey || 'invierno',
        seasonLabel: game.seasonLabel || 'Invierno',
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
        '&season=' + encodeURIComponent(game.seasonKey || 'invierno') +
        '&seasonLabel=' + encodeURIComponent(game.seasonLabel || 'Invierno') +
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

    function getVotePanelElements() {
      return {
        panel: byAnyId(['zombie-map-vote-panel']),
        text: byAnyId(['zombie-map-vote-text']),
        picked: byAnyId(['zombie-map-vote-picked']),
        counts: byAnyId(['zombie-map-vote-counts'])
      };
    }

    function computeVoteCounts(voteState, queuePlayers) {
      var counts = { invierno: 0, primavera: 0, otono: 0 };
      var token = voteState && voteState.token ? voteState.token : '';
      var eligibleIds = token
        ? token.split('|')
        : (queuePlayers || []).slice(0, store.REQUIRED_PLAYERS).map(function (p) { return p && p.id; });
      for (var i = 0; i < eligibleIds.length; i++) {
        var vote = voteState && voteState.votes ? voteState.votes[eligibleIds[i]] : '';
        if (vote === 'invierno' || vote === 'primavera' || vote === 'otono') counts[vote] += 1;
      }
      return counts;
    }

    function setVoteButtonsState(selectedKey, disableAll) {
      document.querySelectorAll('.zombie-map-vote-btn').forEach(function (btn) {
        var isActive = btn.getAttribute('data-season') === selectedKey;
        btn.classList.toggle('active', !!isActive);
        btn.disabled = !!disableAll;
      });
    }

    function renderVotePanel(queuePlayers, voteState) {
      var elements = getVotePanelElements();
      if (!elements.panel) return;
      if (queuePlayers.length < store.REQUIRED_PLAYERS) {
        elements.panel.hidden = true;
        return;
      }
      elements.panel.hidden = false;
      var localVote = voteState && voteState.votes ? voteState.votes[localPlayerId] : '';
      var disableVoting = !!(localVote || (voteState && voteState.resolvedSeasonKey));
      setVoteButtonsState(localVote || '', disableVoting);
      var counts = computeVoteCounts(voteState, queuePlayers);
      if (elements.counts) {
        elements.counts.textContent =
          'Invierno: ' + counts.invierno +
          ' · Primavera: ' + counts.primavera +
          ' · Otono: ' + counts.otono;
      }
      if (!elements.text || !elements.picked) return;
      if (voteState && voteState.resolvedSeasonKey) {
        elements.text.textContent = 'Mapa elegido por votacion.';
        elements.picked.textContent = 'Mapa final: ' + (voteState.resolvedSeasonLabel || MAP_LABELS[voteState.resolvedSeasonKey] || 'Invierno');
        return;
      }
      elements.text.textContent = 'Todos votan: gana la mayoria. Si hay empate, se elige uno al azar.';
      if (localVote) {
        elements.picked.textContent = 'Tu voto: ' + (MAP_LABELS[localVote] || localVote) + ' (no se puede cambiar).';
      } else {
        elements.picked.textContent = 'Aun no has votado.';
      }
    }

    function bindVoteButtons() {
      document.querySelectorAll('.zombie-map-vote-btn').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var seasonKey = btn.getAttribute('data-season') || '';
          if (!seasonKey) return;
          var room = store.getRoom();
          var queuePlayers = store.getQueuePlayers(room);
          store.castMapVote(queuePlayers, seasonKey);
          refreshView();
        });
      });
    }

    function refreshView() {
      var room = store.getRoom();
      var queuePlayers = store.getQueuePlayers(room);
      renderConnectedUsers(queuePlayers);
      if (queuePlayers.length < store.REQUIRED_PLAYERS) {
        showStatus('Buscando partida Zombie...', 'Esperando a que se conecten 4 jugadores.');
        renderVotePanel(queuePlayers, null);
        return;
      }

      var voteState = store.ensureMapVote(queuePlayers);
      renderVotePanel(queuePlayers, voteState);
      voteState = store.resolveMapVote(queuePlayers) || voteState;
      renderVotePanel(queuePlayers, voteState);
      if (!voteState || !voteState.resolvedSeasonKey) {
        var totalVotes = voteState && voteState.votes ? Object.keys(voteState.votes).length : 0;
        showStatus('Sala Zombie lista', 'Ya hay 4 jugadores. Votos registrados: ' + totalVotes + ' / 4.');
        return;
      }

      showStatus('Mapa elegido', 'Entrando al mapa zombie ' + (voteState.resolvedSeasonLabel || 'Invierno') + '...');
      var game = store.createGameIfReady({ seasonKey: voteState.resolvedSeasonKey });
      if (game) {
        window.setTimeout(function () { goToGame(game); }, 350);
      }
    }

    return {
      start: function (selection) {
        weapon = selection.weapon;
        weaponLabel = selection.weaponLabel;
        playerName = selection.name || '';
        bindVoteButtons();
        heartbeat();
        refreshView();
        heartbeatInterval = window.setInterval(heartbeat, 1200);
        renderInterval = window.setInterval(refreshView, 900);
      },
      onStorage: function (event) {
        if (event.key === store.ROOM_KEY || event.key === store.GAME_KEY || event.key === store.MAP_VOTE_KEY) refreshView();
      },
      renderNow: refreshView,
      cleanup: function () {
        if (heartbeatInterval) window.clearInterval(heartbeatInterval);
        if (renderInterval) window.clearInterval(renderInterval);
        if (!redirected) {
          store.removeMapVoteForLocalPlayer();
          store.removeRoomPlayer();
        }
      }
    };
  }

  window.PintaGolZombieMatchmaking = {
    createController: createController
  };
})(window);
