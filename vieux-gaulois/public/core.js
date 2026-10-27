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
  const ROLES = ['directiva', 'entrenador', 'jugador'];
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

  // Completa una base guardada con una versión anterior de la app (sin borrar datos).
  function migrar(db) {
    const base = dbVacia();
    if (db.version >= base.version) return db;
    ['avisos', 'firmas', 'movimientos', 'convenios'].forEach((k) => { db[k] = db[k] || []; });
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
      version: 3,
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
        indicacionesCitacion: 'Llevar carnet, calcetas negras, short negro, botella de agua y toalla de mano.',
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
    const jugadores = [
      add(20123456, { nombre: 'Tomás Rojas', rol: 'jugador', fechaNac: '2001-04-12', categoria: PE, numero: 7, posicion: 'Central', telefono: '+56 9 3333 3333' }),
      add(19876543, { nombre: 'Diego Muñoz', rol: 'jugador', fechaNac: '1998-09-03', categoria: PE, numero: 1, posicion: 'Arquero' }),
      add(21345678, { nombre: 'Benjamín Soto', rol: 'jugador', fechaNac: '2003-01-25', categoria: 'Adultos B Masculino', numero: 10, posicion: 'Lateral izquierdo' }),
      add(18765432, { nombre: 'Camila Fuentes', rol: 'jugador', fechaNac: '1996-11-30', categoria: 'Primer Equipo Femenino', numero: 9, posicion: 'Pivote' }),
      add(20555666, { nombre: 'Valentina Araya', rol: 'jugador', fechaNac: '2000-06-18', categoria: 'Primer Equipo Femenino', numero: 14, posicion: 'Extremo derecho', descuento: 50 }),
      add(23456789, { nombre: 'Matías Contreras', rol: 'jugador', fechaNac: '2008-03-08', categoria: 'Juvenil Masculino', anioCategoria: '2', numero: 5, posicion: 'Extremo izquierdo' }),
      add(24567890, { nombre: 'Germán Meinas', rol: 'jugador', fechaNac: '2010-02-11', categoria: CAD, anioCategoria: '2', numero: 1, posicion: 'Arquero' }),
      add(24678901, { nombre: 'Renato Flores', rol: 'jugador', fechaNac: '2010-07-21', categoria: CAD, anioCategoria: '2', numero: 4, posicion: 'Central' }),
      add(24789012, { nombre: 'Agustín Contreras', rol: 'jugador', fechaNac: '2011-03-02', categoria: CAD, anioCategoria: '1', numero: 8, posicion: 'Pivote' }),
      add(24890123, { nombre: 'Benjamín Aguayo', rol: 'jugador', fechaNac: '2011-09-15', categoria: CAD, anioCategoria: '1', numero: 11, posicion: 'Extremo derecho' }),
      add(24901234, { nombre: 'Sofía Herrera', rol: 'jugador', fechaNac: '2012-05-30', categoria: 'Infantil Femenino', anioCategoria: '1', numero: 6, posicion: 'Lateral derecho' }),
    ];

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
      // Todos firmaron el consentimiento menos Tomás, para ver la firma al ingresar.
      if (i !== 0) {
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
      { id: uid(), empresa: 'Gimnasio Fuerza Total', beneficio: 'Matrícula gratis y 10% mensual', detalle: 'Válido para jugadores con cuotas al día.' }
    );

    db.movimientos.push(
      { id: uid(), fecha: hoyISO(new Date(anio, 2, 1)), tipo: 'gasto', concepto: 'Arriendo gimnasio marzo', monto: 180000 },
      { id: uid(), fecha: hoyISO(new Date(anio, 3, 10)), tipo: 'ingreso', concepto: 'Auspicio Ferretería Central', monto: 300000 },
      { id: uid(), fecha: hoyISO(new Date(anio, 4, 2)), tipo: 'gasto', concepto: 'Balones y conos', monto: 95000 }
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
      contactoEmergencia: texto(p.contactoEmergencia, 120),
      prevision: texto(p.prevision, 60),
    });
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

    // El jugador debe firmar el consentimiento antes de usar la app.
    if (rol === 'jugador' && action && action.type !== 'documento.firmar'
      && documentosPendientes(db, actor.rut).some((d) => d.id === 'consentimiento')) {
      throw err('Primero debes firmar el consentimiento informado');
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
        break;
      }
      case 'jugador.editar': {
        const j = buscarJugador(db, p.rut);
        if (esStaff) {
          datosJugador(db, Object.assign({}, j, p), j);
          if (esDir && p.descuento != null) j.descuento = num(p.descuento, 0, 100) || 0;
        } else {
          exigir(actor.rut === j.rut);
          // El jugador sólo puede editar sus datos de contacto.
          j.telefono = texto(p.telefono, 30);
          j.email = texto(p.email, 80);
          j.contactoEmergencia = texto(p.contactoEmergencia, 120);
          j.prevision = texto(p.prevision, 60);
        }
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
        // Sólo jugadores: su clave vuelve a ser los 4 primeros dígitos del RUT.
        const u = buscarJugador(db, p.rut);
        delete u.claveHash;
        break;
      }

      // ----- Lesiones y molestias -----
      case 'lesion.crear': {
        const rut = rol === 'jugador' ? actor.rut : p.rut;
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
        exigir(esStaff || l.rut === actor.rut);
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
        m.citados = nuevos;
        m.citacionFecha = hoyISO();
        m.citadoPor = actor.rut;
        break;
      }
      case 'citacion.responder': {
        exigir(rol === 'jugador');
        const m = db.partidos.find((x) => x.id === p.id);
        if (!m || !m.citados[actor.rut]) throw err('No estás citado a este partido');
        m.citados[actor.rut] = p.respuesta === 'confirmado' ? 'confirmado' : 'rechazado';
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
        if (p.indicacionesCitacion != null) c.indicacionesCitacion = texto(p.indicacionesCitacion, 300);
        if (p.montoFederativo != null) c.montoFederativo = num(p.montoFederativo, 0, 10000000) || 0;
        if (Array.isArray(p.mesesCobro)) c.mesesCobro = p.mesesCobro.map(Number).filter((m) => m >= 0 && m <= 11).sort((a, b) => a - b);
        if (p.diaVencimiento != null) c.diaVencimiento = num(p.diaVencimiento, 1, 28) || 10;
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

      // ----- Convenios -----
      case 'convenio.guardar': {
        exigir(esDir);
        const empresa = texto(p.empresa, 80);
        if (!empresa) throw err('Indica la empresa o institución');
        const datos = { empresa, beneficio: texto(p.beneficio, 120), detalle: texto(p.detalle, 400) };
        if (p.id) {
          const c = db.convenios.find((x) => x.id === p.id);
          if (!c) throw err('Convenio no encontrado');
          Object.assign(c, datos);
        } else {
          db.convenios.push(Object.assign({ id: uid() }, datos));
        }
        break;
      }
      case 'convenio.eliminar': {
        exigir(esDir);
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
        exigir(rol === 'jugador');
        const d = (db.documentos || []).find((x) => x.id === p.id);
        if (!d || !documentoAplica(d, actor.rut)) throw err('Documento no encontrado');
        if (firmaDe(db, actor.rut, d)) throw err('Ya firmaste este documento');
        const aceptados = Array.isArray(p.aceptados) ? p.aceptados.map(Number) : [];
        if (d.puntos.some((_, i) => !aceptados.includes(i))) throw err('Debes aceptar todos los puntos para firmar');
        const nombreFirma = texto(p.nombreFirma, 80);
        if (nombreFirma.length < 5) throw err('Escribe tu nombre completo como firma');
        const menor = actor.fechaNac && edad(actor.fechaNac) < 18;
        const apoderado = texto(p.apoderado, 120);
        if (menor && apoderado.length < 5) throw err('Eres menor de edad: tu apoderado debe firmar con su nombre y RUT');
        db.firmas.push({ id: uid(), rut: actor.rut, documentoId: d.id, version: d.version, fecha: hoyISO(), nombreFirma, apoderado });
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
    if (!usuario.claveHash) return usuario.rol === 'jugador' && String(clave) === claveInicial(usuario.rut);
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
  function viewFor(db, rut) {
    const yo = buscarUsuario(db, rut);
    if (!yo || yo.activo === false) return null;
    const v = clone(db);
    v.usuarios.forEach((u) => { u.claveInicial = !u.claveHash; delete u.claveHash; });
    v.yo = rut;
    if (yo.rol === 'directiva') return v;

    if (yo.rol === 'entrenador') {
      delete v.movimientos;
      v.pagos = {};
      return v;
    }

    const anio = new Date().getFullYear();
    const yoV = v.usuarios.find((u) => u.rut === rut);
    const nombreDe = (r) => { const u = buscarUsuario(db, r); return u ? { nombre: u.nombre, numero: u.numero } : { nombre: '?', numero: null }; };
    const porNumero = (a, b) => (a.numero == null ? 999 : a.numero) - (b.numero == null ? 999 : b.numero) || a.nombre.localeCompare(b.nombre);
    v.usuarios = [yoV].concat(v.usuarios.filter((u) => u.rol !== 'jugador' && u.activo !== false)
      .map((u) => ({ rut: u.rut, nombre: u.nombre, rol: u.rol, cargo: u.cargo, telefono: u.telefono, jugadorRut: u.jugadorRut === rut ? rut : '' })));
    v.pagos = { [rut]: db.pagos[rut] || {} };
    v.federativo = { [rut]: db.federativo[rut] || {} };
    v.lesiones = v.lesiones.filter((l) => l.rut === rut);
    v.documentos = v.documentos.filter((d) => documentoAplica(d, rut));
    v.firmas = v.firmas.filter((f) => f.rut === rut);
    delete v.movimientos;
    v.entrenamientos = entrenamientosDeCategoria(v, yo.categoria).map((e) => {
      const r = Object.assign({}, e, { miAsistencia: (e.asistencia || {})[rut] || null });
      delete r.asistencia;
      return r;
    });
    v.partidos = v.partidos.filter((m) => m.categoria === yo.categoria || m.citados[rut]).map((m) => {
      const r = Object.assign({}, m, {
        miCitacion: m.citados[rut] || null,
        citadosLista: Object.keys(m.citados).map(nombreDe).sort(porNumero),
      });
      delete r.citados;
      return r;
    });
    v.resumen = { asistencia: resumenAsistencia(db, yo, anio), cuota: cuotaDe(db, yo) };
    v.pendientes = documentosPendientes(db, rut).map((d) => d.id);
    return v;
  }

  return {
    MESES, ROLES, POSICIONES,
    limpiarRut, dvRut, normalizarRut, formatearRut, claveInicial, rutDesdeCuerpo,
    normalizarUsuario, idDeIngreso, textoHash, CUENTA_DIRECTIVA,
    hoyISO, sumarDias, edad, uid, clone,
    CATEGORIAS_BASE, RAMAS, CON_ANIO, armarCategorias, baseCategoria, ramaCategoria, llevaAnio, etiquetaCategoria,
    COMPROMISO_BECA, documentoAplica, firmaDe, documentosPendientes,
    cuotaDe, federativoPagado, habilitado, pagoMes, mesesAdeudados, resumenAsistencia, entrenamientosDeCategoria,
    dbVacia, dbEjemplo, migrar, applyAction, viewFor,
    hashClave, verificarClave, cambiarClave, prepararAccion,
  };
});
