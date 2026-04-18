(function (window) {
  'use strict';

  var store = window.PintaGolMultiplayerStore;
  if (!store || typeof store.updateGamePlayer !== 'function') return;

  var remoteByPlayer = {};
  var ws = null;
  var gameId = '';
  var playerId = '';
  var outboundQueue = [];
  var MAX_QUEUE = 12;

  var originalUpdateGamePlayer = store.updateGamePlayer.bind(store);

  function wsUrl() {
    var override = window.__PINTAGOL_WS_URL__;
    if (typeof override === 'string' && override.length) return override;
    var proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return proto + '//' + window.location.host + '/ws';
  }

  function flushQueue() {
    if (!ws || ws.readyState !== 1) return;
    while (outboundQueue.length) {
      var next = outboundQueue.shift();
      try {
        ws.send(next);
      } catch (e) {
        break;
      }
    }
  }

  function sendRaw(jsonStr) {
    if (ws && ws.readyState === 1) {
      try {
        ws.send(jsonStr);
      } catch (e) {}
    } else {
      if (outboundQueue.length >= MAX_QUEUE) outboundQueue.shift();
      outboundQueue.push(jsonStr);
    }
  }

  store.updateGamePlayer = function (transform) {
    var result = originalUpdateGamePlayer(transform);
    if (!gameId || !playerId) return result;
    var payload = JSON.stringify({
      type: 'playerUpdate',
      gameId: gameId,
      playerId: playerId,
      x: transform.x,
      y: transform.y,
      z: transform.z,
      rotationY: transform.rotationY
    });
    sendRaw(payload);
    return result;
  };

  function mergeRemoteIntoGame(game, localId) {
    if (!game || !Array.isArray(game.players)) return game;
    var keys = Object.keys(remoteByPlayer);
    if (!keys.length) return game;

    var merged = game.players.map(function (p) {
      if (!p || p.id === localId) return p;
      var r = remoteByPlayer[p.id];
      if (!r) return p;
      return {
        id: p.id,
        name: p.name,
        country: p.country,
        countryLabel: p.countryLabel,
        x: r.x,
        y: r.y,
        z: r.z,
        rotationY: r.rotationY,
        lastSeen: p.lastSeen
      };
    });

    keys.forEach(function (rid) {
      if (rid === localId) return;
      var already = merged.some(function (p) {
        return p && p.id === rid;
      });
      if (already) return;
      var r = remoteByPlayer[rid];
      if (!r) return;
      merged.push({
        id: rid,
        name: 'Jugador',
        country: '',
        countryLabel: '',
        x: r.x,
        y: r.y,
        z: r.z,
        rotationY: r.rotationY,
        lastSeen: Date.now()
      });
    });

    return {
      id: game.id,
      status: game.status,
      createdAt: game.createdAt,
      endsAt: game.endsAt,
      players: merged
    };
  }

  function connect(opts) {
    disconnect();
    remoteByPlayer = {};
    gameId = (opts && opts.gameId) || '';
    playerId = (opts && opts.playerId) || '';
    if (!gameId || !playerId) return;

    try {
      ws = new WebSocket(wsUrl());
    } catch (e) {
      console.warn('PintaGol WS: no se pudo abrir conexión', e);
      return;
    }

    ws.onopen = function () {
      try {
        ws.send(JSON.stringify({ type: 'join', gameId: gameId, playerId: playerId }));
      } catch (e) {}
      flushQueue();
    };

    ws.onmessage = function (event) {
      var msg;
      try {
        msg = JSON.parse(event.data);
      } catch (e) {
        return;
      }
      if (msg.type !== 'playerUpdate' || !msg.playerId) return;
      if (msg.playerId === playerId) return;
      remoteByPlayer[msg.playerId] = {
        x: msg.x,
        y: msg.y,
        z: msg.z,
        rotationY: msg.rotationY
      };
    };

    ws.onclose = function () {
      if (ws) ws = null;
    };

    ws.onerror = function () {
      /* el navegador ya registra el fallo */
    };
  }

  function disconnect() {
    outboundQueue = [];
    if (ws) {
      try {
        ws.close();
      } catch (e) {}
      ws = null;
    }
    gameId = '';
    playerId = '';
  }

  window.PintaGolWsBridge = {
    connect: connect,
    disconnect: disconnect,
    mergeRemoteIntoGame: mergeRemoteIntoGame,
    getRemoteSnapshot: function () {
      return remoteByPlayer;
    }
  };
})(window);
