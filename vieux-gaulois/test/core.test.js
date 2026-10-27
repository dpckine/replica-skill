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
  assert.throws(() => C.applyAction(db, DIR, { type: 'clave.resetear', payload: { rut: 'usr:camila.f' } }), /Usuario no encontrado/);
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
  // Un menor no firma: lo hace su apoderado desde su cuenta (ver pruebas de apoderado).
  const menor = db.usuarios.find((u) => u.nombre === 'Germán Meinas');
  assert.throws(() => C.applyAction(db, menor.rut, { type: 'documento.firmar', payload: { id: d.id, aceptados: d.puntos.map((_, i) => i), nombreFirma: 'Germán Meinas' } }), /apoderado firma por ti/);
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

test('cobros: la directiva activa link o transferencia por concepto', () => {
  const db = C.dbEjemplo();
  assert.ok(C.mediosDe(db, 'cuota').link && C.mediosDe(db, 'cuota').transferencia);
  C.applyAction(db, DIR, { type: 'config.guardar', payload: { medios: { cuota: { link: false, transferencia: true }, federativo: { link: true, transferencia: false } } } });
  assert.strictEqual(C.mediosDe(db, 'cuota').link, '');
  assert.strictEqual(C.mediosDe(db, 'federativo').transferencia, false);
  assert.throws(() => C.applyAction(db, DIR, { type: 'cobro.guardar', payload: { nombre: 'Viaje', monto: 5000, usarLink: true } }), /link/);
  C.applyAction(db, DIR, { type: 'cobro.guardar', payload: { nombre: 'Viaje Temuco', monto: 40000, usarTransferencia: true, categorias: ['Infantil Femenino'] } });
  const viaje = db.cobros.find((c) => c.nombre === 'Viaje Temuco');
  assert.deepStrictEqual(C.mediosDe(db, viaje.id), { link: '', transferencia: true });
  assert.throws(() => C.applyAction(db, ENT, { type: 'cobro.guardar', payload: { nombre: 'X', monto: 1 } }), /permiso/);
  // Sólo lo ven los jugadores de esa categoría.
  firmar(db, JUG);
  assert.ok(!C.viewFor(db, JUG).cobros.some((c) => c.id === viaje.id));
  const sofia = db.usuarios.find((u) => u.nombre === 'Sofía Herrera');
  assert.ok(C.viewFor(db, sofia.rut).cobros.some((c) => c.id === viaje.id));
  assert.strictEqual(C.viewFor(db, ENT).cobros.length, 0);
});

test('el jugador informa un pago y la directiva lo aprueba o rechaza', () => {
  const db = C.dbEjemplo();
  const j = db.usuarios.find((u) => u.nombre === 'Sofía Herrera');
  const cons = db.documentos.find((x) => x.id === 'consentimiento');
  C.applyAction(db, C.rutDesdeCuerpo(15678901), { type: 'documento.firmar', payload: { hijo: j.rut, id: cons.id, aceptados: cons.puntos.map((_, i) => i), nombreFirma: 'Carolina Herrera' } });
  const mes = C.mesesAdeudados(db, j.rut, ANIO)[0];
  const informar = (payload) => C.applyAction(db, j.rut, { type: 'pago.informar', payload: Object.assign({ anio: ANIO, monto: 18000, medio: 'Transferencia' }, payload) });
  informar({ concepto: 'cuota', mes, detalle: 'Op 123' });
  assert.throws(() => informar({ concepto: 'cuota', mes }), /revisando/);
  assert.throws(() => C.applyAction(db, ENT, { type: 'pago.revisar', payload: { id: db.pagosInformados[db.pagosInformados.length - 1].id, aprobar: true } }), /permiso/);
  const info = db.pagosInformados.find((x) => x.rut === j.rut);
  C.applyAction(db, DIR, { type: 'pago.revisar', payload: { id: info.id, aprobar: true } });
  assert.ok(C.pagoMes(db, j.rut, ANIO, mes).pagado);
  assert.throws(() => informar({ concepto: 'cuota', mes }), /ya aparece pagado/);
  const poleron = db.cobros.find((c) => c.nombre.startsWith('Polerón'));
  informar({ concepto: poleron.id });
  const info2 = db.pagosInformados.find((x) => x.rut === j.rut && x.concepto === poleron.id);
  C.applyAction(db, DIR, { type: 'pago.revisar', payload: { id: info2.id, aprobar: false, nota: 'No llegó la transferencia' } });
  assert.strictEqual(info2.estado, 'rechazado');
  assert.ok(!C.cobroPagado(db, poleron.id, j.rut));
  // Cada jugador ve sólo sus pagos informados.
  assert.ok(C.viewFor(db, j.rut).pagosInformados.every((x) => x.rut === j.rut));
});

