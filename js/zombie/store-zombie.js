(function (window) {
  'use strict';

  var ROOM_KEY = 'pintagol_zombie_room';
  var GAME_KEY = 'pintagol_zombie_game';
  var MAP_VOTE_KEY = 'pintagol_zombie_map_vote';
  var GAME_LOCK_KEY = 'pintagol_zombie_game_lock';
  var SESSION_KEY = 'pintagol_zombie_session_id';
  var STALE_MS = 15000;
  var LOCK_TTL_MS = 1500;
  var REQUIRED_PLAYERS = 4;
  var CORNER_SPAWNS = [
    { x: 6, z: -6, rotationY: (3 * Math.PI) / 4 },
    { x: -6, z: 6, rotationY: -Math.PI / 4 },
    { x: -6, z: -6, rotationY: Math.PI / 4 },
    { x: 6, z: 6, rotationY: (-3 * Math.PI) / 4 }
  ];
  var MAP_LABELS = {
    invierno: 'Invierno',
    primavera: 'Primavera',
    otono: 'Otono'
  };

  function now() { return Date.now(); }
  function readJSON(key, fallback) {
    try {
      var raw = window.localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (_error) {
      return fallback;
    }
  }
  function writeJSON(key, value) {
    window.localStorage.setItem(key, JSON.stringify(value));
  }
  function getSessionId() {
    var existing = window.sessionStorage.getItem(SESSION_KEY);
    if (existing) return existing;
    var id = 'zplayer-' + Math.random().toString(36).slice(2, 10);
    window.sessionStorage.setItem(SESSION_KEY, id);
    return id;
  }
  function prunePlayers(players) {
    var current = now();
    return (players || []).filter(function (player) {
      var ls = Number(player && player.lastSeen);
      return !isFinite(ls) || ls <= 0 || current - ls < STALE_MS;
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
  function selectMatchPlayers(players) {
    return (players || [])
      .slice()
      .sort(function (a, b) {
        return String(a && a.id || '').localeCompare(String(b && b.id || ''));
      })
      .slice(0, REQUIRED_PLAYERS);
  }
  function normalizeSeasonKey(raw) {
    var key = String(raw || '').toLowerCase();
    if (key === 'invierno' || key === 'primavera' || key === 'otono') return key;
    return '';
  }
  function getVoteToken(players) {
    var ids = selectMatchPlayers(players)
      .map(function (player) { return String(player && player.id || ''); })
      .filter(Boolean)
    if (ids.length < REQUIRED_PLAYERS) return '';
    return ids.join('|');
  }
  function ensureMapVote(players) {
    var token = getVoteToken(players);
    if (!token) return null;
    var current = readJSON(MAP_VOTE_KEY, null);
    if (current && current.token === token) return current;
    var next = {
      token: token,
      createdAt: now(),
      votes: {},
      resolvedSeasonKey: '',
      resolvedSeasonLabel: '',
      resolvedAt: 0
    };
    writeJSON(MAP_VOTE_KEY, next);
    return next;
  }
  function getMapVoteState() {
    return readJSON(MAP_VOTE_KEY, null);
  }
  function castMapVote(players, seasonKey) {
    var normalized = normalizeSeasonKey(seasonKey);
    if (!normalized) return null;
    var state = ensureMapVote(players);
    if (!state || state.resolvedSeasonKey) return state;
    state.votes = state.votes || {};
    var playerId = getSessionId();
    if (state.votes[playerId]) return state;
    state.votes[playerId] = normalized;
    writeJSON(MAP_VOTE_KEY, state);
    return state;
  }
  function removeMapVoteForLocalPlayer() {
    var state = getMapVoteState();
    if (!state || !state.votes) return;
    var playerId = getSessionId();
    if (!state.votes[playerId]) return;
    delete state.votes[playerId];
    writeJSON(MAP_VOTE_KEY, state);
  }
  function resolveMapVote(players) {
    var token = getVoteToken(players);
    if (!token) return null;
    var state = ensureMapVote(players);
    if (!state) return null;
    if (state.resolvedSeasonKey) return state;
    var eligibleIds = token.split('|');
    var votesBySeason = { invierno: 0, primavera: 0, otono: 0 };
    var validVotes = 0;
    for (var i = 0; i < eligibleIds.length; i++) {
      var vote = normalizeSeasonKey(state.votes && state.votes[eligibleIds[i]]);
      if (!vote) continue;
      votesBySeason[vote] += 1;
      validVotes += 1;
    }
    if (validVotes < REQUIRED_PLAYERS) return state;
    var keys = ['invierno', 'primavera', 'otono'];
    var maxVotes = Math.max(votesBySeason.invierno, votesBySeason.primavera, votesBySeason.otono);
    var leaders = keys.filter(function (key) { return votesBySeason[key] === maxVotes; });
    var seedSource = String(state.token || '') + '|' + String(state.createdAt || 0);
    var seed = 0;
    for (var si = 0; si < seedSource.length; si++) {
      seed = (seed * 31 + seedSource.charCodeAt(si)) >>> 0;
    }
    var winner = leaders[leaders.length ? seed % leaders.length : 0] || 'invierno';
    state.resolvedSeasonKey = winner;
    state.resolvedSeasonLabel = MAP_LABELS[winner] || 'Invierno';
    state.resolvedAt = now();
    writeJSON(MAP_VOTE_KEY, state);
    return state;
  }
  function saveRoom(room) {
    room.players = prunePlayers(room.players);
    writeJSON(ROOM_KEY, room);
    return room;
  }
  function upsertRoomPlayer(data) {
    var room = getRoom();
    var playerId = getSessionId();
    var exists = false;
    room.players = room.players.map(function (player) {
      if (player.id !== playerId) return player;
      exists = true;
      return {
        id: playerId,
        name: data.name || player.name || 'Jugador',
        weapon: data.weapon || player.weapon || '',
        weaponLabel: data.weaponLabel || player.weaponLabel || '',
        status: data.status || player.status || 'waiting',
        lastSeen: now()
      };
    });
    if (!exists) {
      room.players.push({
        id: playerId,
        name: data.name || 'Jugador',
        weapon: data.weapon || '',
        weaponLabel: data.weaponLabel || '',
        status: data.status || 'waiting',
        lastSeen: now()
      });
    }
    return saveRoom(room);
  }
  function removeRoomPlayer() {
    var playerId = getSessionId();
    var room = getRoom();
    room.players = room.players.filter(function (player) { return player.id !== playerId; });
    saveRoom(room);
  }
  function acquireGameCreationLock() {
    var current = now();
    var lock = readJSON(GAME_LOCK_KEY, null);
    if (lock && current - Number(lock.ts || 0) < LOCK_TTL_MS) return null;
    var token = getSessionId() + '-' + current;
    writeJSON(GAME_LOCK_KEY, { token: token, ts: current });
    var confirmed = readJSON(GAME_LOCK_KEY, null);
    return confirmed && confirmed.token === token ? token : null;
  }
  function releaseGameCreationLock(token) {
    if (!token) return;
    var lock = readJSON(GAME_LOCK_KEY, null);
    if (lock && lock.token === token) window.localStorage.removeItem(GAME_LOCK_KEY);
  }
  function getGame() { return readJSON(GAME_KEY, null); }
  function createGameIfReady(options) {
    var opts = options || {};
    var normalizedSeason = normalizeSeasonKey(opts.seasonKey);
    if (!normalizedSeason) return null;
    var room = getRoom();
    var queuePlayers = getQueuePlayers(room);
    if (queuePlayers.length < REQUIRED_PLAYERS) return null;
    var active = getGame();
    if (active && active.status === 'active' && Array.isArray(active.players) && active.players.length >= REQUIRED_PLAYERS) {
      var expectedToken = getVoteToken(queuePlayers);
      var activeToken = getVoteToken(active.players || []);
      var sameSeason = normalizeSeasonKey(active.seasonKey) === normalizedSeason;
      if (expectedToken && expectedToken === activeToken && sameSeason) {
        return active;
      }
      window.localStorage.removeItem(GAME_KEY);
    }
    var token = acquireGameCreationLock();
    if (!token) {
      var fallback = getGame();
      if (!fallback || !Array.isArray(fallback.players)) return null;
      var expectedTokenOnFallback = getVoteToken(queuePlayers);
      var fallbackToken = getVoteToken(fallback.players || []);
      var sameSeasonOnFallback = normalizeSeasonKey(fallback.seasonKey) === normalizedSeason;
      return expectedTokenOnFallback && expectedTokenOnFallback === fallbackToken && sameSeasonOnFallback ? fallback : null;
    }
    try {
      var ordered = selectMatchPlayers(queuePlayers);
      var game = {
        id: 'zombie-game-' + now(),
        status: 'active',
        createdAt: now(),
        seasonKey: normalizedSeason,
        seasonLabel: MAP_LABELS[normalizedSeason] || 'Invierno',
        players: ordered.map(function (player, index) {
          var spawn = CORNER_SPAWNS[index % CORNER_SPAWNS.length];
          return {
            id: player.id,
            name: player.name,
            weapon: player.weapon,
            weaponLabel: player.weaponLabel,
            x: spawn.x,
            y: 0,
            z: spawn.z,
            rotationY: spawn.rotationY,
            lastSeen: now()
          };
        })
      };
      writeJSON(GAME_KEY, game);
      room.players = room.players.map(function (player) {
        player.status = 'ready';
        player.lastSeen = now();
        return player;
      });
      saveRoom(room);
      return game;
    } finally {
      releaseGameCreationLock(token);
    }
  }
  function prepareMatchmaking() {
    getRoom();
    // No limpiar aquí; la votación activa se define por token de jugadores.
  }
  function updateGamePlayer(transform) {
    var game = getGame();
    var playerId = getSessionId();
    if (!game || !Array.isArray(game.players)) return;
    game.players = game.players.map(function (player) {
      if (player.id !== playerId) return player;
      return {
        id: player.id,
        name: player.name,
        weapon: player.weapon,
        weaponLabel: player.weaponLabel,
        x: transform.x,
        y: transform.y,
        z: transform.z,
        rotationY: transform.rotationY,
        lastSeen: now()
      };
    });
    writeJSON(GAME_KEY, game);
  }
  function cleanupGameIfEmpty() {
    var game = getGame();
    if (!game || !Array.isArray(game.players)) return;
    var alive = prunePlayers(game.players);
    if (!alive.length) {
      window.localStorage.removeItem(GAME_KEY);
      return;
    }
    game.players = alive;
    writeJSON(GAME_KEY, game);
  }

  window.PintaGolZombieStore = {
    MAP_VOTE_KEY: MAP_VOTE_KEY,
    ROOM_KEY: ROOM_KEY,
    GAME_KEY: GAME_KEY,
    REQUIRED_PLAYERS: REQUIRED_PLAYERS,
    getSessionId: getSessionId,
    getRoom: getRoom,
    getQueuePlayers: getQueuePlayers,
    upsertRoomPlayer: upsertRoomPlayer,
    removeRoomPlayer: removeRoomPlayer,
    createGameIfReady: createGameIfReady,
    ensureMapVote: ensureMapVote,
    getMapVoteState: getMapVoteState,
    castMapVote: castMapVote,
    resolveMapVote: resolveMapVote,
    removeMapVoteForLocalPlayer: removeMapVoteForLocalPlayer,
    getGame: getGame,
    prepareMatchmaking: prepareMatchmaking,
    updateGamePlayer: updateGamePlayer,
    cleanupGameIfEmpty: cleanupGameIfEmpty
  };
})(window);
