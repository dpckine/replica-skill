'use strict';
const test = require('node:test');
const assert = require('node:assert');
const crypto = require('crypto');
const C = require('../public/core.js');

const sha256 = async (s) => crypto.createHash('sha256').update(s).digest('hex');
const ANIO = new Date().getFullYear();
const DIR = '11111111-1';
const ENT = C.rutDesdeCuerpo(12222222);
const JUG = C.rutDesdeCuerpo(20123456);

test('RUT: valida dígito verificador y normaliza formatos', () => {
  assert.strictEqual(C.normalizarRut('11.111.111-1'), '11111111-1');
  assert.strictEqual(C.normalizarRut('111111111'), '11111111-1');
  assert.strictEqual(C.normalizarRut('11.111.111-2'), null);
  assert.strictEqual(C.dvRut(10000013), 'K');
  assert.strictEqual(C.formatearRut('20123456-' + C.dvRut(20123456)), '20.123.456-' + C.dvRut(20123456));
});

test('clave inicial = primeros 4 dígitos del RUT', async () => {
  const db = C.dbEjemplo();
  const u = db.usuarios.find((x) => x.rut === JUG);
  assert.strictEqual(C.claveInicial(JUG), '2012');
  assert.ok(await C.verificarClave(u, '2012', sha256));
  assert.ok(!(await C.verificarClave(u, '1234', sha256)));
  await C.cambiarClave(db, JUG, '2012', 'nueva123', sha256);
  assert.ok(!(await C.verificarClave(u, '2012', sha256)));
  assert.ok(await C.verificarClave(u, 'nueva123', sha256));
  C.applyAction(db, DIR, { type: 'clave.resetear', payload: { rut: JUG } });
  assert.ok(await C.verificarClave(u, '2012', sha256));
});

test('edad', () => {
  assert.strictEqual(C.edad('2000-06-18', '2026-06-17'), 25);
  assert.strictEqual(C.edad('2000-06-18', '2026-06-18'), 26);
});

test('permisos: jugador no puede tocar finanzas ni citar', () => {
  const db = C.dbEjemplo();
  for (const type of ['pago.marcar', 'federativo.marcar', 'config.guardar', 'jugador.crear', 'citacion.guardar', 'entrenamiento.guardar']) {
    assert.throws(() => C.applyAction(db, JUG, { type, payload: { rut: JUG, anio: ANIO, mes: 3, pagado: true } }), /permiso/, type);
  }
});

test('permisos: entrenador inscribe jugadores pero no maneja finanzas', () => {
  const db = C.dbEjemplo();
  const nuevo = C.rutDesdeCuerpo(24111222);
  C.applyAction(db, ENT, { type: 'jugador.crear', payload: { rut: nuevo, nombre: 'Nuevo Jugador', categoria: 'Juvenil', numero: 22 } });
  assert.ok(db.usuarios.find((u) => u.rut === nuevo));
  assert.throws(() => C.applyAction(db, ENT, { type: 'pago.marcar', payload: { rut: nuevo, anio: ANIO, mes: 3, pagado: true } }), /permiso/);
  assert.throws(() => C.applyAction(db, ENT, { type: 'config.guardar', payload: { montoFederativo: 1 } }), /permiso/);
});

test('no se repite número de camiseta en la misma categoría', () => {
  const db = C.dbEjemplo();
  assert.throws(() => C.applyAction(db, DIR, { type: 'jugador.crear', payload: { rut: C.rutDesdeCuerpo(24111222), nombre: 'X', categoria: 'Adulto Varones', numero: 7 } }), /número 7/);
});

test('federativo pagado = habilitado para jugar', () => {
  const db = C.dbEjemplo();
  const j = db.usuarios.find((u) => u.rut === C.rutDesdeCuerpo(21345678));
  assert.strictEqual(C.habilitado(db, j.rut, ANIO), false);
  C.applyAction(db, DIR, { type: 'federativo.marcar', payload: { rut: j.rut, anio: ANIO, pagado: true } });
  assert.strictEqual(C.habilitado(db, j.rut, ANIO), true);
});