test('chat: cada uno ve sólo sus conversaciones', () => {
  const db = C.dbEjemplo();
  firmar(db, JUG);
  const otro = C.rutDesdeCuerpo(19876543);
  C.applyAction(db, JUG, { type: 'chat.enviar', payload: { hilo: 'dir:' + JUG, texto: 'Hola directiva' } });
  C.applyAction(db, JUG, { type: 'chat.enviar', payload: { hilo: 'ent:' + JUG, texto: 'Hola profe' } });
  assert.throws(() => C.applyAction(db, JUG, { type: 'chat.enviar', payload: { hilo: 'dir:' + otro, texto: 'x' } }), /No puedes/);
  assert.throws(() => C.applyAction(db, ENT, { type: 'chat.enviar', payload: { hilo: 'dir:' + JUG, texto: 'x' } }), /No puedes/);
  C.applyAction(db, ENT, { type: 'chat.enviar', payload: { hilo: 'ent:' + JUG, texto: 'Hola Tomás' } });
  C.applyAction(db, DIR, { type: 'chat.enviar', payload: { hilo: 'dir:' + JUG, texto: 'Hola Tomás' } });
  const vj = C.viewFor(db, JUG);
  assert.ok(vj.mensajes.every((m) => m.hilo === 'dir:' + JUG || m.hilo === 'ent:' + JUG));
  assert.strictEqual(vj.mensajes.length, 4);
  assert.ok(C.viewFor(db, DIR).mensajes.every((m) => m.hilo.startsWith('dir:')));
  assert.ok(!C.viewFor(db, otro).mensajes.some((m) => m.hilo.endsWith(JUG)));
  C.applyAction(db, JUG, { type: 'chat.leer', payload: { hilo: 'ent:' + JUG } });
  assert.ok(db.mensajes.filter((m) => m.hilo === 'ent:' + JUG).every((m) => m.leidoPor.includes(JUG)));
});

test('convocatoria: cuerpo técnico sólo con los cargos que tienen nombre', () => {
  const db = C.dbEjemplo();
  const m = db.partidos[0];
  C.applyAction(db, ENT, { type: 'citacion.guardar', payload: { id: m.id, ruts: Object.keys(m.citados), cuerpoTecnico: { entrenadorA: 'Jorge Pérez', entrenadorB: '', kinesiologo: 'Paula Soto', otro: 'x' } } });
  assert.deepStrictEqual(m.cuerpoTecnico, { entrenadorA: 'Jorge Pérez', kinesiologo: 'Paula Soto' });
});

test('jugadas: los entrenadores las guardan y las comparten con categorías', () => {
  const db = C.dbEjemplo();
  const pasos = [{ fichas: [{ id: 'CE', t: 'a', n: 'CE', x: 99, y: -3 }], trazos: [{ t: 'pase', p: [[1, 1], [2, 2]] }, { t: 'mov', p: [[1, 1]] }] }];
  assert.throws(() => C.applyAction(db, JUG, { type: 'jugada.guardar', payload: { nombre: 'X', pasos } }), /permiso|consentimiento/);
  C.applyAction(db, ENT, { type: 'jugada.guardar', payload: { nombre: 'Salida rápida', pasos, categorias: ['Infantil Femenino'] } });
  const j = db.jugadas.find((x) => x.nombre === 'Salida rápida');
  assert.deepStrictEqual([j.pasos[0].fichas[0].x, j.pasos[0].fichas[0].y], [40, 0]);
  assert.strictEqual(j.pasos[0].trazos.length, 1);
  const sofia = db.usuarios.find((u) => u.nombre === 'Sofía Herrera');
  assert.ok(C.viewFor(db, sofia.rut).jugadas.some((x) => x.id === j.id));
  assert.ok(!C.viewFor(db, C.rutDesdeCuerpo(19876543)).jugadas.some((x) => x.id === j.id));
  assert.throws(() => C.applyAction(db, 'usr:tomas', { type: 'jugada.eliminar', payload: { id: j.id } }), /permiso/);
  C.applyAction(db, DIR, { type: 'jugada.eliminar', payload: { id: j.id } });
});

