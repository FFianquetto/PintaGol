/**
 * Lobby "Pinta Gol" - Three.js (WebGL)
 * Sin frameworks de terceros excepto Three.js.
 * Compatible con Google Chrome.
 */
(function () {
  'use strict';

  var scene, camera, renderer, ball, mapPlane;
  var clock = new THREE.Clock();

  function createMapTexture() {
    var w = 1024, h = 512;
    var canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    var ctx = canvas.getContext('2d');

    // Océano azul vibrante (como en el diseño)
    var gradient = ctx.createLinearGradient(0, 0, 0, h);
    gradient.addColorStop(0, '#0088dd');
    gradient.addColorStop(0.5, '#0066cc');
    gradient.addColorStop(1, '#004499');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, h);

    // Siluetas de continentes estilizados (proyección simplificada)
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

  function createBallTexture() {
    var size = 512;
    var canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    var ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, size, size);

    function drawHexagon(cx, cy, radius) {
      ctx.beginPath();
      for (var i = 0; i < 6; i++) {
        var angle = (Math.PI / 3) * i - Math.PI / 6;
        var x = cx + radius * Math.cos(angle);
        var y = cy + radius * Math.sin(angle);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fill();
    }

    ctx.fillStyle = '#1a1a1a';
    // 12 parches como en un balón real: 2 polos + 5 arriba + 5 abajo (patrón icosaedro)
    var spots = [
      [0.5, 0.07],   // polo superior
      [0.5, 0.93],   // polo inferior
      [0.5, 0.48], [0.69, 0.34], [0.618, 0.12], [0.382, 0.12], [0.31, 0.34],   // pentágono superior
      [0.5, 0.52], [0.69, 0.66], [0.618, 0.88], [0.382, 0.88], [0.31, 0.66]    // pentágono inferior
    ];
    var radius = size * 0.088;
    spots.forEach(function (p) {
      drawHexagon(p[0] * size, p[1] * size, radius);
    });
    var tex = new THREE.CanvasTexture(canvas);
    tex.needsUpdate = true;
    return tex;
  }

  function createBall() {
    var geometry = new THREE.SphereGeometry(1, 32, 24);
    var material = new THREE.MeshStandardMaterial({
      map: createBallTexture(),
      color: 0xf5f5f5,
      roughness: 0.5,
      metalness: 0.06
    });
    var mesh = new THREE.Mesh(geometry, material);
    mesh.scale.setScalar(2.2);
    return mesh;
  }

  function init() {
    var canvasEl = document.getElementById('lobby-canvas');
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

    // Luz ambiental + direccional para el balón
    scene.add(new THREE.AmbientLight(0xffffff, 0.75));
    var dirLight = new THREE.DirectionalLight(0xffffff, 0.95);
    dirLight.position.set(6, 10, 8);
    scene.add(dirLight);
    var fillLight = new THREE.DirectionalLight(0xe8f4fc, 0.5);
    fillLight.position.set(-5, 3, 6);
    scene.add(fillLight);

    // Plano del mapa (fondo)
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

    // Balón 3D (posición superior derecha del mapa)
    ball = createBall();
    ball.position.set(5, 2.2, 0.5);
    ball.rotation.order = 'YXZ';
    scene.add(ball);

    window.addEventListener('resize', onResize);
    onResize();

    // Handlers de botones del lobby
    document.querySelectorAll('.lobby-btn').forEach(function (btn) {
      btn.addEventListener('click', onLobbyButtonClick);
    });

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

  function onLobbyButtonClick(ev) {
    var action = (ev.currentTarget && ev.currentTarget.getAttribute('data-action')) || '';
    switch (action) {
      case 'crear-partida':
        window.location.href = 'pausa.html';
        break;
      case 'buscar-partida':
        window.location.href = 'seleccion-pais.html';
        break;
      case 'configuracion':
        window.location.href = 'configuracion.html';
        break;
      case 'puntuaciones':
        window.location.href = 'puntuaciones.html';
        break;
      case 'comunidad':
        window.location.href = 'comunidad.html';
        break;
      default:
        break;
    }
  }

  function animate() {
    requestAnimationFrame(animate);
    var dt = clock.getDelta();
    if (ball) {
      ball.rotation.y += 0.35 * dt;
      ball.rotation.x = Math.sin(clock.getElapsedTime() * 0.5) * 0.08;
    }
    if (renderer && scene && camera) {
      renderer.render(scene, camera);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
