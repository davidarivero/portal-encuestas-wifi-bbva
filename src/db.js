// Almacenamiento de respuestas.
// Con DATABASE_URL usa PostgreSQL (producción en Render).
// Sin DATABASE_URL guarda en un archivo JSON local (solo para desarrollo).

const fs = require('fs');
const path = require('path');

let impl;

if (process.env.DATABASE_URL) {
  const { Pool } = require('pg');
  const useSsl = process.env.DATABASE_SSL === 'true';
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: useSsl ? { rejectUnauthorized: false } : undefined,
  });

  impl = {
    kind: 'postgres',
    async init() {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS respuestas (
          id SERIAL PRIMARY KEY,
          creado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
          calificacion SMALLINT NOT NULL CHECK (calificacion BETWEEN 1 AND 5),
          seccion TEXT NOT NULL,
          respuestas JSONB NOT NULL
        )`);
      await pool.query('CREATE INDEX IF NOT EXISTS respuestas_creado_en_idx ON respuestas (creado_en)');
    },
    async insert({ calificacion, seccion, respuestas }) {
      await pool.query(
        'INSERT INTO respuestas (calificacion, seccion, respuestas) VALUES ($1, $2, $3)',
        [calificacion, seccion, JSON.stringify(respuestas)]
      );
    },
    async list({ desde, hasta } = {}) {
      const where = [];
      const params = [];
      if (desde) { params.push(desde); where.push(`creado_en >= $${params.length}`); }
      if (hasta) { params.push(hasta); where.push(`creado_en < $${params.length}`); }
      const sql = `SELECT id, creado_en, calificacion, seccion, respuestas FROM respuestas
        ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY creado_en DESC`;
      const { rows } = await pool.query(sql, params);
      return rows.map((r) => ({ ...r, creado_en: new Date(r.creado_en).toISOString() }));
    },
    async remove(id) {
      await pool.query('DELETE FROM respuestas WHERE id = $1', [id]);
    },
  };
} else {
  const file = process.env.DATA_FILE || path.join(__dirname, '..', 'data', 'respuestas.json');
  const read = () => (fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : []);
  const write = (rows) => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(rows, null, 2));
  };

  impl = {
    kind: 'archivo',
    async init() {
      console.warn(`[db] DATABASE_URL no definida: guardando respuestas en ${file} (solo desarrollo).`);
    },
    async insert(row) {
      const rows = read();
      const id = rows.reduce((m, r) => Math.max(m, r.id), 0) + 1;
      rows.push({ id, creado_en: new Date().toISOString(), ...row });
      write(rows);
    },
    async list({ desde, hasta } = {}) {
      return read()
        .filter((r) => (!desde || r.creado_en >= new Date(desde).toISOString()) && (!hasta || r.creado_en < new Date(hasta).toISOString()))
        .sort((a, b) => b.creado_en.localeCompare(a.creado_en));
    },
    async remove(id) {
      write(read().filter((r) => r.id !== id));
    },
  };
}

module.exports = impl;
