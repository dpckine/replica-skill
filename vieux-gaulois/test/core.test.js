'use strict';
const test = require('node:test');
const assert = require('node:assert');
const crypto = require('crypto');
const C = require('../public/core.js');

const sha256 = async (s) => crypto.createHash('sha256').update(s).digest('hex');
const ANIO = new Date().getFullYear();
const DIR = 'usr:vieux';
const ENT = 'usr:jorge';
const JUG = C.rutDesdeCuerpo(20123456);

// En los datos de ejemplo Tomás (JUG) aún no firma el consentimiento.
function firmar(db, rut) {
  const d = db.documentos.find((x) => x.id === 'consentimiento');
  C.applyAction(db, rut, { type: 'documento.firmar', payload: { id: d.id, aceptados: d.puntos.map((_, i) => i), nombreFirma: 'Nombre Completo' } });
}

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

test('directiva y entrenadores entran con usuario y clave; jugadores con RUT', async () => {
  const db = C.dbEjemplo();
  const buscar = (id) => db.usuarios.find((u) => u.rut === C.idDeIngreso(id));
  assert.ok(await C.verificarClave(buscar('Vieux'), 'vieuxg1234', sha256));
  assert.ok(!(await C.verificarClave(buscar('vieux'), 'vieu', sha256)));
  assert.ok(await C.verificarClave(buscar('jorge'), 'jorge1234', sha256));
  // Tomás: jugador con su RUT y entrenador con su usuario.
  assert.strictEqual(buscar('20.123.456-5').rol, 'jugador');
  assert.ok(await C.verificarClave(buscar('20.123.456-5'), '2012', sha256));
  assert.strictEqual(buscar('tomas').rol, 'entrenador');
  assert.strictEqual(buscar('tomas').jugadorRut, JUG);
  // La base vacía también trae la cuenta vieux.
  assert.ok(await C.verificarClave(C.dbVacia().usuarios.find((u) => u.rut === 'usr:vieux'), 'vieuxg1234', sha256));
});

test('directiva crea entrenador con usuario y clave definidos', async () => {
  const db = C.dbEjemplo();
  const crear = async (actor, payload) => C.applyAction(db, actor, await C.prepararAccion({ type: 'staff.crear', payload }, sha256));
  await crear(DIR, { usuario: 'Camila.F', clave: 'balon2026', nombre: 'Camila Fuentes', rol: 'entrenador', jugadorRut: C.rutDesdeCuerpo(18765432) });
  const u = db.usuarios.find((x) => x.rut === 'usr:camila.f');
  assert.ok(await C.verificarClave(u, 'balon2026', sha256));
  assert.strictEqual(u.jugadorRut, C.rutDesdeCuerpo(18765432));
  await assert.rejects(crear(DIR, { usuario: 'camila.f', clave: 'otra1234', nombre: 'X', rol: 'entrenador' }), /Ya existe/);
  await assert.rejects(crear(DIR, { usuario: '1abc', clave: 'otra1234', nombre: 'X', rol: 'entrenador' }), /Usuario no válido/);
  await assert.rejects(crear(ENT, { usuario: 'nuevo', clave: 'otra1234', nombre: 'X', rol: 'directiva' }), /permiso/);
  // Un hash enviado desde fuera se ignora.
  await assert.rejects(crear(DIR, { usuario: 'hacker', claveHash: 'abc', nombre: 'X', rol: 'directiva' }), /clave/);
  C.applyAction(db, DIR, await C.prepararAccion({ type: 'clave.definir', payload: { rut: 'usr:camila.f', clave: 'nueva999' } }, sha256));
  assert.ok(await C.verificarClave(u, 'nueva999', sha256));
  assert.throws(() => C.applyAction(db, DIR, { type: 'clave.resetear', payload: { rut: 'usr:camila.f' } }), /Jugador no encontrado/);
});

test('edad', () => {
  assert.strictEqual(C.edad('2000-06-18', '2026-06-17'), 25);
  assert.strictEqual(C.edad('2000-06-18', '2026-06-18'), 26);
});

test('permisos: jugador no puede tocar finanzas ni citar', () => {
  const db = C.dbEjemplo();
  firmar(db, JUG);
  for (const type of ['pago.marcar', 'federativo.marcar', 'config.guardar', 'jugador.crear', 'citacion.guardar', 'entrenamiento.guardar']) {
    assert.throws(() => C.applyAction(db, JUG, { type, payload: { rut: JUG, anio: ANIO, mes: 3, pagado: true } }), /permiso/, type);
  }
});

