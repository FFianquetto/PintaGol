/**
 * Selección de País - Pinta Gol
 * 32 países Copa del Mundo + Aleatorio. Efecto recorrido 4s al elegir Aleatorio.
 */
(function () {
  'use strict';

  var scene, camera, renderer, mapPlane;
  var DURACION_EFECTO_MS = 4000;
  var NUM_PASOS = 80;
  var NUM_PAISES = 32;

  function createMapTexture() {
    var w = 1024, h = 512;
    var canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    var ctx = canvas.getContext('2d');

    var gradient = ctx.createLinearGradient(0, 0, 0, h);
    gradient.addColorStop(0, '#0088dd');
    gradient.addColorStop(0.5, '#0066cc');
    gradient.addColorStop(1, '#004499');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, h);

    ctx.fillStyle = '#2d5016';
    ctx.beginPath();
    ctx.moveTo(95, 165); ctx.lineTo(220, 155); ctx.lineTo(280, 195); ctx.lineTo(265, 260); ctx.lineTo(180, 290); ctx.lineTo(100, 270); ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#1e3a8a';
    ctx.beginPath();
    ctx.moveTo(195, 268); ctx.lineTo(255, 255); ctx.lineTo(300, 300); ctx.lineTo(280, 380); ctx.lineTo(200, 420); ctx.lineTo(140, 360); ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#6b8c2e';
    ctx.beginPath();
    ctx.moveTo(430, 130); ctx.lineTo(560, 125); ctx.lineTo(600, 185); ctx.lineTo(580, 260); ctx.lineTo(480, 290); ctx.lineTo(400, 250); ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#065f46';
    ctx.beginPath();
    ctx.moveTo(480, 265); ctx.lineTo(600, 250); ctx.lineTo(660, 320); ctx.lineTo(640, 400); ctx.lineTo(520, 430); ctx.lineTo(430, 370); ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#b91c1c';
    ctx.beginPath();
    ctx.moveTo(620, 150); ctx.lineTo(800, 140); ctx.lineTo(880, 200); ctx.lineTo(860, 300); ctx.lineTo(720, 330); ctx.lineTo(640, 270); ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#0d9488';
    ctx.beginPath();
    ctx.moveTo(800, 320); ctx.lineTo(900, 300); ctx.lineTo(920, 380); ctx.lineTo(880, 440); ctx.lineTo(800, 420); ctx.closePath();
    ctx.fill();

    var texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    return texture;
  }

  function initScene() {
    var canvasEl = document.getElementById('paises-canvas');
    if (!canvasEl) return;

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0066aa);

    var aspect = window.innerWidth / window.innerHeight;
    camera = new THREE.PerspectiveCamera(50, aspect, 0.1, 1000);
    camera.position.set(0, 0, 12);
    camera.lookAt(0, 0, 0);

    renderer = new THREE.WebGLRenderer({ canvas: canvasEl, antialias: true, alpha: false });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    var mapTexture = createMapTexture();
    var mapGeometry = new THREE.PlaneGeometry(20, 10);
    var mapMaterial = new THREE.MeshBasicMaterial({
      map: mapTexture,
      depthWrite: true,
      side: THREE.DoubleSide
    });
    mapPlane = new THREE.Mesh(mapGeometry, mapMaterial);
    mapPlane.position.z = -2;
    scene.add(mapPlane);

    window.addEventListener('resize', onResize);
    onResize();
    animate();
  }

  function onResize() {
    var w = window.innerWidth;
    var h = window.innerHeight;
    if (!camera || !renderer) return;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  }

  function animate() {
    requestAnimationFrame(animate);
    if (renderer && scene && camera) {
      renderer.render(scene, camera);
    }
  }

  function getPaisSlots() {
    var slots = [];
    document.querySelectorAll('.pais-slot:not(.pais-aleatorio)').forEach(function (el) {
      slots.push(el);
    });
    return slots;
  }

  function setDestacado(slots, index) {
    slots.forEach(function (slot, i) {
      if (i === index) {
        slot.classList.add('pais-slot--recorriendo');
        slot.scrollIntoView({ block: 'nearest', behavior: 'auto' });
      } else {
        slot.classList.remove('pais-slot--recorriendo');
      }
    });
  }

  function quitarDestacado(slots) {
    slots.forEach(function (slot) {
      slot.classList.remove('pais-slot--recorriendo');
    });
  }

  function iniciarEfectoAleatorio() {
    var grid = document.getElementById('paises-grid');
    var slots = getPaisSlots();
    if (slots.length !== NUM_PAISES) return;

    grid.classList.add('paises-grid--spinning');
    var paso = 0;
    var sumDelays = 0;
    for (var i = 0; i < NUM_PASOS; i++) {
      sumDelays += 30 + 0.5 * i;
    }
    var factor = DURACION_EFECTO_MS / sumDelays;

    function runStep() {
      if (paso >= NUM_PASOS) {
        var finalIndex = Math.floor(Math.random() * NUM_PAISES);
        setDestacado(slots, finalIndex);
        grid.classList.remove('paises-grid--spinning');
        var paisElegido = slots[finalIndex].getAttribute('data-pais');
        var nombreElegido = slots[finalIndex].querySelector('.pais-nombre');
        if (nombreElegido) {
          console.log('Aleatorio: ' + (nombreElegido.textContent || paisElegido));
        }
        setTimeout(function () {
          quitarDestacado(slots);
        }, 1500);
        return;
      }
      setDestacado(slots, paso % NUM_PAISES);
      paso += 1;
      var delay = (30 + 0.5 * paso) * factor;
      setTimeout(runStep, delay);
    }

    runStep();
  }

  function onPaisClick(ev) {
    var btn = ev.currentTarget;
    var pais = btn && btn.getAttribute('data-pais');
    if (!pais) return;

    if (pais === 'aleatorio') {
      ev.preventDefault();
      var grid = document.getElementById('paises-grid');
      if (grid && grid.classList.contains('paises-grid--spinning')) return;
      iniciarEfectoAleatorio();
      return;
    }

    console.log('País seleccionado:', pais);
  }

  function initButtons() {
    var btnVolver = document.getElementById('btn-volver');
    if (btnVolver) {
      btnVolver.addEventListener('click', function () {
        window.location.href = 'index.html';
      });
    }

    document.querySelectorAll('.pais-slot').forEach(function (slot) {
      slot.addEventListener('click', onPaisClick);
    });
  }

  function init() {
    initScene();
    initButtons();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
