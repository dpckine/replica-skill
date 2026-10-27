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
    const base = Number(db.config.cuotas[jugador.categoria] || 0);
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

  // ---------- Base de datos inicial ----------

  function dbVacia() {
    const anio = new Date().getFullYear();
    return {
      version: 1,
      config: {
        club: 'Vieux Gaulois Handball',
        temporada: anio,
        categorias: ['Mini', 'Infantil', 'Cadete', 'Juvenil', 'Adulto Varones', 'Adulto Damas', 'Senior'],
        cuotas: { Mini: 15000, Infantil: 18000, Cadete: 20000, Juvenil: 22000, 'Adulto Varones': 25000, 'Adulto Damas': 25000, Senior: 20000 },
        montoFederativo: 35000,
        mesesCobro: [2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
        diaVencimiento: 10,
      },
      usuarios: [],
      pagos: {},
      federativo: {},
      entrenamientos: [],
      partidos: [],
      lesiones: [],
      convenios: [],
      movimientos: [],
    };
  }

  function dbEjemplo() {
    const db = dbVacia();
    const anio = db.config.temporada;
    const hoy = hoyISO();
    const add = (cuerpo, datos) => {
      const u = Object.assign({ rut: rutDesdeCuerpo(cuerpo), activo: true, creado: hoy }, datos);
      db.usuarios.push(u);
      return u;
    };
    add(11111111, { nombre: 'María González', rol: 'directiva', cargo: 'Presidenta', telefono: '+56 9 1111 1111' });
    add(12222222, { nombre: 'Jorge Pérez', rol: 'entrenador', cargo: 'Entrenador Adulto', telefono: '+56 9 2222 2222' });
    const jugadores = [
      add(20123456, { nombre: 'Tomás Rojas', rol: 'jugador', fechaNac: '2001-04-12', categoria: 'Adulto Varones', numero: 7, posicion: 'Central', telefono: '+56 9 3333 3333' }),
      add(19876543, { nombre: 'Diego Muñoz', rol: 'jugador', fechaNac: '1998-09-03', categoria: 'Adulto Varones', numero: 1, posicion: 'Arquero' }),
      add(21345678, { nombre: 'Benjamín Soto', rol: 'jugador', fechaNac: '2003-01-25', categoria: 'Adulto Varones', numero: 10, posicion: 'Lateral izquierdo' }),
      add(18765432, { nombre: 'Camila Fuentes', rol: 'jugador', fechaNac: '1996-11-30', categoria: 'Adulto Damas', numero: 9, posicion: 'Pivote' }),
      add(20555666, { nombre: 'Valentina Araya', rol: 'jugador', fechaNac: '2000-06-18', categoria: 'Adulto Damas', numero: 14, posicion: 'Extremo derecho', descuento: 50 }),
      add(23456789, { nombre: 'Matías Contreras', rol: 'jugador', fechaNac: '2008-03-08', categoria: 'Juvenil', numero: 5, posicion: 'Extremo izquierdo' }),
    ];

    const mesActual = new Date().getMonth();
    jugadores.forEach((j, i) => {
      db.pagos[j.rut] = { [anio]: {} };
      db.config.mesesCobro.forEach((m) => {
        if (m <= mesActual - (i % 3)) {
          db.pagos[j.rut][anio][m] = { pagado: true, monto: cuotaDe(db, j), fecha: hoyISO(new Date(anio, m, 5)), metodo: 'Transferencia' };
        }
      });
      if (i !== 2 && i !== 5) {
        db.federativo[j.rut] = { [anio]: { pagado: true, monto: db.config.montoFederativo, fecha: hoyISO(new Date(anio, 2, 15)) } };
      }
    });

    // Entrenamientos: martes y jueves de las últimas 3 semanas (con asistencia) y las próximas 2.
    const base = new Date();
    base.setDate(base.getDate() - ((base.getDay() + 5) % 7)); // martes de esta semana (o el anterior)
    for (let s = -3; s <= 1; s++) {
      [0, 2].forEach((off) => {
        const fecha = sumarDias(hoyISO(base), s * 7 + off);
        const pasado = fecha < hoy;
        const e = {
          id: uid(), fecha, hora: '20:00', duracion: 90, lugar: 'Gimnasio Municipal',
          categorias: ['Adulto Varones', 'Adulto Damas'], tema: off ? 'Táctica defensiva 6:0' : 'Físico y lanzamiento',
          asistenciaTomada: pasado, asistencia: {},
        };
        if (pasado) {
          jugadores.filter((j) => j.categoria.startsWith('Adulto')).forEach((j, k) => {
            e.asistencia[j.rut] = (k + s + off) % 4 === 0 ? 'A' : (k + s) % 5 === 0 ? 'J' : 'P';
          });
        }
        db.entrenamientos.push(e);
      });
    }
    db.entrenamientos.push({ id: uid(), fecha: sumarDias(hoy, 1), hora: '18:30', duracion: 75, lugar: 'Gimnasio Colegio', categorias: ['Juvenil'], tema: 'Técnica individual', asistenciaTomada: false, asistencia: {} });

    db.partidos.push({
      id: uid(), fecha: sumarDias(hoy, 4), hora: '17:00', rival: 'Club Balonmano Andes', lugar: 'Gimnasio Municipal',
      condicion: 'Local', competicion: 'Liga Metropolitana', categoria: 'Adulto Varones',
      citados: { [jugadores[0].rut]: 'confirmado', [jugadores[1].rut]: 'pendiente' }, presentacion: '16:00', resultado: null,
    });
    db.partidos.push({
      id: uid(), fecha: sumarDias(hoy, 11), hora: '12:00', rival: 'Deportivo Costa', lugar: 'Polideportivo Costa',
      condicion: 'Visita', competicion: 'Liga Metropolitana', categoria: 'Adulto Damas',
      citados: { [jugadores[3].rut]: 'pendiente', [jugadores[4].rut]: 'pendiente' }, presentacion: '10:30', resultado: null,
    });
    db.partidos.push({
      id: uid(), fecha: sumarDias(hoy, -6), hora: '19:00', rival: 'Handball Sur', lugar: 'Gimnasio Municipal',
      condicion: 'Local', competicion: 'Liga Metropolitana', categoria: 'Adulto Varones',
      citados: { [jugadores[0].rut]: 'confirmado', [jugadores[1].rut]: 'confirmado' }, presentacion: '18:00', resultado: { nuestro: 28, rival: 24 },
    });

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
    Object.assign(j, {
      nombre,
      fechaNac: p.fechaNac || '',
      categoria: p.categoria,
      numero,
      posicion: texto(p.posicion, 40),
      telefono: texto(p.telefono, 30),
      email: texto(p.email, 80),
      contactoEmergencia: texto(p.contactoEmergencia, 120),
      prevision: texto(p.prevision, 60),
    });
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
        const rut = normalizarRut(p.rut);
        if (!rut) throw err('RUT no válido');
        if (buscarUsuario(db, rut)) throw err('Ya existe un usuario con ese RUT');
        if (!['directiva', 'entrenador'].includes(p.rol)) throw err('Rol no válido');
        const nombre = texto(p.nombre, 80);
        if (!nombre) throw err('El nombre es obligatorio');
        db.usuarios.push({ rut, rol: p.rol, nombre, cargo: texto(p.cargo, 60), telefono: texto(p.telefono, 30), email: texto(p.email, 80), activo: true, creado: hoyISO() });
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
        const u = buscarUsuario(db, p.rut);
        if (!u) throw err('Usuario no encontrado');
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
          notas: texto(p.notas, 300),
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
        if (Array.isArray(p.categorias)) {
          const cats = p.categorias.map((x) => texto(x, 40)).filter(Boolean);
          if (!cats.length) throw err('Debe existir al menos una categoría');
          const enUso = db.usuarios.filter((u) => u.rol === 'jugador' && u.activo !== false && !cats.includes(u.categoria));
          if (enUso.length) throw err('No puedes quitar la categoría "' + enUso[0].categoria + '": tiene jugadores activos');
          c.categorias = Array.from(new Set(cats));
        }
        if (p.cuotas && typeof p.cuotas === 'object') {
          const cuotas = {};
          c.categorias.forEach((cat) => { cuotas[cat] = num(p.cuotas[cat], 0, 10000000) || 0; });
          c.cuotas = cuotas;
        }
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

      default:
        throw err('Acción desconocida');
    }
    return db;
  }

  // ---------- Autenticación ----------

  async function hashClave(rut, clave, sha256) {
    return sha256('vieux-gaulois|' + rut + '|' + clave);
  }

  async function verificarClave(usuario, clave, sha256) {
    if (!usuario || usuario.activo === false) return false;
    if (!usuario.claveHash) return String(clave) === claveInicial(usuario.rut);
    return (await hashClave(usuario.rut, String(clave), sha256)) === usuario.claveHash;
  }

  async function cambiarClave(db, rut, actual, nueva, sha256) {
    const u = buscarUsuario(db, rut);
    if (!(await verificarClave(u, actual, sha256))) throw err('La clave actual no es correcta');
    if (!/^\S{4,40}$/.test(String(nueva || ''))) throw err('La nueva clave debe tener al menos 4 caracteres, sin espacios');
    u.claveHash = await hashClave(rut, String(nueva), sha256);
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
    v.usuarios = [yoV].concat(v.usuarios.filter((u) => u.rol !== 'jugador' && u.activo !== false)
      .map((u) => ({ rut: u.rut, nombre: u.nombre, rol: u.rol, cargo: u.cargo, telefono: u.telefono })));
    v.pagos = { [rut]: db.pagos[rut] || {} };
    v.federativo = { [rut]: db.federativo[rut] || {} };
    v.lesiones = v.lesiones.filter((l) => l.rut === rut);
    delete v.movimientos;
    v.entrenamientos = entrenamientosDeCategoria(v, yo.categoria).map((e) => {
      const r = Object.assign({}, e, { miAsistencia: (e.asistencia || {})[rut] || null });
      delete r.asistencia;
      return r;
    });
    v.partidos = v.partidos.filter((m) => m.categoria === yo.categoria || m.citados[rut]).map((m) => {
      const r = Object.assign({}, m, {
        miCitacion: m.citados[rut] || null,
        citadosLista: Object.keys(m.citados).map(nombreDe).sort((a, b) => (a.numero || 0) - (b.numero || 0)),
      });
      delete r.citados;
      return r;
    });
    v.resumen = { asistencia: resumenAsistencia(db, yo, anio), cuota: cuotaDe(db, yo) };
    return v;
  }

  return {
    MESES, ROLES, POSICIONES,
    limpiarRut, dvRut, normalizarRut, formatearRut, claveInicial, rutDesdeCuerpo,
    hoyISO, sumarDias, edad, uid, clone,
    cuotaDe, federativoPagado, habilitado, pagoMes, mesesAdeudados, resumenAsistencia, entrenamientosDeCategoria,
    dbVacia, dbEjemplo, applyAction, viewFor,
    hashClave, verificarClave, cambiarClave,
  };
});
