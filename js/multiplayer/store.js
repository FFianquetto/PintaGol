(function (window) {
  'use strict';

  var ROOM_KEY = 'pintagol_matchmaking_room';
  var GAME_KEY = 'pintagol_active_game';
  var GAME_LOCK_KEY = 'pintagol_game_lock';
  var SESSION_KEY = 'pintagol_session_id';
  var CHANNEL_KEY = 'pintagol_matchmaking_channel';
  var LOCK_TTL_MS = 1500;
  var STALE_MS = 15000;
  var REQUIRED_PLAYERS = 4;
  var realtimeChannel = typeof window.BroadcastChannel === 'function'
    ? new window.BroadcastChannel(CHANNEL_KEY)
    : null;
  var COUNTRY_COLORS = {
    brasil: 0x22c55e,
    argentina: 0x38bdf8,
    alemania: 0x111827,
    francia: 0x2563eb,
    espana: 0xef4444,
    italia: 0x3b82f6,
    inglaterra: 0xf8fafc,
    mexico: 0x16a34a,
    japon: 0xf3f4f6,
    'paises-bajos': 0xf97316,
    portugal: 0xdc2626,
    uruguay: 0x60a5fa,
    belgica: 0xfacc15,
    croacia: 0xe5e7eb,
    'estados-unidos': 0x1d4ed8,
    marruecos: 0xbe123c,
    suiza: 0xef4444,
    senegal: 0x22c55e,
    polonia: 0xf8fafc,
    'corea-del-sur': 0xfda4af,
    'arabia-saudita': 0x15803d,
    ecuador: 0xfacc15,
    ghana: 0xf59e0b,
    iran: 0x84cc16,
    serbia: 0xdc2626,
    tunez: 0xef4444,
    'costa-rica': 0x7c3aed,
    canada: 0xdc2626,
    camerun: 0x16a34a,
    australia: 0xfbbf24,
    dinamarca: 0xdc2626,
    colombia: 0xfacc15
  };
  var CORNER_SPAWNS = [
    { x: 4.5, z: -1.5, rotationY: (3 * Math.PI) / 4 },   // +-
    { x: -4.5, z: 1.5, rotationY: -Math.PI / 4 },        // -+
    { x: -4.5, z: -1.5, rotationY: Math.PI / 4 },        // --
    { x: 4.5, z: 1.5, rotationY: (-3 * Math.PI) / 4 }    // ++
  ];

  function now() {
    return Date.now();
  }

  function readJSON(key, fallback) {
    try {
      var raw = window.localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (error) {
      console.error('No se pudo leer', key, error);
      return fallback;
    }
  }

  function writeJSON(key, value) {
    window.localStorage.setItem(key, JSON.stringify(value));
  }

  function notifyChange(type) {
    if (!realtimeChannel) return;
    realtimeChannel.postMessage({
      type: type,
      at: now()
    });
  }

  function subscribeRealtime(listener) {
    if (!realtimeChannel || typeof listener !== 'function') {
      return function () {};
    }

    function handleMessage(event) {
      listener(event.data || {});
    }

    realtimeChannel.addEventListener('message', handleMessage);
    return function () {
      realtimeChannel.removeEventListener('message', handleMessage);
    };
  }

  function getSessionId() {
    var existing = window.sessionStorage.getItem(SESSION_KEY);
    if (existing) return existing;
    var id = 'player-' + Math.random().toString(36).slice(2, 10);
    window.sessionStorage.setItem(SESSION_KEY, id);
    return id;
  }

  function prunePlayers(players) {
    var current = now();
    return (players || []).filter(function (player) {
      if (!player) return false;
      var ls = Number(player.lastSeen);
      // Sin lastSeen válido no podar: antes (lastSeen || 0) hacía current-0 >> STALE y vaciaba la partida.
      if (!isFinite(ls) || ls <= 0) return true;
      return current - ls < STALE_MS;
    });
  }

  function getRoom() {
    var room = readJSON(ROOM_KEY, { players: [], createdAt: now() });
    room.players = prunePlayers(room.players);
    return room;
  }

  function getQueuePlayers(room) {
    return (room && room.players ? room.players : []).filter(function (player) {
      return player && player.status !== 'playing';
    });
  }

  function saveRoom(room) {
    room.players = prunePlayers(room.players);
    writeJSON(ROOM_KEY, room);
    notifyChange('room');
    return room;
  }

  function upsertRoomPlayer(playerData) {
    var room = getRoom();
    var playerId = getSessionId();
    var exists = false;

    room.players = room.players.map(function (player) {
      if (player.id !== playerId) return player;
      exists = true;
      return {
        id: playerId,
        name: playerData.name || player.name || 'Jugador',
        country: playerData.country || player.country || '',
        countryLabel: playerData.countryLabel || player.countryLabel || '',
        status: playerData.status || player.status || 'waiting',
        lastSeen: now()
      };
    });

    if (!exists) {
      room.players.push({
        id: playerId,
        name: playerData.name || 'Jugador',
        country: playerData.country || '',
        countryLabel: playerData.countryLabel || '',
        status: playerData.status || 'waiting',
        lastSeen: now()
      });
    }

    saveRoom(room);
    return room;
  }

  function removeRoomPlayer() {
    var playerId = getSessionId();
    var room = getRoom();
    room.players = room.players.filter(function (player) {
      return player.id !== playerId;
    });
    saveRoom(room);
  }

  function createGameIfReady() {
    var room = getRoom();
    var queuePlayers = getQueuePlayers(room);
    if (queuePlayers.length < REQUIRED_PLAYERS) return null;

    var activeGame = readJSON(GAME_KEY, null);
    if (activeGame && activeGame.status === 'active' && Array.isArray(activeGame.players)) {
      // Si el juego activo ya expiró, se descarta para forzar uno nuevo.
      if (getRemainingGameMs(activeGame) <= 0) {
        window.localStorage.removeItem(GAME_KEY);
        notifyChange('game');
      } else {
        // Si ya existe una partida activa vigente, se reutiliza para evitar sobrescrituras.
        if (activeGame.players.length >= REQUIRED_PLAYERS) {
          return activeGame;
        }
      }
    }

    var lockToken = null;
    try {
      lockToken = acquireGameCreationLock();
      if (!lockToken) {
        var fallbackGame = readJSON(GAME_KEY, null);
        return (fallbackGame && fallbackGame.status === 'active') ? fallbackGame : null;
      }

      // Releer después de adquirir lock para evitar carreras.
      activeGame = readJSON(GAME_KEY, null);
      if (activeGame && activeGame.status === 'active' && Array.isArray(activeGame.players) && activeGame.players.length >= REQUIRED_PLAYERS) {
        return activeGame;
      }

      var orderedPlayers = queuePlayers
        .slice(0, REQUIRED_PLAYERS)
        .sort(function (a, b) {
          return String(a && a.id || '').localeCompare(String(b && b.id || ''));
        });

      var game = {
        id: 'game-' + now(),
        status: 'active',
        createdAt: now(),
        endsAt: null,
        players: orderedPlayers.map(function (player, index) {
          var spawn = CORNER_SPAWNS[index % CORNER_SPAWNS.length];
          return {
            id: player.id,
            name: player.name,
            country: player.country,
            countryLabel: player.countryLabel,
            x: spawn.x,
            y: 0,
            z: spawn.z,
            rotationY: spawn.rotationY,
            lastSeen: now()
          };
        })
      };

      writeJSON(GAME_KEY, game);
      notifyChange('game');
      room.players = room.players.map(function (player) {
        player.status = 'ready';
        player.lastSeen = now();
        return player;
      });
      saveRoom(room);
      return game;
    } finally {
      releaseGameCreationLock(lockToken);
    }
  }

  function acquireGameCreationLock() {
    var current = now();
    var lock = readJSON(GAME_LOCK_KEY, null);
    if (lock && current - Number(lock.ts || 0) < LOCK_TTL_MS) {
      return null;
    }

    var token = getSessionId() + '-' + current + '-' + Math.random().toString(36).slice(2, 8);
    writeJSON(GAME_LOCK_KEY, { token: token, ts: current });
    var confirmed = readJSON(GAME_LOCK_KEY, null);
    if (!confirmed || confirmed.token !== token) return null;
    return token;
  }

  function releaseGameCreationLock(token) {
    if (!token) return;
    var lock = readJSON(GAME_LOCK_KEY, null);
    if (lock && lock.token === token) {
      window.localStorage.removeItem(GAME_LOCK_KEY);
    }
  }

  function getGame() {
    return readJSON(GAME_KEY, null);
  }

  function clearFinishedGame() {
    var game = getGame();
    if (!game) return;
    if (game.status === 'finished') {
      window.localStorage.removeItem(GAME_KEY);
      notifyChange('game');
    }
  }

  function prepareMatchmaking() {
    clearFinishedGame();
    getRoom();
  }

  function getRemainingGameMs(game) {
    if (!game) return 0;
    if (!game.endsAt) return Number.POSITIVE_INFINITY;
    return Math.max(0, Number(game.endsAt) - now());
  }

  function getCountryColor(country) {
    return COUNTRY_COLORS[country] || COUNTRY_COLORS[String(country || '').toLowerCase()] || 0xdbeafe;
  }

  function updateGamePlayer(transform) {
    var game = getGame();
    var playerId = getSessionId();
    if (!game || !Array.isArray(game.players)) return null;

    game.players = game.players.map(function (player) {
      if (player.id !== playerId) return player;
      return {
        id: player.id,
        name: player.name,
        country: player.country,
        countryLabel: player.countryLabel,
        x: transform.x,
        y: transform.y,
        z: transform.z,
        rotationY: transform.rotationY,
        lastSeen: now()
      };
    });

    writeJSON(GAME_KEY, game);
    notifyChange('game');
    return game;
  }

  function cleanupGameIfEmpty() {
    var game = getGame();
    if (!game || !Array.isArray(game.players)) return;
    var alive = prunePlayers(game.players);
    if (!alive.length) {
      window.localStorage.removeItem(GAME_KEY);
      notifyChange('game');
      return;
    }
    game.players = alive;
    writeJSON(GAME_KEY, game);
    notifyChange('game');
  }

  window.PintaGolMultiplayerStore = {
    ROOM_KEY: ROOM_KEY,
    GAME_KEY: GAME_KEY,
    REQUIRED_PLAYERS: REQUIRED_PLAYERS,
    getSessionId: getSessionId,
    subscribeRealtime: subscribeRealtime,
    getRoom: getRoom,
    getQueuePlayers: getQueuePlayers,
    upsertRoomPlayer: upsertRoomPlayer,
    removeRoomPlayer: removeRoomPlayer,
    createGameIfReady: createGameIfReady,
    getGame: getGame,
    clearFinishedGame: clearFinishedGame,
    prepareMatchmaking: prepareMatchmaking,
    getRemainingGameMs: getRemainingGameMs,
    getCountryColor: getCountryColor,
    updateGamePlayer: updateGamePlayer,
    cleanupGameIfEmpty: cleanupGameIfEmpty
  };
})(window);
