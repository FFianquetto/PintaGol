# Análisis de requisitos – Pinta Gol

Relación de cada requisito con lo que ya existe y cómo cumplirlo (sin implementar código aquí).

---

## 1. Ejercicios realizados en clase (mínimo 4)

| Requisito | Estado en el proyecto | Cómo cumplir |
|-----------|------------------------|--------------|
| **Pantalla menú inicial** | ✅ `index.html` (lobby) | Ya existe. Mantener como entrada principal. |
| **Pantalla configuraciones** | ✅ `configuracion.html` | Ya existe. Asegurar que sliders/opciones persistan (localStorage o API). |
| **Pantalla puntuaciones** | ✅ `puntuaciones.html` | Ya existe. Conectar a servicio web / backend para datos reales. |
| **Pantalla menú de pausa** | ✅ `pausa.html` | Ya existe. Desde la escena de juego, abrir esta pantalla al pausar. |

**Conclusión:** Se cubren las 4 pantallas mínimas. Solo falta enlazar bien flujos (pausa desde el juego, puntuaciones desde API).

---

## 2. Detección y uso de colisiones

- **Dónde:** En la escena de juego (WebGL/Three.js): balón–portería, jugador–balón, jugador–límites, ítems–jugador.
- **Cómo:** Usar **Raycaster** para disparos/objetos, o **cajas/esferas de colisión** (bounding box/sphere) y comprobar intersecciones. Three.js no tiene motor de física; para física “real” se puede usar **Ammo.js** o **Cannon-es** y sincronizar con los meshes.
- **Carpetas:** Lógica en `js/` (escena de partida); no requiere carpeta nueva.

---

## 3. Iluminación ambiental e iluminación focal

- **Ambiental:** `THREE.AmbientLight` (ya usado en `lobby.js`). Repetir en la escena de juego.
- **Focal:** `THREE.SpotLight` (cono de luz) o `THREE.PointLight` (luz puntual). Por ejemplo: focos del estadio, luz sobre el balón o el jugador.
- **Dónde:** En el `init` de la escena 3D de la partida y, si aplica, en cada uno de los 3 escenarios con valores distintos por ambiente.

---

## 4. Al menos 2 niveles de dificultad (el tiempo no es la variante)

- **Requisito:** Diferenciar niveles por algo distinto al tiempo (vidas, número de enemigos, precisión, tamaño de portería, velocidad del rival, etc.).
- **Ejemplos:** Nivel fácil = menos enemigos/IA más lenta o portería más grande; nivel difícil = más enemigos/IA más agresiva o portería más pequeña.
- **Dónde:** Variable o configuración de partida (ej. `dificultad: 'facil' | 'dificil'`); menú de creación de partida o pantalla de selección de modo. No requiere carpeta nueva; puede guardarse en `js/` o enviarse por API.

---

## 5. Al menos 3 escenarios totalmente distintos

- **Requisito:** Tres niveles/escenarios con escenografía diferente (estadio, calle, playa, etc.).
- **Dónde:** Assets y configuración por escenario en `assets/scenarios/` (por ejemplo subcarpetas o prefijos `escenario_1`, `escenario_2`, `escenario_3` con modelos, texturas, skybox, luces distintas).
- **En código:** Al cargar la partida se elige qué escenario cargar (rutas distintas a modelos/escena) y se aplican luces/ambiente de ese escenario.

---

## 6. Al menos 2 modos de juego distintos

- **Requisito:** Dos modos claramente diferenciados (ej. “Pinta Gol clásico” vs “Penales”, o “Solo” vs “Multijugador”, o “Campaña” vs “Libre”).
- **Dónde:** Menú principal o pantalla “Crear partida”: el usuario elige modo; la lógica de la partida (reglas, objetivos, flujo) cambia según el modo. No requiere carpeta nueva; puede ser un módulo `js/` por modo o flags en la escena.

---

## 7. REQ – Desarrollar y consumir un servicio web

