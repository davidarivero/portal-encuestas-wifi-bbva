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
  assert.deepEqual(r.value.respuestas, { piso: '12', equipos: ['Windows BBVA'], colaborador: 'Interno', canal: 'autoservicio' });
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