test('convenios: jugadores y entrenadores proponen, la directiva publica', () => {
  const db = C.dbEjemplo();
  firmar(db, JUG);
  const otro = C.rutDesdeCuerpo(19876543);
  assert.throws(() => C.applyAction(db, JUG, { type: 'convenio.guardar', payload: { empresa: 'X' } }), /permiso/);
  C.applyAction(db, JUG, { type: 'convenio.proponer', payload: { empresa: 'Óptica Visión', beneficio: '10%', contacto: 'ventas@optica.cl' } });
  C.applyAction(db, ENT, { type: 'convenio.proponer', payload: { empresa: 'Fisio Sur' } });
  const pj = db.convenios.find((c) => c.empresa === 'Óptica Visión');
  const pe = db.convenios.find((c) => c.empresa === 'Fisio Sur');
  assert.strictEqual(pj.estado, 'propuesto');
  assert.ok(C.viewFor(db, JUG).convenios.some((c) => c.id === pj.id));
  assert.ok(!C.viewFor(db, otro).convenios.some((c) => c.id === pj.id || c.estado === 'propuesto'));
  assert.ok(C.viewFor(db, DIR).convenios.some((c) => c.id === pe.id));
  assert.throws(() => C.applyAction(db, JUG, { type: 'convenio.revisar', payload: { id: pj.id, aprobar: true } }), /permiso/);
  C.applyAction(db, DIR, { type: 'convenio.revisar', payload: { id: pj.id, aprobar: true } });
  assert.ok(C.viewFor(db, otro).convenios.some((c) => c.id === pj.id));
  assert.throws(() => C.applyAction(db, JUG, { type: 'convenio.eliminar', payload: { id: pj.id } }), /permiso/);
  C.applyAction(db, DIR, { type: 'convenio.revisar', payload: { id: pe.id, aprobar: false, nota: 'Ya tenemos kinesiología' } });
  assert.strictEqual(pe.estado, 'rechazado');
  C.applyAction(db, ENT, { type: 'convenio.eliminar', payload: { id: pe.id } });
  assert.ok(!db.convenios.some((c) => c.id === pe.id));
});

const APO = C.rutDesdeCuerpo(15678901);
const SOFIA = C.rutDesdeCuerpo(24901234);
const MARTIN = C.rutDesdeCuerpo(25123987);
const porNombre = (db, n) => db.usuarios.find((u) => u.nombre === n);
const firmarComo = (db, actor, hijo) => {
  const d = db.documentos.find((x) => x.id === 'consentimiento');
  C.applyAction(db, actor, { type: 'documento.firmar', payload: { hijo, id: d.id, aceptados: d.puntos.map((_, i) => i), nombreFirma: 'Carolina Herrera' } });
};

test('temporada: al pasar de año suben de categoría (Infantil 2do -> Cadete 1er)', () => {
  const db = C.dbEjemplo();
  db.config.temporada = ANIO - 1;
  const matias = porNombre(db, 'Matías Contreras');
  Object.assign(matias, { anioCategoria: '1', numero: 1 }); // se queda en Juvenil y usa el N° 1
  const german = porNombre(db, 'Germán Meinas'); // Cadete 2do año, N° 1
  const sofia = porNombre(db, 'Sofía Herrera'); // Infantil 1er año
  const agustin = porNombre(db, 'Agustín Contreras'); // Cadete 1er año
  db.usuarios.push({ rut: C.rutDesdeCuerpo(26111222), rol: 'jugador', nombre: 'Infantil Dos', categoria: 'Infantil Femenino', anioCategoria: '2', activo: true });
  assert.ok(C.cambioTemporada(db, ANIO));
  assert.deepStrictEqual([german.categoria, german.anioCategoria, german.numero], ['Juvenil Masculino', '1', null]);
  assert.deepStrictEqual([matias.categoria, matias.anioCategoria], ['Juvenil Masculino', '2']);
  assert.deepStrictEqual([sofia.categoria, sofia.anioCategoria], ['Infantil Femenino', '2']);
  assert.deepStrictEqual([agustin.categoria, agustin.anioCategoria], ['Cadete Masculino', '2']);
  const dos = porNombre(db, 'Infantil Dos');
  assert.deepStrictEqual([dos.categoria, dos.anioCategoria], ['Cadete Femenino', '1']);
  assert.strictEqual(db.usuarios.find((u) => u.rut === JUG).categoria, 'Primer Equipo Masculino');
  const reg = db.cambiosTemporada.pop();
  assert.strictEqual(reg.anio, ANIO);
  assert.ok(reg.cambios.some((c) => c.nombre === 'Germán Meinas' && c.numeroLiberado === 1));
  assert.strictEqual(db.config.temporada, ANIO);
  assert.ok(!C.cambioTemporada(db, ANIO));
  // Juvenil 2do año sube a Junior (sin año).
  matias.anioCategoria = '2';
  db.config.temporada = ANIO - 1;
  C.cambioTemporada(db, ANIO);
  assert.deepStrictEqual([matias.categoria, matias.anioCategoria], ['Junior Masculino', '']);
});

