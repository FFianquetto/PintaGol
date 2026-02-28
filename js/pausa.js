/**
 * Ventana de Pausa - Pinta Gol
 * Mapa de fondo difuminado, menú PAUSA. Coherencia con el resto del juego.
 */
(function () {
  'use strict';

  var scene, camera, renderer, mapPlane;

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
    var canvasEl = document.getElementById('pausa-canvas');
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

  function onBotonClick(ev) {
    var btn = ev.currentTarget;
    var accion = btn && btn.getAttribute('data-accion');
    switch (accion) {
      case 'continuar':
        window.location.href = 'index.html';
        break;
      case 'reiniciar':
        window.location.reload();
        break;
      case 'salir':
        window.location.href = 'index.html';
        break;
      default:
        break;
    }
  }

  function initButtons() {
    document.querySelectorAll('.pausa-btn').forEach(function (btn) {
      btn.addEventListener('click', onBotonClick);
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
