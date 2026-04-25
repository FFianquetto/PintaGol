(function (window) {
  'use strict';

  var store = window.PintaGolMultiplayerStore;
  var MAP_LABELS = {
    invierno: 'Invierno',
    primavera: 'Primavera',
    otono: 'Otono'
  };

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

    function isGameCompatibleWithVote(game, voteState) {
      if (!isGameReadyForRedirect(game) || !voteState || !voteState.resolvedSeasonKey) return false;
      var gameSeason = String(game.seasonKey || '').toLowerCase();
      if (gameSeason !== String(voteState.resolvedSeasonKey || '').toLowerCase()) return false;
      // Prioridad: todos a la misma partida/zona. No bloquear por membresía local.
      return true;
    }

    function resolveLocalPlayerIdForGame(game) {
      if (!game || !Array.isArray(game.players)) return localPlayerId;
      if (isLocalPlayerInGame(game)) return localPlayerId;
      // Evita reasignaciones ambiguas: país por sí solo puede duplicar ids/colores.
      for (var i = 0; i < game.players.length; i++) {
        var exact = game.players[i];
        if (!exact) continue;
        var sameNameAndCountry =
          !!playerName &&
          !!selectedCountryKey &&
          exact.name === playerName &&
          exact.country === selectedCountryKey;
        if (sameNameAndCountry) {
          return exact.id || localPlayerId;
        }
      }
      for (var i = 0; i < game.players.length; i++) {
        var player = game.players[i];
        if (!player) continue;
        var sameName = !!playerName && player.name === playerName;
        if (sameName) {
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
        seasonKey: game.seasonKey || 'invierno',
        seasonLabel: game.seasonLabel || 'Invierno',
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
      dest.searchParams.set('season', game.seasonKey || 'invierno');
      dest.searchParams.set('seasonLabel', game.seasonLabel || 'Invierno');
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

    function getVotePanelElements() {
      return {
        panel: document.getElementById('map-vote-panel'),
        text: document.getElementById('map-vote-text'),
        picked: document.getElementById('map-vote-picked'),
        counts: document.getElementById('map-vote-counts')
      };
    }

    function setVoteButtonsActive(selectedKey, disableAll) {
      var buttons = document.querySelectorAll('.map-vote-btn');
      buttons.forEach(function (btn) {
        if (btn.getAttribute('data-season') === selectedKey) {
          btn.classList.add('active');
        } else {
          btn.classList.remove('active');
        }
        btn.disabled = !!disableAll;
      });
    }

    function computeVoteCounts(voteState, queuePlayers) {
      var counts = { invierno: 0, primavera: 0, otono: 0 };
      var token = voteState && voteState.token ? voteState.token : '';
      var eligibleIds = token
        ? token.split('|')
        : (queuePlayers || []).slice(0, store.REQUIRED_PLAYERS).map(function (p) { return p && p.id; });
      for (var i = 0; i < eligibleIds.length; i++) {
        var playerId = eligibleIds[i];
        var vote = voteState && voteState.votes ? voteState.votes[playerId] : '';
        if (vote === 'invierno' || vote === 'primavera' || vote === 'otono') {
          counts[vote] += 1;
        }
      }
      return counts;
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
      setVoteButtonsActive(localVote || '', disableVoting);
      if (!elements.text || !elements.picked) return;
      var counts = computeVoteCounts(voteState, queuePlayers);
      if (elements.counts) {
        elements.counts.textContent =
          'Invierno: ' + counts.invierno +
          ' · Primavera: ' + counts.primavera +
          ' · Otono: ' + counts.otono;
      }
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
      document.querySelectorAll('.map-vote-btn').forEach(function (btn) {
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
      if (!selectedCountry) return;
      var room = store.getRoom();
      var queuePlayers = store.getQueuePlayers(room);

      renderConnectedUsers(queuePlayers);

      if (queuePlayers.length < store.REQUIRED_PLAYERS) {
        showStatus(
          'Buscando partida...',
          'Esperando a que se conecten ' + store.REQUIRED_PLAYERS + ' jugadores para iniciar.'
        );
        renderVotePanel(queuePlayers, null);
        return;
      }

      var voteState = store.ensureMapVote(queuePlayers);
      renderVotePanel(queuePlayers, voteState);
      voteState = store.resolveMapVote(queuePlayers) || voteState;
      renderVotePanel(queuePlayers, voteState);
      if (!voteState || !voteState.resolvedSeasonKey) {
        var totalVotes = voteState && voteState.votes ? Object.keys(voteState.votes).length : 0;
        showStatus('Sala lista', 'Ya hay 4 jugadores. Votos registrados: ' + totalVotes + ' / 4.');
        return;
      }

      var activeGame = store.getGame();
      if (isGameCompatibleWithVote(activeGame, voteState)) {
        goToGame(activeGame);
        if (redirectedToGame) return;
      }

      showStatus('Mapa elegido', 'Cargando partida en mapa ' + (voteState.resolvedSeasonLabel || 'Invierno') + '...');
      var game = store.createGameIfReady({
        seasonKey: voteState.resolvedSeasonKey
      });
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
        bindVoteButtons();
        heartbeat();
        refreshView();
        if (heartbeatInterval) window.clearInterval(heartbeatInterval);
        heartbeatInterval = window.setInterval(heartbeat, 1200);
        if (renderInterval) window.clearInterval(renderInterval);
        renderInterval = window.setInterval(refreshView, 900);
      },
      onStorage: function (event) {
        if (event.key === store.ROOM_KEY || event.key === store.GAME_KEY || event.key === store.MAP_VOTE_KEY) {
          refreshView();
        }
      },
      renderNow: function () {
        refreshView();
      },
      cleanup: function () {
        if (heartbeatInterval) window.clearInterval(heartbeatInterval);
        if (renderInterval) window.clearInterval(renderInterval);
        if (!redirectedToGame) {
          store.removeMapVoteForLocalPlayer();
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