test('estadísticas por partido, comentario y tabla de goleadores', () => {
  const db = C.dbEjemplo();
  firmar(db, JUG);
  const m = db.partidos.find((x) => x.rival === 'Club Balonmano Andes');
  const renato = porNombre(db, 'Renato Flores');
  C.applyAction(db, ENT, { type: 'partido.resultado', payload: { id: m.id, nuestro: 30, rival: 20, comentario: 'Muy bien', estadisticas: { [JUG]: { g: 9, dm: 5, am: 1 } } } });
  assert.deepStrictEqual(m.estadisticas[JUG], { g: 9, at: 0, dm: 3, am: 1, ro: 0, az: 0 });
  assert.strictEqual(m.comentario, 'Muy bien');
  assert.throws(() => C.applyAction(db, JUG, { type: 'partido.resultado', payload: { id: m.id, nuestro: 1, rival: 0 } }), /permiso/);
  const tabla = C.tablaGoleadores(db, 'Cadete Masculino', ANIO);
  assert.strictEqual(tabla[0].nombre, 'Renato Flores');
  assert.strictEqual(tabla[0].g, 14);
  const v = C.viewFor(db, renato.rut);
  assert.ok(v.goleadores.length >= 4 && v.goleadores.every((x) => x.rut === undefined));
  assert.ok(v.goleadores.find((x) => x.esYo).g === 14);
  assert.ok(v.partidos.every((x) => x.estadisticas === undefined && x.notas === undefined));
  assert.strictEqual(C.viewFor(db, JUG).misEstadisticas.g, 16);
});

test('evaluación física: el entrenador registra tests y cada jugador ve los suyos', () => {
  const db = C.dbEjemplo();
  const renato = porNombre(db, 'Renato Flores');
  const fecha = C.hoyISO();
  C.applyAction(db, ENT, { type: 'evaluacion.guardar', payload: { fecha, registros: [{ rut: renato.rut, valores: { t5105: '5,1', salto: 50, peso: '' } }, { rut: JUG, valores: {} }] } });
  const e = db.evaluaciones.filter((x) => x.rut === renato.rut && x.fecha === fecha);
  assert.strictEqual(e.length, 1);
  assert.deepStrictEqual(e[0].valores, { t5105: 5.1, salto: 50 });
  C.applyAction(db, ENT, { type: 'evaluacion.guardar', payload: { fecha, registros: [{ rut: renato.rut, valores: { flex: 30 } }] } });
  assert.deepStrictEqual(db.evaluaciones.find((x) => x.rut === renato.rut && x.fecha === fecha).valores, { flex: 30 });
  assert.throws(() => C.applyAction(db, ENT, { type: 'evaluacion.guardar', payload: { fecha, registros: [{ rut: renato.rut, valores: { salto: 900 } }] } }), /fuera de rango/);
  assert.throws(() => C.applyAction(db, renato.rut, { type: 'evaluacion.guardar', payload: { fecha, registros: [] } }), /permiso/);
  assert.ok(C.viewFor(db, renato.rut).evaluaciones.every((x) => x.rut === renato.rut));
});

test('plan de entrenamiento: visible para jugadores sólo si el entrenador lo marca', () => {
  const db = C.dbEjemplo();
  const renato = porNombre(db, 'Renato Flores');
  const e = db.entrenamientos.find((x) => x.fecha >= C.hoyISO() && x.categorias.includes('Cadete Masculino'));
  const plan = [{ nombre: 'Rondo', minutos: 10 }, { nombre: '', minutos: 5 }, { nombre: 'Jugada', jugada: db.jugadas[0].id }, { nombre: 'X', jugada: 'no-existe' }];
  C.applyAction(db, ENT, { type: 'entrenamiento.plan', payload: { id: e.id, plan, planVisible: false } });
  assert.strictEqual(e.plan.length, 3);
  assert.strictEqual(e.plan[2].jugada, '');
  assert.strictEqual(C.viewFor(db, renato.rut).entrenamientos.find((x) => x.id === e.id).plan, undefined);
  C.applyAction(db, ENT, { type: 'entrenamiento.plan', payload: { id: e.id, plan, planVisible: true } });
  assert.strictEqual(C.viewFor(db, renato.rut).entrenamientos.find((x) => x.id === e.id).plan[1].jugada, db.jugadas[0].id);
});

