/**
 * Pool de conexiones MySQL (mysql2).
 * Si falta MYSQL_HOST, devuelve null y el servidor usa scores-meta.json.
 */
import mysql from 'mysql2/promise';

export function createMysqlPool() {
  const host = process.env.MYSQL_HOST;
  if (!host || !String(host).trim()) return null;

  return mysql.createPool({
    host: String(host).trim(),
    port: Number(process.env.MYSQL_PORT) || 3306,
    user: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASSWORD != null ? String(process.env.MYSQL_PASSWORD) : '',
    database: process.env.MYSQL_DATABASE || 'pintagol',
    waitForConnections: true,
    connectionLimit: Number(process.env.MYSQL_CONNECTION_LIMIT) || 10,
    enableKeepAlive: true,
    keepAliveInitialDelay: 0
  });
}
