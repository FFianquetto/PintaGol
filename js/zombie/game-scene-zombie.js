(function (window) {
  'use strict';

  var assets = window.PintaGolMultiplayerAssets;

  function createScene(canvas) {
    var scene = new THREE.Scene();
    var camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
    var renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
    var heroesById = {};

    // Mismo fondo base que astro-sync / galería
    scene.background = new THREE.Color(0x0f172a);
    camera.position.set(0, 1.3, 7.5);
    camera.lookAt(0, 1.2, 0);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    var floor = new THREE.Mesh(
      new THREE.PlaneGeometry(18, 12, 1, 1),
      new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.95, metalness: 0.02 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -1.45;
    scene.add(floor);

    var grid = new THREE.GridHelper(18, 18, 0x475569, 0x1e293b);
    grid.position.y = -1.43;
    scene.add(grid);
    // La carga del mapa se ejecuta desde js/zombie/zombie.js para asegurar
    // que se haga en la ruta final de la pantalla zombie.
    scene.add(new THREE.AmbientLight(0xffffff, 0.95));

    var keyLight = new THREE.DirectionalLight(0xffffff, 1.2);
    keyLight.position.set(4, 8, 6);
    scene.add(keyLight);

    var rimLight = new THREE.DirectionalLight(0x93c5fd, 0.9);
    rimLight.position.set(-5, 3, -2);
    scene.add(rimLight);

    function asFiniteNumber(value, fallback) {
      return typeof value === 'number' && isFinite(value) ? value : fallback;
    }

    function applyHeroTransform(heroGroup, player, elapsed) {
      var x = asFiniteNumber(player && player.x, 0);
      var y = asFiniteNumber(player && player.y, 0);
      var z = asFiniteNumber(player && player.z, 0);
      var rotationY = asFiniteNumber(player && player.rotationY, Math.PI);
      heroGroup.position.set(x, -1.2 + y + Math.sin(elapsed * 2 + x) * 0.04, z);
      heroGroup.rotation.y = rotationY;
    }

    function ensureHero(player) {
      if (heroesById[player.id]) return heroesById[player.id];
      var heroGroup = new THREE.Group();
      heroGroup.userData.player = player;
      assets.loadHeroModel(heroGroup);
      scene.add(heroGroup);
      heroesById[player.id] = heroGroup;
      return heroGroup;
    }

    return {
      scene: scene,
      camera: camera,
      renderer: renderer,
      syncPlayers: function (players, elapsed) {
        var activeIds = {};
        (players || []).forEach(function (player) {
          activeIds[player.id] = true;
          applyHeroTransform(ensureHero(player), player, elapsed);
        });
        Object.keys(heroesById).forEach(function (playerId) {
          if (activeIds[playerId]) return;
          scene.remove(heroesById[playerId]);
          delete heroesById[playerId];
        });
      },
      getHero: function (playerId) {
        return heroesById[playerId] || null;
      },
      getAnyHero: function () {
        var ids = Object.keys(heroesById);
        if (!ids.length) return null;
        return heroesById[ids[0]] || null;
      },
      resize: function () {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
      }
    };
  }

  window.PintaGolZombieScene = {
    createScene: createScene
  };
})(window);