test('cuota respeta precio de categoría y descuento', () => {
  const db = C.dbEjemplo();
  C.applyAction(db, DIR, { type: 'config.guardar', payload: { cuotas: Object.assign({}, db.config.cuotas, { 'Adulto Damas': 30000 }) } });
  const v = db.usuarios.find((u) => u.nombre === 'Valentina Araya');
  assert.strictEqual(C.cuotaDe(db, v), 15000);
  C.applyAction(db, DIR, { type: 'pago.marcar', payload: { rut: v.rut, anio: ANIO, mes: 11, pagado: true } });
  assert.strictEqual(db.pagos[v.rut][ANIO][11].monto, 15000);
});

test('lesión del jugador llega como aviso sin ver para entrenador y directiva', () => {
  const db = C.dbEjemplo();
  C.applyAction(db, JUG, { type: 'lesion.crear', payload: { zona: 'Tobillo', tipo: 'Lesión', intensidad: 7 } });
  const l = db.lesiones.find((x) => x.rut === JUG);
  assert.ok(l && !l.vistoPor.includes(ENT) && !l.vistoPor.includes(DIR));
  C.applyAction(db, ENT, { type: 'lesion.visto', payload: { id: l.id } });
  assert.ok(l.vistoPor.includes(ENT));
  // El jugador no puede crear lesiones a nombre de otro.
  C.applyAction(db, JUG, { type: 'lesion.crear', payload: { rut: DIR, zona: 'Mano' } });
  assert.ok(db.lesiones.filter((x) => x.zona === 'Mano').every((x) => x.rut === JUG));
});

test('asistencia: realizados vs asistidos', () => {
  const db = C.dbEjemplo();
  const e = { id: 'x', fecha: ANIO + '-01-02', hora: '20:00', categorias: ['Juvenil'], asistenciaTomada: false, asistencia: {} };
  db.entrenamientos = [e, Object.assign({}, e, { id: 'y' })];
  const m = db.usuarios.find((u) => u.categoria === 'Juvenil');
  C.applyAction(db, ENT, { type: 'asistencia.guardar', payload: { id: 'x', asistencia: { [m.rut]: 'P' } } });
  C.applyAction(db, ENT, { type: 'asistencia.guardar', payload: { id: 'y', asistencia: { [m.rut]: 'A' } } });
  assert.deepStrictEqual(C.resumenAsistencia(db, m, ANIO), { realizados: 2, asistidos: 1, justificados: 0, porcentaje: 50 });
});

test('vista del jugador sólo muestra sus propios datos', () => {
  const db = C.dbEjemplo();
  const v = C.viewFor(db, JUG);
  assert.deepStrictEqual(Object.keys(v.pagos), [JUG]);
  assert.deepStrictEqual(Object.keys(v.federativo), [JUG]);
  assert.ok(v.lesiones.every((l) => l.rut === JUG));
  assert.strictEqual(v.movimientos, undefined);
  assert.strictEqual(v.usuarios.filter((u) => u.rol === 'jugador').length, 1);
  assert.ok(v.usuarios.every((u) => u.claveHash === undefined));
  assert.ok(v.partidos.every((m) => m.citados === undefined && Array.isArray(m.citadosLista)));
  assert.ok(v.entrenamientos.every((e) => e.asistencia === undefined));
  const ve = C.viewFor(db, ENT);
  assert.deepStrictEqual(ve.pagos, {});
  assert.ok(Object.keys(ve.federativo).length > 0);
});

test('jugador confirma su citación', () => {
  const db = C.dbEjemplo();
  const m = db.partidos.find((x) => x.citados[C.rutDesdeCuerpo(19876543)] === 'pendiente');
  C.applyAction(db, C.rutDesdeCuerpo(19876543), { type: 'citacion.responder', payload: { id: m.id, respuesta: 'confirmado' } });
  assert.strictEqual(m.citados[C.rutDesdeCuerpo(19876543)], 'confirmado');
  assert.throws(() => C.applyAction(db, C.rutDesdeCuerpo(18765432), { type: 'citacion.responder', payload: { id: m.id, respuesta: 'confirmado' } }), /No estás citado/);
});
