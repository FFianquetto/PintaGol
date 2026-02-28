# Pinta Gol - Lobby

Pantalla de lobby del videojuego en línea **Pinta Gol**, desarrollada con **HTML**, **JavaScript** y **WebGL** usando únicamente **Three.js** (sin otros frameworks de terceros). Compatible con **Google Chrome**.

## Contenido

- **Fondo:** Mapa mundial estilizado (océano azul y continentes simplificados) renderizado en WebGL.
- **Balón 3D:** Balón de fútbol dorado con geometría tipo icosaedro y rotación suave.
- **Título:** "Pinta Gol" con estilo pincelada (verde/amarillo) en overlay HTML/CSS.
- **Botones:** Crear partida, Buscar Partida, Configuración, Puntuaciones, Comunidad (formas redondeadas y colores del diseño).

## Cómo ejecutar

1. Sirve el proyecto con un servidor local (Chrome puede bloquear WebGL con `file://`).
   - Con Node: `npx serve .` o `npx http-server .`
   - Con Python: `python -m http.server 8080`
2. Abre en Chrome la URL que indique el servidor (ej. `http://localhost:8080`).

## Estructura

```
Avance1/
├── index.html           # Página del lobby
├── configuracion.html   # Pantalla de configuraciones
├── puntuaciones.html    # Pantalla de puntuaciones / leaderboard
├── seleccion-pais.html  # Selección de país (Buscar partida)
├── comunidad.html       # Comunidad / noticias
├── pausa.html            # Menú de pausa (Continuar, Reiniciar, Salir)
├── css/
│   ├── lobby.css         # Estilos del lobby
│   ├── configuracion.css # Estilos del panel de configuración
│   ├── puntuaciones.css  # Estilos del panel de puntuaciones
│   ├── seleccion-pais.css # Estilos del panel de selección de país
│   ├── comunidad.css     # Estilos del panel de comunidad / noticias
│   └── pausa.css         # Estilos del menú de pausa
├── js/
│   ├── lobby.js          # Escena Three.js y lógica del lobby
│   ├── configuracion.js  # Escena Three.js y sliders de sonido/música
│   ├── puntuaciones.js   # Escena Three.js del mapa (puntuaciones)
│   ├── seleccion-pais.js # Escena Three.js y grid de banderas
│   ├── comunidad.js      # Escena Three.js (comunidad / noticias)
│   └── pausa.js          # Escena Three.js y menú de pausa
└── README.md
```

## Próximos pasos

- Conectar cada botón con su pantalla (crear partida, buscar partida, etc.).
- Sustituir la textura del mapa por una imagen de alta resolución con banderas si se desea.
- Añadir más pantallas del juego siguiendo el mismo stack (HTML + JS + Three.js).
