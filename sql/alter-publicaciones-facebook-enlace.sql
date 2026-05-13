-- Ejecuta en tu base `pintagol` si la tabla `publicaciones` ya existe (phpMyAdmin → SQL).
-- Guarda el enlace al post en el perfil de Facebook tras usar el diálogo de compartir de Meta.

USE pintagol;

ALTER TABLE publicaciones
  ADD COLUMN facebook_enlace VARCHAR(768) NOT NULL DEFAULT ''
    COMMENT 'URL del post en Facebook (tras compartir con el SDK)' AFTER imagen_url;
