-- Comunidad: publicaciones y comentarios (Pinta Gol)
-- Requiere la tabla `jugadores` (sql/jugadores.sql). Ejecuta tras crear la base pintagol.

USE pintagol;

-- Publicaciones de usuarios con Facebook vinculado (meta_user_id = jugadores.meta_user_id)
CREATE TABLE IF NOT EXISTS publicaciones (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  meta_user_id VARCHAR(64) NOT NULL COMMENT 'Autor: FK a jugadores.meta_user_id',
  cuerpo TEXT NOT NULL COMMENT 'Texto de la publicación',
  imagen_url VARCHAR(512) NOT NULL DEFAULT '' COMMENT 'Ruta bajo /uploads/comunidad/ (vacío si no hay foto)',
  facebook_enlace VARCHAR(768) NOT NULL DEFAULT '' COMMENT 'URL del post en Facebook (tras compartir)',
  creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_pub_creado (creado_en DESC),
  CONSTRAINT fk_publicaciones_jugador
    FOREIGN KEY (meta_user_id) REFERENCES jugadores (meta_user_id)
    ON DELETE CASCADE
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS comentarios_publicacion (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  publicacion_id BIGINT UNSIGNED NOT NULL,
  meta_user_id VARCHAR(64) NOT NULL COMMENT 'Autor del comentario',
  cuerpo VARCHAR(2000) NOT NULL,
  creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_com_pub (publicacion_id),
  CONSTRAINT fk_comentarios_publicacion
    FOREIGN KEY (publicacion_id) REFERENCES publicaciones (id)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT fk_comentarios_jugador
    FOREIGN KEY (meta_user_id) REFERENCES jugadores (meta_user_id)
    ON DELETE CASCADE
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
