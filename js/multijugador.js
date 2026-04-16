(function () {
  'use strict';

  var clock = new THREE.Clock();
  var store = window.PintaGolMultiplayerStore;
  var localPlayerId = store.getSessionId();
  var gameScene = null;
  var controls = null;
  var syncInterval = null;
  var roomHeartbeat = null;
  var currentCountry = '';
  var currentCountryKey = '';
  var currentPlayerName = '';
  var expectedGameId = '';
  var ACTIVE_MATCH_KEY = 'pintagol_active_match';

  function getQueryParams() {
    return new URLSearchParams(window.location.search);
  }

  function updateCountryLabel() {
    var params = getQueryParams();
    var queryGameId = params.get('game') || '';
    var queryCountry = params.get('pais') || '';
    var queryCountryKey = params.get('countryKey') || '';
    var queryPlayerName = params.get('playerName') || '';
    var queryPlayerId = params.get('playerId') || '';
    var sessionMatch = null;

    try {
      sessionMatch = JSON.parse(window.sessionStorage.getItem(ACTIVE_MATCH_KEY) || 'null');
    } catch (error) {
      sessionMatch = null;
    }

    localPlayerId = queryPlayerId || localPlayerId;
    expectedGameId = queryGameId || (sessionMatch && sessionMatch.gameId) || '';
    currentCountry = queryCountry || (sessionMatch && sessionMatch.country) || 'Sin selección';
    currentCountryKey = queryCountryKey || (sessionMatch && sessionMatch.countryKey) || '';
    currentPlayerName = queryPlayerName || (sessionMatch && sessionMatch.playerName) || ('Jugador ' + localPlayerId.slice(-4));

    if (expectedGameId) {
      window.sessionStorage.setItem(ACTIVE_MATCH_KEY, JSON.stringify({
        gameId: expectedGameId,
        country: currentCountry,
        countryKey: currentCountryKey,
        playerName: currentPlayerName,
        playerId: localPlayerId
      }));
    }
    var playerTarget = document.getElementById('multiplayer-player');
    var target = document.getElementById('multiplayer-country');
    if (playerTarget) {
      playerTarget.textContent = 'Jugador: ' + currentPlayerName;
    }
    if (!target) return;
    target.textContent = 'País conectado: ' + currentCountry;
  }

  function bindUI() {
    var btnLobby = document.getElementById('btn-volver-lobby');
    var btnPais = document.getElementById('btn-cambiar-pais');

    if (btnLobby) {
      btnLobby.addEventListener('click', function () {
        window.location.href = 'index.html';
      });
    }

    if (btnPais) {
      btnPais.addEventListener('click', function () {
        window.location.href = 'seleccion-pais.html';
      });
    }
  }

  function getLocalPlayer(game) {
    if (!game || !Array.isArray(game.players)) return null;
    for (var i = 0; i < game.players.length; i++) {
      if (game.players[i].id === localPlayerId) {
        return game.players[i];
      }
    }
    return null;
  }

  function getRenderableGame() {
    var game = store.getGame();
    if (!game || game.status !== 'active' || !Array.isArray(game.players) || !game.players.length) {
      var room = store.getRoom();
      var roomPlayers = (room && room.players ? room.players : []).filter(function (player) {
        return player && player.status !== 'waiting';
      });
      if (!roomPlayers.length) {
        // Fallback de emergencia: siempre mostrar al jugador local para evitar escena vacía.
        return {
          id: 'local-emergency',
          status: 'active',
          players: [{
            id: localPlayerId,
            name: currentPlayerName || 'Jugador local',
            country: currentCountryKey || '',
            countryLabel: currentCountry || '',
            x: 0,
            y: 0,
            z: 0,
            rotationY: Math.PI
          }]
        };
      }

      // Fallback visual: mostrar jugadores de sala mientras el GAME se estabiliza.
      return {
        id: 'room-fallback',
        status: 'active',
        players: roomPlayers.map(function (player, index) {
          return {
            id: player.id,
            name: player.name || ('Jugador ' + (index + 1)),
            country: player.country || '',
            countryLabel: player.countryLabel || '',
            x: -4 + (index % 4) * 2.6,
            y: 0,
            z: Math.floor(index / 4) * 2.2 - 1.1,
            rotationY: Math.PI
          };
        })
      };
    }
    if (!expectedGameId || game.id !== expectedGameId) {
      expectedGameId = game.id;
    }
    return game;
  }

  function syncScene() {
    var game = getRenderableGame();
    if (!game) return;
    gameScene.syncPlayers(game.players, clock.getElapsedTime());
  }

  function updateLocalPlayer() {
    var game = getRenderableGame();
    if (!game || !Array.isArray(game.players)) return;
    if (game.id === 'room-fallback') return;

    var byId = getLocalPlayer(game);
    if (!byId) {
      // Intentar reasignar el id local por nombre para recuperar control.
      var byName = game.players.find(function (player) {
        return player && player.name === currentPlayerName;
      });
      if (byName && byName.id) {
        localPlayerId = byName.id;
        window.sessionStorage.setItem(ACTIVE_MATCH_KEY, JSON.stringify({
          gameId: expectedGameId,
          country: currentCountry,
          countryKey: currentCountryKey,
          playerName: currentPlayerName,
          playerId: localPlayerId
        }));
      }
    }

    var player = getLocalPlayer(game);
    if (!player) return;
    controls.move(player);
    if (game.id !== 'local-emergency') {
      store.updateGamePlayer(player);
    }
  }

  function startNetworkLoops() {
    store.upsertRoomPlayer({
      name: currentPlayerName,
      country: currentCountryKey,
      countryLabel: currentCountry,
      status: 'playing'
    });

    if (syncInterval) window.clearInterval(syncInterval);
    syncInterval = window.setInterval(function () {
      syncScene();
    }, 120);

    if (roomHeartbeat) window.clearInterval(roomHeartbeat);
    roomHeartbeat = window.setInterval(function () {
      store.upsertRoomPlayer({
        name: currentPlayerName,
        country: currentCountryKey,
        countryLabel: currentCountry,
        status: 'playing'
      });
      store.cleanupGameIfEmpty();
    }, 1000);
  }

  function animate() {
    requestAnimationFrame(animate);
    updateLocalPlayer();
    syncScene();

    var localHero = gameScene.getHero(localPlayerId) || gameScene.getAnyHero();
    if (localHero) {
      // Cámara tercera persona detrás del personaje local.
      var desiredX = localHero.position.x - Math.sin(localHero.rotation.y) * 2.2;
      var desiredY = localHero.position.y + 2.2;
      var desiredZ = localHero.position.z - Math.cos(localHero.rotation.y) * 2.2;
      gameScene.camera.position.x += (desiredX - gameScene.camera.position.x) * 0.09;
      gameScene.camera.position.y += (desiredY - gameScene.camera.position.y) * 0.09;
      gameScene.camera.position.z += (desiredZ - gameScene.camera.position.z) * 0.09;
      gameScene.camera.lookAt(localHero.position.x, localHero.position.y + 1.2, localHero.position.z);

      // Micro animación del arma para reforzar feedback visual.
      var weapon = localHero.getObjectByName('weapon-model');
      if (weapon) {
        var t = clock.getElapsedTime();
        weapon.rotation.z = -0.22 + Math.sin(t * 8) * 0.02;
        weapon.position.y = 1.52 + Math.cos(t * 8) * 0.01;
      }
    } else {
      // Cámara estable mientras aparece el muñeco local.
      gameScene.camera.lookAt(0, 1.2, 0);
    }
    gameScene.renderer.render(gameScene.scene, gameScene.camera);
  }

  function init() {
    var canvas = document.getElementById('multiplayer-canvas');
    if (!canvas) return;
    gameScene = window.PintaGolGameScene.createScene(canvas);
    controls = window.PintaGolGameControls.createControls();
    updateCountryLabel();
    if (!expectedGameId) {
      var countryEl = document.getElementById('multiplayer-country');
      if (countryEl) {
        countryEl.textContent = 'Esperando partida activa. Vuelve a buscar partida desde la sala de carga.';
      }
      return;
    }
    bindUI();
    startNetworkLoops();
    syncScene();

    controls.bind();
    window.addEventListener('resize', gameScene.resize);
    window.addEventListener('storage', function (event) {
      if (event.key === store.GAME_KEY) {
        syncScene();
      }
    });
    window.addEventListener('beforeunload', function () {
      if (syncInterval) window.clearInterval(syncInterval);
      if (roomHeartbeat) window.clearInterval(roomHeartbeat);
      store.removeRoomPlayer();
    });
    animate();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
