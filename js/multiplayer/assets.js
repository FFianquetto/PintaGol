(function (window) {
  'use strict';

  var textureLoader = new THREE.TextureLoader();
  var fbxLoader = new THREE.FBXLoader();
  var store = window.PintaGolMultiplayerStore;

  function configureModelMaterials(object, texture, color) {
    object.traverse(function (child) {
      if (!child.isMesh) return;

      if (Array.isArray(child.material)) {
        child.material = child.material.map(function (material) {
          var nextMaterial = material || new THREE.MeshStandardMaterial({ color: 0xffffff });
          if (texture) nextMaterial.map = texture;
          if (color) nextMaterial.color = new THREE.Color(color);
          nextMaterial.needsUpdate = true;
          return nextMaterial;
        });
        return;
      }

      if (!child.material) {
        child.material = new THREE.MeshStandardMaterial({ color: 0xffffff });
      }

      if (texture) child.material.map = texture;
      if (color) child.material.color = new THREE.Color(color);
      child.material.needsUpdate = true;
    });
  }

  function createFallbackHero(color) {
    var group = new THREE.Group();
    var bodyMat = new THREE.MeshStandardMaterial({ color: color || 0xdbeafe, roughness: 0.75 });
    var visorMat = new THREE.MeshStandardMaterial({ color: 0x111827, metalness: 0.5, roughness: 0.2 });

    var body = new THREE.Mesh(new THREE.CapsuleGeometry(0.7, 1.6, 6, 14), bodyMat);
    body.position.y = 1.6;
    group.add(body);

    var head = new THREE.Mesh(new THREE.SphereGeometry(0.58, 24, 24), bodyMat);
    head.position.y = 2.9;
    group.add(head);

    var visor = new THREE.Mesh(new THREE.SphereGeometry(0.3, 18, 18), visorMat);
    visor.position.set(0, 2.88, 0.42);
    visor.scale.set(1.3, 0.84, 0.45);
    group.add(visor);

    return group;
  }

  function attachWeapon(hero) {
    textureLoader.load(
      '/assets/items/gun2/gun2.png',
      function (gunTexture) {
        gunTexture.colorSpace = THREE.SRGBColorSpace;
        fbxLoader.load(
          '/assets/items/gun2/gun2.fbx',
          function (gun) {
            configureModelMaterials(gun, gunTexture);
            gun.scale.setScalar(0.018);
            gun.position.set(0.58, 1.52, 0.92);
            gun.rotation.set(0.08, Math.PI / 2, -0.22);
            gun.name = 'weapon-model';
            hero.add(gun);
          },
          undefined,
          function (error) {
            console.error('No se pudo cargar gun2.fbx', error);
          }
        );
      },
      undefined,
      function (error) {
        console.error('No se pudo cargar gun2.png', error);
      }
    );
  }

  function createNameTag(player) {
    var canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 80;
    var ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = 'rgba(8, 15, 29, 0.82)';
    ctx.fillRect(0, 14, canvas.width, 52);
    ctx.strokeStyle = '#86efac';
    ctx.lineWidth = 3;
    ctx.strokeRect(4, 18, canvas.width - 8, 44);
    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 24px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(player.name || 'Jugador', canvas.width / 2, 48);

    var texture = new THREE.CanvasTexture(canvas);
    var material = new THREE.SpriteMaterial({ map: texture, transparent: true });
    var sprite = new THREE.Sprite(material);
    sprite.position.set(0, 3.8, 0);
    sprite.scale.set(2.8, 0.9, 1);
    return sprite;
  }

  function loadHeroModel(heroGroup) {
    var player = heroGroup.userData.player || {};
    var suitColor = store.getCountryColor(player.country);
    var instantFallback = createFallbackHero(suitColor);
    instantFallback.name = 'instant-fallback-hero';
    heroGroup.add(instantFallback);
    heroGroup.add(createNameTag(heroGroup.userData.player || {}));
    fbxLoader.load(
      '/assets/items/astro/astronout.fbx',
      function (astro) {
        var fallbackNode = heroGroup.getObjectByName('instant-fallback-hero');
        if (fallbackNode) {
          heroGroup.remove(fallbackNode);
        }
        configureModelMaterials(astro, null, suitColor);
        astro.scale.setScalar(0.024);
        astro.rotation.set(0, Math.PI, 0);
        heroGroup.add(astro);
        attachWeapon(heroGroup);
      },
      undefined,
      function () {
        // Ya mostramos fallback inmediato; solo añadimos arma para mantener consistencia visual.
        attachWeapon(heroGroup);
      }
    );
  }

  window.PintaGolMultiplayerAssets = {
    loadHeroModel: loadHeroModel
  };
})(window);
