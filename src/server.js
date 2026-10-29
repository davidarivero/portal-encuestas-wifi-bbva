const path = require('path');
const crypto = require('crypto');
const express = require('express');
const helmet = require('helmet');
const cookieSession = require('cookie-session');
const { rateLimit } = require('express-rate-limit');

const db = require('./db');
const { survey, validate } = require('./survey');
const { checkCredentials, missingPasswords, requireAuth } = require('./auth');

const PORT = process.env.PORT || 3000;
const isProd = process.env.NODE_ENV === 'production';
const VIEWS = path.join(__dirname, '..', 'views');

let sessionSecret = process.env.SESSION_SECRET;
if (!sessionSecret) {
  if (isProd) {
    console.error('Falta SESSION_SECRET. Defínela en las variables de entorno.');
    process.exit(1);
  }
  sessionSecret = crypto.randomBytes(32).toString('hex');
}

const app = express();
app.set('trust proxy', 1); // Render está detrás de un proxy HTTPS
app.disable('x-powered-by');

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        imgSrc: ["'self'", 'data:'],
        styleSrc: ["'self'"],
        scriptSrc: ["'self'"],
        connectSrc: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
      },
    },
  })
);
app.use(express.json({ limit: '50kb' }));
app.use(express.urlencoded({ extended: false, limit: '10kb' }));
app.use(
  cookieSession({
    name: 'bbva_wifi_sesion',
    keys: [sessionSecret],
    maxAge: 8 * 60 * 60 * 1000, // 8 horas
    httpOnly: true,
    sameSite: 'lax',
    secure: isProd,
  })
);

// HTML, JS y CSS se revalidan siempre para que un despliegue nuevo se vea de inmediato;
// las imágenes sí se guardan en caché.
app.use(
  express.static(path.join(__dirname, '..', 'public'), {
    setHeaders(res, file) {
      res.setHeader('Cache-Control', /\.(png|jpe?g|svg|webp)$/.test(file) ? 'public, max-age=86400' : 'no-cache');
    },
  })
);
const CHART_JS = path.join(path.dirname(require.resolve('chart.js')), 'chart.umd.min.js');
app.get('/vendor/chart.umd.js', (req, res) => res.sendFile(CHART_JS));

app.get('/encuestador', (req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'index.html')));

app.get('/healthz', (req, res) => res.json({ ok: true }));

// ---------- Encuesta pública ----------

app.get('/api/encuesta', (req, res) => res.json(survey));

const submitLimiter = rateLimit({ windowMs: 60 * 1000, limit: 10, standardHeaders: 'draft-7', legacyHeaders: false });
app.post('/api/respuestas', submitLimiter, async (req, res, next) => {
  try {
    const result = validate(req.body);
    if (!result.ok) return res.status(400).json({ error: result.error });
    await db.insert(result.value);
    res.status(201).json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// ---------- Administración ----------

const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: 'draft-7', legacyHeaders: false, skipSuccessfulRequests: true });

app.get('/admin/login', (req, res) => {
  if (req.session.user) return res.redirect('/admin');
  res.sendFile(path.join(VIEWS, 'login.html'));
});

app.post('/admin/login', loginLimiter, (req, res) => {
  const user = checkCredentials(req.body.usuario, req.body.contrasena);
  if (!user) return res.redirect('/admin/login?error=1');
  req.session.user = user;
  res.redirect('/admin');
});

app.post('/admin/logout', (req, res) => {
  req.session = null;
  res.redirect('/admin/login');
});

app.get('/admin', requireAuth, (req, res) => res.sendFile(path.join(VIEWS, 'admin.html')));

app.get('/admin/api/yo', requireAuth, (req, res) => res.json(req.session.user));

function rangeFrom(query) {
  const isDate = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
  const range = {};
  if (isDate(query.desde)) range.desde = `${query.desde}T00:00:00-06:00`;
  if (isDate(query.hasta)) {
    const d = new Date(`${query.hasta}T00:00:00-06:00`);
    d.setUTCDate(d.getUTCDate() + 1);
    range.hasta = d.toISOString();
  }
  return range;
}

app.get('/admin/api/respuestas', requireAuth, async (req, res, next) => {
  try {
    res.json({ encuesta: survey, respuestas: await db.list(rangeFrom(req.query)) });
  } catch (err) {
    next(err);
  }
});

app.delete('/admin/api/respuestas/:id', requireAuth, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: 'Id inválido.' });
    await db.remove(id);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

const CSV_COLUMNS = [
  ['id', 'ID'],
  ['creado_en', 'Fecha'],
  ['calificacion', 'Calificación'],
  ['seccion', 'Sección'],
  ['canal', 'Canal'],
  ['piso', 'Piso'],
  ['colaborador', 'Colaborador'],
  ['equipos', 'Equipo de trabajo'],
  ['mejoras', 'Aspectos a mejorar'],
  ['mejoras_otro', 'Aspectos a mejorar (otro)'],
  ['dispositivo_problema', 'Dispositivo con problema'],
  ['problemas', 'Problema principal'],
  ['problemas_otro', 'Problema principal (otro)'],
  ['frecuencia', 'Frecuencia'],
  ['reportado', '¿Reportado a soporte?'],
  ['comentarios', 'Comentarios'],
];

function csvCell(v) {
  let s = Array.isArray(v) ? v.join('; ') : v === undefined || v === null ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; // evita inyección de fórmulas en Excel
  return `"${s.replace(/"/g, '""')}"`;
}

app.get('/admin/api/exportar.csv', requireAuth, async (req, res, next) => {
  try {
    const rows = await db.list(rangeFrom(req.query));
    const lines = [CSV_COLUMNS.map(([, h]) => csvCell(h)).join(',')];
    for (const r of rows) {
      const flat = { ...r.respuestas, id: r.id, creado_en: r.creado_en, calificacion: r.calificacion, seccion: r.seccion };
      lines.push(CSV_COLUMNS.map(([k]) => csvCell(flat[k])).join(','));
    }
    const stamp = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="encuesta-wifi-bbva-${stamp}.csv"`);
    res.send('﻿' + lines.join('\r\n'));
  } catch (err) {
    next(err);
  }
});

app.use((req, res) => res.status(404).sendFile(path.join(VIEWS, '404.html')));

app.use((err, req, res, next) => {
  console.error(err);
  if (res.headersSent) return next(err);
  res.status(500).json({ error: 'Ocurrió un error. Intenta de nuevo.' });
});

db.init()
  .then(() => {
    const missing = missingPasswords();
    if (missing.length) console.warn(`[auth] Sin contraseña configurada (${missing.join(', ')}): ese usuario no podrá entrar.`);
    app.listen(PORT, () => console.log(`Portal de encuestas Wi-Fi BBVA en http://localhost:${PORT}`));
  })
  .catch((err) => {
    console.error('No se pudo inicializar la base de datos:', err);
    process.exit(1);
  });