test('apoderado: el menor se habilita cuando su apoderado firma; actúa por su hijo', async () => {
  const db = C.dbEjemplo();
  const apo = db.usuarios.find((u) => u.rut === APO);
  assert.ok(await C.verificarClave(apo, '1567', sha256));
  // La menor no puede usar la app ni firmar por sí misma.
  assert.throws(() => C.applyAction(db, SOFIA, { type: 'lesion.crear', payload: { zona: 'Rodilla' } }), /apoderado debe firmar/);
  const d = db.documentos.find((x) => x.id === 'consentimiento');
  assert.throws(() => C.applyAction(db, SOFIA, { type: 'documento.firmar', payload: { id: d.id, aceptados: [0, 1, 2], nombreFirma: 'Sofía Herrera' } }), /apoderado firma por ti/);
  assert.throws(() => C.applyAction(db, APO, { type: 'lesion.crear', payload: { hijo: SOFIA, zona: 'Rodilla' } }), /firma el consentimiento informado de Sofía/);
  firmarComo(db, APO, SOFIA);
  const f = db.firmas.find((x) => x.rut === SOFIA);
  assert.strictEqual(f.apoderadoRut, APO);
  C.applyAction(db, SOFIA, { type: 'lesion.crear', payload: { zona: 'Tobillo' } });
  C.applyAction(db, APO, { type: 'lesion.crear', payload: { hijo: SOFIA, zona: 'Muñeca' } });
  assert.deepStrictEqual(db.lesiones.filter((l) => l.rut === SOFIA).map((l) => l.zona), ['Tobillo', 'Muñeca']);
  // Martín sigue pendiente; no puede actuar por un niño que no es suyo.
  assert.throws(() => C.applyAction(db, APO, { type: 'lesion.crear', payload: { hijo: MARTIN, zona: 'X' } }), /consentimiento/);
  assert.throws(() => C.applyAction(db, APO, { type: 'lesion.crear', payload: { hijo: JUG, zona: 'X' } }), /permiso/);
  // Un adulto no lo firma el apoderado.
  apo.hijos.push(JUG);
  assert.throws(() => firmarComo(db, APO, JUG), /mayor de edad/);
  // Vista: una por hijo, con su chat y sin datos de otros.
  const v = C.viewFor(db, APO);
  assert.deepStrictEqual(v.hijos.map((x) => x.yo).sort(), [SOFIA, MARTIN, JUG].sort());
  assert.ok(v.hijos.every((x) => x.yoReal === APO && x.usuarios[0].rut === x.yo));
  C.applyAction(db, APO, { type: 'chat.enviar', payload: { hilo: 'ent:' + SOFIA, texto: 'Hola, soy la mamá de Sofía' } });
  assert.ok(C.viewFor(db, ENT).mensajes.some((m) => m.de === APO));
  assert.ok(db.notificar.some((n) => n.para.includes(ENT)));
});

test('apoderado: se crea al inscribir a un menor y la directiva no ve la ficha médica', () => {
  const db = C.dbEjemplo();
  const nino = C.rutDesdeCuerpo(26333444), papa = C.rutDesdeCuerpo(14222333);
  C.applyAction(db, ENT, { type: 'jugador.crear', payload: { rut: nino, nombre: 'Niño Nuevo', categoria: 'Mini Masculino', fechaNac: '2017-01-01', apoderadoRut: C.formatearRut(papa), apoderadoNombre: 'Papá Nuevo', apoderadoTelefono: '+56 9 1234 5678' } });
  const a = db.usuarios.find((u) => u.rut === papa);
  assert.deepStrictEqual([a.rol, a.hijos, a.telefono], ['apoderado', [nino], '+56 9 1234 5678']);
  assert.throws(() => C.applyAction(db, ENT, { type: 'apoderado.vincular', payload: { rut: nino, apoderadoRut: C.formatearRut(JUG) } }), /cuenta de jugador/);
  C.applyAction(db, ENT, { type: 'ficha.guardar', payload: { rut: SOFIA, sangre: 'O+', alergias: 'Polen', emergencia: 'Mamá' } });
  assert.throws(() => C.applyAction(db, DIR, { type: 'ficha.guardar', payload: { rut: SOFIA } }), /permiso/);
  assert.ok(C.viewFor(db, DIR).usuarios.every((u) => u.medica === undefined));
  assert.strictEqual(C.viewFor(db, ENT).usuarios.find((u) => u.rut === SOFIA).medica.alergias, 'Polen');
  C.applyAction(db, ENT, { type: 'apoderado.desvincular', payload: { rut: nino, apoderadoRut: papa } });
  assert.strictEqual(a.activo, false);
});

