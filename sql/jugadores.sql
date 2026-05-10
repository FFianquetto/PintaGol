-- Base de datos para Pinta Gol (jugadores vinculados con Meta / Facebook)
-- Ejecuta en MySQL (Workbench, CLI: mysql -u root -p < sql/jugadores.sql)

CREATE DATABASE IF NOT EXISTS pintagol
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE pintagol;

-- Correo y puntaje total se actualizan desde el servidor al validar Facebook y al registrar victorias.
CREATE TABLE IF NOT EXISTS jugadores (
  meta_user_id VARCHAR(64) NOT NULL COMMENT 'ID de usuario Graph API (Facebook)',
  correo VARCHAR(320) NOT NULL DEFAULT '',
  nombre VARCHAR(255) NOT NULL DEFAULT '',
  puntaje_total INT UNSIGNED NOT NULL DEFAULT 0 COMMENT 'Partidas ganadas acumuladas',
  vinculo_facebook TINYINT(1) NOT NULL DEFAULT 0 COMMENT '1 si inició sesión al menos una vez con canal Facebook',
  creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (meta_user_id),
  KEY idx_ranking (puntaje_total DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
