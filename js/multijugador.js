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
  var cameraDistance = 3.2;
  var cameraHeight = 2.2;
  var minCameraDistance = 1.8;
  var maxCameraDistance = 18;
  var minCameraHeight = 1.2;
  var maxCameraHeight = 8;
  var localKine = { x: 0, y: 0, z: 0, rotationY: Math.PI, _roomInit: false };
  var CORNER_SPAWNS = [
    { x: 4.5, z: -1.5, rotationY: (3 * Math.PI) / 4 },   // +-
    { x: -4.5, z: 1.5, rotationY: -Math.PI / 4 },        // -+
    { x: -4.5, z: -1.5, rotationY: Math.PI / 4 },        // --
    { x: 4.5, z: 1.5, rotationY: (-3 * Math.PI) / 4 }    // ++
  ];

  function spawnForIndex(index) {
    return CORNER_SPAWNS[((index % CORNER_SPAWNS.length) + CORNER_SPAWNS.length) % CORNER_SPAWNS.length];
  }

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

  function bindCameraZoom(canvas) {
    if (!canvas) return;
    canvas.addEventListener('wheel', function (event) {
      event.preventDefault();
      var zoomStep = event.deltaY * 0.01;
      cameraDistance = Math.max(minCameraDistance, Math.min(maxCameraDistance, cameraDistance + zoomStep));
      // Elevamos un poco la cámara al alejar para mantener referencia del mapa.
      cameraHeight = Math.max(minCameraHeight, Math.min(maxCameraHeight, 1.4 + cameraDistance * 0.35));
    }, { passive: false });
  }

  function addModeloEnMultijugador() {
    if (!gameScene || !gameScene.scene) return;
    var assets = window.PintaGolMultiplayerAssets;
    if (!assets || typeof assets.loadMultijugadorShowcase !== 'function') {
      console.error('PintaGolMultiplayerAssets.loadMultijugadorShowcase no disponible.');
      return;
    }
    if (gameScene.renderer && typeof assets.setRendererMaxAnisotropy === 'function') {
      var cap = gameScene.renderer.capabilities && gameScene.renderer.capabilities.getMaxAnisotropy;
      var maxA = typeof cap === 'function' ? cap.call(gameScene.renderer.capabilities) : 4;
      assets.setRendererMaxAnisotropy(Math.min(4, maxA));
    }
    // Mismos FBX que astro-sync: astro/astronout.fbx + gun1/gun1 (assets.js).
    assets.loadMultijugadorShowcase(gameScene.scene, function (_msg) {
      updateCountryLabel();
    });
  }

  function createFallbackScene(canvas) {
    var scene = new THREE.Scene();
    scene.background = new THREE.Color(0xdbeafe);
    var camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 2.2, 8.6);
    camera.lookAt(0, 0.8, 0);

    var renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

    scene.add(new THREE.AmbientLight(0xffffff, 0.95));
    var keyLight = new THREE.DirectionalLight(0xffffff, 1.1);
    keyLight.position.set(4, 8, 6);
    scene.add(keyLight);

    var floor = new THREE.Mesh(
      new THREE.PlaneGeometry(18, 12, 1, 1),
      new THREE.MeshStandardMaterial({ color: 0x93c5fd, roughness: 0.95, metalness: 0.02 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -1.45;
    scene.add(floor);

    return {
      scene: scene,
      camera: camera,
      renderer: renderer,
      syncPlayers: function () {},
      getHero: function () { return null; },
      getAnyHero: function () { return null; },
      resize: function () {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
      }
    };
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

  function applyWsRemote(gameSnapshot) {
    var bridge = window.PintaGolWsBridge;
    if (!gameSnapshot || !bridge || typeof bridge.mergeRemoteIntoGame !== 'function') {
      return gameSnapshot;
    }
    return bridge.mergeRemoteIntoGame(gameSnapshot, localPlayerId);
  }

  function getRenderableGame() {
    var game = store.getGame();
    if (!game || game.status !== 'active' || !Array.isArray(game.players) || !game.players.length) {
      var room = store.getRoom();
      var roomPlayers = (room && room.players ? room.players : []).filter(function (player) {
        return player && player.status !== 'waiting';
      });
      roomPlayers.sort(function (a, b) {
        return String(a && a.id || '').localeCompare(String(b && b.id || ''));
      });
      if (!roomPlayers.length) {
        // Fallback de emergencia: posición local persistida (WASD).
        return applyWsRemote({
          id: 'local-emergency',
          status: 'active',
          players: [{
            id: localPlayerId,
            name: currentPlayerName || 'Jugador local',
            country: currentCountryKey || '',
            countryLabel: currentCountry || '',
            x: localKine.x,
            y: localKine.y,
            z: localKine.z,
            rotationY: localKine.rotationY
          }]
        });
      }

      if (!localKine._roomInit) {
        for (var ri = 0; ri < roomPlayers.length; ri++) {
          if (roomPlayers[ri].id === localPlayerId) {
            var spawn = spawnForIndex(ri);
            localKine.x = spawn.x;
            localKine.y = 0;
            localKine.z = spawn.z;
            localKine.rotationY = spawn.rotationY;
            break;
          }
        }
        localKine._roomInit = true;
      }
      // Fallback visual: el jugador local usa la misma cinemática que emergencia/room.
      return applyWsRemote({
        id: 'room-fallback',
        status: 'active',
        players: roomPlayers.map(function (player, index) {
          var isMe = player.id === localPlayerId;
          var spawn = spawnForIndex(index);
          return {
            id: player.id,
            name: player.name || ('Jugador ' + (index + 1)),
            country: player.country || '',
            countryLabel: player.countryLabel || '',
            x: isMe ? localKine.x : spawn.x,
            y: isMe ? localKine.y : 0,
            z: isMe ? localKine.z : spawn.z,
            rotationY: isMe ? localKine.rotationY : spawn.rotationY
          };
        })
      });
    }
    if (!expectedGameId || game.id !== expectedGameId) {
      expectedGameId = game.id;
    }
    localKine._roomInit = false;
    return applyWsRemote(game);
  }

  function syncScene() {
    var game = getRenderableGame();
    if (!game) return;
    gameScene.syncPlayers(game.players, clock.getElapsedTime());
  }

  function updateLocalPlayer() {
    var game = getRenderableGame();
    if (!game || !Array.isArray(game.players)) return;

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
    if (game.id === 'local-emergency' || game.id === 'room-fallback') {
      localKine.x = player.x;
      localKine.y = player.y;
      localKine.z = player.z;
      localKine.rotationY = player.rotationY;
    } else {
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

    if (window.PintaGolWsBridge && typeof window.PintaGolWsBridge.connect === 'function') {
      window.PintaGolWsBridge.connect({
        gameId: expectedGameId,
        playerId: localPlayerId
      });
    }

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
      var desiredX = localHero.position.x - Math.sin(localHero.rotation.y) * cameraDistance;
      var desiredY = localHero.position.y + cameraHeight;
      var desiredZ = localHero.position.z - Math.cos(localHero.rotation.y) * cameraDistance;
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
      // Vista general mientras aparece el jugador.
      gameScene.camera.position.x += (0 - gameScene.camera.position.x) * 0.06;
      gameScene.camera.position.y += (5.8 - gameScene.camera.position.y) * 0.06;
      gameScene.camera.position.z += (8.6 - gameScene.camera.position.z) * 0.06;
      gameScene.camera.lookAt(0, 1.2, 0);
    }
    gameScene.renderer.render(gameScene.scene, gameScene.camera);
  }

  function init() {
    var canvas = document.getElementById('multiplayer-canvas');
    if (!canvas) return;
    canvas.addEventListener('click', function () {
      canvas.focus({ preventScroll: true });
    });
    updateCountryLabel();
    if (window.PintaGolGameScene && typeof window.PintaGolGameScene.createScene === 'function') {
      try {
        gameScene = window.PintaGolGameScene.createScene(canvas);
      } catch (error) {
        console.error(error);
        gameScene = createFallbackScene(canvas);
      }
    } else {
      gameScene = createFallbackScene(canvas);
    }
    addModeloEnMultijugador();
    controls = window.PintaGolGameControls.createControls();
    var hasActiveGame = !!expectedGameId;
    if (!hasActiveGame) {
      var countryEl = document.getElementById('multiplayer-country');
      if (countryEl) {
        countryEl.textContent = 'Sin partida activa: vista de pruebas 3D.';
      }
    }
    bindUI();
    if (hasActiveGame) {
      startNetworkLoops();
      syncScene();
    }

    controls.bind();
    bindCameraZoom(canvas);
    window.addEventListener('resize', gameScene.resize);
    window.addEventListener('storage', function (event) {
      if (hasActiveGame && event.key === store.GAME_KEY) {
        syncScene();
      }
    });
    window.addEventListener('beforeunload', function () {
      if (syncInterval) window.clearInterval(syncInterval);
      if (roomHeartbeat) window.clearInterval(roomHeartbeat);
      if (window.PintaGolWsBridge && typeof window.PintaGolWsBridge.disconnect === 'function') {
        window.PintaGolWsBridge.disconnect();
      }
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
