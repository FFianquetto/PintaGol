# Pinta Gol - Lobby

Pantalla de lobby del videojuego en línea **Pinta Gol**, desarrollada con **HTML**, **JavaScript** y **WebGL** usando únicamente **Three.js** (sin otros frameworks de terceros). Compatible con **Google Chrome**.

## Contenido

- **Fondo:** Mapa mundial estilizado (océano azul y continentes simplificados) renderizado en WebGL.
- **Balón 3D:** Balón de fútbol dorado con geometría tipo icosaedro y rotación suave.
- **Título:** "Pinta Gol" con estilo pincelada (verde/amarillo) en overlay HTML/CSS.
- **Botones:** Crear partida, Buscar Partida, Configuración, Puntuaciones, Comunidad (formas redondeadas y colores del diseño).

## Cómo ejecutar

**Comando recomendado (Node):**
```bash
npx serve .
```
Luego abre en el navegador la URL que muestre (por ejemplo `http://localhost:3000`).  
*(Chrome puede bloquear WebGL con `file://`; hace falta servidor local.)*

**Alternativas:**
- `npx http-server .` — sirve en otro puerto (p. ej. 8080).
- `python -m http.server 8080` — si usas Python 3.

## Estructura

```
Avance1/
├── index.html
├── configuracion.html
├── puntuaciones.html
├── seleccion-pais.html
├── comunidad.html
├── pausa.html
├── assets/
│   ├── models/
│   ├── textures/
│   ├── audio/
│   ├── images/
│   ├── items/        # Ítems especiales (mín. 3)
│   ├── scenarios/   # 3 escenarios distintos
│   └── particles/   # Texturas para partículas
├── backend/             # Backend propio (opcional). Si las APIs son externas, solo se usa js/api/
├── css/
│   └── ...
├── js/
│   ├── api/             # Cliente REST API (base URL, endpoints). Estilo Retrofit: centralizar llamadas cuando tengas las APIs
│   ├── scenes/
│   ├── network/
│   └── ...
├── REQUISITOS.md     # Análisis de cumplimiento de la rúbrica (pantallas, colisiones, IA, multijugador, etc.)
└── README.md
```

## Próximos pasos

- Conectar cada botón con su pantalla (crear partida, buscar partida, etc.).
- Sustituir la textura del mapa por una imagen de alta resolución con banderas si se desea.
- Añadir más pantallas del juego siguiendo el mismo stack (HTML + JS + Three.js).