test('permisos: entrenador inscribe jugadores pero no maneja finanzas', () => {
  const db = C.dbEjemplo();
  const nuevo = C.rutDesdeCuerpo(24111222);
  C.applyAction(db, ENT, { type: 'jugador.crear', payload: { rut: nuevo, nombre: 'Nuevo Jugador', categoria: 'Junior Masculino', numero: 22 } });
  assert.ok(db.usuarios.find((u) => u.rut === nuevo));
  assert.throws(() => C.applyAction(db, ENT, { type: 'pago.marcar', payload: { rut: nuevo, anio: ANIO, mes: 3, pagado: true } }), /permiso/);
  assert.throws(() => C.applyAction(db, ENT, { type: 'config.guardar', payload: { montoFederativo: 1 } }), /permiso/);
});

test('no se repite número de camiseta en la misma categoría', () => {
  const db = C.dbEjemplo();
  assert.throws(() => C.applyAction(db, DIR, { type: 'jugador.crear', payload: { rut: C.rutDesdeCuerpo(24111222), nombre: 'X', categoria: 'Primer Equipo Masculino', numero: 7 } }), /número 7/);
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
  C.applyAction(db, DIR, { type: 'config.guardar', payload: { cuotas: Object.assign({}, db.config.cuotas, { 'Primer Equipo': 30000 }) } });
  const v = db.usuarios.find((u) => u.nombre === 'Valentina Araya');
  assert.strictEqual(C.cuotaDe(db, v), 15000);
  C.applyAction(db, DIR, { type: 'pago.marcar', payload: { rut: v.rut, anio: ANIO, mes: 11, pagado: true } });
  assert.strictEqual(db.pagos[v.rut][ANIO][11].monto, 15000);
});

