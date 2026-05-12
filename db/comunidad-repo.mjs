/**
 * Publicaciones y comentarios de la comunidad (MySQL).
 * @param {import('mysql2/promise').Pool} pool
 */
export function createComunidadRepo(pool) {
  return {
    /** @returns {Promise<Array<{ id: number, meta_user_id: string, cuerpo: string, imagen_url: string, creado_en: string, autor_nombre: string }>>} */
    async listPublicaciones(limit = 30) {
      const lim = Math.min(Math.max(Number(limit) || 30, 1), 100);
      const [rows] = await pool.execute(
        `SELECT p.id, p.meta_user_id, p.cuerpo, p.imagen_url, p.creado_en,
                COALESCE(NULLIF(TRIM(j.nombre), ''), NULLIF(TRIM(j.correo), ''), 'Jugador') AS autor_nombre,
                (SELECT COUNT(*) FROM comentarios_publicacion c WHERE c.publicacion_id = p.id) AS num_comentarios
         FROM publicaciones p
         INNER JOIN jugadores j ON j.meta_user_id = p.meta_user_id
         ORDER BY p.creado_en DESC, p.id DESC
         LIMIT ?`,
        [lim]
      );
      return rows.map((r) => ({
        id: Number(r.id),
        meta_user_id: String(r.meta_user_id),
        cuerpo: String(r.cuerpo || ''),
        imagen_url: String(r.imagen_url || ''),
        creado_en: r.creado_en instanceof Date ? r.creado_en.toISOString() : String(r.creado_en),
        autor_nombre: String(r.autor_nombre || 'Jugador'),
        num_comentarios: Number(r.num_comentarios) || 0
      }));
    },

    /** @returns {Promise<number>} nuevo id */
    async insertPublicacion(metaUserId, cuerpo, imagenUrl) {
      const [res] = await pool.execute(
        `INSERT INTO publicaciones (meta_user_id, cuerpo, imagen_url) VALUES (?, ?, ?)`,
        [String(metaUserId || '').trim(), String(cuerpo || '').trim(), String(imagenUrl || '').trim()]
      );
      const id = res && typeof res.insertId === 'number' ? res.insertId : 0;
      return id;
    },

    /** @returns {Promise<Array<{ id: number, meta_user_id: string, cuerpo: string, creado_en: string, autor_nombre: string }>>} */
    async listComentarios(publicacionId) {
      const pid = Number(publicacionId);
      if (!Number.isFinite(pid) || pid <= 0) return [];
      const [rows] = await pool.execute(
        `SELECT c.id, c.meta_user_id, c.cuerpo, c.creado_en,
                COALESCE(NULLIF(TRIM(j.nombre), ''), NULLIF(TRIM(j.correo), ''), 'Jugador') AS autor_nombre
         FROM comentarios_publicacion c
         INNER JOIN jugadores j ON j.meta_user_id = c.meta_user_id
         WHERE c.publicacion_id = ?
         ORDER BY c.creado_en ASC, c.id ASC`,
        [pid]
      );
      return rows.map((r) => ({
        id: Number(r.id),
        meta_user_id: String(r.meta_user_id),
        cuerpo: String(r.cuerpo || ''),
        creado_en: r.creado_en instanceof Date ? r.creado_en.toISOString() : String(r.creado_en),
        autor_nombre: String(r.autor_nombre || 'Jugador')
      }));
    },

    /** @returns {Promise<boolean>} */
    async existsPublicacion(publicacionId) {
      const pid = Number(publicacionId);
      if (!Number.isFinite(pid) || pid <= 0) return false;
      const [rows] = await pool.execute(`SELECT 1 AS ok FROM publicaciones WHERE id = ? LIMIT 1`, [pid]);
      return !!(rows && rows.length);
    },

    /** @returns {Promise<number>} nuevo id */
    async insertComentario(publicacionId, metaUserId, cuerpo) {
      const pid = Number(publicacionId);
      const [res] = await pool.execute(
        `INSERT INTO comentarios_publicacion (publicacion_id, meta_user_id, cuerpo) VALUES (?, ?, ?)`,
        [pid, String(metaUserId || '').trim(), String(cuerpo || '').trim()]
      );
      return res && typeof res.insertId === 'number' ? res.insertId : 0;
    },

    /**
     * Borra publicación solo si el autor coincide (comentarios en cascada por FK).
     * @returns {Promise<{ ok: boolean, imagen_url?: string, reason?: string }>}
     */
    async deletePublicacionAsOwner(publicacionId, metaUserId) {
      const pid = Number(publicacionId);
      const uid = String(metaUserId || '').trim();
      if (!Number.isFinite(pid) || pid <= 0 || !uid) return { ok: false, reason: 'bad_args' };
      const [rows] = await pool.execute(
        `SELECT imagen_url FROM publicaciones WHERE id = ? AND meta_user_id = ? LIMIT 1`,
        [pid, uid]
      );
      if (!rows || !rows.length) return { ok: false, reason: 'not_found' };
      const imagenUrl = String(rows[0].imagen_url || '');
      const [del] = await pool.execute(`DELETE FROM publicaciones WHERE id = ? AND meta_user_id = ?`, [pid, uid]);
      const n = del && typeof del.affectedRows === 'number' ? del.affectedRows : 0;
      if (n < 1) return { ok: false, reason: 'not_found' };
      return { ok: true, imagen_url: imagenUrl };
    }
  };
}