test('fotos y galería: sólo entrenadores suben, máximo 3 por álbum', () => {
  const db = C.dbEjemplo();
  firmar(db, JUG);
  const img = 'data:image/jpeg;base64,' + Buffer.alloc(3000, 7).toString('base64');
  C.applyAction(db, JUG, { type: 'foto.perfil', payload: { rut: JUG, data: img } });
  const idFoto = db.usuarios.find((u) => u.rut === JUG).foto;
  assert.ok(/^f[0-9a-f]{24}$/.test(idFoto) && db.fotos[idFoto] === img);
  assert.strictEqual(C.viewFor(db, JUG).fotos, undefined);
  assert.throws(() => C.applyAction(db, JUG, { type: 'foto.perfil', payload: { rut: JUG, data: 'data:image/svg+xml;base64,AAAA' } }), /no válida/);
  const album = { titulo: 'Plantel 2026', fecha: C.hoyISO(), categoria: 'Primer Equipo Masculino', tipo: 'plantel', fotos: [img, img] };
  assert.throws(() => C.applyAction(db, DIR, { type: 'galeria.guardar', payload: album }), /permiso/);
  assert.throws(() => C.applyAction(db, JUG, { type: 'galeria.guardar', payload: album }), /permiso/);
  C.applyAction(db, ENT, { type: 'galeria.guardar', payload: album });
  const al = db.galeria[0];
  assert.throws(() => C.applyAction(db, ENT, { type: 'galeria.guardar', payload: Object.assign({}, album, { id: al.id, fotos: [img, img] }) }), /Máximo 3/);
  C.applyAction(db, ENT, { type: 'galeria.guardar', payload: Object.assign({}, album, { id: al.id, fotos: [img] }) });
  assert.strictEqual(al.fotos.length, 3);
  assert.ok(C.viewFor(db, JUG).galeria.some((x) => x.id === al.id));
  assert.ok(!C.viewFor(db, SOFIA).galeria.some((x) => x.id === al.id));
  const quitada = al.fotos[0];
  C.applyAction(db, DIR, { type: 'galeria.quitarFoto', payload: { id: al.id, foto: quitada } });
  assert.ok(db.fotosBorradas.includes(quitada) && !db.fotos[quitada]);
});

test('inventario: entregas con stock y material a cargo del jugador', () => {
  const db = C.dbEjemplo();
  firmar(db, JUG);
  C.applyAction(db, ENT, { type: 'inventario.guardar', payload: { nombre: 'Balones nuevos', tipo: 'Balones', total: 3 } });
  const it = db.inventario.find((x) => x.nombre === 'Balones nuevos');
  C.applyAction(db, ENT, { type: 'prestamo.crear', payload: { itemId: it.id, rut: JUG, cantidad: 2 } });
  assert.throws(() => C.applyAction(db, ENT, { type: 'prestamo.crear', payload: { itemId: it.id, rut: JUG, cantidad: 2 } }), /Sólo quedan 1/);
  assert.throws(() => C.applyAction(db, ENT, { type: 'inventario.guardar', payload: { id: it.id, nombre: 'Balones nuevos', total: 1 } }), /no puede ser menor/);
  assert.throws(() => C.applyAction(db, ENT, { type: 'inventario.eliminar', payload: { id: it.id } }), /devolución/);
  assert.ok(C.viewFor(db, JUG).miMaterial.some((x) => x.nombre === 'Balones nuevos' && x.cantidad === 2));
  assert.strictEqual(C.viewFor(db, JUG).inventario, undefined);
  const pr = db.prestamos.find((x) => x.itemId === it.id);
  C.applyAction(db, ENT, { type: 'prestamo.devolver', payload: { id: pr.id } });
  assert.ok(!C.viewFor(db, JUG).miMaterial.some((x) => x.nombre === 'Balones nuevos'));
  assert.throws(() => C.applyAction(db, JUG, { type: 'prestamo.crear', payload: { itemId: it.id, rut: JUG } }), /permiso/);
});

