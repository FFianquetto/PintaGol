(function () {
  'use strict';

  var scene, camera, renderer;
  var selectedWeapon = null;
  var ZOMBIE_PLAYER_KEY = 'pintagol_zombie_selected_player';

  function initScene() {
    var canvasEl = document.getElementById('zombie-canvas');
    if (!canvasEl || typeof THREE === 'undefined') return;
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a1922);
    camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 0, 12);
    camera.lookAt(0, 0, 0);
    renderer = new THREE.WebGLRenderer({ canvas: canvasEl, antialias: true, alpha: false });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    window.addEventListener('resize', onResize);
    onResize();
    animate();
  }

  function onResize() {
    if (!camera || !renderer) return;
    var w = window.innerWidth;
    var h = window.innerHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  }

  function animate() {
    requestAnimationFrame(animate);
    if (renderer && scene && camera) renderer.render(scene, camera);
  }

  function getPlayerName() {
    var input = document.getElementById('zombie-player-name-input');
    return input ? input.value.trim() : '';
  }

  function canSearch() {
    return !!(selectedWeapon && getPlayerName());
  }

  function setBuscarEnabled(enabled) {
    var btn = document.getElementById('btn-buscar-zombie');
    if (btn) btn.disabled = !enabled;
  }

  function persistSelection() {
    if (!selectedWeapon) return;
    window.sessionStorage.setItem(ZOMBIE_PLAYER_KEY, JSON.stringify({
      weapon: selectedWeapon.key,
      weaponLabel: selectedWeapon.label,
      name: getPlayerName()
    }));
  }

  function selectWeapon(button) {
    var key = button && button.getAttribute('data-weapon');
    var label = button && button.getAttribute('data-label');
    if (!key || !label) return;
    document.querySelectorAll('.zombie-weapon-slot').forEach(function (slot) {
      slot.classList.remove('zombie-weapon-slot--selected');
    });
    button.classList.add('zombie-weapon-slot--selected');
    selectedWeapon = { key: key, label: label };
    var msg = document.getElementById('zombie-weapon-msg');
    if (msg) msg.textContent = 'Arma elegida: ' + label;
    persistSelection();
    setBuscarEnabled(canSearch());
  }

  function init() {
    initScene();
    var btnBuscar = document.getElementById('btn-buscar-zombie');
    var btnVolver = document.getElementById('btn-volver-zombie');
    var nameInput = document.getElementById('zombie-player-name-input');

    document.querySelectorAll('.zombie-weapon-slot').forEach(function (slot) {
      slot.addEventListener('click', function () { selectWeapon(slot); });
    });

    if (nameInput) {
      nameInput.addEventListener('input', function () {
        persistSelection();
        setBuscarEnabled(canSearch());
      });
    }

    if (btnBuscar) {
      btnBuscar.addEventListener('click', function () {
        var playerName = getPlayerName();
        if (!selectedWeapon || !playerName) return;
        persistSelection();
        window.location.href =
          'carga-zombie.html?' +
          'weapon=' + encodeURIComponent(selectedWeapon.key) +
          '&weaponLabel=' + encodeURIComponent(selectedWeapon.label) +
          '&playerName=' + encodeURIComponent(playerName);
      });
    }

    if (btnVolver) {
      btnVolver.addEventListener('click', function () {
        window.location.href = 'modo-partida.html';
      });
    }

    try {
      var cached = JSON.parse(window.sessionStorage.getItem(ZOMBIE_PLAYER_KEY) || 'null');
      if (cached && cached.weapon && cached.weaponLabel) {
        selectedWeapon = { key: cached.weapon, label: cached.weaponLabel };
        document.querySelectorAll('.zombie-weapon-slot').forEach(function (slot) {
          if (slot.getAttribute('data-weapon') === cached.weapon) {
            slot.classList.add('zombie-weapon-slot--selected');
          }
        });
        var msg = document.getElementById('zombie-weapon-msg');
        if (msg) msg.textContent = 'Arma elegida: ' + cached.weaponLabel;
        if (nameInput && cached.name) nameInput.value = cached.name;
      }
    } catch (_error) {}

    setBuscarEnabled(canSearch());
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
