/*
 * Vieux Gaulois Handball: lógica compartida entre el navegador y el servidor.
 * Contiene: utilidades de RUT, datos de ejemplo, permisos por rol (applyAction)
 * y la vista filtrada que recibe cada usuario (viewFor).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.VGCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  const ROLES = ['directiva', 'entrenador', 'jugador', 'apoderado'];
  const POSICIONES = ['Arquero', 'Extremo izquierdo', 'Lateral izquierdo', 'Central', 'Lateral derecho', 'Extremo derecho', 'Pivote'];

  // ---------- RUT ----------

  function limpiarRut(rut) {
    return String(rut || '').replace(/[^0-9kK]/g, '').toUpperCase();
  }

  function dvRut(cuerpo) {
    let suma = 0, mul = 2;
    for (let i = String(cuerpo).length - 1; i >= 0; i--) {
      suma += Number(String(cuerpo)[i]) * mul;
      mul = mul === 7 ? 2 : mul + 1;
    }
    const r = 11 - (suma % 11);
    return r === 11 ? '0' : r === 10 ? 'K' : String(r);
  }

  // Devuelve el RUT normalizado "12345678-5" o null si no es válido.
  function normalizarRut(rut) {
    const s = limpiarRut(rut);
    if (s.length < 2) return null;
    const cuerpo = s.slice(0, -1), dv = s.slice(-1);
    if (!/^\d{6,8}$/.test(cuerpo)) return null;
    if (dvRut(cuerpo) !== dv) return null;
    return Number(cuerpo) + '-' + dv;
  }

  function formatearRut(rut) {
    const [cuerpo, dv] = String(rut).split('-');
    if (!dv) return rut;
    return cuerpo.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + '-' + dv;
  }

  // La clave inicial son los primeros 4 dígitos del RUT.
  function claveInicial(rut) {
    return String(rut).split('-')[0].slice(0, 4);
  }

  function rutDesdeCuerpo(cuerpo) {
    return cuerpo + '-' + dvRut(cuerpo);
  }

  // ---------- Ingreso ----------
  // Jugadores ingresan con su RUT. Directiva y entrenadores con un usuario y una clave
  // definidos por la directiva; internamente su identificador es "usr:<usuario>".

  function normalizarUsuario(u) {
    const s = String(u || '').trim().toLowerCase();
    return /^[a-z][a-z0-9._-]{2,29}$/.test(s) ? s : null;
  }

  function idDeIngreso(identificador) {
    const r = normalizarRut(identificador);
    if (r) return r;
    const u = normalizarUsuario(identificador);
    return u ? 'usr:' + u : null;
  }

  function textoHash(id, clave) {
    return 'vieux-gaulois|' + id + '|' + clave;
  }

  // Cuentas que existen desde el inicio (clave guardada como hash SHA-256).
  const CUENTA_DIRECTIVA = {
    rut: 'usr:vieux', usuario: 'vieux', rol: 'directiva', nombre: 'Directiva Vieux Gaulois', cargo: 'Directiva', activo: true,
    claveHash: 'a6618b56c12983a6847705ed03e0f70a7d0ee37318b774ffae2d8ec0032dd2d8', // vieuxg1234
  };

  // ---------- Fechas ----------

  function hoyISO(d) {
    d = d || new Date();
    const z = (n) => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + z(d.getMonth() + 1) + '-' + z(d.getDate());
  }

  function sumarDias(iso, dias) {
    const d = new Date(iso + 'T12:00:00');
    d.setDate(d.getDate() + dias);
    return hoyISO(d);
  }

  function edad(fechaNac, hoy) {
    if (!fechaNac) return null;
    const h = hoy ? new Date(hoy + 'T12:00:00') : new Date();
    const n = new Date(fechaNac + 'T12:00:00');
    let e = h.getFullYear() - n.getFullYear();
    if (h.getMonth() < n.getMonth() || (h.getMonth() === n.getMonth() && h.getDate() < n.getDate())) e--;
    return e;
  }

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function clone(o) {
    return JSON.parse(JSON.stringify(o));
  }

  // ---------- Reglas del club ----------

  function cuotaDe(db, jugador) {
    const base = Number(db.config.cuotas[baseCategoria(jugador.categoria)] || 0);
    const desc = Number(jugador.descuento || 0);
    return Math.round(base * (1 - desc / 100));
  }

  function federativoPagado(db, rut, anio) {
    return !!(db.federativo[rut] && db.federativo[rut][anio] && db.federativo[rut][anio].pagado);
  }

  // Un jugador está habilitado para jugar si tiene el federativo del año pagado.
  function habilitado(db, rut, anio) {
    return federativoPagado(db, rut, anio || new Date().getFullYear());
  }

  function pagoMes(db, rut, anio, mes) {
    return (db.pagos[rut] && db.pagos[rut][anio] && db.pagos[rut][anio][mes]) || null;
  }

  // Meses cobrables ya vencidos (hasta el mes actual) que no están pagados.
  function mesesAdeudados(db, rut, anio, hoy) {
    const h = hoy ? new Date(hoy + 'T12:00:00') : new Date();
    const hasta = anio < h.getFullYear() ? 11 : anio > h.getFullYear() ? -1 : h.getMonth();
    return db.config.mesesCobro.filter((m) => m <= hasta && !(pagoMes(db, rut, anio, m) || {}).pagado);
  }

  function entrenamientosDeCategoria(db, categoria) {
    return db.entrenamientos.filter((e) => !e.categorias || !e.categorias.length || e.categorias.includes(categoria));
  }

  // Entrenamientos realizados (con asistencia tomada) y a cuántos asistió el jugador.
  function resumenAsistencia(db, jugador, anio) {
    const lista = entrenamientosDeCategoria(db, jugador.categoria)
      .filter((e) => e.asistenciaTomada && (!anio || e.fecha.startsWith(String(anio))));
    const asistidos = lista.filter((e) => e.asistencia && e.asistencia[jugador.rut] === 'P').length;
    const justificados = lista.filter((e) => e.asistencia && e.asistencia[jugador.rut] === 'J').length;
    return {
      realizados: lista.length,
      asistidos,
      justificados,
      porcentaje: lista.length ? Math.round((asistidos / lista.length) * 100) : 0,
    };
  }

  // ---------- Categorías ----------
  // Cada categoría existe en rama masculina y femenina ("Cadete Masculino", "Cadete Femenino").
  // Las cuotas se fijan por categoría base; de Infantil a Juvenil se registra si es 1er o 2do año.

  const CATEGORIAS_BASE = ['Mini', 'Infantil', 'Cadete', 'Juvenil', 'Junior', 'Adultos B', 'Primer Equipo', 'Master'];
  const RAMAS = ['Masculino', 'Femenino'];
  const CON_ANIO = ['Infantil', 'Cadete', 'Juvenil'];

  function armarCategorias(bases) {
    const out = [];
    bases.forEach((b) => RAMAS.forEach((r) => out.push(b + ' ' + r)));
    return out;
  }

  function baseCategoria(cat) {
    const r = RAMAS.find((x) => String(cat).endsWith(' ' + x));
    return r ? String(cat).slice(0, -(r.length + 1)) : String(cat || '');
  }

  function ramaCategoria(cat) {
    return RAMAS.find((x) => String(cat).endsWith(' ' + x)) || '';
  }

  function llevaAnio(cat) {
    return CON_ANIO.includes(baseCategoria(cat));
  }

  // "Cadete Masculino · 2° año"
  function etiquetaCategoria(j) {
    return (j.categoria || '') + (j.anioCategoria && llevaAnio(j.categoria) ? ' · ' + j.anioCategoria + '° año' : '');
  }

  // ---------- Documentos que firman los jugadores ----------

  const CONSENTIMIENTO = {
    id: 'consentimiento',
    titulo: 'Consentimiento informado y compromiso del jugador',
    texto: 'Al formar parte de Vieux Gaulois Handball declaro que:\n\n' +
      'Mi estado de salud es compatible con la práctica del balonmano y no tengo conocimiento de enfermedades, lesiones o condiciones que me impidan realizar actividad física de alta intensidad. Si mi estado de salud cambia, lo informaré al cuerpo técnico y a la directiva a través de esta app.\n\n' +
      'Me comprometo a asistir a los entrenamientos y partidos a los que sea citado, avisando con anticipación cuando no pueda asistir.\n\n' +
      'Me comprometo a pagar puntualmente las cuotas mensuales y el pago federativo definidos por la directiva.\n\n' +
      'Si soy menor de edad, mi apoderado autoriza mi participación y firma este documento conmigo.',
    puntos: [
      'Declaro que mi estado de salud es compatible con la práctica deportiva.',
      'Me comprometo a asistir a entrenamientos y partidos.',
      'Me comprometo a pagar las cuotas mensuales y el federativo.',
    ],
    destinatarios: 'todos',
  };

  const COMPROMISO_BECA = {
    titulo: 'Compromiso de jugador becado',
    texto: 'Vieux Gaulois Handball me otorga una beca o descuento en la cuota mensual.\n\n' +
      'A cambio me comprometo a entrenar con regularidad, asistir a los partidos a los que sea citado y representar al club con buena conducta dentro y fuera de la cancha.\n\n' +
      'Entiendo que la directiva puede revisar la beca si no cumplo este compromiso.',
    puntos: ['Me comprometo a entrenar con regularidad.', 'Me comprometo a jugar los partidos a los que sea citado.'],
  };

  function documentoAplica(doc, rut) {
    return doc.destinatarios === 'todos' || (Array.isArray(doc.destinatarios) && doc.destinatarios.includes(rut));
  }

  function firmaDe(db, rut, doc) {
    return (db.firmas || []).find((f) => f.rut === rut && f.documentoId === doc.id && f.version === doc.version) || null;
  }

  // Documentos que el jugador todavía no firma (en su versión actual). El consentimiento va primero.
  function documentosPendientes(db, rut) {
    return (db.documentos || []).filter((d) => documentoAplica(d, rut) && !firmaDe(db, rut, d))
      .sort((a, b) => (a.id === 'consentimiento' ? -1 : b.id === 'consentimiento' ? 1 : 0));
  }

  // ---------- Cobros y medios de pago ----------
  // La directiva decide, por concepto, si se paga con link, con transferencia o con ambos.
  // "cuota" y "federativo" son fijos; los demás cobros (torneos, indumentaria...) se crean en db.cobros.

  function cobroAplica(cobro, jugador) {
    return !!cobro && cobro.activo !== false && (!cobro.categorias || !cobro.categorias.length || cobro.categorias.includes(jugador.categoria));
  }

  function cobroPagado(db, cobroId, rut) {
    return !!(db.pagosCobro && db.pagosCobro[cobroId] && db.pagosCobro[cobroId][rut] && db.pagosCobro[cobroId][rut].pagado);
  }

  // Devuelve { link, transferencia } habilitados para un concepto ("cuota", "federativo" o id de cobro).
  function mediosDe(db, concepto) {
    const c = db.config;
    const conTransf = (on) => !!(on && c.datosTransferencia);
    if (concepto === 'cuota' || concepto === 'federativo') {
      const m = (c.medios && c.medios[concepto]) || { link: true, transferencia: true };
      const l = concepto === 'cuota' ? c.linkCuota : c.linkFederativo;
      return { link: m.link !== false && l ? l : '', transferencia: conTransf(m.transferencia !== false) };
    }
    const cobro = (db.cobros || []).find((x) => x.id === concepto);
    if (!cobro) return { link: '', transferencia: false };
    return { link: cobro.usarLink && cobro.link ? cobro.link : '', transferencia: conTransf(cobro.usarTransferencia) };
  }

  // ---------- Chat ----------
  // Conversaciones: "dir:<id>" entre un jugador o entrenador y la directiva;
  // "ent:<rut>" entre un jugador y los entrenadores.

  // El apoderado participa en las conversaciones de su hijo o hija.
  function puedeVerHilo(db, actor, hilo) {
    const m = /^(dir|ent):(.+)$/.exec(String(hilo || ''));
    if (!m) return false;
    const otro = buscarUsuario(db, m[2]);
    if (!otro) return false;
    const propio = actor.rut === otro.rut || esApoderadoDe(actor, otro.rut);
    if (m[1] === 'dir') return otro.rol !== 'directiva' && otro.rol !== 'apoderado' && (actor.rol === 'directiva' || propio);
    return otro.rol === 'jugador' && (actor.rol === 'entrenador' || propio);
  }

  // ---------- Apoderados ----------
  // Los menores de 18 se inscriben con un apoderado. Su cuenta se habilita cuando
  // el apoderado firma el consentimiento informado desde su propia cuenta.

  const esMenor = (j) => !!(j && j.fechaNac && edad(j.fechaNac) < 18);
  const esApoderadoDe = (u, rutHijo) => !!(u && u.rol === 'apoderado' && u.activo !== false && (u.hijos || []).includes(rutHijo));
  const apoderadosDe = (db, rutHijo) => db.usuarios.filter((u) => esApoderadoDe(u, rutHijo));

  // A quién avisar por un jugador: él mismo y sus apoderados.
  function conApoderados(db, ruts) {
    const out = new Set();
    ruts.forEach((r) => { out.add(r); apoderadosDe(db, r).forEach((a) => out.add(a.rut)); });
    return Array.from(out);
  }

  // ---------- Cambio de temporada ----------
  // Al pasar de año, quien estaba en 1er año pasa a 2do; quien estaba en 2do sube a la
  // siguiente categoría (Infantil 2do año -> Cadete 1er año), en la misma rama.

  function siguienteCategoria(db, j) {
    if (!llevaAnio(j.categoria)) return null;
    if (j.anioCategoria === '1') return { categoria: j.categoria, anioCategoria: '2' };
    if (j.anioCategoria !== '2') return null;
    const bases = db.config.categoriasBase;
    const i = bases.indexOf(baseCategoria(j.categoria));
    if (i < 0 || i + 1 >= bases.length) return null;
    const categoria = bases[i + 1] + ' ' + ramaCategoria(j.categoria);
    return { categoria, anioCategoria: llevaAnio(categoria) ? '1' : '' };
  }

  // Devuelve true si hubo cambios (hay que guardar la base).
  function cambioTemporada(db, anioActual) {
    anioActual = anioActual || new Date().getFullYear();
    const desde = Number(db.config.temporada) || anioActual;
    if (desde >= anioActual) return false;
    db.cambiosTemporada = db.cambiosTemporada || [];
    for (let a = desde + 1; a <= anioActual; a++) {
      const activos = db.usuarios.filter((u) => u.rol === 'jugador' && u.activo !== false);
      const sube = new Map();
      activos.forEach((j) => { const s = siguienteCategoria(db, j); if (s) sube.set(j.rut, s); });
      const catFinal = (j) => (sube.has(j.rut) ? sube.get(j.rut).categoria : j.categoria);
      const cambios = [];
      activos.filter((j) => sube.has(j.rut)).forEach((j) => {
        const s = sube.get(j.rut);
        const c = { rut: j.rut, nombre: j.nombre, de: etiquetaCategoria(j) };
        // Si al subir choca el número de camiseta con alguien de la nueva categoría, el número queda libre para asignarlo.
        if (s.categoria !== j.categoria && j.numero != null && activos.some((o) => o !== j && catFinal(o) === s.categoria && Number(o.numero) === Number(j.numero))) {
          c.numeroLiberado = j.numero;
          j.numero = null;
        }
        Object.assign(j, s);
        c.a = etiquetaCategoria(j);
        cambios.push(c);
      });
      db.cambiosTemporada.push({ anio: a, fecha: hoyISO(), cambios });
    }
    db.config.temporada = anioActual;
    return true;
  }

  // ---------- Estadísticas de partido ----------
  // [clave, nombre, máximo por partido]
  const CAMPOS_ESTADISTICA = [['g', 'Goles', 60], ['at', 'Atajadas', 80], ['dm', '2 min', 3], ['am', 'Amarilla', 1], ['ro', 'Roja', 1], ['az', 'Azul', 1]];

  function estadisticasDe(db, filtro) {
    const tabla = {};
    db.partidos.filter(filtro).forEach((m) => {
      Object.keys(m.estadisticas || {}).forEach((rut) => {
        const t = tabla[rut] = tabla[rut] || { rut, pj: 0, g: 0, at: 0, dm: 0, am: 0, ro: 0, az: 0 };
        t.pj++;
        CAMPOS_ESTADISTICA.forEach(([k]) => { t[k] += Number(m.estadisticas[rut][k]) || 0; });
      });
    });
    return tabla;
  }

  // Tabla de goleadores de una categoría en el año.
  function tablaGoleadores(db, categoria, anio) {
    const t = estadisticasDe(db, (m) => m.categoria === categoria && String(m.fecha).startsWith(String(anio)));
    return Object.values(t).map((x) => {
      const u = buscarUsuario(db, x.rut) || { nombre: '?' };
      return Object.assign(x, { nombre: u.nombre, numero: u.numero == null ? null : u.numero });
    }).sort((a, b) => b.g - a.g || a.pj - b.pj || a.nombre.localeCompare(b.nombre));
  }

  function estadisticasJugador(db, rut, anio) {
    const t = estadisticasDe(db, (m) => String(m.fecha).startsWith(String(anio)) && m.estadisticas && m.estadisticas[rut]);
    return t[rut] || { rut, pj: 0, g: 0, at: 0, dm: 0, am: 0, ro: 0, az: 0 };
  }

  // ---------- Evaluación física ----------
  // [clave, nombre, unidad, mejor ("menos" = menor es mejor), mínimo, máximo]
  const TESTS_FISICOS = [
    ['t5105', 'Test 5-10-5', 's', 'menos', 3, 20],
    ['salto', 'Salto alto', 'cm', 'mas', 1, 200],
    ['flex', 'Flexiones en 30 s', 'rep.', 'mas', 0, 120],
    ['sent', 'Sentadillas en 30 s', 'rep.', 'mas', 0, 120],
    ['altura', 'Altura', 'cm', '', 80, 230],
    ['peso', 'Peso', 'kg', '', 15, 200],
  ];

  // ---------- Cumpleaños ----------
  function cumpleanosDelMes(db, mes, anio, categoria) {
    return db.usuarios.filter((u) => u.rol === 'jugador' && u.activo !== false && u.fechaNac && Number(u.fechaNac.slice(5, 7)) === mes + 1 && (!categoria || u.categoria === categoria))
      .map((u) => ({ rut: u.rut, nombre: u.nombre, categoria: u.categoria, dia: Number(u.fechaNac.slice(8, 10)), cumple: anio - Number(u.fechaNac.slice(0, 4)) }))
      .sort((a, b) => a.dia - b.dia || a.nombre.localeCompare(b.nombre));
  }

  // ---------- Fotos ----------
  // Las imágenes llegan como data URL ya comprimidas en el navegador. En la base se guarda sólo
  // un id; el servidor mueve el contenido a archivos (ver server.js).
  function idFoto() {
    const a = new Uint8Array(12);
    const c = typeof globalThis !== 'undefined' && globalThis.crypto;
    if (c && c.getRandomValues) c.getRandomValues(a); else for (let i = 0; i < a.length; i++) a[i] = Math.floor(Math.random() * 256);
    return 'f' + Array.from(a).map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  function guardarImagen(db, data, maxKB) {
    const m = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+=*)$/.exec(String(data || ''));
    if (!m) throw err('Imagen no válida');
    if (m[2].length * 0.75 > maxKB * 1024) throw err('La imagen pesa más de ' + maxKB + ' KB');
    const id = idFoto();
    db.fotos = db.fotos || {};
    db.fotos[id] = data;
    return id;
  }

  function quitarImagen(db, id) {
    if (!id) return;
    if (db.fotos) delete db.fotos[id];
    (db.fotosBorradas = db.fotosBorradas || []).push(id);
  }

  const MAX_FOTOS_ALBUM = 3;

  // ---------- Reporte mensual de finanzas ----------
  function reporteMensual(db, anio, mes, hoy) {
    hoy = hoy || hoyISO();
    const pref = anio + '-' + String(mes + 1).padStart(2, '0');
    const enMes = (f) => String(f || '').startsWith(pref);
    const quien = (rut) => buscarUsuario(db, rut) || { nombre: '?', categoria: '' };
    const ingresos = [];
    Object.keys(db.pagos).forEach((rut) => Object.keys(db.pagos[rut]).forEach((a) => Object.keys(db.pagos[rut][a]).forEach((mm) => {
      const p = db.pagos[rut][a][mm];
      if (p && p.pagado && enMes(p.fecha)) ingresos.push({ fecha: p.fecha, tipo: 'Cuota', detalle: 'Cuota ' + MESES[mm] + ' ' + a, nombre: quien(rut).nombre, categoria: quien(rut).categoria, medio: p.metodo || '', monto: Number(p.monto) || 0 });
    })));
    Object.keys(db.federativo).forEach((rut) => Object.keys(db.federativo[rut]).forEach((a) => {
      const p = db.federativo[rut][a];
      if (p && p.pagado && enMes(p.fecha)) ingresos.push({ fecha: p.fecha, tipo: 'Federativo', detalle: 'Federativo ' + a, nombre: quien(rut).nombre, categoria: quien(rut).categoria, medio: p.metodo || '', monto: Number(p.monto) || 0 });
    }));
    Object.keys(db.pagosCobro || {}).forEach((cid) => {
      const c = (db.cobros || []).find((x) => x.id === cid);
      Object.keys(db.pagosCobro[cid]).forEach((rut) => {
        const p = db.pagosCobro[cid][rut];
        if (p && p.pagado && enMes(p.fecha)) ingresos.push({ fecha: p.fecha, tipo: 'Otro cobro', detalle: c ? c.nombre : 'Cobro eliminado', nombre: quien(rut).nombre, categoria: quien(rut).categoria, medio: p.metodo || '', monto: Number(p.monto) || 0 });
      });
    });
    (db.movimientos || []).filter((m) => m.tipo === 'ingreso' && enMes(m.fecha))
      .forEach((m) => ingresos.push({ fecha: m.fecha, tipo: 'Otro ingreso', detalle: m.concepto, nombre: '', categoria: '', medio: '', monto: Number(m.monto) || 0 }));
    const gastos = (db.movimientos || []).filter((m) => m.tipo === 'gasto' && enMes(m.fecha))
      .map((m) => ({ fecha: m.fecha, detalle: m.concepto, monto: Number(m.monto) || 0 }));
    // Morosos al cierre del mes (o a hoy, si el mes no ha terminado).
    const fin = sumarDias(hoyISO(new Date(anio, mes + 1, 1)), -1);
    const corte = fin < hoy ? fin : hoy;
    const morosos = db.usuarios.filter((u) => u.rol === 'jugador' && u.activo !== false).map((j) => {
      const meses = mesesAdeudados(db, j.rut, anio, corte).filter((m) => m <= mes);
      const contacto = esMenor(j) ? apoderadosDe(db, j.rut)[0] : j;
      return { nombre: j.nombre, categoria: etiquetaCategoria(j), meses, deuda: meses.length * cuotaDe(db, j), telefono: (contacto && contacto.telefono) || j.telefono || '' };
    }).filter((x) => x.meses.length).sort((a, b) => b.deuda - a.deuda || a.nombre.localeCompare(b.nombre));
    const suma = (l, f) => l.filter(f || (() => true)).reduce((s, x) => s + x.monto, 0);
    ingresos.sort((a, b) => a.fecha.localeCompare(b.fecha));
    gastos.sort((a, b) => a.fecha.localeCompare(b.fecha));
    return {
      anio, mes, titulo: MESES_LARGOS[mes] + ' ' + anio, ingresos, gastos, morosos,
      totales: {
        cuotas: suma(ingresos, (x) => x.tipo === 'Cuota'), federativos: suma(ingresos, (x) => x.tipo === 'Federativo'),
        cobros: suma(ingresos, (x) => x.tipo === 'Otro cobro'), otros: suma(ingresos, (x) => x.tipo === 'Otro ingreso'),
        ingresos: suma(ingresos), gastos: suma(gastos), balance: suma(ingresos) - suma(gastos),
        morosos: morosos.length, deuda: morosos.reduce((s, x) => s + x.deuda, 0),
      },
    };
  }

  // ---------- Recordatorios de cuotas ----------
  // "antes": desde N días antes del vencimiento; "atraso": hasta 7 días después, si sigue impaga.
  // Cada recordatorio se envía una sola vez (db.recordatoriosEnviados).
  function recordatoriosPendientes(db, hoy) {
    const cfg = db.config.recordatorios || {};
    if (!cfg.activo) return [];
    hoy = hoy || hoyISO();
    const d = new Date(hoy + 'T12:00:00');
    const anio = d.getFullYear(), mes = d.getMonth();
    if (!db.config.mesesCobro.includes(mes)) return [];
    const venc = hoyISO(new Date(anio, mes, db.config.diaVencimiento));
    let tipo = null;
    if (hoy >= sumarDias(venc, -(Number(cfg.diasAntes) || 0)) && hoy <= venc) tipo = 'antes';
    else if (cfg.atraso && hoy > venc && hoy <= sumarDias(venc, 7)) tipo = 'atraso';
    if (!tipo) return [];
    const enviados = db.recordatoriosEnviados || {};
    return db.usuarios.filter((u) => u.rol === 'jugador' && u.activo !== false).filter((j) => {
      if ((pagoMes(db, j.rut, anio, mes) || {}).pagado) return false;
      if ((db.pagosInformados || []).some((x) => x.rut === j.rut && x.estado === 'pendiente' && x.concepto === 'cuota' && x.mes === mes && x.anio === anio)) return false;
      return !enviados[[j.rut, anio, mes, tipo].join('|')];
    }).map((j) => {
      const menor = esMenor(j);
      const aps = apoderadosDe(db, j.rut);
      const destinatarios = (menor && aps.length ? aps : [j]).map((u) => ({ rut: u.rut, nombre: u.nombre, telefono: u.telefono || '', email: u.email || '' }));
      const monto = cuotaDe(db, j);
      const fecha = venc.slice(8, 10) + '/' + venc.slice(5, 7);
      const de = menor ? 'la cuota de ' + j.nombre.split(/\s+/)[0] : 'tu cuota';
      const texto = tipo === 'antes'
        ? 'te recordamos que ' + de + ' de ' + MESES_LARGOS[mes].toLowerCase() + ' (' + pesos(monto) + ') vence el ' + fecha + '.'
        : 'te contamos que ' + de + ' de ' + MESES_LARGOS[mes].toLowerCase() + ' (' + pesos(monto) + ') venció el ' + fecha + ' y aún aparece pendiente.';
      return {
        clave: [j.rut, anio, mes, tipo].join('|'), tipo, rut: j.rut, nombre: j.nombre, anio, mes, monto, vence: venc, destinatarios,
        titulo: tipo === 'antes' ? 'Cuota por vencer' : 'Cuota atrasada',
        texto: 'Hola, ' + texto + ' Puedes pagar e informar el pago en la app de Vieux Gaulois. ¡Gracias!',
      };
    });
  }

  function marcarRecordatorio(db, clave) {
    db.recordatoriosEnviados = db.recordatoriosEnviados || {};
    db.recordatoriosEnviados[clave] = hoyISO();
  }

  const pesos = (n) => '$' + String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const MESES_LARGOS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

  // ---------- Planilla Excel (.xlsx) ----------
  // Arma un .xlsx mínimo (zip sin compresión) con una hoja por tabla. hojas = [{ nombre, filas: [[celda...]] }]
  // La primera fila de cada hoja va en negrita; los números quedan como números.
  function crearXlsx(hojas) {
    const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
    const col = (i) => { let s = ''; i++; while (i) { const r = (i - 1) % 26; s = String.fromCharCode(65 + r) + s; i = Math.floor((i - 1) / 26); } return s; };
    const hoja = (filas) => '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>' +
      filas.map((f, r) => '<row r="' + (r + 1) + '">' + f.map((v, c) => {
        const ref = col(c) + (r + 1);
        const st = r === 0 ? ' s="1"' : typeof v === 'number' ? ' s="2"' : '';
        if (typeof v === 'number' && Number.isFinite(v)) return '<c r="' + ref + '"' + st + '><v>' + v + '</v></c>';
        if (v == null || v === '') return '';
        return '<c r="' + ref + '" t="inlineStr"' + st + '><is><t xml:space="preserve">' + esc(v) + '</t></is></c>';
      }).join('') + '</row>').join('') + '</sheetData></worksheet>';
    const nombres = hojas.map((x, i) => esc(String(x.nombre || 'Hoja ' + (i + 1)).replace(/[\\/?*[\]:]/g, ' ').slice(0, 31)));
    const archivos = [
      ['[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
        hojas.map((_, i) => '<Override PartName="/xl/worksheets/sheet' + (i + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>').join('') + '</Types>'],
      ['_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'],
      ['xl/workbook.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' +
        nombres.map((n, i) => '<sheet name="' + n + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>').join('') + '</sheets></workbook>'],
      ['xl/_rels/workbook.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        hojas.map((_, i) => '<Relationship Id="rId' + (i + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + (i + 1) + '.xml"/>').join('') +
        '<Relationship Id="rId' + (hojas.length + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>'],
      ['xl/styles.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0"/></numFmts><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>'],
    ].concat(hojas.map((x, i) => ['xl/worksheets/sheet' + (i + 1) + '.xml', hoja(x.filas)]));
    return zipSinCompresion(archivos);
  }

  const CRC_TABLA = (() => {
    const t = [];
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t.push(c >>> 0); }
    return t;
  })();
  function crc32(bytes) {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < bytes.length; i++) c = CRC_TABLA[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  function utf8(s) {
    if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(s);
    return Uint8Array.from(Buffer.from(s, 'utf8'));
  }

  function zipSinCompresion(archivos) {
    const partes = [], central = [];
    let off = 0;
    const u16 = (v) => [v & 0xFF, (v >>> 8) & 0xFF];
    const u32 = (v) => [v & 0xFF, (v >>> 8) & 0xFF, (v >>> 16) & 0xFF, (v >>> 24) & 0xFF];
    archivos.forEach(([nombre, contenido]) => {
      const n = utf8(nombre), d = utf8(contenido), crc = crc32(d);
      // versión 20, bit 11 = nombres en UTF-8, método 0 (sin compresión), fecha 1/1/2020
      const comun = [].concat(u16(20), u16(0x0800), u16(0), u16(0), u16(0x5021), u32(crc), u32(d.length), u32(d.length), u16(n.length), u16(0));
      const local = Uint8Array.from([].concat(u32(0x04034b50), comun));
      partes.push(local, n, d);
      central.push(Uint8Array.from([].concat(u32(0x02014b50), u16(20), comun, u16(0), u16(0), u16(0), u32(0), u32(off))), n);
      off += local.length + n.length + d.length;
    });
    const tamCentral = central.reduce((s, x) => s + x.length, 0);
    const fin = Uint8Array.from([].concat(u32(0x06054b50), u16(0), u16(0), u16(archivos.length), u16(archivos.length), u32(tamCentral), u32(off), u16(0)));
    const total = partes.concat(central, [fin]);
    const out = new Uint8Array(total.reduce((s, x) => s + x.length, 0));
    let p = 0;
    total.forEach((x) => { out.set(x, p); p += x.length; });
    return out;
  }

  // ---------- Notificaciones ----------
  // applyAction deja en db.notificar lo que hay que avisar; el servidor lo envía (push) y lo vacía.
  function notificar(db, para, titulo, cuerpo, tab) {
    const ruts = Array.from(new Set(para)).filter(Boolean);
    if (!ruts.length) return;
    (db.notificar = db.notificar || []).push({ para: ruts, titulo: String(titulo).slice(0, 80), cuerpo: String(cuerpo || '').slice(0, 180), tab: tab || '' });
  }

  const jugadoresDeCategoria = (db, categoria) => db.usuarios.filter((u) => u.rol === 'jugador' && u.activo !== false && (!categoria || u.categoria === categoria)).map((u) => u.rut);

  // ---------- Convocatoria: cuerpo técnico ----------
  const CUERPO_TECNICO = [
    ['entrenadorA', 'Entrenador A'], ['entrenadorB', 'Entrenador B'], ['entrenadorC', 'Entrenador C'],
    ['kinesiologo', 'Kinesiólogo/a'], ['enfermero', 'Enfermero/a'],
  ];

  // ---------- Jugadas (pizarra táctica) ----------
  // Coordenadas en metros de la cancha: x de 0 a 40, y de 0 a 20. Atacamos hacia el arco de x = 40.

  // Ataque 6 contra defensa 6:0 con arquero; el balón en manos del central.
  const ATAQUE_BASE = [['EI', 38, 1.6], ['LI', 29, 5], ['CE', 27.5, 10], ['LD', 29, 15], ['ED', 38, 18.4], ['PIV', 35.3, 12.4]];
  const DEFENSA_BASE = [[34.6, 3.2], [34, 6.6], [33.7, 9], [33.7, 11.2], [34, 13.6], [34.6, 16.9], [39.2, 10]];

  // mueve = { CE: [x, y] } cambia la posición de esas fichas; balon = [x, y].
  function formacionInicial(mueve, balon) {
    mueve = mueve || {};
    return ATAQUE_BASE.map(([n, x, y]) => ({ id: n, t: 'a', n, x: mueve[n] ? mueve[n][0] : x, y: mueve[n] ? mueve[n][1] : y }))
      .concat(DEFENSA_BASE.map(([x, y], i) => ({ id: 'd' + i, t: 'd', n: i === 6 ? 'AR' : String(i + 1), x, y })))
      .concat([{ id: 'bal', t: 'b', n: '', x: balon ? balon[0] : 28.3, y: balon ? balon[1] : 10.6 }]);
  }

  function limpiarJugada(pasos) {
    if (!Array.isArray(pasos) || !pasos.length) throw err('La jugada no tiene pasos');
    const coord = (v, max) => Math.round(Math.min(max, Math.max(0, Number(v) || 0)) * 100) / 100;
    return pasos.slice(0, 30).map((paso) => ({
      fichas: (Array.isArray(paso && paso.fichas) ? paso.fichas : []).slice(0, 20).map((f) => ({
        id: texto(f.id, 12) || uid().slice(-6), t: ['a', 'd', 'b'].includes(f.t) ? f.t : 'a', n: texto(f.n, 3), x: coord(f.x, 40), y: coord(f.y, 20),
      })),
      trazos: (Array.isArray(paso && paso.trazos) ? paso.trazos : []).slice(0, 30).map((t) => ({
        t: ['mov', 'pase', 'lanz', 'libre'].includes(t.t) ? t.t : 'libre',
        p: (Array.isArray(t.p) ? t.p : []).slice(0, 120).map((q) => [coord(q && q[0], 40), coord(q && q[1], 20)]),
      })).filter((t) => t.p.length >= 2),
    }));
  }

  // Completa una base guardada con una versión anterior de la app (sin borrar datos).
  function migrar(db) {
    const base = dbVacia();
    if (db.version >= base.version) return db;
    ['avisos', 'firmas', 'movimientos', 'convenios', 'cobros', 'pagosInformados', 'mensajes', 'jugadas',
      'evaluaciones', 'inventario', 'prestamos', 'encuestas', 'galeria', 'cambiosTemporada'].forEach((k) => { db[k] = db[k] || []; });
    ['pagosCobro', 'fotos', 'recordatoriosEnviados'].forEach((k) => { db[k] = db[k] || {}; });
    // Contacto de emergencia y previsión pasan a la ficha médica.
    db.usuarios.forEach((u) => {
      if (u.rol !== 'jugador' || u.medica) return;
      u.medica = { emergencia: u.contactoEmergencia || '', prevision: u.prevision || '' };
      delete u.contactoEmergencia; delete u.prevision;
    });
    db.documentos = db.documentos || base.documentos;
    Object.keys(base.config).forEach((k) => { if (db.config[k] == null) db.config[k] = base.config[k]; });
    if (!db.config.categoriasBase || !db.config.categoriasBase.length) {
      db.config.categoriasBase = base.config.categoriasBase;
      db.config.categorias = base.config.categorias;
      db.config.cuotas = Object.assign({}, base.config.cuotas, db.config.cuotas);
    }
    db.version = base.version;
    return db;
  }

  // ---------- Base de datos inicial ----------

  function dbVacia() {
    const anio = new Date().getFullYear();
    return {
      version: 5,
      config: {
        club: 'Vieux Gaulois Handball',
        temporada: anio,
        categoriasBase: CATEGORIAS_BASE.slice(),
        categorias: armarCategorias(CATEGORIAS_BASE),
        cuotas: { Mini: 15000, Infantil: 18000, Cadete: 20000, Juvenil: 22000, Junior: 25000, 'Adultos B': 25000, 'Primer Equipo': 25000, Master: 20000 },
        montoFederativo: 35000,
        mesesCobro: [2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
        diaVencimiento: 10,
        linkCuota: '',
        linkFederativo: '',
        datosTransferencia: '',
        medios: { cuota: { link: true, transferencia: true }, federativo: { link: true, transferencia: true } },
        indicacionesCitacion: 'Llevar carnet, calcetas negras, short negro, botella de agua y toalla de mano.',
        recordatorios: { activo: true, diasAntes: 3, atraso: true, push: true, correo: true, whatsapp: false },
      },
      usuarios: [Object.assign({ creado: hoyISO() }, CUENTA_DIRECTIVA)],
      pagos: {},
      federativo: {},
      entrenamientos: [],
      partidos: [],
      lesiones: [],
      convenios: [],
      movimientos: [],
      avisos: [],
      documentos: [Object.assign({ version: 1, creado: hoyISO() }, clone(CONSENTIMIENTO))],
      firmas: [],
      cobros: [],
      pagosCobro: {},
      pagosInformados: [],
      mensajes: [],
      jugadas: [],
      evaluaciones: [],
      inventario: [],
      prestamos: [],
      encuestas: [],
      galeria: [],
      fotos: {},
      cambiosTemporada: [],
      recordatoriosEnviados: {},
    };
  }

  function dbEjemplo() {
    const db = dbVacia();
    const anio = db.config.temporada;
    const hoy = hoyISO();
    Object.assign(db.config, {
      linkCuota: 'https://www.webpay.cl/form-pay/ejemplo-cuota',
      linkFederativo: 'https://www.webpay.cl/form-pay/ejemplo-federativo',
      datosTransferencia: 'Club Deportivo Vieux Gaulois\nRUT 65.123.456-7\nBanco Estado, Cuenta Corriente 12345678\ntesoreria@vieuxgaulois.cl',
    });
    const add = (cuerpo, datos) => {
      const u = Object.assign({ rut: rutDesdeCuerpo(cuerpo), activo: true, creado: hoy }, datos);
      db.usuarios.push(u);
      return u;
    };
    db.usuarios.push({
      rut: 'usr:jorge', usuario: 'jorge', rol: 'entrenador', nombre: 'Jorge Pérez', cargo: 'Entrenador Cadetes', telefono: '+56 9 2222 2222', activo: true, creado: hoy,
      claveHash: '87f28f30a50033150d34790d77b007cfd5f43dab18eb5f530ca6174592790396', // jorge1234
    });
    // Tomás juega en el Primer Equipo (entra con su RUT) y además entrena a la Juvenil (entra con usuario "tomas").
    db.usuarios.push({
      rut: 'usr:tomas', usuario: 'tomas', rol: 'entrenador', nombre: 'Tomás Rojas', cargo: 'Entrenador Juvenil', activo: true, creado: hoy,
      jugadorRut: rutDesdeCuerpo(20123456), claveHash: 'd355c072d67c4714eb6120152e17fad62ced7f0190ad54dce3532321967ea1cb', // tomas1234
    });
    const PE = 'Primer Equipo Masculino', CAD = 'Cadete Masculino';
    // Dos cumpleaños caen en el mes actual, para verlos en el inicio.
    const mesHoy = String(new Date().getMonth() + 1).padStart(2, '0');
    const diaCumple = String(Math.min(28, new Date().getDate() + 3)).padStart(2, '0');
    const jugadores = [
      add(20123456, { nombre: 'Tomás Rojas', rol: 'jugador', fechaNac: '2001-04-12', categoria: PE, numero: 7, posicion: 'Central', telefono: '+56 9 3333 3333' }),
      add(19876543, { nombre: 'Diego Muñoz', rol: 'jugador', fechaNac: '1998-09-03', categoria: PE, numero: 1, posicion: 'Arquero' }),
      add(21345678, { nombre: 'Benjamín Soto', rol: 'jugador', fechaNac: '2003-01-25', categoria: 'Adultos B Masculino', numero: 10, posicion: 'Lateral izquierdo' }),
      add(18765432, { nombre: 'Camila Fuentes', rol: 'jugador', fechaNac: '1996-' + mesHoy + '-05', categoria: 'Primer Equipo Femenino', numero: 9, posicion: 'Pivote' }),
      add(20555666, { nombre: 'Valentina Araya', rol: 'jugador', fechaNac: '2000-06-18', categoria: 'Primer Equipo Femenino', numero: 14, posicion: 'Extremo derecho', descuento: 50 }),
      add(23456789, { nombre: 'Matías Contreras', rol: 'jugador', fechaNac: '2008-03-08', categoria: 'Juvenil Masculino', anioCategoria: '2', numero: 5, posicion: 'Extremo izquierdo' }),
      add(24567890, { nombre: 'Germán Meinas', rol: 'jugador', fechaNac: '2010-02-11', categoria: CAD, anioCategoria: '2', numero: 1, posicion: 'Arquero' }),
      add(24678901, { nombre: 'Renato Flores', rol: 'jugador', fechaNac: '2010-07-21', categoria: CAD, anioCategoria: '2', numero: 4, posicion: 'Central' }),
      add(24789012, { nombre: 'Agustín Contreras', rol: 'jugador', fechaNac: '2011-03-02', categoria: CAD, anioCategoria: '1', numero: 8, posicion: 'Pivote' }),
      add(24890123, { nombre: 'Benjamín Aguayo', rol: 'jugador', fechaNac: '2011-' + mesHoy + '-' + diaCumple, categoria: CAD, anioCategoria: '1', numero: 11, posicion: 'Extremo derecho' }),
      add(24901234, { nombre: 'Sofía Herrera', rol: 'jugador', fechaNac: '2012-05-30', categoria: 'Infantil Femenino', anioCategoria: '1', numero: 6, posicion: 'Lateral derecho' }),
      add(25123987, { nombre: 'Martín Herrera', rol: 'jugador', fechaNac: '2016-08-20', categoria: 'Mini Masculino', numero: 3, posicion: 'Extremo izquierdo' }),
    ];
    // Apoderada de Sofía y Martín: los menores quedan habilitados cuando ella firma el consentimiento.
    add(15678901, { nombre: 'Carolina Herrera', rol: 'apoderado', telefono: '+56 9 4444 5555', email: 'carolina.herrera@example.com', hijos: [jugadores[10].rut, jugadores[11].rut] });
    const ficha = (j, m) => { j.medica = Object.assign({ sangre: '', alergias: '', condiciones: '', medicamentos: '', seguro: '', prevision: '', emergencia: '', obs: '' }, m); };
    ficha(jugadores[0], { sangre: 'O+', alergias: 'Penicilina', prevision: 'Fonasa', seguro: 'Seguro deportivo Federación', emergencia: 'María Rojas (madre) +56 9 1111 2222' });
    ficha(jugadores[6], { sangre: 'A+', condiciones: 'Asma leve', medicamentos: 'Salbutamol antes de entrenar', prevision: 'Isapre Colmena', seguro: 'Seguro escolar', emergencia: 'Pedro Meinas (padre) +56 9 6666 1234' });
    ficha(jugadores[10], { sangre: 'B+', alergias: 'Maní', prevision: 'Fonasa', seguro: 'Seguro escolar', emergencia: 'Carolina Herrera (madre) +56 9 4444 5555' });

    const mesActual = new Date().getMonth();
    jugadores.forEach((j, i) => {
      db.pagos[j.rut] = { [anio]: {} };
      db.config.mesesCobro.forEach((m) => {
        if (m <= mesActual - (i % 3)) {
          db.pagos[j.rut][anio][m] = { pagado: true, monto: cuotaDe(db, j), fecha: hoyISO(new Date(anio, m, 5)), metodo: 'Transferencia' };
        }
      });
      if (i !== 2 && i !== 5 && i !== 9) {
        db.federativo[j.rut] = { [anio]: { pagado: true, monto: db.config.montoFederativo, fecha: hoyISO(new Date(anio, 2, 15)) } };
      }
      // Todos firmaron el consentimiento menos Tomás (firma al ingresar) y los hijos de Carolina (firma ella).
      if (i !== 0 && i !== 10 && i !== 11) {
        db.firmas.push({ id: uid(), rut: j.rut, documentoId: 'consentimiento', version: 1, fecha: hoyISO(new Date(anio, 2, 1)), nombreFirma: j.nombre, apoderado: edad(j.fechaNac) < 18 ? 'Apoderado de ' + j.nombre.split(' ')[0] : '' });
      }
    });

    // Compromiso extra enviado por la directiva a la jugadora becada (sin firmar aún).
    db.documentos.push(Object.assign({ id: uid(), version: 1, creado: hoy, destinatarios: [jugadores[4].rut] }, clone(COMPROMISO_BECA)));

    // Entrenamientos: martes y jueves de las últimas 3 semanas (con asistencia) y las próximas 2.
    const base = new Date();
    base.setDate(base.getDate() - ((base.getDay() + 5) % 7)); // martes de esta semana (o el anterior)
    const adultos = [PE, 'Adultos B Masculino', 'Primer Equipo Femenino'];
    for (let s = -3; s <= 1; s++) {
      [0, 2].forEach((off) => {
        const fecha = sumarDias(hoyISO(base), s * 7 + off);
        const pasado = fecha < hoy;
        const e = {
          id: uid(), fecha, hora: '20:00', duracion: 90, lugar: 'Gimnasio Municipal',
          categorias: adultos, tema: off ? 'Táctica defensiva 6:0' : 'Físico y lanzamiento',
          asistenciaTomada: pasado, asistencia: {},
        };
        const cad = {
          id: uid(), fecha, hora: '18:00', duracion: 75, lugar: 'Gimnasio Colegio', categorias: [CAD, 'Juvenil Masculino'],
          tema: off ? 'Contraataque' : 'Técnica individual', asistenciaTomada: pasado, asistencia: {},
        };
        if (pasado) {
          jugadores.filter((j) => adultos.includes(j.categoria)).forEach((j, k) => {
            e.asistencia[j.rut] = (k + s + off) % 4 === 0 ? 'A' : (k + s) % 5 === 0 ? 'J' : 'P';
          });
          jugadores.filter((j) => cad.categorias.includes(j.categoria)).forEach((j, k) => {
            cad.asistencia[j.rut] = (k + s + off) % 5 === 0 ? 'A' : 'P';
          });
        }
        db.entrenamientos.push(e, cad);
      });
    }

    const ruts = (lista) => { const o = {}; lista.forEach(([j, est]) => { o[j.rut] = est; }); return o; };
    db.partidos.push({
      id: uid(), fecha: sumarDias(hoy, 5), hora: '15:00', rival: 'UdeC', lugar: 'Parque Rivera Bio Bio',
      condicion: 'Visita', competicion: 'Liga Regional', categoria: CAD, vestimenta: 'Negras',
      indicaciones: db.config.indicacionesCitacion, presentacion: '14:00', resultado: null,
      citados: ruts([[jugadores[6], 'confirmado'], [jugadores[7], 'pendiente'], [jugadores[8], 'confirmado'], [jugadores[9], 'pendiente']]),
      citacionFecha: hoy, citadoPor: 'usr:jorge',
    });
    db.partidos.push({
      id: uid(), fecha: sumarDias(hoy, 4), hora: '17:00', rival: 'Club Balonmano Andes', lugar: 'Gimnasio Municipal',
      condicion: 'Local', competicion: 'Liga Metropolitana', categoria: PE, vestimenta: 'Blancas', indicaciones: db.config.indicacionesCitacion,
      citados: ruts([[jugadores[0], 'confirmado'], [jugadores[1], 'pendiente']]), presentacion: '16:00', resultado: null, citacionFecha: hoy, citadoPor: 'usr:jorge',
    });
    db.partidos.push({
      id: uid(), fecha: sumarDias(hoy, 11), hora: '12:00', rival: 'Deportivo Costa', lugar: 'Polideportivo Costa',
      condicion: 'Visita', competicion: 'Liga Metropolitana', categoria: 'Primer Equipo Femenino', vestimenta: 'Negras', indicaciones: db.config.indicacionesCitacion,
      citados: ruts([[jugadores[3], 'pendiente'], [jugadores[4], 'pendiente']]), presentacion: '10:30', resultado: null, citacionFecha: hoy, citadoPor: 'usr:vieux',
    });
    db.partidos.push({
      id: uid(), fecha: sumarDias(hoy, -6), hora: '19:00', rival: 'Handball Sur', lugar: 'Gimnasio Municipal',
      condicion: 'Local', competicion: 'Liga Metropolitana', categoria: PE, vestimenta: 'Blancas', indicaciones: db.config.indicacionesCitacion,
      citados: ruts([[jugadores[0], 'confirmado'], [jugadores[1], 'confirmado']]), presentacion: '18:00', resultado: { nuestro: 28, rival: 24 }, citacionFecha: sumarDias(hoy, -9), citadoPor: 'usr:jorge',
      comentario: 'Gran segundo tiempo: la defensa 6:0 cerró los espacios y Diego atajó dos penales.',
      estadisticas: { [jugadores[0].rut]: { g: 7, at: 0, dm: 1, am: 1, ro: 0, az: 0 }, [jugadores[1].rut]: { g: 0, at: 14, dm: 0, am: 0, ro: 0, az: 0 } },
    });
    // Dos fechas jugadas de Cadetes con estadísticas, para la tabla de goleadores.
    [[-20, 'Liceo Alemán', 22, 25, [[6, 0, 9], [7, 6, 0], [8, 5, 0], [9, 3, 0]]], [-13, 'Club Andino', 27, 21, [[6, 0, 13], [7, 8, 0], [8, 4, 0], [9, 6, 0]]]].forEach(([dias, rival, a, b, est]) => {
      const e = {};
      est.forEach(([k, g, at]) => { e[jugadores[k].rut] = { g, at, dm: k === 8 && dias === -20 ? 1 : 0, am: 0, ro: 0, az: 0 }; });
      db.partidos.push({
        id: uid(), fecha: sumarDias(hoy, dias), hora: '16:00', rival, lugar: 'Gimnasio Colegio', condicion: 'Local', competicion: 'Liga Regional', categoria: CAD, vestimenta: 'Negras',
        indicaciones: db.config.indicacionesCitacion, citados: ruts(est.map(([k]) => [jugadores[k], 'confirmado'])), presentacion: '15:00', resultado: { nuestro: a, rival: b },
        citacionFecha: sumarDias(hoy, dias - 4), citadoPor: 'usr:jorge', estadisticas: e,
        comentario: a > b ? 'Buen partido colectivo, muy rápidos en el contraataque.' : 'Nos faltó intensidad en defensa. A corregir en la semana.',
      });
    });

    db.avisos.push(
      { id: uid(), fecha: hoy, autor: 'usr:vieux', titulo: 'Juvenil Femenino juega el sábado', texto: 'Vamos todos a apoyar a la Juvenil Femenino contra Deportes Concepción. ¡Lleven bombos!', categoria: 'Juvenil Femenino', fechaEvento: sumarDias(hoy, 3), hora: '11:00', lugar: 'Casa del Deporte', link: '', fijado: true },
      { id: uid(), fecha: sumarDias(hoy, -1), autor: 'usr:jorge', titulo: 'Cambio de horario Cadetes', texto: 'Esta semana los Cadetes entrenan a las 18:00 en vez de 18:30.', categoria: CAD, fechaEvento: '', hora: '', lugar: '', link: '', fijado: false },
      { id: uid(), fecha: sumarDias(hoy, -4), autor: 'usr:vieux', titulo: 'Pago federativo ' + anio, texto: 'Recuerden pagar el federativo con el link de pago de su perfil. Sin federativo pagado no se puede jugar partidos oficiales.', categoria: '', fechaEvento: '', hora: '', lugar: '', link: '', fijado: false }
    );

    db.lesiones.push({
      id: uid(), rut: jugadores[2].rut, fecha: sumarDias(hoy, -2), zona: 'Hombro derecho', tipo: 'Dolor',
      intensidad: 6, descripcion: 'Molestia al lanzar después del último entrenamiento.', estado: 'activa', vistoPor: [],
      creado: sumarDias(hoy, -2),
    });

    db.convenios.push(
      { id: uid(), empresa: 'Clínica Deportiva KineSport', beneficio: '20% de descuento en kinesiología', detalle: 'Presentando credencial del club. Reserva al +56 2 2345 6789.' },
      { id: uid(), empresa: 'Tienda Handball Pro', beneficio: '15% en zapatillas y balones', detalle: 'Código VIEUXGAULOIS en tienda online.' },
      { id: uid(), empresa: 'Gimnasio Fuerza Total', beneficio: 'Matrícula gratis y 10% mensual', detalle: 'Válido para jugadores con cuotas al día.' },
      { id: uid(), estado: 'propuesto', propuestoPor: jugadores[4].rut, creado: hoy, empresa: 'Nutricionista Paula Díaz', beneficio: '25% en primera consulta',
        detalle: 'Atiende deportistas en Ñuñoa, trabaja con mi equipo universitario.', contacto: '+56 9 7777 1234' }
    );

    // Otros cobros: uno con link y transferencia, otro sólo con transferencia.
    const torneo = { id: uid(), nombre: 'Torneo Nacional Cadetes', monto: 25000, categorias: [CAD], link: 'https://www.webpay.cl/form-pay/ejemplo-torneo', usarLink: true, usarTransferencia: true, vence: sumarDias(hoy, 14), activo: true, creado: hoy };
    const poleron = { id: uid(), nombre: 'Polerón oficial del club', monto: 18000, categorias: [], link: '', usarLink: false, usarTransferencia: true, vence: '', activo: true, creado: hoy };
    db.cobros.push(torneo, poleron);
    db.pagosCobro[torneo.id] = { [jugadores[6].rut]: { pagado: true, monto: 25000, fecha: hoy, metodo: 'Link de pago' } };
    db.pagosCobro[poleron.id] = { [jugadores[3].rut]: { pagado: true, monto: 18000, fecha: hoy, metodo: 'Transferencia' } };

    // Un pago informado por un jugador, esperando revisión de la directiva.
    const debe = mesesAdeudados(db, jugadores[2].rut, anio)[0];
    if (debe != null) {
      db.pagosInformados.push({ id: uid(), rut: jugadores[2].rut, concepto: 'cuota', anio, mes: debe, monto: cuotaDe(db, jugadores[2]), fecha: hoy, medio: 'Transferencia', detalle: 'Transferencia desde Banco Chile, N° operación 884512', estado: 'pendiente', creado: hoy });
    }

    // Conversaciones de ejemplo.
    const msj = (hilo, de, txt, minutos, leidoPor) => db.mensajes.push({ id: uid(), hilo, de, texto: txt, fecha: new Date(Date.now() - minutos * 60e3).toISOString(), leidoPor });
    msj('dir:' + jugadores[4].rut, jugadores[4].rut, 'Hola, ¿puedo pagar la cuota de octubre en dos partes?', 300, [jugadores[4].rut]);
    msj('dir:' + jugadores[4].rut, 'usr:vieux', 'Hola Valentina, sí. Informa cada pago desde Finanzas en la app.', 240, ['usr:vieux']);
    msj('ent:' + jugadores[6].rut, jugadores[6].rut, 'Profe, el domingo llego directo al gimnasio, ¿hay problema?', 90, [jugadores[6].rut]);
    msj('dir:usr:jorge', 'usr:jorge', 'Necesitamos 10 balones nuevos para los Cadetes.', 60, ['usr:jorge']);

    // Jugada de ejemplo: cruce central-lateral derecho y lanzamiento.
    db.jugadas.push({
      id: uid(), nombre: 'Cruce central - lateral derecho', descripcion: 'El central fija hacia la derecha, el lateral derecho cruza por detrás, recibe y lanza.',
      categorias: [CAD, PE, 'Primer Equipo Femenino'], autor: 'usr:jorge', fecha: hoy, cancha: 'media',
      pasos: [
        { fichas: formacionInicial(), trazos: [{ t: 'mov', p: [[27.5, 10], [30, 13]] }, { t: 'mov', p: [[29, 15], [30.5, 9.2]] }] },
        { fichas: formacionInicial({ CE: [30, 13], LD: [30.5, 9.2] }, [30.6, 13.5]), trazos: [{ t: 'pase', p: [[30, 13], [30.5, 9.2]] }] },
        { fichas: formacionInicial({ CE: [30, 13], LD: [31.2, 9.4] }, [31.6, 9.8]), trazos: [{ t: 'lanz', p: [[31.2, 9.4], [39.6, 10.8]] }] },
      ],
    });

    // Plan del próximo entrenamiento de Cadetes, con la jugada de ejemplo adjunta.
    const proxCad = db.entrenamientos.filter((e) => e.fecha >= hoy && e.categorias.includes(CAD)).sort((a, b) => a.fecha.localeCompare(b.fecha))[0];
    if (proxCad) {
      proxCad.planVisible = true;
      proxCad.plan = [
        { nombre: 'Calentamiento con balón', minutos: 15, detalle: 'Trote, movilidad y pases en parejas.', jugada: '' },
        { nombre: 'Circuito 5-10-5 y saltos', minutos: 15, detalle: '3 series, pausa de 1 minuto.', jugada: '' },
        { nombre: 'Cruce central - lateral derecho', minutos: 25, detalle: 'Primero sin defensa, luego contra 6:0.', jugada: db.jugadas[0].id },
        { nombre: 'Partido 6 contra 6', minutos: 15, detalle: 'Gol de cruce vale doble.', jugada: '' },
      ];
    }

    // Evaluaciones físicas de Cadetes hace dos meses y esta semana; se ve la evolución.
    const evalua = (j, dias, v) => db.evaluaciones.push({ id: uid(), rut: j.rut, fecha: sumarDias(hoy, dias), autor: 'usr:jorge', valores: v });
    [[6, 6.1, 38, 18, 24, 168, 61], [7, 5.6, 45, 25, 30, 172, 63], [8, 5.9, 41, 20, 27, 160, 52], [9, 5.8, 43, 22, 28, 158, 49]].forEach(([k, t, sa, fl, se, al, pe]) => {
      evalua(jugadores[k], -60, { t5105: t, salto: sa, flex: fl, sent: se, altura: al, peso: pe });
      evalua(jugadores[k], -30, { t5105: Math.round((t - 0.2) * 100) / 100, salto: sa + 2, flex: fl + 3, sent: se + 2, altura: al + 1, peso: pe + 0.5 });
      evalua(jugadores[k], -3, { t5105: Math.round((t - 0.35) * 100) / 100, salto: sa + 4, flex: fl + 5, sent: se + 4, altura: al + 1, peso: pe + 1 });
    });
    evalua(jugadores[4], -40, { t5105: 5.4, salto: 44, flex: 20, sent: 29, altura: 168, peso: 60 });
    evalua(jugadores[4], -5, { t5105: 5.2, salto: 47, flex: 24, sent: 32, altura: 168, peso: 59 });

    // Inventario y material entregado.
    const item = (nombre, tipo, total) => { const x = { id: uid(), nombre, tipo, total, notas: '' }; db.inventario.push(x); return x; };
    const bal3 = item('Balones talla 3', 'Balones', 20), bal2 = item('Balones talla 2', 'Balones', 15);
    const petos = item('Petos de entrenamiento', 'Petos', 30), cam = item('Camisetas oficiales', 'Camisetas', 40);
    item('Conos', 'Otros', 50);
    const presta = (it, rut, cantidad, dias, nota) => db.prestamos.push({ id: uid(), itemId: it.id, rut, cantidad, fecha: sumarDias(hoy, dias), nota, por: 'usr:jorge', devuelto: null });
    presta(cam, jugadores[0].rut, 1, -50, 'Camiseta N° 7');
    presta(cam, jugadores[6].rut, 1, -50, 'Camiseta N° 1 arquero');
    presta(bal3, 'usr:jorge', 6, -10, 'Para entrenamiento de Cadetes');
    presta(petos, 'usr:jorge', 12, -10, '');
    presta(bal2, jugadores[10].rut, 1, -8, 'Para practicar en casa');

    // Encuestas.
    db.encuestas.push({
      id: uid(), pregunta: '¿Qué día prefieren para el entrenamiento extra?', opciones: ['Lunes', 'Miércoles', 'Sábado en la mañana'], categoria: CAD,
      cierre: sumarDias(hoy, 6), autor: 'usr:jorge', fecha: sumarDias(hoy, -1), cerrada: false,
      votos: { [jugadores[6].rut]: 2, [jugadores[8].rut]: 1 },
    });
    db.encuestas.push({
      id: uid(), pregunta: '¿Hacemos convivencia de fin de temporada con las familias?', opciones: ['Sí, en diciembre', 'Sí, en enero', 'No por ahora'], categoria: '',
      cierre: sumarDias(hoy, 12), autor: 'usr:vieux', fecha: sumarDias(hoy, -2), cerrada: false,
      votos: { [jugadores[1].rut]: 0, [jugadores[3].rut]: 0, [jugadores[4].rut]: 1, [jugadores[7].rut]: 0 },
    });

    db.movimientos.push(
      { id: uid(), fecha: hoyISO(new Date(anio, 2, 1)), tipo: 'gasto', concepto: 'Arriendo gimnasio marzo', monto: 180000 },
      { id: uid(), fecha: hoyISO(new Date(anio, 3, 10)), tipo: 'ingreso', concepto: 'Auspicio Ferretería Central', monto: 300000 },
      { id: uid(), fecha: hoyISO(new Date(anio, 4, 2)), tipo: 'gasto', concepto: 'Balones y conos', monto: 95000 },
      { id: uid(), fecha: hoyISO(new Date(anio, new Date().getMonth(), 1)), tipo: 'gasto', concepto: 'Arriendo gimnasio ' + MESES_LARGOS[new Date().getMonth()].toLowerCase(), monto: 180000 },
      { id: uid(), fecha: hoyISO(new Date(anio, new Date().getMonth(), 2)), tipo: 'ingreso', concepto: 'Rifa pro viaje Cadetes', monto: 120000 }
    );
    return db;
  }

  // ---------- Permisos y acciones ----------

  function err(msg) {
    const e = new Error(msg);
    e.publico = true;
    return e;
  }

  function texto(v, max) {
    return String(v == null ? '' : v).trim().slice(0, max || 200);
  }

  function num(v, min, max) {
    const n = Number(v);
    if (!Number.isFinite(n)) return null;
    return Math.min(max == null ? n : max, Math.max(min == null ? n : min, n));
  }

  function fechaValida(f) {
    return /^\d{4}-\d{2}-\d{2}$/.test(String(f || ''));
  }

  function horaValida(h) {
    return !h || /^\d{2}:\d{2}$/.test(String(h));
  }

  function buscarUsuario(db, rut) {
    return db.usuarios.find((u) => u.rut === rut);
  }

  function buscarJugador(db, rut) {
    const u = buscarUsuario(db, rut);
    if (!u || u.rol !== 'jugador') throw err('Jugador no encontrado');
    return u;
  }

  function datosJugador(db, p, j) {
    const nombre = texto(p.nombre, 80);
    if (!nombre) throw err('El nombre es obligatorio');
    if (!db.config.categorias.includes(p.categoria)) throw err('Categoría no válida');
    if (p.fechaNac && !fechaValida(p.fechaNac)) throw err('Fecha de nacimiento no válida');
    const numero = p.numero === '' || p.numero == null ? null : num(p.numero, 0, 99);
    if (numero != null) {
      const choque = db.usuarios.find((u) => u.rol === 'jugador' && u.activo !== false && u.rut !== j.rut
        && u.categoria === p.categoria && Number(u.numero) === numero);
      if (choque) throw err('El número ' + numero + ' ya lo usa ' + choque.nombre + ' en ' + p.categoria);
    }
    let anioCategoria = '';
    if (llevaAnio(p.categoria)) {
      anioCategoria = String(p.anioCategoria || '');
      if (!['1', '2'].includes(anioCategoria)) throw err('Indica si es 1er o 2do año de ' + baseCategoria(p.categoria));
    }
    Object.assign(j, {
      nombre,
      fechaNac: p.fechaNac || '',
      categoria: p.categoria,
      anioCategoria,
      numero,
      posicion: texto(p.posicion, 40),
      telefono: texto(p.telefono, 30),
      email: texto(p.email, 80),
    });
  }

  // Crea la cuenta del apoderado (entra con su RUT y los 4 primeros dígitos) o le suma este hijo o hija.
  function vincularApoderado(db, rutHijo, p) {
    const lleno = [p.apoderadoRut, p.apoderadoNombre].some((v) => String(v || '').trim());
    if (!lleno) return;
    const rut = normalizarRut(p.apoderadoRut);
    if (!rut) throw err('RUT del apoderado no válido');
    if (rut === rutHijo) throw err('El apoderado debe ser otra persona');
    let a = buscarUsuario(db, rut);
    if (a && a.rol !== 'apoderado') throw err('Ese RUT ya tiene una cuenta de ' + a.rol + ' en el club');
    const datos = { telefono: texto(p.apoderadoTelefono, 30), email: texto(p.apoderadoEmail, 80) };
    if (!a) {
      const nombre = texto(p.apoderadoNombre, 80);
      if (!nombre) throw err('Indica el nombre del apoderado');
      a = { rut, rol: 'apoderado', nombre, hijos: [], activo: true, creado: hoyISO() };
      db.usuarios.push(a);
    } else if (texto(p.apoderadoNombre, 80)) a.nombre = texto(p.apoderadoNombre, 80);
    Object.keys(datos).forEach((k) => { if (datos[k]) a[k] = datos[k]; });
    a.activo = true;
    if (!a.hijos.includes(rutHijo)) a.hijos.push(rutHijo);
  }

  // Sólo se aceptan links web (evita "javascript:" y similares).
  function link(v) {
    const t = texto(v, 400);
    if (t && !/^https?:\/\/[^\s]+$/i.test(t)) throw err('El link debe empezar con https://');
    return t;
  }

  function datosEvento(p, db) {
    if (!fechaValida(p.fecha)) throw err('Fecha no válida');
    if (!horaValida(p.hora)) throw err('Hora no válida');
    return { fecha: p.fecha, hora: p.hora || '', lugar: texto(p.lugar, 100) };
  }

  /*
   * Aplica una acción sobre la base de datos si el usuario tiene permiso.
   * Lanza un Error con mensaje en español si no corresponde.
   */
  function applyAction(db, actorRut, action) {
    const actor = buscarUsuario(db, actorRut);
    if (!actor || actor.activo === false) throw err('Sesión no válida');
    const p = (action && action.payload) || {};
    const rol = actor.rol;
    const esDir = rol === 'directiva';
    const esStaff = esDir || rol === 'entrenador';
    const exigir = (ok) => { if (!ok) throw err('No tienes permiso para esta acción'); };
    const anio = num(p.anio, 2000, 2100);

    // El apoderado actúa por uno de sus hijos (payload.hijo); el jugador, por sí mismo.
    const esJug = rol === 'jugador' || rol === 'apoderado';
    let quien = actor;
    if (rol === 'apoderado') {
      const hijos = actor.hijos || [];
      const hijo = p.hijo || (hijos.length === 1 ? hijos[0] : '');
      if (hijo) { exigir(hijos.includes(hijo)); quien = buscarJugador(db, hijo); }
    }
    const jug = () => { exigir(esJug && quien.rol === 'jugador'); return quien; };

    // El consentimiento debe estar firmado antes de usar la app. Si el jugador es menor, lo firma su apoderado.
    if (esJug && quien.rol === 'jugador' && action && action.type !== 'documento.firmar'
      && documentosPendientes(db, quien.rut).some((d) => d.id === 'consentimiento')) {
      throw err(rol === 'apoderado' ? 'Primero firma el consentimiento informado de ' + quien.nombre.split(/\s+/)[0]
        : esMenor(quien) ? 'Tu apoderado debe firmar el consentimiento informado desde su cuenta' : 'Primero debes firmar el consentimiento informado');
    }

    switch (action && action.type) {
      // ----- Jugadores -----
      case 'jugador.crear': {
        exigir(esStaff);
        const rut = normalizarRut(p.rut);
        if (!rut) throw err('RUT no válido');
        if (buscarUsuario(db, rut)) throw err('Ya existe un usuario con ese RUT');
        const j = { rut, rol: 'jugador', activo: true, creado: hoyISO(), descuento: 0 };
        datosJugador(db, p, j);
        if (esDir) j.descuento = num(p.descuento, 0, 100) || 0;
        db.usuarios.push(j);
        vincularApoderado(db, rut, p);
        break;
      }
      case 'jugador.editar': {
        // El apoderado también actualiza su propio teléfono y email.
        if (rol === 'apoderado' && p.rut === actor.rut) {
          actor.telefono = texto(p.telefono, 30);
          actor.email = texto(p.email, 80);
          break;
        }
        const j = buscarJugador(db, p.rut);
        if (esStaff) {
          datosJugador(db, Object.assign({}, j, p), j);
          if (esDir && p.descuento != null) j.descuento = num(p.descuento, 0, 100) || 0;
          vincularApoderado(db, j.rut, p);
        } else {
          exigir(jug().rut === j.rut);
          // El jugador (o su apoderado) sólo puede editar sus datos de contacto.
          j.telefono = texto(p.telefono, 30);
          j.email = texto(p.email, 80);
        }
        break;
      }
      case 'apoderado.vincular': {
        exigir(esStaff);
        const j = buscarJugador(db, p.rut);
        if (!String(p.apoderadoRut || '').trim()) throw err('Indica el RUT del apoderado');
        vincularApoderado(db, j.rut, p);
        break;
      }
      case 'apoderado.desvincular': {
        exigir(esStaff);
        const a = buscarUsuario(db, p.apoderadoRut);
        if (!a || a.rol !== 'apoderado') throw err('Apoderado no encontrado');
        a.hijos = (a.hijos || []).filter((r) => r !== p.rut);
        if (!a.hijos.length) a.activo = false;
        break;
      }
      // Ficha médica: la ven y editan el cuerpo técnico, el jugador y su apoderado (no la directiva).
      case 'ficha.guardar': {
        const j = buscarJugador(db, p.rut);
        exigir(rol === 'entrenador' || (esJug && jug().rut === j.rut));
        j.medica = {
          sangre: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].includes(p.sangre) ? p.sangre : '',
          alergias: texto(p.alergias, 200), condiciones: texto(p.condiciones, 200), medicamentos: texto(p.medicamentos, 200),
          seguro: texto(p.seguro, 100), prevision: texto(p.prevision, 60), emergencia: texto(p.emergencia, 120), obs: texto(p.obs, 300),
          actualizada: hoyISO(),
        };
        break;
      }
      case 'foto.perfil': {
        const j = buscarJugador(db, p.rut);
        exigir(esStaff || (esJug && jug().rut === j.rut));
        const id = p.data ? guardarImagen(db, p.data, 150) : null;
        quitarImagen(db, j.foto);
        if (id) j.foto = id; else delete j.foto;
        break;
      }
      case 'jugador.activo': {
        exigir(esDir);
        buscarJugador(db, p.rut).activo = !!p.activo;
        break;
      }

      // ----- Staff (directiva / entrenadores) -----
      case 'staff.crear': {
        exigir(esDir);
        const usuario = normalizarUsuario(p.usuario);
        if (!usuario) throw err('Usuario no válido: de 3 a 30 caracteres, empieza con letra, sin espacios');
        const id = 'usr:' + usuario;
        if (buscarUsuario(db, id)) throw err('Ya existe el usuario "' + usuario + '"');
        if (!['directiva', 'entrenador'].includes(p.rol)) throw err('Rol no válido');
        const nombre = texto(p.nombre, 80);
        if (!nombre) throw err('El nombre es obligatorio');
        if (!p.claveHash) throw err('Define una clave de al menos 4 caracteres');
        const jugadorRut = p.jugadorRut ? buscarJugador(db, p.jugadorRut).rut : '';
        db.usuarios.push({
          rut: id, usuario, rol: p.rol, nombre, cargo: texto(p.cargo, 60), telefono: texto(p.telefono, 30), email: texto(p.email, 80),
          jugadorRut, claveHash: p.claveHash, activo: true, creado: hoyISO(),
        });
        break;
      }
      case 'clave.definir': {
        exigir(esDir);
        const u = buscarUsuario(db, p.rut);
        if (!u || u.rol === 'jugador') throw err('Usuario no encontrado');
        if (!p.claveHash) throw err('Define una clave de al menos 4 caracteres');
        u.claveHash = p.claveHash;
        break;
      }
      case 'staff.activo': {
        exigir(esDir);
        const u = buscarUsuario(db, p.rut);
        if (!u || u.rol === 'jugador') throw err('Usuario no encontrado');
        if (u.rut === actor.rut) throw err('No puedes desactivar tu propia cuenta');
        u.activo = !!p.activo;
        break;
      }
      case 'clave.resetear': {
        exigir(esDir);
        // Jugadores y apoderados: la clave vuelve a ser los 4 primeros dígitos del RUT.
        const u = buscarUsuario(db, p.rut);
        if (!u || !['jugador', 'apoderado'].includes(u.rol)) throw err('Usuario no encontrado');
        delete u.claveHash;
        break;
      }

      // ----- Lesiones y molestias -----
      case 'lesion.crear': {
        const rut = esJug ? jug().rut : p.rut;
        buscarJugador(db, rut);
        const zona = texto(p.zona, 60);
        if (!zona) throw err('Indica la zona del cuerpo');
        db.lesiones.push({
          id: uid(), rut, fecha: fechaValida(p.fecha) ? p.fecha : hoyISO(), zona,
          tipo: ['Lesión', 'Dolor', 'Molestia'].includes(p.tipo) ? p.tipo : 'Molestia',
          intensidad: num(p.intensidad, 1, 10) || 1, descripcion: texto(p.descripcion, 500),
          estado: 'activa', vistoPor: [actor.rut], creado: hoyISO(), reportadoPor: actor.rut,
        });
        break;
      }
      case 'lesion.editar': {
        const l = db.lesiones.find((x) => x.id === p.id);
        if (!l) throw err('Registro no encontrado');
        exigir(esStaff || (esJug && l.rut === quien.rut));
        if (p.zona != null) l.zona = texto(p.zona, 60) || l.zona;
        if (p.tipo != null && ['Lesión', 'Dolor', 'Molestia'].includes(p.tipo)) l.tipo = p.tipo;
        if (p.intensidad != null) l.intensidad = num(p.intensidad, 1, 10) || l.intensidad;
        if (p.descripcion != null) l.descripcion = texto(p.descripcion, 500);
        if (p.estado != null) {
          l.estado = p.estado === 'resuelta' ? 'resuelta' : 'activa';
          l.resuelta = l.estado === 'resuelta' ? hoyISO() : null;
        }
        if (p.notaStaff != null && esStaff) l.notaStaff = texto(p.notaStaff, 300);
        // Cualquier cambio vuelve a avisar a quienes no lo hicieron.
        l.vistoPor = [actor.rut];
        break;
      }
      case 'lesion.visto': {
        exigir(esStaff);
        const ids = Array.isArray(p.ids) ? p.ids : [p.id];
        db.lesiones.forEach((l) => {
          if (ids.includes(l.id) && !l.vistoPor.includes(actor.rut)) l.vistoPor.push(actor.rut);
        });
        break;
      }

      // ----- Entrenamientos -----
      case 'entrenamiento.guardar': {
        exigir(esStaff);
        const datos = datosEvento(p, db);
        const categorias = (Array.isArray(p.categorias) ? p.categorias : []).filter((c) => db.config.categorias.includes(c));
        if (!categorias.length) throw err('Selecciona al menos una categoría');
        Object.assign(datos, { categorias, duracion: num(p.duracion, 0, 600) || 90, tema: texto(p.tema, 120) });
        if (p.id) {
          const e = db.entrenamientos.find((x) => x.id === p.id);
          if (!e) throw err('Entrenamiento no encontrado');
          Object.assign(e, datos);
        } else {
          const repetir = num(p.repetirSemanas, 0, 26) || 0;
          for (let s = 0; s <= repetir; s++) {
            db.entrenamientos.push(Object.assign({ id: uid(), asistenciaTomada: false, asistencia: {} }, datos, { fecha: sumarDias(datos.fecha, s * 7) }));
          }
        }
        break;
      }
      // Plan de la sesión: ejercicios con minutos, detalle y, si se quiere, una jugada de la pizarra.
      case 'entrenamiento.plan': {
        exigir(esStaff);
        const e = db.entrenamientos.find((x) => x.id === p.id);
        if (!e) throw err('Entrenamiento no encontrado');
        e.plan = (Array.isArray(p.plan) ? p.plan : []).slice(0, 20).map((x) => ({
          nombre: texto(x && x.nombre, 80), minutos: num(x && x.minutos, 0, 300) || 0, detalle: texto(x && x.detalle, 300),
          jugada: x && x.jugada && db.jugadas.some((jg) => jg.id === x.jugada) ? x.jugada : '',
        })).filter((x) => x.nombre);
        e.planVisible = !!p.planVisible;
        break;
      }
      case 'entrenamiento.eliminar': {
        exigir(esStaff);
        db.entrenamientos = db.entrenamientos.filter((x) => x.id !== p.id);
        break;
      }
      case 'asistencia.guardar': {
        exigir(esStaff);
        const e = db.entrenamientos.find((x) => x.id === p.id);
        if (!e) throw err('Entrenamiento no encontrado');
        const asis = {};
        Object.keys(p.asistencia || {}).forEach((rut) => {
          if (['P', 'A', 'J'].includes(p.asistencia[rut]) && buscarUsuario(db, rut)) asis[rut] = p.asistencia[rut];
        });
        e.asistencia = asis;
        e.asistenciaTomada = true;
        e.asistenciaPor = actor.rut;
        break;
      }

      // ----- Partidos y citaciones -----
      case 'partido.guardar': {
        exigir(esStaff);
        const datos = datosEvento(p, db);
        const rival = texto(p.rival, 80);
        if (!rival) throw err('Indica el rival');
        if (!db.config.categorias.includes(p.categoria)) throw err('Categoría no válida');
        Object.assign(datos, {
          rival, categoria: p.categoria, condicion: p.condicion === 'Visita' ? 'Visita' : 'Local',
          competicion: texto(p.competicion, 80), presentacion: horaValida(p.presentacion) ? (p.presentacion || '') : '',
          notas: texto(p.notas, 300), vestimenta: texto(p.vestimenta, 60),
          indicaciones: p.indicaciones == null ? db.config.indicacionesCitacion : texto(p.indicaciones, 300),
        });
        if (p.id) {
          const m = db.partidos.find((x) => x.id === p.id);
          if (!m) throw err('Partido no encontrado');
          Object.assign(m, datos);
        } else {
          db.partidos.push(Object.assign({ id: uid(), citados: {}, resultado: null }, datos));
        }
        break;
      }
      case 'partido.resultado': {
        exigir(esStaff);
        const m = db.partidos.find((x) => x.id === p.id);
        if (!m) throw err('Partido no encontrado');
        const a = num(p.nuestro, 0, 200), b = num(p.rival, 0, 200);
        m.resultado = a == null || b == null || p.nuestro === '' || p.rival === '' ? null : { nuestro: a, rival: b };
        if (p.comentario != null) m.comentario = texto(p.comentario, 600);
        // Estadísticas: { rut: { g, at, dm, am, ro, az } } sólo de quienes jugaron.
        if (p.estadisticas && typeof p.estadisticas === 'object') {
          const est = {};
          Object.keys(p.estadisticas).slice(0, 40).forEach((rut) => {
            buscarJugador(db, rut);
            const fila = {};
            CAMPOS_ESTADISTICA.forEach(([k, , max]) => { fila[k] = num(p.estadisticas[rut] && p.estadisticas[rut][k], 0, max) || 0; });
            est[rut] = fila;
          });
          m.estadisticas = est;
        }
        break;
      }
      case 'partido.eliminar': {
        exigir(esStaff);
        db.partidos = db.partidos.filter((x) => x.id !== p.id);
        break;
      }
      case 'citacion.guardar': {
        exigir(esStaff);
        const m = db.partidos.find((x) => x.id === p.id);
        if (!m) throw err('Partido no encontrado');
        const nuevos = {};
        (p.ruts || []).forEach((rut) => {
          buscarJugador(db, rut);
          nuevos[rut] = m.citados[rut] || 'pendiente';
        });
        const recien = Object.keys(nuevos).filter((r) => !m.citados[r]);
        m.citados = nuevos;
        if (m.fecha >= hoyISO()) {
          notificar(db, conApoderados(db, recien), 'Convocatoria: ' + m.categoria + ' vs ' + m.rival,
            'Fecha ' + m.fecha.split('-').reverse().slice(0, 2).join('/') + (m.hora ? ' ' + m.hora + ' hrs' : '') + '. Confirma tu asistencia en la app.', 'perfil');
        }
        if (p.cuerpoTecnico && typeof p.cuerpoTecnico === 'object') {
          // Sólo quedan en la convocatoria los cargos con nombre.
          const ct = {};
          CUERPO_TECNICO.forEach(([k]) => { const n = texto(p.cuerpoTecnico[k], 60); if (n) ct[k] = n; });
          m.cuerpoTecnico = ct;
        }
        m.citacionFecha = hoyISO();
        m.citadoPor = actor.rut;
        break;
      }
      case 'citacion.responder': {
        const j = jug();
        const m = db.partidos.find((x) => x.id === p.id);
        if (!m || !m.citados[j.rut]) throw err('No estás citado a este partido');
        m.citados[j.rut] = p.respuesta === 'confirmado' ? 'confirmado' : 'rechazado';
        break;
      }

      // ----- Finanzas (sólo directiva) -----
      case 'config.guardar': {
        exigir(esDir);
        const c = db.config;
        if (Array.isArray(p.categoriasBase)) {
          const bases = Array.from(new Set(p.categoriasBase.map((x) => texto(x, 40)).filter(Boolean)));
          if (!bases.length) throw err('Debe existir al menos una categoría');
          const nuevas = armarCategorias(bases);
          const enUso = db.usuarios.find((u) => u.rol === 'jugador' && u.activo !== false && !nuevas.includes(u.categoria));
          if (enUso) throw err('No puedes quitar "' + baseCategoria(enUso.categoria) + '": tiene jugadores activos');
          c.categoriasBase = bases;
          c.categorias = nuevas;
        }
        if (p.cuotas && typeof p.cuotas === 'object') {
          const cuotas = {};
          c.categoriasBase.forEach((b) => { cuotas[b] = num(p.cuotas[b] != null ? p.cuotas[b] : c.cuotas[b], 0, 10000000) || 0; });
          c.cuotas = cuotas;
        }
        if (p.linkCuota != null) c.linkCuota = link(p.linkCuota);
        if (p.linkFederativo != null) c.linkFederativo = link(p.linkFederativo);
        if (p.datosTransferencia != null) c.datosTransferencia = texto(p.datosTransferencia, 500);
        if (p.medios && typeof p.medios === 'object') {
          c.medios = c.medios || {};
          ['cuota', 'federativo'].forEach((k) => {
            if (p.medios[k]) c.medios[k] = { link: !!p.medios[k].link, transferencia: !!p.medios[k].transferencia };
          });
        }
        if (p.indicacionesCitacion != null) c.indicacionesCitacion = texto(p.indicacionesCitacion, 300);
        if (p.montoFederativo != null) c.montoFederativo = num(p.montoFederativo, 0, 10000000) || 0;
        if (Array.isArray(p.mesesCobro)) c.mesesCobro = p.mesesCobro.map(Number).filter((m) => m >= 0 && m <= 11).sort((a, b) => a - b);
        if (p.diaVencimiento != null) c.diaVencimiento = num(p.diaVencimiento, 1, 28) || 10;
        if (p.recordatorios && typeof p.recordatorios === 'object') {
          const r = p.recordatorios;
          c.recordatorios = { activo: !!r.activo, diasAntes: num(r.diasAntes, 0, 15) == null ? 3 : num(r.diasAntes, 0, 15), atraso: !!r.atraso, push: !!r.push, correo: !!r.correo, whatsapp: !!r.whatsapp };
        }
        break;
      }
      case 'pago.marcar': {
        exigir(esDir);
        const j = buscarJugador(db, p.rut);
        const mes = num(p.mes, 0, 11);
        if (anio == null || mes == null) throw err('Mes no válido');
        db.pagos[j.rut] = db.pagos[j.rut] || {};
        db.pagos[j.rut][anio] = db.pagos[j.rut][anio] || {};
        if (p.pagado) {
          db.pagos[j.rut][anio][mes] = {
            pagado: true, monto: p.monto != null && p.monto !== '' ? num(p.monto, 0) : cuotaDe(db, j),
            fecha: fechaValida(p.fecha) ? p.fecha : hoyISO(), metodo: texto(p.metodo, 40) || 'Transferencia', registradoPor: actor.rut,
          };
        } else {
          delete db.pagos[j.rut][anio][mes];
        }
        break;
      }
      case 'federativo.marcar': {
        exigir(esDir);
        const j = buscarJugador(db, p.rut);
        if (anio == null) throw err('Año no válido');
        db.federativo[j.rut] = db.federativo[j.rut] || {};
        if (p.pagado) {
          db.federativo[j.rut][anio] = { pagado: true, monto: p.monto != null && p.monto !== '' ? num(p.monto, 0) : db.config.montoFederativo, fecha: fechaValida(p.fecha) ? p.fecha : hoyISO() };
        } else {
          delete db.federativo[j.rut][anio];
        }
        break;
      }
      case 'movimiento.crear': {
        exigir(esDir);
        const concepto = texto(p.concepto, 120);
        const monto = num(p.monto, 0);
        if (!concepto || !monto) throw err('Indica concepto y monto');
        db.movimientos.push({ id: uid(), fecha: fechaValida(p.fecha) ? p.fecha : hoyISO(), tipo: p.tipo === 'gasto' ? 'gasto' : 'ingreso', concepto, monto });
        break;
      }
      case 'movimiento.eliminar': {
        exigir(esDir);
        db.movimientos = db.movimientos.filter((x) => x.id !== p.id);
        break;
      }

      // ----- Otros cobros (torneos, indumentaria, viajes...) -----
      case 'cobro.guardar': {
        exigir(esDir);
        const nombre = texto(p.nombre, 80);
        const monto = num(p.monto, 0, 10000000);
        if (!nombre) throw err('Indica el concepto del cobro');
        if (!monto) throw err('Indica el monto');
        if (p.vence && !fechaValida(p.vence)) throw err('Fecha de vencimiento no válida');
        const datos = {
          nombre, monto, link: link(p.link), usarLink: !!p.usarLink, usarTransferencia: !!p.usarTransferencia, vence: p.vence || '',
          categorias: (Array.isArray(p.categorias) ? p.categorias : []).filter((c) => db.config.categorias.includes(c)),
          activo: p.activo == null ? true : !!p.activo,
        };
        if (datos.usarLink && !datos.link) throw err('Agrega el link de pago o desactiva esa opción');
        if (p.id) {
          const c = db.cobros.find((x) => x.id === p.id);
          if (!c) throw err('Cobro no encontrado');
          Object.assign(c, datos);
        } else {
          db.cobros.push(Object.assign({ id: uid(), creado: hoyISO() }, datos));
        }
        break;
      }
      case 'cobro.eliminar': {
        exigir(esDir);
        db.cobros = db.cobros.filter((x) => x.id !== p.id);
        delete db.pagosCobro[p.id];
        break;
      }
      case 'cobro.marcar': {
        exigir(esDir);
        const c = db.cobros.find((x) => x.id === p.id);
        if (!c) throw err('Cobro no encontrado');
        const j = buscarJugador(db, p.rut);
        db.pagosCobro[c.id] = db.pagosCobro[c.id] || {};
        if (p.pagado) db.pagosCobro[c.id][j.rut] = { pagado: true, monto: p.monto != null && p.monto !== '' ? num(p.monto, 0) : c.monto, fecha: fechaValida(p.fecha) ? p.fecha : hoyISO(), metodo: texto(p.metodo, 40) || 'Transferencia' };
        else delete db.pagosCobro[c.id][j.rut];
        break;
      }

      // ----- El jugador informa un pago; la directiva lo aprueba o rechaza -----
      case 'pago.informar': {
        const yoJ = jug();
        const concepto = String(p.concepto || '');
        const anioP = anio || new Date().getFullYear();
        const info = { id: uid(), rut: yoJ.rut, informadoPor: actor.rut, concepto, anio: anioP, mes: null, fecha: fechaValida(p.fecha) ? p.fecha : hoyISO(), estado: 'pendiente', creado: hoyISO() };
        if (concepto === 'cuota') {
          const mes = num(p.mes, 0, 11);
          if (mes == null || !db.config.mesesCobro.includes(mes)) throw err('Elige el mes que pagaste');
          if ((pagoMes(db, yoJ.rut, anioP, mes) || {}).pagado) throw err('Ese mes ya aparece pagado');
          info.mes = mes;
        } else if (concepto === 'federativo') {
          if (federativoPagado(db, yoJ.rut, anioP)) throw err('El federativo ya aparece pagado');
        } else {
          const c = (db.cobros || []).find((x) => x.id === concepto);
          if (!cobroAplica(c, yoJ)) throw err('Concepto no válido');
          if (cobroPagado(db, c.id, yoJ.rut)) throw err('Ese cobro ya aparece pagado');
        }
        if (db.pagosInformados.some((x) => x.rut === yoJ.rut && x.estado === 'pendiente' && x.concepto === concepto && x.mes === info.mes && x.anio === anioP)) {
          throw err('Ya informaste ese pago; la directiva lo está revisando');
        }
        info.monto = num(p.monto, 0, 10000000);
        if (!info.monto) throw err('Indica el monto pagado');
        info.medio = ['Transferencia', 'Link de pago', 'Efectivo'].includes(p.medio) ? p.medio : 'Transferencia';
        info.detalle = texto(p.detalle, 200);
        db.pagosInformados.push(info);
        break;
      }
      case 'pago.revisar': {
        exigir(esDir);
        const info = db.pagosInformados.find((x) => x.id === p.id);
        if (!info) throw err('Pago informado no encontrado');
        if (info.estado !== 'pendiente') throw err('Este pago ya fue revisado');
        if (p.aprobar) {
          const reg = { pagado: true, monto: info.monto, fecha: info.fecha, metodo: info.medio, registradoPor: actor.rut };
          if (info.concepto === 'cuota') {
            db.pagos[info.rut] = db.pagos[info.rut] || {};
            db.pagos[info.rut][info.anio] = db.pagos[info.rut][info.anio] || {};
            db.pagos[info.rut][info.anio][info.mes] = reg;
          } else if (info.concepto === 'federativo') {
            db.federativo[info.rut] = db.federativo[info.rut] || {};
            db.federativo[info.rut][info.anio] = reg;
          } else {
            if (!db.cobros.some((x) => x.id === info.concepto)) throw err('El cobro ya no existe');
            db.pagosCobro[info.concepto] = db.pagosCobro[info.concepto] || {};
            db.pagosCobro[info.concepto][info.rut] = reg;
          }
        }
        Object.assign(info, { estado: p.aprobar ? 'aprobado' : 'rechazado', nota: texto(p.nota, 200), revisadoPor: actor.rut, revisado: hoyISO() });
        notificar(db, conApoderados(db, [info.rut]), p.aprobar ? 'Pago aprobado' : 'Pago rechazado',
          p.aprobar ? 'La directiva registró tu pago de ' + pesos(info.monto) + '.' : 'Revisa el motivo en Finanzas: ' + info.nota, 'finanzas');
        break;
      }

      // ----- Chat con la directiva y con los entrenadores -----
      case 'chat.enviar': {
        if (!puedeVerHilo(db, actor, p.hilo)) throw err('No puedes escribir en esta conversación');
        const t = texto(p.texto, 1000);
        if (!t) throw err('Escribe un mensaje');
        db.mensajes.push({ id: uid(), hilo: p.hilo, de: actor.rut, texto: t, fecha: new Date().toISOString(), leidoPor: [actor.rut] });
        // Aviso a la otra parte: la directiva o los entrenadores, o el jugador y sus apoderados.
        const [tipo, otroRut] = [p.hilo.slice(0, 3), p.hilo.slice(4)];
        const equipo = db.usuarios.filter((u) => u.activo !== false && u.rol === (tipo === 'dir' ? 'directiva' : 'entrenador')).map((u) => u.rut);
        const lado = (tipo === 'dir' ? esDir : rol === 'entrenador') ? conApoderados(db, [otroRut]) : equipo;
        notificar(db, lado.filter((r) => r !== actor.rut), 'Mensaje de ' + actor.nombre, t.slice(0, 120), 'chat');
        break;
      }
      case 'chat.leer': {
        if (!puedeVerHilo(db, actor, p.hilo)) throw err('Conversación no encontrada');
        db.mensajes.forEach((m) => { if (m.hilo === p.hilo && !m.leidoPor.includes(actor.rut)) m.leidoPor.push(actor.rut); });
        break;
      }

      // ----- Jugadas de la pizarra táctica -----
      case 'jugada.guardar': {
        exigir(esStaff);
        const nombre = texto(p.nombre, 80);
        if (!nombre) throw err('Ponle un nombre a la jugada');
        const datos = {
          nombre, descripcion: texto(p.descripcion, 500), cancha: p.cancha === 'completa' ? 'completa' : 'media', pasos: limpiarJugada(p.pasos),
          categorias: (Array.isArray(p.categorias) ? p.categorias : []).filter((c) => db.config.categorias.includes(c)),
        };
        if (p.id) {
          const j = db.jugadas.find((x) => x.id === p.id);
          if (!j) throw err('Jugada no encontrada');
          // Cualquier entrenador puede mejorar una jugada del club; borrarla sólo su autor o la directiva.
          Object.assign(j, datos, { fecha: hoyISO() });
        } else {
          db.jugadas.push(Object.assign({ id: uid(), autor: actor.rut, fecha: hoyISO() }, datos));
        }
        break;
      }
      case 'jugada.eliminar': {
        const j = db.jugadas.find((x) => x.id === p.id);
        if (!j) throw err('Jugada no encontrada');
        exigir(esDir || j.autor === actor.rut);
        db.jugadas = db.jugadas.filter((x) => x.id !== p.id);
        break;
      }

      // ----- Convenios -----
      case 'convenio.guardar': {
        exigir(esDir);
        const empresa = texto(p.empresa, 80);
        if (!empresa) throw err('Indica la empresa o institución');
        const datos = { empresa, beneficio: texto(p.beneficio, 120), detalle: texto(p.detalle, 400), contacto: texto(p.contacto, 120) };
        if (p.id) {
          const c = db.convenios.find((x) => x.id === p.id);
          if (!c) throw err('Convenio no encontrado');
          Object.assign(c, datos);
        } else {
          db.convenios.push(Object.assign({ id: uid(), estado: 'publicado', creado: hoyISO() }, datos));
        }
        break;
      }
      // Jugadores y entrenadores proponen; sólo se publica cuando la directiva lo aprueba.
      case 'convenio.proponer': {
        exigir(!esDir);
        const empresa = texto(p.empresa, 80);
        if (!empresa) throw err('Indica la empresa o institución');
        const abiertas = db.convenios.filter((x) => x.propuestoPor === actor.rut && x.estado === 'propuesto').length;
        if (abiertas >= 5) throw err('Ya tienes 5 propuestas esperando revisión');
        db.convenios.push({
          id: uid(), estado: 'propuesto', propuestoPor: actor.rut, creado: hoyISO(),
          empresa, beneficio: texto(p.beneficio, 120), detalle: texto(p.detalle, 400), contacto: texto(p.contacto, 120),
        });
        break;
      }
      case 'convenio.revisar': {
        exigir(esDir);
        const c = db.convenios.find((x) => x.id === p.id);
        if (!c) throw err('Convenio no encontrado');
        if (c.estado !== 'propuesto') throw err('Esta propuesta ya fue revisada');
        Object.assign(c, { estado: p.aprobar ? 'publicado' : 'rechazado', nota: texto(p.nota, 200), revisadoPor: actor.rut, revisado: hoyISO() });
        break;
      }
      case 'convenio.eliminar': {
        const c = db.convenios.find((x) => x.id === p.id);
        if (!c) throw err('Convenio no encontrado');
        // Quien propuso puede retirar su propuesta mientras no esté publicada.
        exigir(esDir || (c.propuestoPor === actor.rut && c.estado !== 'publicado'));
        db.convenios = db.convenios.filter((x) => x.id !== p.id);
        break;
      }

      // ----- Avisos (para todo el club) -----
      case 'aviso.guardar': {
        exigir(esStaff);
        const titulo = texto(p.titulo, 100);
        if (!titulo) throw err('Indica un título');
        if (p.categoria && !db.config.categorias.includes(p.categoria)) throw err('Categoría no válida');
        if (p.fechaEvento && !fechaValida(p.fechaEvento)) throw err('Fecha no válida');
        if (!horaValida(p.hora)) throw err('Hora no válida');
        const datos = {
          titulo, texto: texto(p.texto, 1000), categoria: p.categoria || '', fechaEvento: p.fechaEvento || '',
          hora: p.hora || '', lugar: texto(p.lugar, 100), link: link(p.link), fijado: esDir && !!p.fijado,
        };
        db.avisos = db.avisos || [];
        if (p.id) {
          const a = db.avisos.find((x) => x.id === p.id);
          if (!a) throw err('Aviso no encontrado');
          exigir(esDir || a.autor === actor.rut);
          if (!esDir) datos.fijado = a.fijado;
          Object.assign(a, datos);
        } else {
          db.avisos.push(Object.assign({ id: uid(), fecha: hoyISO(), autor: actor.rut }, datos));
          notificar(db, conApoderados(db, jugadoresDeCategoria(db, datos.categoria)), 'Aviso: ' + titulo, datos.texto.slice(0, 120), 'avisos');
        }
        break;
      }
      case 'aviso.eliminar': {
        const a = (db.avisos || []).find((x) => x.id === p.id);
        if (!a) throw err('Aviso no encontrado');
        exigir(esDir || a.autor === actor.rut);
        db.avisos = db.avisos.filter((x) => x.id !== p.id);
        break;
      }

      // ----- Documentos para firmar -----
      case 'documento.guardar': {
        exigir(esDir);
        const titulo = texto(p.titulo, 120), cuerpo = texto(p.texto, 5000);
        if (!titulo || !cuerpo) throw err('Indica título y texto del documento');
        const puntos = (Array.isArray(p.puntos) ? p.puntos : String(p.puntos || '').split('\n')).map((x) => texto(x, 200)).filter(Boolean);
        if (p.id) {
          const d = db.documentos.find((x) => x.id === p.id);
          if (!d) throw err('Documento no encontrado');
          Object.assign(d, { titulo, texto: cuerpo, puntos });
          // Con "pedir nueva firma" todos los destinatarios deben volver a firmar.
          if (p.nuevaVersion) { d.version += 1; d.creado = hoyISO(); }
          if (d.id !== 'consentimiento' && Array.isArray(p.destinatarios)) d.destinatarios = p.destinatarios.filter((r) => buscarUsuario(db, r));
        } else {
          const dest = (Array.isArray(p.destinatarios) ? p.destinatarios : []).filter((r) => { const u = buscarUsuario(db, r); return u && u.rol === 'jugador'; });
          if (!dest.length) throw err('Elige al menos un jugador');
          db.documentos.push({ id: uid(), titulo, texto: cuerpo, puntos, destinatarios: dest, version: 1, creado: hoyISO() });
        }
        break;
      }
      case 'documento.eliminar': {
        exigir(esDir);
        if (p.id === 'consentimiento') throw err('El consentimiento informado no se puede eliminar');
        db.documentos = db.documentos.filter((x) => x.id !== p.id);
        break;
      }
      case 'documento.firmar': {
        const j = jug();
        const d = (db.documentos || []).find((x) => x.id === p.id);
        if (!d || !documentoAplica(d, j.rut)) throw err('Documento no encontrado');
        if (firmaDe(db, j.rut, d)) throw err('Este documento ya está firmado');
        // Los menores no firman: lo hace su apoderado desde su cuenta. Los mayores firman ellos mismos.
        if (esMenor(j) && rol !== 'apoderado') throw err('Eres menor de edad: tu apoderado firma por ti desde su cuenta');
        if (!esMenor(j) && rol === 'apoderado') throw err(j.nombre.split(/\s+/)[0] + ' es mayor de edad: firma desde su propia cuenta');
        const aceptados = Array.isArray(p.aceptados) ? p.aceptados.map(Number) : [];
        if (d.puntos.some((_, i) => !aceptados.includes(i))) throw err('Debes aceptar todos los puntos para firmar');
        const nombreFirma = texto(p.nombreFirma, 80);
        if (nombreFirma.length < 5) throw err('Escribe tu nombre completo como firma');
        db.firmas.push({
          id: uid(), rut: j.rut, documentoId: d.id, version: d.version, fecha: hoyISO(), nombreFirma,
          apoderado: rol === 'apoderado' ? actor.nombre + ' (' + formatearRut(actor.rut) + ')' : '', apoderadoRut: rol === 'apoderado' ? actor.rut : '',
        });
        break;
      }

      // ----- Evaluación física -----
      // registros = [{ rut, valores: { t5105, salto, flex, sent, altura, peso } }]; una evaluación por jugador y fecha.
      case 'evaluacion.guardar': {
        exigir(esStaff);
        if (!fechaValida(p.fecha)) throw err('Fecha no válida');
        let n = 0;
        (Array.isArray(p.registros) ? p.registros : []).slice(0, 80).forEach((r) => {
          const j = buscarJugador(db, r && r.rut);
          const valores = {};
          TESTS_FISICOS.forEach(([k, nombre, , , min, max]) => {
            const v = r.valores && r.valores[k];
            if (v === '' || v == null) return;
            const x = Number(String(v).replace(',', '.'));
            if (!Number.isFinite(x) || x < min || x > max) throw err(nombre + ' de ' + j.nombre + ': valor fuera de rango (' + min + ' a ' + max + ')');
            valores[k] = Math.round(x * 100) / 100;
          });
          if (!Object.keys(valores).length) return;
          const prev = db.evaluaciones.find((e) => e.rut === j.rut && e.fecha === p.fecha);
          if (prev) Object.assign(prev, { valores, autor: actor.rut });
          else db.evaluaciones.push({ id: uid(), rut: j.rut, fecha: p.fecha, autor: actor.rut, valores });
          n++;
        });
        if (!n) throw err('Ingresa al menos un resultado');
        break;
      }
      case 'evaluacion.eliminar': {
        exigir(esStaff);
        db.evaluaciones = db.evaluaciones.filter((e) => e.id !== p.id);
        break;
      }

      // ----- Inventario: material del club y a quién se le entregó -----
      case 'inventario.guardar': {
        exigir(esStaff);
        const nombre = texto(p.nombre, 80);
        if (!nombre) throw err('Indica el nombre del material');
        const total = num(p.total, 0, 10000);
        if (total == null) throw err('Indica la cantidad');
        const datos = { nombre, tipo: texto(p.tipo, 40) || 'Otros', total, notas: texto(p.notas, 200) };
        if (p.id) {
          const it = db.inventario.find((x) => x.id === p.id);
          if (!it) throw err('Material no encontrado');
          const prestado = db.prestamos.filter((x) => x.itemId === it.id && !x.devuelto).reduce((s, x) => s + x.cantidad, 0);
          if (total < prestado) throw err('Hay ' + prestado + ' entregados: el total no puede ser menor');
          Object.assign(it, datos);
        } else {
          db.inventario.push(Object.assign({ id: uid() }, datos));
        }
        break;
      }
      case 'inventario.eliminar': {
        exigir(esStaff);
        if (db.prestamos.some((x) => x.itemId === p.id && !x.devuelto)) throw err('Primero registra la devolución del material entregado');
        db.inventario = db.inventario.filter((x) => x.id !== p.id);
        db.prestamos = db.prestamos.filter((x) => x.itemId !== p.id);
        break;
      }
      case 'prestamo.crear': {
        exigir(esStaff);
        const it = db.inventario.find((x) => x.id === p.itemId);
        if (!it) throw err('Material no encontrado');
        const u = buscarUsuario(db, p.rut);
        if (!u || u.rol === 'apoderado') throw err('Elige a quién se entrega');
        const cantidad = num(p.cantidad, 1, 10000) || 1;
        const prestado = db.prestamos.filter((x) => x.itemId === it.id && !x.devuelto).reduce((s, x) => s + x.cantidad, 0);
        if (prestado + cantidad > it.total) throw err('Sólo quedan ' + (it.total - prestado) + ' disponibles');
        db.prestamos.push({ id: uid(), itemId: it.id, rut: u.rut, cantidad, fecha: fechaValida(p.fecha) ? p.fecha : hoyISO(), nota: texto(p.nota, 120), por: actor.rut, devuelto: null });
        break;
      }
      case 'prestamo.devolver': {
        exigir(esStaff);
        const x = db.prestamos.find((y) => y.id === p.id);
        if (!x) throw err('Entrega no encontrada');
        x.devuelto = hoyISO();
        x.recibio = actor.rut;
        break;
      }

      // ----- Encuestas -----
      case 'encuesta.guardar': {
        exigir(esStaff);
        const pregunta = texto(p.pregunta, 160);
        if (!pregunta) throw err('Escribe la pregunta');
        const opciones = (Array.isArray(p.opciones) ? p.opciones : String(p.opciones || '').split('\n')).map((x) => texto(x, 80)).filter(Boolean).slice(0, 8);
        if (opciones.length < 2) throw err('Agrega al menos 2 opciones');
        if (p.categoria && !db.config.categorias.includes(p.categoria)) throw err('Categoría no válida');
        if (p.cierre && !fechaValida(p.cierre)) throw err('Fecha de cierre no válida');
        db.encuestas.push({ id: uid(), pregunta, opciones, categoria: p.categoria || '', cierre: p.cierre || '', autor: actor.rut, fecha: hoyISO(), cerrada: false, votos: {} });
        notificar(db, conApoderados(db, jugadoresDeCategoria(db, p.categoria)), 'Nueva encuesta', pregunta, 'encuestas');
        break;
      }
      case 'encuesta.votar': {
        const j = jug();
        const e = db.encuestas.find((x) => x.id === p.id);
        if (!e || (e.categoria && e.categoria !== j.categoria)) throw err('Encuesta no encontrada');
        if (encuestaCerrada(e)) throw err('La encuesta ya cerró');
        const o = num(p.opcion, 0, e.opciones.length - 1);
        if (o == null || String(p.opcion) === '') throw err('Elige una opción');
        e.votos[j.rut] = o;
        break;
      }
      case 'encuesta.cerrar':
      case 'encuesta.eliminar': {
        const e = db.encuestas.find((x) => x.id === p.id);
        if (!e) throw err('Encuesta no encontrada');
        exigir(esDir || e.autor === actor.rut);
        if (action.type === 'encuesta.cerrar') e.cerrada = true;
        else db.encuestas = db.encuestas.filter((x) => x.id !== p.id);
        break;
      }

      // ----- Galería: sólo los entrenadores suben fotos, máximo 3 por álbum -----
      case 'galeria.guardar': {
        exigir(rol === 'entrenador');
        const titulo = texto(p.titulo, 80);
        if (!titulo) throw err('Ponle un título al álbum');
        if (!fechaValida(p.fecha)) throw err('Fecha no válida');
        if (p.categoria && !db.config.categorias.includes(p.categoria)) throw err('Categoría no válida');
        const fotos = Array.isArray(p.fotos) ? p.fotos : [];
        let al = p.id && db.galeria.find((x) => x.id === p.id);
        if (p.id && !al) throw err('Álbum no encontrado');
        if (al) exigir(al.autor === actor.rut);
        const ya = al ? al.fotos.length : 0;
        if (ya + fotos.length > MAX_FOTOS_ALBUM) throw err('Máximo ' + MAX_FOTOS_ALBUM + ' fotos por álbum');
        if (!ya && !fotos.length) throw err('Agrega al menos una foto');
        const partido = p.partidoId ? db.partidos.find((m) => m.id === p.partidoId) : null;
        const datos = { titulo, fecha: p.fecha, categoria: p.categoria || (partido ? partido.categoria : ''), partidoId: partido ? partido.id : '', tipo: ['plantel', 'partido', 'evento'].includes(p.tipo) ? p.tipo : 'partido' };
        const ids = fotos.map((f) => guardarImagen(db, f, 450));
        if (al) { Object.assign(al, datos); al.fotos = al.fotos.concat(ids); } else {
          al = Object.assign({ id: uid(), autor: actor.rut, creado: hoyISO(), fotos: ids }, datos);
          db.galeria.push(al);
          notificar(db, conApoderados(db, jugadoresDeCategoria(db, al.categoria)), 'Fotos nuevas', titulo, 'galeria');
        }
        break;
      }
      case 'galeria.quitarFoto': {
        const al = db.galeria.find((x) => x.id === p.id);
        if (!al) throw err('Álbum no encontrado');
        exigir(esDir || al.autor === actor.rut);
        if (!al.fotos.includes(p.foto)) throw err('Foto no encontrada');
        al.fotos = al.fotos.filter((f) => f !== p.foto);
        quitarImagen(db, p.foto);
        if (!al.fotos.length) db.galeria = db.galeria.filter((x) => x.id !== al.id);
        break;
      }
      case 'galeria.eliminar': {
        const al = db.galeria.find((x) => x.id === p.id);
        if (!al) throw err('Álbum no encontrado');
        exigir(esDir || al.autor === actor.rut);
        al.fotos.forEach((f) => quitarImagen(db, f));
        db.galeria = db.galeria.filter((x) => x.id !== p.id);
        break;
      }

      default:
        throw err('Acción desconocida');
    }
    return db;
  }

  // ---------- Autenticación ----------

  async function hashClave(rut, clave, sha256) {
    return sha256(textoHash(rut, clave));
  }

  async function verificarClave(usuario, clave, sha256) {
    if (!usuario || usuario.activo === false) return false;
    if (!usuario.claveHash) return ['jugador', 'apoderado'].includes(usuario.rol) && String(clave) === claveInicial(usuario.rut);
    return (await hashClave(usuario.rut, String(clave), sha256)) === usuario.claveHash;
  }

  async function cambiarClave(db, rut, actual, nueva, sha256) {
    const u = buscarUsuario(db, rut);
    if (!(await verificarClave(u, actual, sha256))) throw err('La clave actual no es correcta');
    if (!/^\S{4,40}$/.test(String(nueva || ''))) throw err('La nueva clave debe tener al menos 4 caracteres, sin espacios');
    u.claveHash = await hashClave(rut, String(nueva), sha256);
  }

  /*
   * Las acciones que definen una clave llegan con la clave en texto (payload.clave).
   * Aquí se reemplaza por su hash antes de applyAction; nunca se acepta un hash enviado desde fuera.
   */
  async function prepararAccion(action, sha256) {
    const p = Object.assign({}, (action && action.payload) || {});
    delete p.claveHash;
    if (action && (action.type === 'staff.crear' || action.type === 'clave.definir') && p.clave != null) {
      if (!/^\S{4,40}$/.test(String(p.clave))) throw err('La clave debe tener al menos 4 caracteres, sin espacios');
      const id = action.type === 'staff.crear' ? 'usr:' + normalizarUsuario(p.usuario) : p.rut;
      p.claveHash = await hashClave(id, String(p.clave), sha256);
    }
    delete p.clave;
    return { type: action && action.type, payload: p };
  }

  // ---------- Vista por rol ----------

  /*
   * Devuelve sólo lo que el usuario puede ver.
   * - directiva: todo.
   * - entrenador: todo menos finanzas detalladas (sí ve el federativo para saber quién está habilitado).
   * - jugador: sus propios datos, los eventos de su categoría y los convenios.
   */
  const convenioPublicado = (c) => !c.estado || c.estado === 'publicado';
  const encuestaCerrada = (e) => !!(e.cerrada || (e.cierre && e.cierre < hoyISO()));

  // Para jugadores y apoderados: el conteo sin decir quién votó qué.
  function resultadoEncuesta(e, rut) {
    const conteo = e.opciones.map(() => 0);
    Object.values(e.votos || {}).forEach((o) => { if (conteo[o] != null) conteo[o]++; });
    const r = Object.assign({}, e, { conteo, total: Object.keys(e.votos || {}).length, miVoto: rut && e.votos && e.votos[rut] != null ? e.votos[rut] : null, cerrada: encuestaCerrada(e) });
    delete r.votos;
    return r;
  }

  function viewFor(db, rut) {
    const yo = buscarUsuario(db, rut);
    if (!yo || yo.activo === false) return null;
    if (yo.rol === 'jugador') return vistaJugador(db, yo, null);
    if (yo.rol === 'apoderado') {
      // El apoderado recibe la vista de cada hijo o hija; la app muestra una a la vez.
      const hijos = (yo.hijos || []).map((r) => buscarUsuario(db, r)).filter((u) => u && u.rol === 'jugador' && u.activo !== false);
      return { yo: rut, apoderado: { rut, nombre: yo.nombre, telefono: yo.telefono || '', email: yo.email || '', claveInicial: !yo.claveHash }, hijos: hijos.map((h) => vistaJugador(db, h, yo)) };
    }
    const v = clone(db);
    ['fotos', 'fotosBorradas', 'notificar', 'recordatoriosEnviados'].forEach((k) => delete v[k]);
    v.usuarios.forEach((u) => { u.claveInicial = !u.claveHash; delete u.claveHash; });
    v.yo = rut;
    // Cada uno ve sólo las conversaciones en que participa.
    v.mensajes = (v.mensajes || []).filter((m) => puedeVerHilo(db, yo, m.hilo));
    v.encuestas = (v.encuestas || []).map((e) => Object.assign(resultadoEncuesta(e, null), { habilitados: jugadoresDeCategoria(db, e.categoria).length }));
    if (yo.rol === 'directiva') {
      // La ficha médica es sólo para el cuerpo técnico.
      v.usuarios.forEach((u) => { delete u.medica; });
      return v;
    }
    v.convenios = v.convenios.filter((c) => convenioPublicado(c) || c.propuestoPor === rut);
    delete v.movimientos;
    delete v.cambiosTemporada;
    delete v.recordatoriosLog;
    v.pagos = {};
    v.cobros = [];
    v.pagosCobro = {};
    v.pagosInformados = [];
    return v;
  }

  // Vista de un jugador. Si la pide su apoderado, "apo" es el apoderado.
  function vistaJugador(db, yo, apo) {
    const rut = yo.rut;
    const v = clone(db);
    ['fotos', 'fotosBorradas', 'notificar', 'recordatoriosEnviados', 'cambiosTemporada', 'inventario', 'prestamos', 'evaluaciones', 'recordatoriosLog'].forEach((k) => delete v[k]);
    v.yo = rut;
    v.yoReal = apo ? apo.rut : rut;
    v.mensajes = (v.mensajes || []).filter((m) => puedeVerHilo(db, yo, m.hilo));
    v.convenios = v.convenios.filter((c) => convenioPublicado(c) || c.propuestoPor === v.yoReal);
    const anio = new Date().getFullYear();
    const yoV = clone(yo);
    yoV.claveInicial = !yo.claveHash;
    delete yoV.claveHash;
    const nombreDe = (r) => { const u = buscarUsuario(db, r); return u ? { nombre: u.nombre, numero: u.numero } : { nombre: '?', numero: null }; };
    const porNumero = (a, b) => (a.numero == null ? 999 : a.numero) - (b.numero == null ? 999 : b.numero) || a.nombre.localeCompare(b.nombre);
    const visible = (u) => ({ rut: u.rut, nombre: u.nombre, rol: u.rol, cargo: u.cargo, telefono: u.telefono, jugadorRut: u.jugadorRut === rut ? rut : '' });
    v.usuarios = [yoV].concat(db.usuarios.filter((u) => u.rol !== 'jugador' && u.rol !== 'apoderado' && u.activo !== false).map(visible),
      apoderadosDe(db, rut).map((a) => ({ rut: a.rut, nombre: a.nombre, rol: 'apoderado', telefono: a.telefono || '', email: a.email || '' })));
    v.pagos = { [rut]: db.pagos[rut] || {} };
    v.federativo = { [rut]: db.federativo[rut] || {} };
    v.lesiones = v.lesiones.filter((l) => l.rut === rut);
    v.documentos = v.documentos.filter((d) => documentoAplica(d, rut));
    v.firmas = v.firmas.filter((f) => f.rut === rut);
    delete v.movimientos;
    v.cobros = (v.cobros || []).filter((c) => cobroAplica(c, yo));
    const misCobros = {};
    v.cobros.forEach((c) => { misCobros[c.id] = (db.pagosCobro[c.id] && db.pagosCobro[c.id][rut]) ? { [rut]: db.pagosCobro[c.id][rut] } : {}; });
    v.pagosCobro = misCobros;
    v.pagosInformados = (v.pagosInformados || []).filter((x) => x.rut === rut);
    v.jugadas = (v.jugadas || []).filter((j) => (j.categorias || []).includes(yo.categoria));
    const jugadasVisibles = new Set(v.jugadas.map((j) => j.id));
    v.entrenamientos = entrenamientosDeCategoria(v, yo.categoria).map((e) => {
      const r = Object.assign({}, e, { miAsistencia: (e.asistencia || {})[rut] || null });
      delete r.asistencia;
      // El plan de la sesión se muestra sólo si el entrenador lo dejó visible.
      if (!e.planVisible) delete r.plan;
      else r.plan = (e.plan || []).map((x) => Object.assign({}, x, { jugada: jugadasVisibles.has(x.jugada) ? x.jugada : '' }));
      return r;
    });
    v.partidos = v.partidos.filter((m) => m.categoria === yo.categoria || m.citados[rut]).map((m) => {
      const r = Object.assign({}, m, {
        miCitacion: m.citados[rut] || null,
        citadosLista: Object.keys(m.citados).map(nombreDe).sort(porNumero),
        miEstadistica: (m.estadisticas || {})[rut] || null,
      });
      delete r.citados;
      delete r.estadisticas;
      delete r.notas;
      return r;
    });
    v.goleadores = tablaGoleadores(db, yo.categoria, anio).map((x) => ({ nombre: x.nombre, numero: x.numero, pj: x.pj, g: x.g, at: x.at, dm: x.dm, am: x.am, ro: x.ro, az: x.az, esYo: x.rut === rut }));
    v.misEstadisticas = estadisticasJugador(db, rut, anio);
    v.evaluaciones = (db.evaluaciones || []).filter((e) => e.rut === rut);
    v.miMaterial = (db.prestamos || []).filter((x) => x.rut === rut && !x.devuelto).map((x) => {
      const it = (db.inventario || []).find((i) => i.id === x.itemId) || { nombre: '?' };
      return { nombre: it.nombre, cantidad: x.cantidad, fecha: x.fecha, nota: x.nota };
    });
    v.encuestas = (db.encuestas || []).filter((e) => !e.categoria || e.categoria === yo.categoria).map((e) => resultadoEncuesta(e, rut));
    v.galeria = (v.galeria || []).filter((a) => !a.categoria || a.categoria === yo.categoria);
    v.cumpleanos = cumpleanosDelMes(db, new Date().getMonth(), anio, yo.categoria).map((c) => ({ nombre: c.nombre, dia: c.dia, cumple: c.cumple, esYo: c.rut === rut }));
    v.resumen = { asistencia: resumenAsistencia(db, yo, anio), cuota: cuotaDe(db, yo) };
    v.pendientes = documentosPendientes(db, rut).map((d) => d.id);
    v.menor = esMenor(yo);
    return v;
  }

  return {
    MESES, ROLES, POSICIONES,
    limpiarRut, dvRut, normalizarRut, formatearRut, claveInicial, rutDesdeCuerpo,
    normalizarUsuario, idDeIngreso, textoHash, CUENTA_DIRECTIVA, convenioPublicado,
    hoyISO, sumarDias, edad, uid, clone,
    CATEGORIAS_BASE, RAMAS, CON_ANIO, armarCategorias, baseCategoria, ramaCategoria, llevaAnio, etiquetaCategoria,
    COMPROMISO_BECA, documentoAplica, firmaDe, documentosPendientes,
    cobroAplica, cobroPagado, mediosDe, puedeVerHilo, CUERPO_TECNICO, limpiarJugada, formacionInicial,
    cuotaDe, federativoPagado, habilitado, pagoMes, mesesAdeudados, resumenAsistencia, entrenamientosDeCategoria,
    dbVacia, dbEjemplo, migrar, applyAction, viewFor,
    hashClave, verificarClave, cambiarClave, prepararAccion,
    MESES_LARGOS, esMenor, apoderadosDe, siguienteCategoria, cambioTemporada,
    CAMPOS_ESTADISTICA, tablaGoleadores, estadisticasJugador, TESTS_FISICOS, cumpleanosDelMes,
    reporteMensual, recordatoriosPendientes, marcarRecordatorio, crearXlsx, crc32, encuestaCerrada, MAX_FOTOS_ALBUM, pesos,
  };
});