test('encuestas: votan los jugadores de la categoría; resultados sin nombres', () => {
  const db = C.dbEjemplo();
  firmar(db, JUG);
  C.applyAction(db, DIR, { type: 'encuesta.guardar', payload: { pregunta: '¿Polera blanca o azul?', opciones: 'Blanca\nAzul', categoria: 'Primer Equipo Masculino' } });
  const e = db.encuestas.find((x) => x.pregunta.startsWith('¿Polera'));
  assert.throws(() => C.applyAction(db, DIR, { type: 'encuesta.guardar', payload: { pregunta: 'X', opciones: 'Una' } }), /2 opciones/);
  C.applyAction(db, JUG, { type: 'encuesta.votar', payload: { id: e.id, opcion: 1 } });
  C.applyAction(db, JUG, { type: 'encuesta.votar', payload: { id: e.id, opcion: 0 } });
  assert.throws(() => C.applyAction(db, porNombre(db, 'Renato Flores').rut, { type: 'encuesta.votar', payload: { id: e.id, opcion: 0 } }), /no encontrada/);
  const ve = C.viewFor(db, JUG).encuestas.find((x) => x.id === e.id);
  assert.deepStrictEqual([ve.conteo, ve.total, ve.miVoto, ve.votos], [[1, 0], 1, 0, undefined]);
  assert.strictEqual(C.viewFor(db, DIR).encuestas.find((x) => x.id === e.id).votos, undefined);
  C.applyAction(db, DIR, { type: 'encuesta.cerrar', payload: { id: e.id } });
  assert.throws(() => C.applyAction(db, JUG, { type: 'encuesta.votar', payload: { id: e.id, opcion: 1 } }), /cerró/);
});

test('reporte mensual y planilla Excel', () => {
  const db = C.dbEjemplo();
  const mes = new Date().getMonth();
  const r = C.reporteMensual(db, ANIO, mes);
  assert.strictEqual(r.totales.gastos, 180000);
  assert.strictEqual(r.totales.ingresos, r.ingresos.reduce((s, x) => s + x.monto, 0));
  assert.strictEqual(r.totales.balance, r.totales.ingresos - r.totales.gastos);
  assert.ok(r.ingresos.some((x) => x.tipo === 'Otro ingreso' && x.monto === 120000));
  assert.ok(r.morosos.every((m) => m.meses.length && m.deuda > 0));
  const xlsx = C.crearXlsx([{ nombre: 'Resumen', filas: [['Concepto', 'Monto'], ['Ingresos', 1000], ['<Gastos & más>', 50]] }, { nombre: 'Hoja/2', filas: [['A']] }]);
  assert.strictEqual(Buffer.from(xlsx.slice(0, 2)).toString(), 'PK');
  const txt = Buffer.from(xlsx).toString('utf8');
  assert.ok(txt.includes('&lt;Gastos &amp; más&gt;') && txt.includes('name="Hoja 2"'));
  assert.strictEqual(C.crc32(Buffer.from('123456789')), 0xCBF43926);
});

test('recordatorios: una vez por cuota, al apoderado si el jugador es menor', () => {
  const db = C.dbEjemplo();
  const mes = db.config.mesesCobro.find((m) => m >= new Date().getMonth()) ?? db.config.mesesCobro[0];
  const venc = C.hoyISO(new Date(ANIO, mes, db.config.diaVencimiento));
  const dia = C.sumarDias(venc, -2);
  db.usuarios.filter((u) => u.rol === 'jugador').forEach((u) => { if (db.pagos[u.rut] && db.pagos[u.rut][ANIO]) delete db.pagos[u.rut][ANIO][mes]; });
  const lista = C.recordatoriosPendientes(db, dia);
  assert.ok(lista.length >= 10 && lista.every((x) => x.tipo === 'antes'));
  assert.deepStrictEqual(lista.find((x) => x.rut === SOFIA).destinatarios.map((d) => d.rut), [APO]);
  assert.match(lista.find((x) => x.rut === SOFIA).texto, /la cuota de Sofía/);
  lista.forEach((x) => C.marcarRecordatorio(db, x.clave));
  assert.strictEqual(C.recordatoriosPendientes(db, dia).length, 0);
  assert.ok(C.recordatoriosPendientes(db, C.sumarDias(venc, 2)).every((x) => x.tipo === 'atraso'));
  assert.strictEqual(C.recordatoriosPendientes(db, C.sumarDias(venc, -10)).length, 0);
  db.config.recordatorios.activo = false;
  assert.strictEqual(C.recordatoriosPendientes(db, dia).length, 0);
});

test('notificaciones: citación avisa al jugador y a su apoderado', () => {
  const db = C.dbEjemplo();
  firmarComo(db, APO, SOFIA);
  db.notificar = [];
  C.applyAction(db, ENT, { type: 'partido.guardar', payload: { rival: 'Rival', categoria: 'Infantil Femenino', fecha: C.sumarDias(C.hoyISO(), 3), hora: '10:00' } });
  const m = db.partidos.find((x) => x.rival === 'Rival');
  C.applyAction(db, ENT, { type: 'citacion.guardar', payload: { id: m.id, ruts: [SOFIA] } });
  assert.deepStrictEqual(db.notificar.pop().para.sort(), [SOFIA, APO].sort());
  C.applyAction(db, APO, { type: 'citacion.responder', payload: { hijo: SOFIA, id: m.id, respuesta: 'confirmado' } });
  assert.strictEqual(m.citados[SOFIA], 'confirmado');
});

