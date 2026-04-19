(function (window) {
  'use strict';

  var textureLoader = new THREE.TextureLoader();
  var fbxLoader = new THREE.FBXLoader();
  var mtlLoader = typeof THREE.MTLLoader === 'function' ? new THREE.MTLLoader() : null;
  var objLoader = typeof THREE.OBJLoader === 'function' ? new THREE.OBJLoader() : null;
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

  function loadObjFromCandidates(paths, onLoad, onError) {
    var index = 0;
    function tryNext() {
      if (index >= paths.length) {
        if (onError) onError(new Error('No se pudo cargar OBJ en ninguna ruta'));
        return;
      }
      var url = paths[index++];
      objLoader.load(
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

  function loadMtlFromCandidates(paths, onLoad, onError) {
    if (!mtlLoader) {
      if (onError) onError(new Error('MTLLoader no disponible'));
      return;
    }
    var index = 0;
    function tryNext() {
      if (index >= paths.length) {
        if (onError) onError(new Error('No se pudo cargar MTL en ninguna ruta'));
        return;
      }
      var url = paths[index++];
      var folder = url.slice(0, url.lastIndexOf('/') + 1);
      mtlLoader.setMaterialOptions({ side: THREE.DoubleSide });
      mtlLoader.setResourcePath(folder + 'textures/');
      mtlLoader.load(
        url,
        function (materials) {
          onLoad(materials, folder);
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

  function buildPaintballTextureMap() {
    var entries = {
      floor: 'FloorBakeCycles.png',
      outerwalls: 'OuterwallsCycles.png',
      roof: 'RoofBakeCycles.png',
      ceiling: 'RoofBakeCycles.png',
      material: 'WallsBakeCycles.png',
      walls: 'WallsBakeCycles.png'
    };
    var map = {};

    Object.keys(entries).forEach(function (key) {
      loadTextureFromCandidates(
        buildCandidatePaths('paintball/textures/' + entries[key]),
        function (texture) {
          texture.colorSpace = THREE.SRGBColorSpace;
          map[key] = texture;
        }
      );
    });

    return map;
  }

  function normalizeMaterialName(name) {
    return String(name || '').trim().toLowerCase();
  }

  function applyPaintballTextures(object) {
    var textureMap = buildPaintballTextureMap();
    object.traverse(function (child) {
      if (!child.isMesh || !child.material) return;

      var materials = Array.isArray(child.material) ? child.material : [child.material];
      materials.forEach(function (material) {
        if (!material) return;
        var key = normalizeMaterialName(material.name);
        var texture = textureMap[key] || null;
        if (texture) {
          material.map = texture;
          material.color = new THREE.Color(0xffffff);
          material.needsUpdate = true;
        }
      });
    });
  }

  function loadPaintballArena(scene) {
    if (!scene || !objLoader) return;
    var modelRelativePath = 'paintball/';

    function placeArena(arena) {
      var box = new THREE.Box3().setFromObject(arena);
      var center = new THREE.Vector3();
      var size = new THREE.Vector3();
      box.getCenter(center);
      box.getSize(size);

      arena.position.x -= center.x;
      arena.position.z -= center.z;
      arena.position.y -= box.min.y;
      arena.position.y += -1.45;
      arena.rotation.set(0, Math.PI, 0);
      if (size.x > 0 && size.z > 0) {
        var maxHorizontal = Math.max(size.x, size.z);
        var targetSpan = 12;
        var scale = targetSpan / maxHorizontal;
        if (isFinite(scale) && scale > 0) {
          arena.scale.setScalar(scale);
          arena.updateMatrixWorld(true);
        }
      }
      arena.name = 'paintball-arena';
      scene.add(arena);
      // Indicador visual pequeño para confirmar centro del mapa.
      var marker = new THREE.Mesh(
        new THREE.SphereGeometry(0.12, 14, 14),
        new THREE.MeshStandardMaterial({ color: 0xf97316, emissive: 0x7c2d12, emissiveIntensity: 0.9 })
      );
      marker.position.set(0, -1.2, 0);
      marker.name = 'arena-center-marker';
      scene.add(marker);
    }

    if (!mtlLoader) {
      loadObjFromCandidates(
        buildCandidatePaths(modelRelativePath + 'paintball.obj'),
        function (arena) {
          applyPaintballTextures(arena);
          placeArena(arena);
        },
        function (error) {
          console.error('No se pudo cargar paintball.obj', error);
        }
      );
      return;
    }

    loadMtlFromCandidates(
      buildCandidatePaths(modelRelativePath + 'paintball.mtl'),
      function (materials) {
        materials.preload();
        objLoader.setMaterials(materials);
        loadObjFromCandidates(
          buildCandidatePaths(modelRelativePath + 'paintball.obj'),
          function (arena) {
            applyPaintballTextures(arena);
            placeArena(arena);
          },
          function (error) {
            console.error('No se pudo cargar paintball.obj', error);
          }
        );
      },
      function () {
        loadObjFromCandidates(
          buildCandidatePaths(modelRelativePath + 'paintball.obj'),
          function (arena) {
            applyPaintballTextures(arena);
            placeArena(arena);
          },
          function (error) {
            console.error('No se pudo cargar paintball.obj', error);
          }
        );
      }
    );
  }

  window.PintaGolMultiplayerAssets = {
    loadHeroModel: loadHeroModel,
    loadPaintballArena: loadPaintballArena,
    loadMultijugadorShowcase: loadMultijugadorShowcase,
    setRendererMaxAnisotropy: function (value) {
      if (typeof value === 'number' && isFinite(value) && value > 0) {
        rendererMaxAnisotropy = value;
      }
    }
  };
})(window);
