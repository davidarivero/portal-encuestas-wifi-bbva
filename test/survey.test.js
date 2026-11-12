const test = require('node:test');
const assert = require('node:assert');
const { validate, sectionFor } = require('../src/survey');

test('la calificación decide la sección', () => {
  assert.equal(sectionFor(5), 'excelente');
  assert.equal(sectionFor(4), 'buena');
  assert.equal(sectionFor(3), 'problemas');
  assert.equal(sectionFor(1), 'problemas');
});

test('acepta una respuesta completa de 5 estrellas', () => {
  const r = validate({ calificacion: 5, piso: '12', equipos: ['Windows BBVA'], colaborador: 'Interno' });
  assert.ok(r.ok);
  assert.deepEqual(r.value.respuestas, { piso: '12', equipos: ['Windows BBVA'], colaborador: 'Interno', canal: 'autoservicio', sede: '' });
});

test('rechaza preguntas obligatorias vacías', () => {
  assert.equal(validate({ calificacion: 2, piso: '3' }).ok, false);
  assert.equal(validate({ calificacion: 7 }).ok, false);
});

test('"Otro" cuenta como respuesta y se descartan opciones desconocidas', () => {
  const r = validate({ calificacion: 4, mejoras: ['inventada'], mejoras_otro: 'Más puntos de acceso', piso: 'PB', colaborador: 'Externo' });
  assert.ok(r.ok);
  assert.deepEqual(r.value.respuestas.mejoras, []);
  assert.equal(r.value.respuestas.mejoras_otro, 'Más puntos de acceso');
});

test('el encuestador debe indicar una sede válida', () => {
  const base = { calificacion: 5, piso: '1', equipos: ['Windows BBVA'], colaborador: 'Interno', canal: 'encuestador' };
  assert.equal(validate(base).ok, false);
  assert.equal(validate({ ...base, sede: 'Otra' }).ok, false);
  assert.equal(validate({ ...base, sede: 'Torre Reforma' }).value.respuestas.sede, 'Torre Reforma');
});

const { sanitizeImport, normalizaPiso } = require('../src/survey');

test('normaliza el piso escrito de distintas formas', () => {
  assert.equal(normalizaPiso('Piso 48'), '48');
  assert.equal(normalizaPiso('Nivel 48'), '48');
  assert.equal(normalizaPiso('48.0'), '48');
  assert.equal(normalizaPiso('PB'), 'PB');
  assert.equal(validate({ calificacion: 5, piso: 'Piso 36', equipos: ['Windows BBVA'], colaborador: 'Interno' }).value.respuestas.piso, '36');
});

test('la importación valida el formato, la sede y las opciones', () => {
  assert.equal(sanitizeImport({}).ok, false);
  const base = { formato: 'importacion-encuesta-wifi-bbva' };
  const r = sanitizeImport({
    ...base,
    actualizar: [{ id: 20, sede: 'Torre Reforma', piso: 'Piso 40' }],
    nuevos: [{ creado_en: '2026-11-05T15:37:55Z', calificacion: 2, respuestas: { origen_id: 'gs-1', sede: 'Parques Polanco', piso: '22', problemas: ['La conexión estaba lenta', 'inventada'], problemas_otro: 'ADA', frecuencia: 'Me ocurre frecuentemente', reportado: 'No', equipos: ['Windows BBVA'], colaborador: 'Interno', comentarios: 'Lento' } }],
  });
  assert.ok(r.ok);
  assert.deepEqual(r.value.actualizar, [{ id: 20, cambios: { sede: 'Torre Reforma', piso: '40' } }]);
  const n = r.value.nuevos[0];
  assert.equal(n.seccion, 'problemas');
  assert.deepEqual(n.respuestas.problemas, ['La conexión estaba lenta']);
  assert.equal(n.respuestas.origen_id, 'gs-1');
  assert.equal(sanitizeImport({ ...base, nuevos: [{ creado_en: '2026-11-05', calificacion: 5, respuestas: { origen_id: 'x', sede: 'Otra' } }] }).ok, false);
  assert.equal(sanitizeImport({ ...base, nuevos: [{ creado_en: '2026-11-05', calificacion: 5, respuestas: {} }] }).ok, false);
});