test('reserva por partido: quien no puede se cambia por un no convocado', () => {
  const db = C.dbEjemplo();
  const m = db.partidos.find((x) => x.rival === 'UdeC');
  const RENATO = C.rutDesdeCuerpo(24678901), BENJA = C.rutDesdeCuerpo(24890123), LUCAS = C.rutDesdeCuerpo(24991122), NACHO = C.rutDesdeCuerpo(24993344);
  assert.deepStrictEqual(C.reservasDe(db, m).sort(), [LUCAS, NACHO].sort());
  // La reserva es por partido: en otro partido de la categoría Lucas puede estar citado.
  const otro = db.partidos.find((x) => x.rival === 'Liceo Alemán');
  assert.deepStrictEqual(C.reservasDe(db, otro).sort(), [LUCAS, NACHO].sort());

  // Al bajarse, el entrenador recibe el aviso.
  db.notificar = [];
  C.applyAction(db, RENATO, { type: 'citacion.responder', payload: { id: m.id, respuesta: 'rechazado' } });
  assert.ok(db.notificar.some((n) => n.para.includes(ENT) && /no puede ir/.test(n.titulo)));

  assert.throws(() => C.applyAction(db, RENATO, { type: 'citacion.reemplazar', payload: { id: m.id, cambios: [{ sale: BENJA, entra: LUCAS }] } }), /permiso/i);
  assert.throws(() => C.applyAction(db, ENT, { type: 'citacion.reemplazar', payload: { id: m.id, cambios: [{ sale: BENJA, entra: RENATO }] } }), /reserva/);
  assert.throws(() => C.applyAction(db, ENT, { type: 'citacion.reemplazar', payload: { id: m.id, cambios: [{ sale: BENJA, entra: LUCAS }, { sale: RENATO, entra: LUCAS }] } }), /reserva/);

  db.notificar = [];
  C.applyAction(db, ENT, { type: 'citacion.reemplazar', payload: { id: m.id, cambios: [{ sale: BENJA, entra: LUCAS }, { sale: RENATO, entra: NACHO }] } });
  assert.strictEqual(m.citados[LUCAS], 'pendiente');
  assert.strictEqual(m.citados[NACHO], 'pendiente');
  assert.ok(!m.citados[BENJA] && !m.citados[RENATO]);
  assert.deepStrictEqual(C.reservasDe(db, m).sort(), [BENJA, RENATO].sort());
  assert.strictEqual(m.reemplazos.length, 2);
  assert.ok(db.notificar.some((n) => n.para.includes(LUCAS) && n.para.includes(NACHO)));

  // Lo que ve cada jugador.
  const vR = C.viewFor(db, RENATO).partidos.find((x) => x.id === m.id);
  assert.strictEqual(vR.miCitacion, null);
  assert.strictEqual(vR.reemplazado, true);
  assert.strictEqual(vR.reemplazos, undefined);
  const vL = C.viewFor(db, LUCAS).partidos.find((x) => x.id === m.id);
  assert.strictEqual(vL.miCitacion, 'pendiente');
  assert.strictEqual(vL.enReserva, false);
  C.applyAction(db, LUCAS, { type: 'citacion.responder', payload: { id: m.id, respuesta: 'confirmado' } });
  assert.strictEqual(m.citados[LUCAS], 'confirmado');
});

test('usuario de staff: acepta mayúsculas, tildes y espacios', async () => {
  assert.strictEqual(C.normalizarUsuario(' J. Pérez '), 'j.perez');
  assert.strictEqual(C.normalizarUsuario('Pedro Soto'), 'pedrosoto');
  assert.strictEqual(C.normalizarUsuario('12abc'), null);
  const db = C.dbEjemplo();
  C.applyAction(db, DIR, await C.prepararAccion({ type: 'staff.crear', payload: { usuario: 'P Soto', clave: 'pedro1234', nombre: 'Pedro Soto', rol: 'entrenador' } }, sha256));
  const u = db.usuarios.find((x) => x.rut === 'usr:psoto');
  assert.ok(u);
  assert.strictEqual(C.idDeIngreso('PSoto'), 'usr:psoto');
  assert.ok(await C.verificarClave(u, 'pedro1234', sha256));
});
