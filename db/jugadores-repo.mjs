/**
 * Tabla `jugadores`: correo, nombre (Meta), puntaje_total, vinculo_facebook.
 * @param {import('mysql2/promise').Pool} pool
 */
export function createJugadoresRepo(pool) {
  return {
    /**
     * Inserta o actualiza fila al validar token SDK / OAuth (correo y nombre desde Graph).
     * @param {'facebook'|'instagram'} channel
     */
    async upsertOAuthUser(userId, email, name, channel) {
      const id = String(userId || '').trim();
      if (!id) return null;
      const fb = channel === 'facebook' ? 1 : 0;
      await pool.execute(
        `INSERT INTO jugadores (meta_user_id, correo, nombre, vinculo_facebook)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           correo = VALUES(correo),
           nombre = VALUES(nombre),
           vinculo_facebook = GREATEST(vinculo_facebook, VALUES(vinculo_facebook))`,
        [id, email || '', name || '', fb]
      );
      return { id, email, name };
    },

    /** @param {string} userId */
    async hasFacebookLink(userId) {
      const id = String(userId || '').trim();
      if (!id) return false;
      const [rows] = await pool.execute(
        `SELECT 1 AS ok FROM jugadores WHERE meta_user_id = ? AND vinculo_facebook = 1 LIMIT 1`,
        [id]
      );
      return !!(rows && rows.length);
    },

    async incrementWin(userId) {
      const id = String(userId || '').trim();
      if (!id) return { ok: false, reason: 'unknown_user' };

      const [upd] = await pool.execute(
        `UPDATE jugadores SET puntaje_total = puntaje_total + 1 WHERE meta_user_id = ? AND vinculo_facebook = 1`,
        [id]
      );
      const affected = upd && typeof upd.affectedRows === 'number' ? upd.affectedRows : 0;

      if (affected === 0) {
        const [existRows] = await pool.execute(
          `SELECT vinculo_facebook FROM jugadores WHERE meta_user_id = ? LIMIT 1`,
          [id]
        );
        if (!existRows || !existRows.length) return { ok: false, reason: 'unknown_user' };
        return { ok: false, reason: 'not_linked_facebook' };
      }

      const [outRows] = await pool.execute(
        `SELECT puntaje_total FROM jugadores WHERE meta_user_id = ? LIMIT 1`,
        [id]
      );
      const r = outRows && outRows[0];
      const wins = r && r.puntaje_total != null ? Number(r.puntaje_total) : 0;
      return { ok: true, wins };
    },

    /** @returns {Promise<Array<{ rank: number, userId: string, name: string, wins: number }>>} */
    async getLeaderboard(limit = 50) {
      const lim = Math.min(Math.max(Number(limit) || 50, 1), 200);
      const [rows] = await pool.execute(
        `SELECT meta_user_id, correo, nombre, puntaje_total FROM jugadores
         WHERE vinculo_facebook = 1
         ORDER BY puntaje_total DESC, meta_user_id ASC
         LIMIT ?`,
        [lim]
      );
      return rows.map((r, i) => ({
        rank: i + 1,
        userId: String(r.meta_user_id),
        name:
          (r.nombre && String(r.nombre).trim()) ||
          (r.correo && String(r.correo).trim()) ||
          'Jugador',
        wins: r.puntaje_total || 0
      }));
    }
  };
}