test('lesión del jugador llega como aviso sin ver para entrenador y directiva', () => {
  const db = C.dbEjemplo();
  firmar(db, JUG);
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
  const e = { id: 'x', fecha: ANIO + '-01-02', hora: '20:00', categorias: ['Juvenil Masculino'], asistenciaTomada: false, asistencia: {} };
  db.entrenamientos = [e, Object.assign({}, e, { id: 'y' })];
  const m = db.usuarios.find((u) => u.categoria === 'Juvenil Masculino');
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

test('categorías: 8 en rama masculina y femenina; Infantil a Juvenil exigen 1er o 2do año', () => {
  const db = C.dbEjemplo();
  assert.strictEqual(db.config.categorias.length, 16);
  assert.ok(db.config.categorias.includes('Adultos B Femenino') && db.config.categorias.includes('Master Masculino'));
  const base = { rut: C.rutDesdeCuerpo(25111222), nombre: 'Nueva Cadete', categoria: 'Cadete Femenino' };
  assert.throws(() => C.applyAction(db, DIR, { type: 'jugador.crear', payload: base }), /1er o 2do año/);
  C.applyAction(db, DIR, { type: 'jugador.crear', payload: Object.assign({ anioCategoria: '1' }, base) });
  const j = db.usuarios.find((u) => u.rut === base.rut);
  assert.strictEqual(C.etiquetaCategoria(j), 'Cadete Femenino · 1° año');
  assert.strictEqual(C.cuotaDe(db, j), db.config.cuotas.Cadete);
  // Junior no lleva año.
  C.applyAction(db, DIR, { type: 'jugador.crear', payload: { rut: C.rutDesdeCuerpo(25111333), nombre: 'Junior X', categoria: 'Junior Masculino', anioCategoria: '2' } });
  assert.strictEqual(db.usuarios.find((u) => u.nombre === 'Junior X').anioCategoria, '');
});

test('links de pago: sólo la directiva y sólo https', () => {
  const db = C.dbEjemplo();
  C.applyAction(db, DIR, { type: 'config.guardar', payload: { linkFederativo: 'https://pago.cl/fed', datosTransferencia: 'Banco X' } });
  assert.strictEqual(db.config.linkFederativo, 'https://pago.cl/fed');
  assert.throws(() => C.applyAction(db, DIR, { type: 'config.guardar', payload: { linkCuota: 'javascript:alert(1)' } }), /https/);
  assert.throws(() => C.applyAction(db, ENT, { type: 'config.guardar', payload: { linkCuota: 'https://x.cl' } }), /permiso/);
  assert.strictEqual(C.viewFor(db, JUG).config.linkFederativo, 'https://pago.cl/fed');
});

test('avisos: staff publica, todos lo ven, sólo autor o directiva borran', () => {
  const db = C.dbEjemplo();
  firmar(db, JUG);
  C.applyAction(db, ENT, { type: 'aviso.guardar', payload: { titulo: 'Juega la Mini', categoria: 'Mini Femenino', fijado: true } });
  const a = db.avisos.find((x) => x.titulo === 'Juega la Mini');
  assert.strictEqual(a.fijado, false); // sólo la directiva fija avisos
  assert.ok(C.viewFor(db, JUG).avisos.some((x) => x.id === a.id));
  assert.throws(() => C.applyAction(db, JUG, { type: 'aviso.guardar', payload: { titulo: 'x' } }), /permiso/);
  assert.throws(() => C.applyAction(db, 'usr:tomas', { type: 'aviso.eliminar', payload: { id: a.id } }), /permiso/);
  C.applyAction(db, DIR, { type: 'aviso.eliminar', payload: { id: a.id } });
  assert.ok(!db.avisos.some((x) => x.id === a.id));
});

test('convocatoria queda guardada con vestimenta, indicaciones y quién citó', () => {
  const db = C.dbEjemplo();
  C.applyAction(db, ENT, { type: 'partido.guardar', payload: { rival: 'UdeC', fecha: '2026-10-25', hora: '15:00', categoria: 'Cadete Masculino', lugar: 'Parque Rivera Bio Bio', vestimenta: 'Negras' } });
  const m = db.partidos.find((x) => x.rival === 'UdeC' && x.fecha === '2026-10-25');
  assert.strictEqual(m.indicaciones, db.config.indicacionesCitacion);
  const cadetes = db.usuarios.filter((u) => u.categoria === 'Cadete Masculino').map((u) => u.rut);
  C.applyAction(db, ENT, { type: 'citacion.guardar', payload: { id: m.id, ruts: cadetes } });
  assert.strictEqual(Object.keys(m.citados).length, cadetes.length);
  assert.strictEqual(m.citadoPor, ENT);
  assert.ok(m.citacionFecha);
});

test('consentimiento: bloquea hasta firmar; menores firman con apoderado', () => {
  const db = C.dbEjemplo();
  const d = db.documentos.find((x) => x.id === 'consentimiento');
  assert.deepStrictEqual(C.viewFor(db, JUG).pendientes, ['consentimiento']);
  assert.throws(() => C.applyAction(db, JUG, { type: 'citacion.responder', payload: {} }), /consentimiento/);
  assert.throws(() => C.applyAction(db, JUG, { type: 'documento.firmar', payload: { id: d.id, aceptados: [0], nombreFirma: 'Tomás Rojas' } }), /todos los puntos/);
  firmar(db, JUG);
  assert.deepStrictEqual(C.viewFor(db, JUG).pendientes, []);
  // Nueva versión: todos deben volver a firmar.
  C.applyAction(db, DIR, { type: 'documento.guardar', payload: { id: d.id, titulo: d.titulo, texto: d.texto + ' Actualizado.', puntos: d.puntos, nuevaVersion: true } });
  assert.deepStrictEqual(C.viewFor(db, JUG).pendientes, ['consentimiento']);
  // Menor de edad sin apoderado.
  const menor = db.usuarios.find((u) => u.nombre === 'Germán Meinas');
  const firmaMenor = (apoderado) => C.applyAction(db, menor.rut, { type: 'documento.firmar', payload: { id: d.id, aceptados: d.puntos.map((_, i) => i), nombreFirma: 'Germán Meinas', apoderado } });
  assert.throws(() => firmaMenor(''), /apoderado/);
  firmaMenor('Ana Meinas 12.345.678-5');
});

test('compromiso de becados: la directiva lo envía y sólo esos jugadores lo firman', () => {
  const db = C.dbEjemplo();
  const becada = db.usuarios.find((u) => u.nombre === 'Valentina Araya');
  assert.strictEqual(C.viewFor(db, becada.rut).pendientes.length, 1);
  assert.throws(() => C.applyAction(db, ENT, { type: 'documento.guardar', payload: Object.assign({ destinatarios: [JUG] }, C.COMPROMISO_BECA) }), /permiso/);
  C.applyAction(db, DIR, { type: 'documento.guardar', payload: Object.assign({}, C.COMPROMISO_BECA, { titulo: 'Beca 2', destinatarios: [becada.rut] }) });
  const v = C.viewFor(db, becada.rut);
  assert.strictEqual(v.pendientes.length, 2);
  assert.ok(!C.viewFor(db, C.rutDesdeCuerpo(19876543)).documentos.some((x) => x.titulo === 'Beca 2'));
  assert.throws(() => C.applyAction(db, DIR, { type: 'documento.eliminar', payload: { id: 'consentimiento' } }), /no se puede eliminar/);
});

test('migrar completa una base de la versión anterior sin perder datos', () => {
  const vieja = C.dbEjemplo();
  vieja.version = 2;
  delete vieja.avisos; delete vieja.documentos; delete vieja.firmas; delete vieja.config.categoriasBase; delete vieja.config.linkCuota;
  const m = C.migrar(vieja);
  assert.strictEqual(m.version, C.dbVacia().version);
  assert.ok(Array.isArray(m.avisos) && m.documentos.some((d) => d.id === 'consentimiento'));
  assert.strictEqual(m.config.categorias.length, 16);
  assert.strictEqual(m.config.linkCuota, '');
  assert.ok(m.usuarios.length > 5);
});
