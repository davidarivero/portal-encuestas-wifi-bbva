// Acceso de administradores. Hay dos usuarios fijos; sus contraseñas
// se leen de variables de entorno y nunca se guardan en el repositorio.

const crypto = require('crypto');

const USERS = {
  'david.rivero': { name: 'David Rivero', envVar: 'PASSWORD_DAVID_RIVERO' },
  'luisoctavio.rubio': { name: 'Luis Octavio Rubio', envVar: 'PASSWORD_LUISOCTAVIO_RUBIO' },
};

function sha256(value) {
  return crypto.createHash('sha256').update(String(value)).digest();
}

function checkCredentials(username, password) {
  const user = USERS[String(username || '').trim().toLowerCase()];
  const expected = user && process.env[user.envVar];
  // Se compara siempre para no revelar por tiempo si el usuario existe.
  const ok = crypto.timingSafeEqual(sha256(password || ''), sha256(expected || crypto.randomBytes(32)));
  return ok && expected ? { username: String(username).trim().toLowerCase(), name: user.name } : null;
}

function missingPasswords() {
  return Object.values(USERS).filter((u) => !process.env[u.envVar]).map((u) => u.envVar);
}

function requireAuth(req, res, next) {
  if (req.session && req.session.user) return next();
  if (req.path.startsWith('/api/')) return res.status(401).json({ error: 'Sesión expirada.' });
  return res.redirect('/admin/login');
}

module.exports = { USERS, checkCredentials, missingPasswords, requireAuth };
