(function (window) {
  'use strict';

  var textureLoader = new THREE.TextureLoader();
  var fbxLoader = new THREE.FBXLoader();
  var store = window.PintaGolMultiplayerStore;
  var MODEL_BASE_CANDIDATES = [
    'assets/models/',
    '/assets/models/',
    '../assets/models/'
  ];
  var rendererMaxAnisotropy = 4;

  function buildCandidatePaths(relativePath) {
    return MODEL_BASE_CANDIDATES.map(function (base) {
      return base + relativePath;
    });
  }

  function loadTextureFromCandidates(paths, onLoad, onError) {
    var index = 0;
    function tryNext() {
      if (index >= paths.length) {
        if (onError) onError(new Error('No se pudo cargar textura en ninguna ruta'));
        return;
      }
      var url = paths[index++];
      textureLoader.load(
        url,
        function (texture) {
          onLoad(texture, url);
        },
        undefined,
        function () {
          tryNext();
        }
      );
    }
    tryNext();
  }

  function loadFbxFromCandidates(paths, onLoad, onError) {
    var index = 0;
    function tryNext() {
      if (index >= paths.length) {
        if (onError) onError(new Error('No se pudo cargar FBX en ninguna ruta'));
        return;
      }
      var url = paths[index++];
      fbxLoader.load(
        url,
        function (model) {
          onLoad(model, url);
        },
        undefined,
        function () {
          tryNext();
        }
      );
    }
    tryNext();
  }

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

  /** Tono azul traje (misma idea que la vista astro-sync). */
  function applyAstroMaterialsLikeModelo(object, colorHex) {
    var base = new THREE.Color(colorHex != null ? colorHex : 0x2f6fe0);
    object.traverse(function (child) {
      if (!child.isMesh) return;
      var materials = Array.isArray(child.material) ? child.material : [child.material];
      materials.forEach(function (M) {
        if (!M) return;
        M.color.copy(base);
        if ('emissive' in M && M.emissive) {
          M.emissive.copy(base).multiplyScalar(0.22);
        } else if ('emissive' in M) {
          M.emissive = base.clone().multiplyScalar(0.2);
        }
        if (typeof M.emissiveIntensity === 'number') {
          M.emissiveIntensity = Math.max(M.emissiveIntensity, 0.22);
        }
        if (typeof M.metalness === 'number') {
          M.metalness = Math.max(0, Math.max(M.metalness, 0.12));
        }
        if (typeof M.roughness === 'number') {
          M.roughness = Math.min(0.82, M.roughness < 0.3 ? 0.72 : M.roughness);
        }
        M.needsUpdate = true;
      });
    });
  }

  function prepareTextureLikeModelo(texture) {
    if (!texture) return texture;
    if (typeof THREE.SRGBColorSpace !== 'undefined') {
      texture.colorSpace = THREE.SRGBColorSpace;
    }
    texture.flipY = true;
    if (texture.anisotropy !== undefined && typeof rendererMaxAnisotropy === 'number') {
      texture.anisotropy = rendererMaxAnisotropy;
    }
    return texture;
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

  function attachWeapon2(hero) {
    loadTextureFromCandidates(
      buildCandidatePaths('gun2/gun2.png'),
      function (gunTexture) {
        prepareTextureLikeModelo(gunTexture);
        loadFbxFromCandidates(
          buildCandidatePaths('gun2/gun2.fbx'),
          function (gun2) {
            configureModelMaterials(gun2, gunTexture);
            gun2.scale.setScalar(0.018);
            gun2.position.set(-0.58, 5.5, 0.92);
            gun2.rotation.set(0.08, Math.PI / 2, -0.22);
            gun2.name = 'weapon-model-gun2';
            hero.add(gun2);
          },
          function (error) {
            console.error('No se pudo cargar gun2.fbx', error);
          }
        );
      },
      function (error) {
        console.error('No se pudo cargar gun2.png', error);
        loadFbxFromCandidates(
          buildCandidatePaths('gun2/gun2.fbx'),
          function (gun2) {
            configureModelMaterials(gun2, null);
            gun2.scale.setScalar(0.018);
            gun2.position.set(-0.58, 1.52, 0.92);
            gun2.rotation.set(0.08, Math.PI / 2, -0.22);
            gun2.name = 'weapon-model-gun2';
            hero.add(gun2);
          },
          function () {}
        );
      }
    );
  }

  function attachWeapon(hero) {
    loadTextureFromCandidates(
      buildCandidatePaths('gun1/gun1.png'),
      function (gunTexture) {
        prepareTextureLikeModelo(gunTexture);
        loadFbxFromCandidates(
          buildCandidatePaths('gun1/gun1.fbx'),
          function (gun) {
            configureModelMaterials(gun, gunTexture);
            gun.scale.setScalar(0.018);
            gun.position.set(0.58, 1.52, 0.92);
            gun.rotation.set(0.08, Math.PI / 2, -0.22);
            gun.name = 'weapon-model';
            hero.add(gun);
            attachWeapon2(hero);
          },
          function (error) {
            console.error('No se pudo cargar gun1.fbx', error);
            attachWeapon2(hero);
          }
        );
      },
      function (error) {
        console.error('No se pudo cargar gun1.png', error);
        loadFbxFromCandidates(
          buildCandidatePaths('gun1/gun1.fbx'),
          function (gun) {
            configureModelMaterials(gun, null);
            gun.scale.setScalar(0.018);
            gun.position.set(0.58, 1.52, 0.92);
            gun.rotation.set(0.08, Math.PI / 2, -0.22);
            gun.name = 'weapon-model';
            hero.add(gun);
            attachWeapon2(hero);
          },
          function () {
            attachWeapon2(hero);
          }
        );
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
    var suitColor =
      heroGroup.userData && heroGroup.userData.overrideSuitColor != null
        ? heroGroup.userData.overrideSuitColor
        : store.getCountryColor(player.country);
    var skipNameTag = !!(heroGroup.userData && heroGroup.userData.skipNameTag);
    var instantFallback = createFallbackHero(suitColor);
    instantFallback.name = 'instant-fallback-hero';
    heroGroup.add(instantFallback);
    if (!skipNameTag) {
      heroGroup.add(createNameTag(heroGroup.userData.player || {}));
    }
    loadFbxFromCandidates(
      buildCandidatePaths('astro/astronout.fbx'),
      function (astro) {
        var fallbackNode = heroGroup.getObjectByName('instant-fallback-hero');
        if (fallbackNode) {
          heroGroup.remove(fallbackNode);
        }
        applyAstroMaterialsLikeModelo(astro, suitColor);
        astro.scale.setScalar(0.024);
        astro.rotation.set(0, Math.PI, 0);
        heroGroup.add(astro);
        attachWeapon(heroGroup);
      },
      function () {
        // Ya mostramos fallback inmediato; solo añadimos arma para mantener consistencia visual.
        attachWeapon(heroGroup);
      }
    );
  }

  /**
   * Mismo astronauta + gun1 + gun2 que en astro-sync,
   * como referencia en el mapa (sustituye la caja demo anterior).
   */
  function loadMultijugadorShowcase(scene, onStatus) {
    if (!scene) return;
    var existing = scene.getObjectByName('multijugador-modelo-central');
    if (existing) {
      scene.remove(existing);
    }
    var group = new THREE.Group();
    group.name = 'multijugador-modelo-central';
    group.userData.skipNameTag = true;
    group.userData.overrideSuitColor = 0x2f6fe0;
    group.userData.player = { name: '', country: '' };
    group.position.set(0, -1.2, 0);
    scene.add(group);
    if (typeof onStatus === 'function') {
      onStatus('Cargando astronauta y armas (gun1, gun2)…');
    }
    loadHeroModel(group);
  }

  window.PintaGolMultiplayerAssets = {
    loadHeroModel: loadHeroModel,
    loadMultijugadorShowcase: loadMultijugadorShowcase,
    setRendererMaxAnisotropy: function (value) {
      if (typeof value === 'number' && isFinite(value) && value > 0) {
        rendererMaxAnisotropy = value;
      }
    }
  };
})(window);