- **Desarrollar:** Backend en `backend/` (Node/Express, etc.) que exponga endpoints (partidas, puntuaciones, usuarios, etc.).
- **Consumir:** Cliente en `js/api/` (fetch/axios) que llame a esa API (o a la que te pasen). Base URL y endpoints centralizados; el resto del juego solo usa esa capa.
- **Requisito:** Tener al menos un servicio propio (aunque luego también consumas APIs externas). Si las APIs son externas, el “desarrollar” puede ser un microservicio propio que las use o que guarde datos del juego.

---

## 8. REQ – Uso de servicios sociales (Facebook, Twitter o Instagram)

- **Opciones:** Botón “Compartir” que abra la URL de compartir de una red (ej. `https://twitter.com/intent/tweet?text=...`), o SDK oficial (Facebook SDK, Twitter widgets) para publicar puntuación o enlace.
- **Dónde:** En pantalla de puntuaciones o fin de partida: “Compartir en Twitter/Facebook/Instagram”. Una sola red ya cumple; incluir 2–3 da mejor impresión.
- **Carpetas:** No hace falta carpeta nueva; un pequeño módulo o funciones en `js/` para abrir URLs o cargar SDK.

---

## 9. Efectos de sonido y música de fondo

- **Música:** Una pista de fondo en menús y/o durante la partida (`assets/audio/`).
- **Efectos:** Gol, pase, menú, ítems, etc. (`assets/audio/`).
- **Dónde:** `assets/audio/` ya existe. En código: `Audio` o `Howler.js`; volumen desde `configuracion.html` (sliders ya existen).

---

## 10. Uso de ítems (mínimo 3)

- **Requisito:** Al menos 3 tipos de objetos especiales (power-ups, bonus: velocidad, escudo, gol doble, etc.).
- **Dónde:** Modelos/sprites en `assets/items/`. En la escena de juego: spawn de ítems, colisión jugador–ítem, aplicación del efecto. Listar los 3 (o más) ítems en diseño y luego implementar lógica y assets.

---

## 11. Multijugador en tiempo real

- **Requisito:** Varios jugadores en la misma partida, sincronizados en tiempo real.
- **Cómo:** WebSockets (Socket.io u otro) en servidor (`backend/` o servidor aparte) y cliente en `js/network/`. Sincronizar posiciones, balón, eventos (disparo, ítem) entre clientes.
- **Carpetas:** `backend/` para servidor; `js/network/` para conexión y mensajes en el cliente.

---

## 12. Uso de partículas

- **Requisito:** Sistema de partículas visible (humo, polvo, chispas, confeti, hierba, etc.).
- **Cómo:** `THREE.Points` o `THREE.PointsMaterial` con textura; o `THREE.Sprite` para partículas con cara a cámara. Texturas en `assets/particles/`.
- **Dónde:** Efectos en gol, disparo, ítems, ambiente; lógica en la escena de juego; assets en `assets/particles/`.

---

## 13. Inteligencia Artificial (enemigos siguen al personaje en campo de visión)

- **Requisito:** IA que persiga o reaccione al jugador cuando está en el campo de visión del enemigo.
- **Cómo:** Detección de “en campo de visión”: cono de visión (ángulo + distancia) o raycast desde el enemigo hacia el jugador. Si está visible, activar comportamiento de persecución (movimiento hacia el jugador o hacia el balón). Opcional: navmesh o waypoints para no atravesar obstáculos.
- **Dónde:** Lógica en `js/` (update del enemigo en el bucle de la partida). No requiere carpeta nueva; puede ir en un módulo `js/ai/` si se quiere orden.

---

## Resumen por carpeta

| Carpeta | Uso para requisitos |
|---------|----------------------|
| `assets/items/` | Ítems especiales (mín. 3). |
| `assets/scenarios/` | 3 escenarios distintos. |
| `assets/particles/` | Texturas/sprites para partículas. |
| `assets/audio/` | Música y efectos de sonido. |
| `js/api/` | Consumir (y, si aplica, desarrollar) servicio web. |
| `js/network/` | Multijugador en tiempo real. |
| `backend/` | Servicio web propio y/o servidor WebSockets. |

Pantallas ya existentes: menú inicial (index), configuraciones, puntuaciones, pausa → cubren el mínimo de 4 ejercicios en clase. El resto se cumple añadiendo lógica y recursos en las escenas y carpetas indicadas.
