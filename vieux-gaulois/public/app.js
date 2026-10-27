/* Vieux Gaulois Handball: interfaz. Depende de core.js (window.VGCore). */
(function () {
  'use strict';
  const C = window.VGCore;
  const ANIO = new Date().getFullYear();
  const HOY = C.hoyISO();

  // ---------- Utilidades ----------
  const $ = (s, el) => (el || document).querySelector(s);
  const h = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const clp = (n) => '$' + Math.round(Number(n) || 0).toLocaleString('es-CL');
  const fDia = (iso) => new Date(iso + 'T12:00:00');
  const fCorta = (iso) => fDia(iso).toLocaleDateString('es-CL', { day: 'numeric', month: 'short' });
  const fLarga = (iso) => fDia(iso).toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' });
  const guardarLS = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (e) { /* sin almacenamiento */ } };
  const leerLS = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };

  async function sha256(texto) {
    if (window.crypto && crypto.subtle) {
      const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto));
      return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
    }
    // Respaldo para modo demo abierto como archivo local (sin contexto seguro).
    let a = 0x811c9dc5, b = 0x01000193;
    for (let i = 0; i < texto.length; i++) { a = Math.imul(a ^ texto.charCodeAt(i), 16777619); b = Math.imul(b + texto.charCodeAt(i), 2246822519); }
    return (a >>> 0).toString(16) + (b >>> 0).toString(16);
  }

  // ---------- Estado ----------
  const S = {
    modo: null, demo: false, view: null, tab: null,
    filtroCat: leerLS('vg_cat') || '', busqueda: '', anioFin: ANIO, verInactivos: false, verPasados: false,
  };

  // ---------- Backend: servidor real o modo demo local ----------
  class ErrorApi extends Error { constructor(msg, status) { super(msg); this.status = status; } }

  const Servidor = {
    token: leerLS('vg_token'),
    async pedir(metodo, ruta, cuerpo) {
      const r = await fetch(ruta, {
        method: metodo,
        headers: Object.assign({ 'Content-Type': 'application/json' }, this.token ? { Authorization: 'Bearer ' + this.token } : {}),
        body: cuerpo ? JSON.stringify(cuerpo) : undefined,
      });
      const datos = await r.json().catch(() => ({}));
      if (!r.ok) throw new ErrorApi(datos.error || 'Error de conexión', r.status);
      return datos;
    },
    async login(rut, clave) {
      const r = await this.pedir('POST', 'api/login', { rut, clave });
      this.token = r.token; guardarLS('vg_token', r.token);
      return r.view;
    },
    async estado() { if (!this.token) return null; return (await this.pedir('GET', 'api/state')).view; },
    async accion(type, payload) { return (await this.pedir('POST', 'api/action', { type, payload })).view; },
    async clave(actual, nueva) { return (await this.pedir('POST', 'api/clave', { actual, nueva })).view; },
    async salir() { try { await this.pedir('POST', 'api/logout'); } catch (e) { /* ya expirada */ } this.token = null; guardarLS('vg_token', null); },
  };

  const Local = {
    db: null, rut: leerLS('vg_rut'),
    cargar() {
      try { this.db = JSON.parse(leerLS('vg_db')); } catch (e) { this.db = null; }
      if (!this.db || !this.db.usuarios) { this.db = C.dbEjemplo(); this.guardar(); }
    },
    guardar() { guardarLS('vg_db', JSON.stringify(this.db)); },
    async login(rut, clave) {
      const r = C.normalizarRut(rut);
      if (!r) throw new ErrorApi('RUT no válido');
      const u = this.db.usuarios.find((x) => x.rut === r);
      if (!(await C.verificarClave(u, clave, sha256))) throw new ErrorApi('RUT o clave incorrectos');
      this.rut = r; guardarLS('vg_rut', r);
      return C.viewFor(this.db, r);
    },
    async estado() { return this.rut ? C.viewFor(this.db, this.rut) : null; },
    async accion(type, payload) {
      const copia = C.clone(this.db);
      C.applyAction(copia, this.rut, { type, payload });
      this.db = copia; this.guardar();
      return C.viewFor(this.db, this.rut);
    },
    async clave(actual, nueva) {
      const copia = C.clone(this.db);
      await C.cambiarClave(copia, this.rut, actual, nueva, sha256);
      this.db = copia; this.guardar();
      return C.viewFor(this.db, this.rut);
    },
    async salir() { this.rut = null; guardarLS('vg_rut', null); },
  };

  const B = () => (S.modo === 'servidor' ? Servidor : Local);

  async function accion(type, payload, okMsg) {
    try {
      S.view = await B().accion(type, payload);
      render();
      if (okMsg) toast(okMsg, 'ok');
      return true;
    } catch (e) {
      if (e.status === 401) { S.view = null; render(); }
      toast(e.message, 'error');
      return false;
    }
  }

  // ---------- Consultas sobre la vista ----------
  const yo = () => S.view.usuarios.find((u) => u.rut === S.view.yo);
  const rol = () => yo().rol;
  const esDir = () => rol() === 'directiva';
  const esStaff = () => rol() !== 'jugador';
  const usuario = (rut) => S.view.usuarios.find((u) => u.rut === rut);
  const cats = () => S.view.config.categorias;
  const ordenar = (a, b) => cats().indexOf(a.categoria) - cats().indexOf(b.categoria) || (a.numero == null ? 999 : a.numero) - (b.numero == null ? 999 : b.numero) || a.nombre.localeCompare(b.nombre);
  const jugadores = (todos) => S.view.usuarios.filter((u) => u.rol === 'jugador' && (todos || u.activo !== false)).sort(ordenar);
  const filtrarCat = (lista, campo) => (S.filtroCat ? lista.filter((x) => (campo ? x[campo] : x.categoria) === S.filtroCat) : lista);
  const hab = (rut) => C.habilitado(S.view, rut, ANIO);
  const lesionesActivas = (rut) => S.view.lesiones.filter((l) => l.rut === rut && l.estado === 'activa');
  const sinVer = () => S.view.lesiones.filter((l) => !l.vistoPor.includes(S.view.yo));
  const porFecha = (a, b) => (a.fecha + (a.hora || '')).localeCompare(b.fecha + (b.hora || ''));
  const proximos = (lista) => lista.filter((e) => e.fecha >= HOY).sort(porFecha);
  const pasados = (lista) => lista.filter((e) => e.fecha < HOY).sort(porFecha).reverse();

  // ---------- Componentes ----------
  const insignia = (txt, tipo) => '<span class="insignia ' + (tipo || '') + '">' + h(txt) + '</span>';
  const habInsignia = (rut) => (hab(rut) ? insignia('Habilitado', 'ok') : insignia('No habilitado', 'mal'));
  const camiseta = (j) => '<div class="camiseta">' + (j.numero != null ? h(j.numero) : '–') + '</div>';
  const fechaCaja = (iso, partido) => '<div class="fecha-caja' + (partido ? ' partido' : '') + '"><b>' + fDia(iso).getDate() + '</b><small>' + h(C.MESES[fDia(iso).getMonth()]) + '</small></div>';
  const vacio = (txt) => '<div class="vacio">' + h(txt) + '</div>';
  const opciones = (lista, sel, todas) => (todas ? '<option value="">' + h(todas) + '</option>' : '') + lista.map((c) => '<option' + (c === sel ? ' selected' : '') + '>' + h(c) + '</option>').join('');
  const filtroCategoria = () => '<select data-cambio="filtroCat" aria-label="Categoría">' + opciones(cats(), S.filtroCat, 'Todas las categorías') + '</select>';
  const campo = (etq, html) => '<label class="campo">' + h(etq) + html + '</label>';
  const input = (name, val, extra) => '<input name="' + name + '" value="' + h(val == null ? '' : val) + '" ' + (extra || '') + '>';

  function estadoMes(rut, anio, mes) {
    if (!S.view.config.mesesCobro.includes(mes)) return 'no';
    const p = C.pagoMes(S.view, rut, anio, mes);
    if (p && p.pagado) return 'pagado';
    const venc = anio < ANIO || (anio === ANIO && (mes < new Date().getMonth() || (mes === new Date().getMonth() && new Date().getDate() > S.view.config.diaVencimiento)));
    return venc ? 'vencido' : 'pendiente';
  }

  function citacionResumen(m) {
    const v = Object.values(m.citados || {});
    return { total: v.length, ok: v.filter((x) => x === 'confirmado').length, no: v.filter((x) => x === 'rechazado').length };
  }

  // ---------- Toast y modal ----------
  let toastTimer;
  function toast(msg, tipo) {
    const t = $('#toast');
    t.textContent = msg; t.className = 'toast ' + (tipo || ''); t.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 3200);
  }

  let alEnviar = null;
  function abrirModal(titulo, cuerpo, onSubmit) {
    $('#modal-titulo').textContent = titulo;
    $('#modal-cuerpo').innerHTML = cuerpo;
    alEnviar = onSubmit || null;
    $('#modal').hidden = false;
    const primero = $('#modal-cuerpo input:not([type=hidden]):not([type=checkbox]):not([type=radio]), #modal-cuerpo select, #modal-cuerpo textarea');
    if (primero && window.matchMedia('(min-width: 641px)').matches) primero.focus();
  }
  function cerrarModal() { $('#modal').hidden = true; $('#modal-cuerpo').innerHTML = ''; alEnviar = null; }
  const pie = (txt, extra) => '<div class="error" id="form-error"></div><div class="modal-pie">' + (extra || '') + '<button type="button" class="btn" data-act="cerrarModal">Cancelar</button><button class="btn primario">' + h(txt || 'Guardar') + '</button></div>';

  function datosForm(form) {
    const fd = new FormData(form), o = {};
    for (const [k, v] of fd.entries()) {
      if (k.endsWith('[]')) (o[k.slice(0, -2)] = o[k.slice(0, -2)] || []).push(v);
      else o[k] = v;
    }
    form.querySelectorAll('input[name$="[]"]').forEach((i) => { const k = i.name.slice(0, -2); o[k] = o[k] || []; });
    return o;
  }

  // ---------- Login ----------
  function vistaLogin() {
    const demo = S.demo ? '<div class="demo"><b>Cuentas de prueba</b> (clave = 4 primeros dígitos del RUT)<table>' +
      [['Directiva', '11111111-1'], ['Entrenador', '12222222-' + C.dvRut(12222222)], ['Jugador', '20123456-' + C.dvRut(20123456)]]
        .map(([r, rut]) => '<tr><td>' + r + '</td><td><button type="button" data-act="rellenarDemo" data-rut="' + rut + '">' + C.formatearRut(rut) + '</button></td><td>' + C.claveInicial(rut) + '</td></tr>').join('') +
      '</table></div>' : '';
    return '<div class="login"><div class="login-caja">' +
      '<img src="escudo.png" alt="Escudo Vieux Gaulois">' +
      '<h1>VIEUX GAULOIS</h1><div class="lema">HANDBALL</div>' +
      '<form id="form-login" autocomplete="on">' +
      campo('RUT', '<input name="rut" id="login-rut" inputmode="text" autocomplete="username" placeholder="12.345.678-9" required>') +
      campo('Clave', '<input name="clave" type="password" inputmode="numeric" autocomplete="current-password" placeholder="4 primeros dígitos del RUT" required>') +
      '<div class="error" id="login-error"></div>' +
      '<button class="btn primario ancho">Ingresar</button></form>' +
      '<p class="suave" style="font-size:.8rem;margin-top:12px">Tu clave inicial son los <b>primeros 4 dígitos de tu RUT</b>.</p>' +
      demo + '</div></div>';
  }

  // ---------- Pestañas por rol ----------
  const PESTANAS = {
    directiva: [['inicio', 'Inicio'], ['jugadores', 'Jugadores'], ['finanzas', 'Finanzas'], ['entrenamientos', 'Entrenamientos'], ['partidos', 'Partidos'], ['lesiones', 'Lesiones'], ['convenios', 'Convenios'], ['ajustes', 'Ajustes']],
    entrenador: [['inicio', 'Inicio'], ['jugadores', 'Jugadores'], ['entrenamientos', 'Entrenamientos'], ['partidos', 'Partidos'], ['lesiones', 'Lesiones'], ['calendario', 'Calendario']],
    jugador: [['perfil', 'Mi perfil'], ['calendario', 'Calendario']],
  };

  function shell(contenido) {
    const u = yo();
    const tabs = PESTANAS[u.rol].map(([id, txt]) => {
      const n = id === 'lesiones' ? sinVer().length : 0;
      return '<button data-act="tab" data-tab="' + id + '" class="' + (S.tab === id ? 'activa' : '') + '">' + txt + (n ? '<span class="punto">' + n + '</span>' : '') + '</button>';
    }).join('');
    return (S.modo === 'local' ? '<div class="modo-demo">Modo demo: los datos se guardan sólo en este navegador. Para uso real del club inicia el servidor (ver README).</div>' : '') +
      '<header class="cabecera"><img src="escudo.png" alt=""><div class="marca"><b>VIEUX GAULOIS</b><small>HANDBALL</small></div>' +
      '<div class="usuario"><span>' + h(u.nombre) + '<small>' + h(u.cargo || u.rol) + '</small></span>' +
      '<button class="btn mini btn-claro" data-act="clave">Clave</button><button class="btn mini btn-claro" data-act="salir">Salir</button></div></header>' +
      '<nav class="pestanas">' + tabs + '</nav><main>' + contenido + '</main>';
  }

  // ---------- Inicio (directiva / entrenador) ----------
  function vistaInicio() {
    const js = jugadores();
    const habs = js.filter((j) => hab(j.rut)).length;
    const activas = S.view.lesiones.filter((l) => l.estado === 'activa');
    const nuevas = sinVer();
    const prox = proximos(S.view.partidos)[0];
    let kpis = '<div class="kpi"><small>Jugadores activos</small><b>' + js.length + '</b></div>' +
      '<div class="kpi verde"><small>Habilitados (federativo ' + ANIO + ')</small><b>' + habs + ' / ' + js.length + '</b></div>' +
      '<div class="kpi rojo"><small>Lesiones / dolores activos</small><b>' + activas.length + '</b>' + (nuevas.length ? '<small>' + nuevas.length + ' sin revisar</small>' : '') + '</div>';
    if (esDir()) {
      const mes = new Date().getMonth();
      let esperado = 0, recaudado = 0, morosos = 0;
      js.forEach((j) => {
        if (S.view.config.mesesCobro.includes(mes)) {
          esperado += C.cuotaDe(S.view, j);
          const p = C.pagoMes(S.view, j.rut, ANIO, mes);
          if (p && p.pagado) recaudado += Number(p.monto) || 0;
        }
        if (C.mesesAdeudados(S.view, j.rut, ANIO).filter((m) => m < mes).length) morosos++;
      });
      kpis += '<div class="kpi oro"><small>Cuotas ' + C.MESES[mes] + ' recaudadas</small><b>' + clp(recaudado) + '</b><small>de ' + clp(esperado) + '</small></div>' +
        '<div class="kpi rojo"><small>Jugadores con cuotas atrasadas</small><b>' + morosos + '</b></div>';
    }

    const avisos = nuevas.length
      ? '<ul class="lista">' + nuevas.map(itemLesion).join('') + '</ul><div class="fila" style="margin-top:8px"><button class="btn mini" data-act="lesionVistoTodo">Marcar todo como revisado</button></div>'
      : vacio('No hay reportes nuevos de lesiones o dolores.');

    const proxPartido = prox ? tarjetaPartido(prox) : vacio('No hay partidos programados.');
    const semana = proximos(S.view.entrenamientos).filter((e) => e.fecha <= C.sumarDias(HOY, 7));

    return '<div class="pila"><div class="kpis">' + kpis + '</div><div class="rejilla">' +
      '<section class="tarjeta"><div class="tarjeta-cab"><h2>Avisos de lesiones y dolores</h2></div>' + avisos + '</section>' +
      '<section class="tarjeta"><div class="tarjeta-cab"><h2>Próximo partido</h2><button class="btn mini" data-act="tab" data-tab="partidos">Ver todos</button></div>' + proxPartido + '</section>' +
      '<section class="tarjeta"><div class="tarjeta-cab"><h2>Entrenamientos esta semana</h2><button class="btn mini" data-act="tab" data-tab="entrenamientos">Ver todos</button></div>' +
      (semana.length ? '<ul class="lista">' + semana.map(itemEntrenamiento).join('') + '</ul>' : vacio('Sin entrenamientos en los próximos 7 días.')) + '</section>' +
      '</div></div>';
  }

  // ---------- Jugadores ----------
  function vistaJugadores() {
    let lista = filtrarCat(jugadores(S.verInactivos));
    const q = S.busqueda.toLowerCase();
    if (q) lista = lista.filter((j) => j.nombre.toLowerCase().includes(q) || j.rut.includes(q.replace(/\./g, '')));
    const filas = lista.map((j) => {
      const a = C.resumenAsistencia(S.view, j, ANIO);
      const les = lesionesActivas(j.rut).length;
      const deuda = esDir() ? C.mesesAdeudados(S.view, j.rut, ANIO).filter((m) => estadoMes(j.rut, ANIO, m) === 'vencido').length : 0;
      return '<tr class="clic" data-act="verJugador" data-rut="' + j.rut + '">' +
        '<td>' + camiseta(j) + '</td>' +
        '<td><div class="nombre">' + h(j.nombre) + (j.activo === false ? ' ' + insignia('Inactivo') : '') + '</div><small>' + h(C.formatearRut(j.rut)) + '</small></td>' +
        '<td class="ocultar-movil">' + h(j.categoria) + '</td>' +
        '<td class="num ocultar-movil">' + (C.edad(j.fechaNac) == null ? '–' : C.edad(j.fechaNac)) + '</td>' +
        '<td class="ocultar-movil">' + h(j.posicion || '–') + '</td>' +
        '<td>' + habInsignia(j.rut) + (les ? ' ' + insignia('Lesión', 'alerta') : '') + (deuda ? ' ' + insignia(deuda + ' cuota' + (deuda > 1 ? 's' : '') + ' atrasada' + (deuda > 1 ? 's' : ''), 'mal') : '') + '</td>' +
        '<td class="num ocultar-movil">' + (a.realizados ? a.porcentaje + '%' : '–') + '</td></tr>';
    }).join('');
    return '<section class="tarjeta"><div class="tarjeta-cab"><h2>Jugadores (' + lista.length + ')</h2><button class="btn primario" data-act="nuevoJugador">+ Inscribir jugador</button></div>' +
      '<div class="filtros">' + filtroCategoria() + '<input type="search" placeholder="Buscar por nombre o RUT" value="' + h(S.busqueda) + '" data-cambio="busqueda">' +
      (esDir() ? '<div class="chequeos" style="margin:0"><label><input type="checkbox" data-cambio="verInactivos"' + (S.verInactivos ? ' checked' : '') + '> Ver inactivos</label></div>' : '') + '</div>' +
      (lista.length ? '<div class="tabla-envoltura"><table class="tabla"><thead><tr><th>N°</th><th>Nombre</th><th class="ocultar-movil">Categoría</th><th class="num ocultar-movil">Edad</th><th class="ocultar-movil">Posición</th><th>Estado</th><th class="num ocultar-movil">Asist.</th></tr></thead><tbody>' + filas + '</tbody></table></div>'
        : vacio('No hay jugadores con ese filtro.')) + '</section>';
  }

  function formJugador(j) {
    const nuevo = !j;
    j = j || { categoria: S.filtroCat || cats()[0] };
    return '<form id="form-modal">' +
      (nuevo ? campo('RUT', input('rut', '', 'required placeholder="12.345.678-9"')) + '<p class="suave" style="margin:-6px 0 12px;font-size:.8rem">Su clave inicial serán los primeros 4 dígitos del RUT.</p>' : '<input type="hidden" name="rut" value="' + h(j.rut) + '">') +
      campo('Nombre completo', input('nombre', j.nombre, 'required maxlength="80"')) +
      '<div class="campos">' +
      campo('Fecha de nacimiento', input('fechaNac', j.fechaNac, 'type="date"')) +
      campo('Categoría', '<select name="categoria">' + opciones(cats(), j.categoria) + '</select>') +
      campo('N° de camiseta', input('numero', j.numero, 'type="number" min="0" max="99"')) +
      campo('Posición', '<select name="posicion"><option value="">–</option>' + opciones(C.POSICIONES, j.posicion) + '</select>') +
      campo('Teléfono', input('telefono', j.telefono, 'type="tel"')) +
      campo('Email', input('email', j.email, 'type="email"')) +
      campo('Previsión de salud', input('prevision', j.prevision, 'placeholder="Fonasa, Isapre..."')) +
      (esDir() ? campo('Descuento / beca (%)', input('descuento', j.descuento || 0, 'type="number" min="0" max="100"')) : '') +
      '</div>' + campo('Contacto de emergencia', input('contactoEmergencia', j.contactoEmergencia, 'placeholder="Nombre y teléfono"')) +
      pie(nuevo ? 'Inscribir' : 'Guardar') + '</form>';
  }

  function fichaJugador(rut) {
    const j = usuario(rut);
    const a = C.resumenAsistencia(S.view, j, ANIO);
    const les = S.view.lesiones.filter((l) => l.rut === rut).sort((x, y) => y.fecha.localeCompare(x.fecha));
    let html = '<div class="fila" style="margin-bottom:12px">' + camiseta(j) + '<div class="crece"><b>' + h(j.nombre) + '</b><br><small>' + h(C.formatearRut(j.rut)) + ' · ' + h(j.categoria) + (j.posicion ? ' · ' + h(j.posicion) : '') + '</small></div>' + habInsignia(rut) + '</div>' +
      '<table class="tabla"><tbody>' +
      '<tr><td>Edad</td><td>' + (C.edad(j.fechaNac) == null ? '–' : C.edad(j.fechaNac) + ' años (' + h(j.fechaNac) + ')') + '</td></tr>' +
      '<tr><td>Teléfono</td><td>' + h(j.telefono || '–') + '</td></tr>' +
      '<tr><td>Email</td><td>' + h(j.email || '–') + '</td></tr>' +
      '<tr><td>Emergencia</td><td>' + h(j.contactoEmergencia || '–') + '</td></tr>' +
      '<tr><td>Previsión</td><td>' + h(j.prevision || '–') + '</td></tr>' +
      '<tr><td>Asistencia ' + ANIO + '</td><td>' + a.asistidos + ' de ' + a.realizados + ' entrenamientos (' + a.porcentaje + '%)' + (a.justificados ? ', ' + a.justificados + ' justificadas' : '') + '</td></tr>' +
      '<tr><td>Federativo ' + ANIO + '</td><td>' + (C.federativoPagado(S.view, rut, ANIO) ? insignia('Pagado', 'ok') : insignia('Pendiente', 'mal')) + '</td></tr>';
    if (esDir()) {
      const deuda = C.mesesAdeudados(S.view, rut, ANIO).filter((m) => estadoMes(rut, ANIO, m) === 'vencido');
      html += '<tr><td>Cuota mensual</td><td>' + clp(C.cuotaDe(S.view, j)) + (j.descuento ? ' (' + j.descuento + '% dcto.)' : '') + '</td></tr>' +
        '<tr><td>Cuotas atrasadas</td><td>' + (deuda.length ? deuda.map((m) => C.MESES[m]).join(', ') : 'Al día') + '</td></tr>';
    }
    html += '</tbody></table>';
    html += '<h3 style="margin:16px 0 4px">Lesiones y dolores</h3>' + (les.length ? '<ul class="lista">' + les.map(itemLesion).join('') + '</ul>' : vacio('Sin reportes.'));
    html += '<div class="modal-pie">' +
      (esDir() ? '<button class="btn mini" data-act="resetClave" data-rut="' + rut + '">Restablecer clave</button><button class="btn mini peligro" data-act="activoJugador" data-rut="' + rut + '" data-activo="' + (j.activo === false ? '1' : '') + '">' + (j.activo === false ? 'Reactivar' : 'Dar de baja') + '</button>' : '') +
      '<button class="btn mini" data-act="lesionPara" data-rut="' + rut + '">+ Registrar lesión</button>' +
      '<button class="btn primario" data-act="editarJugador" data-rut="' + rut + '">Editar datos</button></div>';
    return html;
  }

  // ---------- Finanzas (directiva) ----------
  function vistaFinanzas() {
    const anio = S.anioFin;
    const js = filtrarCat(jugadores());
    let esperado = 0, recaudado = 0, fedN = 0, fedMonto = 0;
    const filas = js.map((j) => {
      const cuota = C.cuotaDe(S.view, j);
      let deuda = 0;
      const celdas = C.MESES.map((nom, m) => {
        const e = estadoMes(j.rut, anio, m);
        const p = C.pagoMes(S.view, j.rut, anio, m);
        if (e !== 'no' && (e === 'vencido' || e === 'pagado')) esperado += e === 'pagado' ? Number(p.monto) || 0 : cuota;
        if (e === 'pagado') recaudado += Number(p.monto) || 0;
        if (e === 'vencido') deuda += cuota;
        const txt = e === 'pagado' ? '✓' : e === 'vencido' ? '!' : e === 'no' ? '·' : '';
        const tit = nom + ': ' + (e === 'pagado' ? 'pagado ' + clp(p.monto) + ' el ' + p.fecha : e === 'vencido' ? 'vencido' : e === 'no' ? 'no se cobra' : 'por vencer');
        return '<td class="c"><button class="celda ' + e + '" title="' + h(tit) + '" ' + (e === 'no' ? 'disabled' : 'data-act="pago" data-rut="' + j.rut + '" data-mes="' + m + '"') + '>' + txt + '</button></td>';
      }).join('');
      const fed = C.federativoPagado(S.view, j.rut, anio);
      if (fed) { fedN++; fedMonto += Number(S.view.federativo[j.rut][anio].monto) || 0; }
      return '<tr><td class="nombre">' + h(j.nombre) + '<br><small>' + h(j.categoria) + ' · ' + clp(cuota) + '</small></td>' +
        '<td class="c"><button class="celda fed ' + (fed ? 'pagado' : 'vencido') + '" data-act="federativo" data-rut="' + j.rut + '" title="Federativo ' + anio + '">' + (fed ? '✓' : '✗') + '</button></td>' +
        celdas + '<td class="num">' + (deuda ? '<b style="color:var(--mal)">' + clp(deuda) + '</b>' : '–') + '</td></tr>';
    }).join('');

    const movs = (S.view.movimientos || []).filter((m) => m.fecha.startsWith(String(anio))).sort((a, b) => b.fecha.localeCompare(a.fecha));
    const ingresos = movs.filter((m) => m.tipo === 'ingreso').reduce((s, m) => s + m.monto, 0);
    const gastos = movs.filter((m) => m.tipo === 'gasto').reduce((s, m) => s + m.monto, 0);
    const balance = recaudado + fedMonto + ingresos - gastos;
    const anios = [ANIO - 1, ANIO, ANIO + 1];

    return '<div class="pila">' +
      '<div class="filtros"><select data-cambio="anioFin" aria-label="Año">' + anios.map((a) => '<option' + (a === anio ? ' selected' : '') + '>' + a + '</option>').join('') + '</select>' + filtroCategoria() + '</div>' +
      '<div class="kpis">' +
      '<div class="kpi verde"><small>Cuotas recaudadas</small><b>' + clp(recaudado) + '</b><small>de ' + clp(esperado) + ' vencido a la fecha</small></div>' +
      '<div class="kpi rojo"><small>Cuotas pendientes (vencidas)</small><b>' + clp(Math.max(0, esperado - recaudado)) + '</b></div>' +
      '<div class="kpi oro"><small>Federativos pagados</small><b>' + fedN + ' / ' + js.length + '</b><small>' + clp(fedMonto) + '</small></div>' +
      '<div class="kpi"><small>Otros ingresos / gastos</small><b>' + clp(ingresos - gastos) + '</b><small>+' + clp(ingresos) + ' / -' + clp(gastos) + '</small></div>' +
      '<div class="kpi ' + (balance >= 0 ? 'verde' : 'rojo') + '"><small>Balance ' + anio + '</small><b>' + clp(balance) + '</b></div></div>' +
      '<section class="tarjeta"><div class="tarjeta-cab"><h2>Mensualidades y federativo ' + anio + '</h2><button class="btn mini" data-act="tab" data-tab="ajustes">Precios de cuotas</button></div>' +
      '<p class="suave" style="font-size:.82rem;margin-bottom:8px">Toca una casilla para registrar o anular un pago. <span class="insignia ok">✓ pagado</span> <span class="insignia mal">! vencido</span> <span class="insignia">por vencer</span> · = mes sin cobro. Fed = federativo (habilita para jugar).</p>' +
      (js.length ? '<div class="tabla-envoltura"><table class="tabla matriz"><thead><tr><th>Jugador</th><th class="c">Fed</th>' + C.MESES.map((m) => '<th class="c">' + m + '</th>').join('') + '<th class="num">Deuda</th></tr></thead><tbody>' + filas + '</tbody></table></div>' : vacio('No hay jugadores.')) +
      '</section>' +
      '<section class="tarjeta"><div class="tarjeta-cab"><h2>Otros ingresos y gastos</h2><button class="btn primario" data-act="nuevoMovimiento">+ Registrar</button></div>' +
      (movs.length ? '<ul class="lista">' + movs.map((m) => '<li><div class="crece"><b>' + h(m.concepto) + '</b><small>' + fCorta(m.fecha) + '</small></div><b style="color:' + (m.tipo === 'gasto' ? 'var(--mal)' : 'var(--ok)') + '">' + (m.tipo === 'gasto' ? '-' : '+') + clp(m.monto) + '</b><button class="btn-icono" data-act="borrarMovimiento" data-id="' + m.id + '" aria-label="Eliminar">&times;</button></li>').join('') + '</ul>' : vacio('Sin movimientos este año.')) +
      '</section></div>';
  }

  // ---------- Entrenamientos ----------
  function itemEntrenamiento(e) {
    const n = Object.values(e.asistencia || {});
    const resumen = e.asistenciaTomada ? insignia(n.filter((x) => x === 'P').length + '/' + n.length + ' presentes', 'ok') : (e.fecha <= HOY ? insignia('Falta asistencia', 'alerta') : '');
    return '<li>' + fechaCaja(e.fecha) + '<div class="crece"><b>' + h(e.tema || 'Entrenamiento') + '</b><small>' + h(e.hora) + ' · ' + h(e.lugar || '') + ' · ' + h((e.categorias || []).join(', ')) + '</small></div>' +
      (esStaff() ? '<div class="fila" style="gap:6px;justify-content:flex-end">' + resumen + '<button class="btn mini" data-act="asistencia" data-id="' + e.id + '">Asistencia</button><button class="btn mini" data-act="editarEntrenamiento" data-id="' + e.id + '">Editar</button></div>' : '') + '</li>';
  }

  function vistaEntrenamientos() {
    const lista = S.filtroCat ? S.view.entrenamientos.filter((e) => e.categorias.includes(S.filtroCat)) : S.view.entrenamientos;
    const prox = proximos(lista), pas = pasados(lista);
    const pendientes = pas.filter((e) => !e.asistenciaTomada);
    return '<div class="pila"><div class="filtros">' + filtroCategoria() + '</div>' +
      (pendientes.length ? '<div class="aviso">Hay ' + pendientes.length + ' entrenamiento(s) pasados sin asistencia registrada.</div>' : '') +
      '<section class="tarjeta"><div class="tarjeta-cab"><h2>Próximos entrenamientos</h2><button class="btn primario" data-act="nuevoEntrenamiento">+ Programar</button></div>' +
      (prox.length ? '<ul class="lista">' + prox.map(itemEntrenamiento).join('') + '</ul>' : vacio('No hay entrenamientos programados.')) + '</section>' +
      '<section class="tarjeta"><div class="tarjeta-cab"><h2>Realizados</h2></div>' +
      (pas.length ? '<ul class="lista">' + pas.slice(0, 40).map(itemEntrenamiento).join('') + '</ul>' : vacio('Aún no hay entrenamientos realizados.')) + '</section></div>';
  }

  function formEntrenamiento(e) {
    const nuevo = !e;
    e = e || { fecha: HOY, hora: '20:00', duracion: 90, categorias: S.filtroCat ? [S.filtroCat] : [] };
    return '<form id="form-modal">' + (nuevo ? '' : '<input type="hidden" name="id" value="' + e.id + '">') +
      '<div class="campos">' + campo('Fecha', input('fecha', e.fecha, 'type="date" required')) + campo('Hora', input('hora', e.hora, 'type="time" required')) +
      campo('Duración (min)', input('duracion', e.duracion, 'type="number" min="15" max="600"')) + campo('Lugar', input('lugar', e.lugar, 'placeholder="Gimnasio"')) + '</div>' +
      campo('Tema / objetivo', input('tema', e.tema, 'placeholder="Ej: contraataque, defensa 5:1"')) +
      '<label class="campo">Categorías</label><div class="chequeos">' + cats().map((c) => '<label><input type="checkbox" name="categorias[]" value="' + h(c) + '"' + (e.categorias.includes(c) ? ' checked' : '') + '> ' + h(c) + '</label>').join('') + '</div>' +
      (nuevo ? campo('Repetir semanalmente (semanas extra)', input('repetirSemanas', 0, 'type="number" min="0" max="26"')) : '') +
      pie(nuevo ? 'Programar' : 'Guardar', nuevo ? '' : '<button type="button" class="btn peligro" data-act="borrarEntrenamiento" data-id="' + e.id + '" style="margin-right:auto">Eliminar</button>') + '</form>';
  }

  function formAsistencia(e) {
    const js = jugadores().filter((j) => e.categorias.includes(j.categoria));
    if (!js.length) return vacio('No hay jugadores en ' + e.categorias.join(', ') + '.');
    const filas = js.map((j) => {
      const val = (e.asistencia || {})[j.rut] || (e.asistenciaTomada ? 'A' : 'P');
      const op = (k, t) => '<label><input type="radio" name="a_' + j.rut + '" value="' + k + '"' + (val === k ? ' checked' : '') + '><span class="' + k + '" title="' + t + '">' + k + '</span></label>';
      return '<li>' + camiseta(j) + '<div class="crece"><b>' + h(j.nombre) + '</b><small>' + h(j.categoria) + (lesionesActivas(j.rut).length ? ' · lesión activa' : '') + '</small></div><div class="asis">' + op('P', 'Presente') + op('A', 'Ausente') + op('J', 'Justificado') + '</div></li>';
    }).join('');
    return '<p class="suave" style="font-size:.85rem">' + fLarga(e.fecha) + ' · ' + h(e.hora) + ' · P = presente, A = ausente, J = justificado</p>' +
      '<form id="form-modal"><input type="hidden" name="id" value="' + e.id + '"><ul class="lista">' + filas + '</ul>' + pie('Guardar asistencia') + '</form>';
  }

  // ---------- Partidos ----------
  function tarjetaPartido(m) {
    const r = citacionResumen(m);
    const res = m.resultado ? '<b style="font-size:1.1rem">' + m.resultado.nuestro + ' - ' + m.resultado.rival + '</b> ' + insignia(m.resultado.nuestro > m.resultado.rival ? 'Victoria' : m.resultado.nuestro < m.resultado.rival ? 'Derrota' : 'Empate', m.resultado.nuestro > m.resultado.rival ? 'ok' : m.resultado.nuestro < m.resultado.rival ? 'mal' : '') : '';
    return '<div class="fila" style="align-items:flex-start">' + fechaCaja(m.fecha, true) + '<div class="crece" style="flex:1;min-width:0">' +
      '<b>Vieux Gaulois vs ' + h(m.rival) + '</b><br><small>' + h(fLarga(m.fecha)) + ' · ' + h(m.hora) + (m.presentacion ? ' (citación ' + h(m.presentacion) + ')' : '') + '</small><br>' +
      '<small>' + h(m.condicion) + ' · ' + h(m.lugar || '') + (m.competicion ? ' · ' + h(m.competicion) : '') + '</small>' +
      '<div class="fila" style="gap:6px;margin-top:6px">' + insignia(m.categoria, 'oro') + insignia(r.total + ' citados') + (r.ok ? insignia(r.ok + ' confirmados', 'ok') : '') + (r.no ? insignia(r.no + ' no pueden', 'mal') : '') + res + '</div>' +
      (esStaff() ? '<div class="fila" style="gap:6px;margin-top:8px"><button class="btn mini primario" data-act="citar" data-id="' + m.id + '">Citar jugadores</button>' +
        (m.fecha <= HOY ? '<button class="btn mini" data-act="resultado" data-id="' + m.id + '">Resultado</button>' : '') +
        '<button class="btn mini" data-act="editarPartido" data-id="' + m.id + '">Editar</button></div>' : '') +
      '</div></div>';
  }

  function vistaPartidos() {
    const lista = filtrarCat(S.view.partidos);
    const prox = proximos(lista), pas = pasados(lista);
    const bloque = (l) => '<ul class="lista">' + l.map((m) => '<li>' + tarjetaPartido(m) + '</li>').join('') + '</ul>';
    return '<div class="pila"><div class="filtros">' + filtroCategoria() + '</div>' +
      '<section class="tarjeta"><div class="tarjeta-cab"><h2>Próximos partidos</h2><button class="btn primario" data-act="nuevoPartido">+ Nuevo partido</button></div>' +
      (prox.length ? bloque(prox) : vacio('No hay partidos programados.')) + '</section>' +
      '<section class="tarjeta"><div class="tarjeta-cab"><h2>Jugados</h2></div>' + (pas.length ? bloque(pas) : vacio('Aún no hay partidos jugados.')) + '</section></div>';
  }

  function formPartido(m) {
    const nuevo = !m;
    m = m || { fecha: C.sumarDias(HOY, 7), hora: '18:00', condicion: 'Local', categoria: S.filtroCat || cats()[0] };
    return '<form id="form-modal">' + (nuevo ? '' : '<input type="hidden" name="id" value="' + m.id + '">') +
      campo('Rival', input('rival', m.rival, 'required maxlength="80"')) +
      '<div class="campos">' + campo('Fecha', input('fecha', m.fecha, 'type="date" required')) + campo('Hora', input('hora', m.hora, 'type="time" required')) +
      campo('Hora de citación', input('presentacion', m.presentacion, 'type="time"')) +
      campo('Categoría', '<select name="categoria">' + opciones(cats(), m.categoria) + '</select>') +
      campo('Condición', '<select name="condicion">' + opciones(['Local', 'Visita'], m.condicion) + '</select>') +
      campo('Competición', input('competicion', m.competicion, 'placeholder="Liga, copa, amistoso"')) + '</div>' +
      campo('Lugar', input('lugar', m.lugar)) + campo('Notas para los jugadores', '<textarea name="notas" maxlength="300">' + h(m.notas || '') + '</textarea>') +
      pie(nuevo ? 'Crear partido' : 'Guardar', nuevo ? '' : '<button type="button" class="btn peligro" data-act="borrarPartido" data-id="' + m.id + '" style="margin-right:auto">Eliminar</button>') + '</form>';
  }

  function formCitacion(m, todas) {
    const js = jugadores().filter((j) => todas || j.categoria === m.categoria || m.citados[j.rut]);
    const estados = { confirmado: insignia('Confirmó', 'ok'), rechazado: insignia('No puede', 'mal'), pendiente: insignia('Sin responder') };
    const filas = js.map((j) => {
      const les = lesionesActivas(j.rut).length;
      return '<li><input type="checkbox" name="ruts[]" value="' + j.rut + '" id="c_' + j.rut + '"' + (m.citados[j.rut] ? ' checked' : '') + ' style="width:20px;height:20px;accent-color:var(--azul)" data-hab="' + (hab(j.rut) ? 1 : 0) + '">' +
        '<label for="c_' + j.rut + '" class="crece" style="cursor:pointer"><b>' + (j.numero != null ? '#' + h(j.numero) + ' ' : '') + h(j.nombre) + '</b><small>' + h(j.categoria) + (j.posicion ? ' · ' + h(j.posicion) : '') + '</small></label>' +
        '<div class="fila" style="gap:4px;justify-content:flex-end">' + habInsignia(j.rut) + (les ? insignia('Lesión', 'alerta') : '') + (m.citados[j.rut] ? estados[m.citados[j.rut]] : '') + '</div></li>';
    }).join('');
    return '<p class="suave" style="font-size:.85rem">vs ' + h(m.rival) + ' · ' + h(fLarga(m.fecha)) + ' · ' + h(m.categoria) + '</p>' +
      '<div class="aviso info" style="margin:8px 0">Sólo los jugadores <b>habilitados</b> (federativo ' + ANIO + ' pagado) pueden jugar.</div>' +
      '<form id="form-modal"><input type="hidden" name="id" value="' + m.id + '">' +
      (todas ? '' : '<button type="button" class="btn mini" data-act="citarTodas" data-id="' + m.id + '">Mostrar todas las categorías</button>') +
      '<ul class="lista">' + (filas || '<li>' + vacio('No hay jugadores en esta categoría.') + '</li>') + '</ul>' +
      '<div class="aviso mal" id="aviso-hab" hidden></div>' + pie('Guardar citación') + '</form>';
  }

  // ---------- Lesiones ----------
  function itemLesion(l) {
    const j = usuario(l.rut) || { nombre: '?' };
    const nueva = !l.vistoPor.includes(S.view.yo);
    const intens = l.intensidad >= 7 ? 'mal' : l.intensidad >= 4 ? 'alerta' : '';
    return '<li class="' + (nueva && esStaff() ? 'nueva' : '') + '" style="align-items:flex-start"><div class="crece">' +
      (esStaff() ? '<b>' + h(j.nombre) + ' <small>' + h(j.categoria || '') + '</small></b>' : '') +
      '<div class="fila" style="gap:6px;margin:2px 0">' + insignia(l.tipo, l.tipo === 'Lesión' ? 'mal' : 'alerta') + '<b>' + h(l.zona) + '</b>' + insignia('Intensidad ' + l.intensidad + '/10', intens) +
      (l.estado === 'resuelta' ? insignia('Recuperado', 'ok') : '') + (nueva && esStaff() ? insignia('Nuevo', 'mal') : '') + '</div>' +
      (l.descripcion ? '<p>' + h(l.descripcion) + '</p>' : '') +
      (l.notaStaff ? '<p class="suave"><b>Nota cuerpo técnico:</b> ' + h(l.notaStaff) + '</p>' : '') +
      '<small>Desde ' + fCorta(l.fecha) + (l.resuelta ? ' · recuperado ' + fCorta(l.resuelta) : '') + '</small></div>' +
      '<div class="fila" style="gap:6px;flex-direction:column;align-items:stretch">' +
      (nueva && esStaff() ? '<button class="btn mini" data-act="lesionVisto" data-id="' + l.id + '">Revisado</button>' : '') +
      '<button class="btn mini" data-act="editarLesion" data-id="' + l.id + '">' + (esStaff() ? 'Gestionar' : 'Actualizar') + '</button></div></li>';
  }

  function vistaLesiones() {
    const todas = S.view.lesiones.filter((l) => !S.filtroCat || (usuario(l.rut) || {}).categoria === S.filtroCat)
      .sort((a, b) => (a.estado === b.estado ? b.fecha.localeCompare(a.fecha) : a.estado === 'activa' ? -1 : 1));
    const activas = todas.filter((l) => l.estado === 'activa'), resueltas = todas.filter((l) => l.estado !== 'activa');
    return '<div class="pila"><div class="filtros">' + filtroCategoria() + (sinVer().length ? '<button class="btn" data-act="lesionVistoTodo">Marcar todo como revisado</button>' : '') + '</div>' +
      '<section class="tarjeta"><div class="tarjeta-cab"><h2>Activas (' + activas.length + ')</h2><button class="btn primario" data-act="lesionPara">+ Registrar</button></div>' +
      (activas.length ? '<ul class="lista">' + activas.map(itemLesion).join('') + '</ul>' : vacio('Ningún jugador reporta lesiones ni dolores.')) + '</section>' +
      '<section class="tarjeta"><div class="tarjeta-cab"><h2>Historial</h2></div>' +
      (resueltas.length ? '<ul class="lista">' + resueltas.slice(0, 50).map(itemLesion).join('') + '</ul>' : vacio('Sin historial.')) + '</section></div>';
  }

  function formLesion(l, rutJugador) {
    const nuevo = !l;
    l = l || { tipo: 'Dolor', intensidad: 5, fecha: HOY };
    const elegir = nuevo && esStaff() && !rutJugador;
    return '<form id="form-modal">' + (nuevo ? '' : '<input type="hidden" name="id" value="' + l.id + '">') +
      (rutJugador ? '<input type="hidden" name="rut" value="' + rutJugador + '">' : '') +
      (elegir ? campo('Jugador', '<select name="rut" required>' + jugadores().map((j) => '<option value="' + j.rut + '">' + h(j.nombre) + ' (' + h(j.categoria) + ')</option>').join('') + '</select>') : '') +
      '<div class="campos">' + campo('Tipo', '<select name="tipo">' + opciones(['Dolor', 'Molestia', 'Lesión'], l.tipo) + '</select>') +
      campo('Zona del cuerpo', input('zona', l.zona, 'required placeholder="Ej: rodilla izquierda" maxlength="60"')) +
      (nuevo ? campo('Desde', input('fecha', l.fecha, 'type="date"')) : '') +
      campo('Intensidad (1 a 10)', input('intensidad', l.intensidad, 'type="number" min="1" max="10" required')) + '</div>' +
      campo('Descripción', '<textarea name="descripcion" maxlength="500" placeholder="¿Cuándo empezó? ¿Qué movimientos duelen?">' + h(l.descripcion || '') + '</textarea>') +
      (!nuevo && esStaff() ? campo('Nota del cuerpo técnico', '<textarea name="notaStaff" maxlength="300">' + h(l.notaStaff || '') + '</textarea>') : '') +
      (!nuevo ? campo('Estado', '<select name="estado">' + '<option value="activa"' + (l.estado === 'activa' ? ' selected' : '') + '>Activa</option><option value="resuelta"' + (l.estado === 'resuelta' ? ' selected' : '') + '>Recuperado</option></select>') : '') +
      (nuevo && !esStaff() ? '<p class="suave" style="font-size:.82rem">Tu reporte le llegará al entrenador y a la directiva.</p>' : '') +
      pie(nuevo ? 'Enviar reporte' : 'Guardar') + '</form>';
  }

  // ---------- Convenios ----------
  function listaConvenios(editable) {
    const cs = S.view.convenios;
    if (!cs.length) return vacio('El club aún no tiene convenios publicados.');
    return '<ul class="lista">' + cs.map((c) => '<li style="align-items:flex-start"><div class="camiseta" style="background:var(--oro)">★</div><div class="crece"><b>' + h(c.empresa) + '</b>' +
      (c.beneficio ? '<div style="color:var(--azul);font-weight:600">' + h(c.beneficio) + '</div>' : '') + (c.detalle ? '<small>' + h(c.detalle) + '</small>' : '') + '</div>' +
      (editable ? '<button class="btn mini" data-act="editarConvenio" data-id="' + c.id + '">Editar</button>' : '') + '</li>').join('') + '</ul>';
  }

  function vistaConvenios() {
    return '<section class="tarjeta"><div class="tarjeta-cab"><h2>Convenios del club</h2><button class="btn primario" data-act="nuevoConvenio">+ Nuevo convenio</button></div>' +
      '<p class="suave" style="font-size:.85rem;margin-bottom:8px">Los jugadores ven estos convenios en su perfil.</p>' + listaConvenios(true) + '</section>';
  }

  function formConvenio(c) {
    const nuevo = !c;
    c = c || {};
    return '<form id="form-modal">' + (nuevo ? '' : '<input type="hidden" name="id" value="' + c.id + '">') +
      campo('Empresa / institución', input('empresa', c.empresa, 'required maxlength="80"')) +
      campo('Beneficio', input('beneficio', c.beneficio, 'placeholder="Ej: 20% de descuento" maxlength="120"')) +
      campo('Detalle / cómo usarlo', '<textarea name="detalle" maxlength="400">' + h(c.detalle || '') + '</textarea>') +
      pie(nuevo ? 'Publicar' : 'Guardar', nuevo ? '' : '<button type="button" class="btn peligro" data-act="borrarConvenio" data-id="' + c.id + '" style="margin-right:auto">Eliminar</button>') + '</form>';
  }

  // ---------- Ajustes (directiva) ----------
  function vistaAjustes() {
    const cfg = S.view.config;
    const staff = S.view.usuarios.filter((u) => u.rol !== 'jugador').sort((a, b) => a.rol.localeCompare(b.rol) || a.nombre.localeCompare(b.nombre));
    return '<div class="rejilla">' +
      '<section class="tarjeta"><h2>Precios de cuotas</h2><p class="suave" style="font-size:.85rem;margin-bottom:12px">Mensualidad por categoría. Los descuentos o becas se asignan en la ficha de cada jugador.</p>' +
      '<form data-form="config"><div class="campos">' + cfg.categorias.map((c) => campo(c, '<input name="cuota_' + h(c) + '" type="number" min="0" step="500" value="' + (cfg.cuotas[c] || 0) + '">')).join('') + '</div>' +
      '<div class="campos">' + campo('Monto federativo anual', input('montoFederativo', cfg.montoFederativo, 'type="number" min="0" step="500"')) +
      campo('Día de vencimiento', input('diaVencimiento', cfg.diaVencimiento, 'type="number" min="1" max="28"')) + '</div>' +
      '<label class="campo">Meses que se cobran</label><div class="chequeos">' + C.MESES.map((m, i) => '<label><input type="checkbox" name="mesesCobro[]" value="' + i + '"' + (cfg.mesesCobro.includes(i) ? ' checked' : '') + '> ' + m + '</label>').join('') + '</div>' +
      '<button class="btn primario">Guardar precios</button></form></section>' +
      '<section class="tarjeta"><h2>Categorías</h2><p class="suave" style="font-size:.85rem;margin-bottom:12px">Una por línea.</p>' +
      '<form data-form="categorias"><textarea class="entrada" name="categorias" rows="8">' + h(cfg.categorias.join('\n')) + '</textarea><div style="margin-top:12px"><button class="btn primario">Guardar categorías</button></div></form></section>' +
      '<section class="tarjeta"><div class="tarjeta-cab"><h2>Directiva y entrenadores</h2><button class="btn primario" data-act="nuevoStaff">+ Agregar</button></div><ul class="lista">' +
      staff.map((u) => '<li><div class="crece"><b>' + h(u.nombre) + '</b><small>' + h(C.formatearRut(u.rut)) + ' · ' + h(u.cargo || u.rol) + (u.claveInicial ? ' · clave inicial' : '') + '</small></div>' +
        insignia(u.rol === 'directiva' ? 'Directiva' : 'Entrenador', u.rol === 'directiva' ? 'oro' : '') + (u.activo === false ? insignia('Inactivo', 'mal') : '') +
        (u.rut !== S.view.yo ? '<button class="btn mini" data-act="resetClave" data-rut="' + u.rut + '">Clave</button><button class="btn mini peligro" data-act="activoStaff" data-rut="' + u.rut + '" data-activo="' + (u.activo === false ? '1' : '') + '">' + (u.activo === false ? 'Activar' : 'Desactivar') + '</button>' : '') + '</li>').join('') +
      '</ul></section>' +
      (S.modo === 'local' ? '<section class="tarjeta"><h2>Datos de demostración</h2><p class="suave" style="font-size:.85rem;margin-bottom:12px">Borra los cambios hechos en este navegador y vuelve a los datos de ejemplo.</p><button class="btn peligro" data-act="reiniciarDemo">Reiniciar demo</button></section>' : '') +
      '</div>';
  }

  // ---------- Calendario ----------
  function vistaCalendario() {
    const jug = !esStaff();
    let ents = S.view.entrenamientos.map((e) => Object.assign({ _t: 'e' }, e));
    let parts = S.view.partidos.map((m) => Object.assign({ _t: 'p' }, m));
    if (!jug && S.filtroCat) { ents = ents.filter((e) => e.categorias.includes(S.filtroCat)); parts = parts.filter((m) => m.categoria === S.filtroCat); }
    const todos = S.verPasados ? pasados(ents.concat(parts)).slice(0, 60) : proximos(ents.concat(parts)).slice(0, 60);
    const grupos = {};
    todos.forEach((x) => { const k = x.fecha.slice(0, 7); (grupos[k] = grupos[k] || []).push(x); });
    const html = Object.keys(grupos).map((k) => {
      const [a, m] = k.split('-');
      return '<section class="tarjeta"><h2 style="text-transform:capitalize;margin-bottom:8px">' + new Date(+a, +m - 1, 1).toLocaleDateString('es-CL', { month: 'long', year: 'numeric' }) + '</h2><ul class="lista">' +
        grupos[k].map((x) => x._t === 'p'
          ? '<li>' + fechaCaja(x.fecha, true) + '<div class="crece"><b>Partido vs ' + h(x.rival) + '</b><small>' + h(fLarga(x.fecha)) + ' · ' + h(x.hora) + ' · ' + h(x.condicion) + ' · ' + h(x.lugar || '') + '</small></div>' + insignia(x.categoria, 'oro') + (jug && x.miCitacion ? insignia('Citado', 'ok') : '') + '</li>'
          : '<li>' + fechaCaja(x.fecha) + '<div class="crece"><b>Entrenamiento' + (x.tema ? ': ' + h(x.tema) : '') + '</b><small>' + h(fLarga(x.fecha)) + ' · ' + h(x.hora) + ' · ' + h(x.lugar || '') + '</small></div>' +
            (jug && x.miAsistencia ? insignia({ P: 'Asististe', A: 'Ausente', J: 'Justificado' }[x.miAsistencia], { P: 'ok', A: 'mal', J: 'alerta' }[x.miAsistencia]) : '') + '</li>').join('') + '</ul></section>';
    }).join('');
    return '<div class="pila"><div class="filtros">' + (jug ? '' : filtroCategoria()) +
      '<select data-cambio="verPasados" aria-label="Periodo"><option value="">Próximos</option><option value="1"' + (S.verPasados ? ' selected' : '') + '>Anteriores</option></select></div>' +
      (html || '<section class="tarjeta">' + vacio('No hay eventos.') + '</section>') + '</div>';
  }

  // ---------- Perfil del jugador ----------
  function vistaPerfil() {
    const j = yo();
    const e = C.edad(j.fechaNac);
    const res = S.view.resumen;
    const a = res.asistencia;
    const fed = C.federativoPagado(S.view, j.rut, ANIO);
    const cobrados = S.view.config.mesesCobro;
    const pagados = cobrados.filter((m) => estadoMes(j.rut, ANIO, m) === 'pagado').length;
    const vencidos = cobrados.filter((m) => estadoMes(j.rut, ANIO, m) === 'vencido').length;
    const misPartidos = proximos(S.view.partidos);
    const misEntr = proximos(S.view.entrenamientos).slice(0, 3);
    const les = S.view.lesiones.slice().sort((x, y) => (x.estado === y.estado ? y.fecha.localeCompare(x.fecha) : x.estado === 'activa' ? -1 : 1));

    const partidosHtml = misPartidos.length ? '<ul class="lista">' + misPartidos.map((m) => {
      let cit = '';
      if (m.miCitacion) {
        cit = '<div class="fila" style="gap:6px;margin-top:8px">' + insignia('Estás citado', 'ok') +
          (m.miCitacion === 'confirmado' ? insignia('Confirmaste', 'ok') : m.miCitacion === 'rechazado' ? insignia('Avisaste que no puedes', 'mal') : '') +
          '<button class="btn mini primario" data-act="responder" data-id="' + m.id + '" data-r="confirmado">Voy</button><button class="btn mini" data-act="responder" data-id="' + m.id + '" data-r="rechazado">No puedo</button></div>';
      }
      return '<li style="align-items:flex-start">' + fechaCaja(m.fecha, true) + '<div class="crece"><b>vs ' + h(m.rival) + '</b><small>' + h(fLarga(m.fecha)) + ' · ' + h(m.hora) + (m.presentacion ? ' · presentarse ' + h(m.presentacion) : '') + '<br>' + h(m.condicion) + ' · ' + h(m.lugar || '') + (m.competicion ? ' · ' + h(m.competicion) : '') + '</small>' +
        (m.notas ? '<p style="font-size:.85rem">' + h(m.notas) + '</p>' : '') + cit +
        (m.citadosLista.length ? '<details style="margin-top:6px"><summary class="suave" style="font-size:.82rem;cursor:pointer">Ver citados (' + m.citadosLista.length + ')</summary><small>' + m.citadosLista.map((c) => (c.numero != null ? '#' + h(c.numero) + ' ' : '') + h(c.nombre)).join(', ') + '</small></details>' : '') +
        '</div></li>';
    }).join('') + '</ul>' : vacio('No hay partidos próximos para tu categoría.');

    return '<div class="pila">' +
      (j.claveInicial ? '<div class="aviso">Estás usando tu clave inicial (4 primeros dígitos del RUT). Te recomendamos <button class="btn mini" data-act="clave">cambiarla</button></div>' : '') +
      '<section class="perfil"><div class="fila"><div class="numero">' + (j.numero != null ? h(j.numero) : '–') + '</div><div style="flex:1;min-width:0"><h1>' + h(j.nombre) + '</h1>' +
      '<div class="fila" style="gap:6px;margin-top:6px">' + (fed ? insignia('Habilitado para jugar', 'ok') : insignia('No habilitado: federativo pendiente', 'mal')) + '</div></div></div>' +
      '<div class="datos"><div><small>Edad</small><b>' + (e == null ? '–' : e + ' años') + '</b></div><div><small>Categoría</small><b>' + h(j.categoria) + '</b></div>' +
      '<div><small>N° camiseta</small><b>' + (j.numero != null ? h(j.numero) : '–') + '</b></div><div><small>Posición</small><b>' + h(j.posicion || '–') + '</b></div>' +
      '<div><small>RUT</small><b>' + h(C.formatearRut(j.rut)) + '</b></div></div>' +
      '<div class="fila" style="margin-top:14px"><button class="btn mini" data-act="misDatos">Editar mis datos de contacto</button></div></section>' +

      '<div class="rejilla">' +
      '<section class="tarjeta"><div class="tarjeta-cab"><h2>Lesiones y dolores</h2><button class="btn primario mini" data-act="lesionPara">+ Reportar</button></div>' +
      '<p class="suave" style="font-size:.82rem;margin-bottom:6px">Lo que reportes lo ven tu entrenador y la directiva.</p>' +
      (les.length ? '<ul class="lista">' + les.map(itemLesion).join('') + '</ul>' : vacio('No tienes lesiones ni dolores reportados. ¡Bien!')) + '</section>' +
      '<section class="tarjeta"><div class="tarjeta-cab"><h2>Próximos partidos</h2></div>' + partidosHtml + '</section>' +
      '<section class="tarjeta"><div class="tarjeta-cab"><h2>Próximos entrenamientos</h2><button class="btn mini" data-act="tab" data-tab="calendario">Calendario</button></div>' +
      (misEntr.length ? '<ul class="lista">' + misEntr.map(itemEntrenamiento).join('') + '</ul>' : vacio('Sin entrenamientos programados.')) + '</section>' +
      '</div>' +

      '<section class="tarjeta"><div class="tarjeta-cab"><h2>Mensualidades ' + ANIO + '</h2>' + (vencidos ? insignia(vencidos + ' atrasada' + (vencidos > 1 ? 's' : ''), 'mal') : insignia('Al día', 'ok')) + '</div>' +
      '<p class="suave" style="font-size:.85rem;margin-bottom:10px">Cuota mensual: <b>' + clp(res.cuota) + '</b> · ' + pagados + ' de ' + cobrados.length + ' pagadas · vencen el día ' + S.view.config.diaVencimiento + '</p>' +
      '<div class="meses">' + C.MESES.map((nom, m) => {
        const est = estadoMes(j.rut, ANIO, m);
        return '<div class="mes ' + est + '">' + nom + '<span>' + ({ pagado: '✓ Pagada', vencido: 'Debe', pendiente: 'Pendiente', no: '–' }[est]) + '</span></div>';
      }).join('') + '</div>' +
      '<div class="fila entre" style="margin-top:14px;padding-top:12px;border-top:1px solid var(--borde)"><div><b>Federativo ' + ANIO + '</b><br><small>' + clp(S.view.config.montoFederativo) + ' · necesario para jugar partidos oficiales</small></div>' + (fed ? insignia('Pagado', 'ok') : insignia('Pendiente', 'mal')) + '</div></section>' +

      '<div class="rejilla">' +
      '<section class="tarjeta"><h2>Asistencia a entrenamientos ' + ANIO + '</h2><div class="fila" style="margin:12px 0"><div class="stat-grande">' + a.asistidos + '<small style="font-size:1rem"> / ' + a.realizados + '</small></div><div class="suave" style="font-size:.85rem">Asististe a ' + a.asistidos + ' de ' + a.realizados + ' entrenamientos realizados' + (a.justificados ? ' (' + a.justificados + ' ausencias justificadas)' : '') + '</div></div>' +
      '<div class="barra"><div style="width:' + a.porcentaje + '%"></div></div><p class="suave" style="text-align:right;font-size:.85rem">' + a.porcentaje + '%</p></section>' +
      '<section class="tarjeta"><h2>Convenios del club</h2>' + listaConvenios(false) + '</section>' +
      '</div></div>';
  }

  function formMisDatos(j) {
    return '<form id="form-modal"><input type="hidden" name="rut" value="' + j.rut + '">' +
      campo('Teléfono', input('telefono', j.telefono, 'type="tel"')) + campo('Email', input('email', j.email, 'type="email"')) +
      campo('Contacto de emergencia', input('contactoEmergencia', j.contactoEmergencia, 'placeholder="Nombre y teléfono"')) +
      campo('Previsión de salud', input('prevision', j.prevision)) +
      '<p class="suave" style="font-size:.82rem">Nombre, categoría y número de camiseta los actualiza el entrenador o la directiva.</p>' + pie() + '</form>';
  }

  // ---------- Render ----------
  const VISTAS = { inicio: vistaInicio, jugadores: vistaJugadores, finanzas: vistaFinanzas, entrenamientos: vistaEntrenamientos, partidos: vistaPartidos, lesiones: vistaLesiones, convenios: vistaConvenios, ajustes: vistaAjustes, calendario: vistaCalendario, perfil: vistaPerfil };

  function render() {
    const app = $('#app');
    if (!S.view) { app.innerHTML = vistaLogin(); return; }
    const permitidas = PESTANAS[rol()].map((p) => p[0]);
    if (!permitidas.includes(S.tab)) S.tab = permitidas[0];
    const enfocado = document.activeElement && document.activeElement.dataset && document.activeElement.dataset.cambio;
    const y = window.scrollY;
    app.innerHTML = shell(VISTAS[S.tab]());
    window.scrollTo(0, y);
    if (enfocado === 'busqueda') { const i = $('[data-cambio="busqueda"]'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }
  }

  function enviarConError(promesa) {
    return promesa.then((ok) => { if (ok) cerrarModal(); });
  }

  // ---------- Acciones de botones ----------
  const ACCIONES = {
    tab: (d) => { S.tab = d.tab; render(); window.scrollTo(0, 0); },
    cerrarModal,
    salir: async () => { await B().salir(); S.view = null; S.tab = null; render(); },
    rellenarDemo: (d) => {
      const f = $('#form-login');
      f.rut.value = C.formatearRut(d.rut); f.clave.value = C.claveInicial(d.rut);
    },
    clave: () => abrirModal('Cambiar clave', '<form id="form-modal">' +
      campo('Clave actual', '<input name="actual" type="password" required autocomplete="current-password">') +
      campo('Nueva clave', '<input name="nueva" type="password" required minlength="4" autocomplete="new-password">') +
      campo('Repite la nueva clave', '<input name="repetir" type="password" required minlength="4" autocomplete="new-password">') + pie('Cambiar clave') + '</form>',
    async (o) => {
      if (o.nueva !== o.repetir) throw new Error('Las claves nuevas no coinciden');
      S.view = await B().clave(o.actual, o.nueva);
      render(); toast('Clave actualizada', 'ok'); return true;
    }),

    // Jugadores
    nuevoJugador: () => abrirModal('Inscribir jugador', formJugador(), (o) => accion('jugador.crear', o, 'Jugador inscrito')),
    verJugador: (d) => abrirModal('Ficha del jugador', fichaJugador(d.rut)),
    editarJugador: (d) => abrirModal('Editar jugador', formJugador(usuario(d.rut)), (o) => accion('jugador.editar', o, 'Datos guardados')),
    misDatos: () => abrirModal('Mis datos de contacto', formMisDatos(yo()), (o) => accion('jugador.editar', o, 'Datos guardados')),
    activoJugador: (d) => {
      if (!confirm(d.activo ? '¿Reactivar a este jugador?' : '¿Dar de baja a este jugador? Ya no podrá ingresar.')) return;
      enviarConError(accion('jugador.activo', { rut: d.rut, activo: !!d.activo }, 'Listo'));
    },
    resetClave: (d) => {
      if (!confirm('¿Restablecer la clave a los primeros 4 dígitos del RUT?')) return;
      accion('clave.resetear', { rut: d.rut }, 'Clave restablecida a ' + C.claveInicial(d.rut));
    },

    // Finanzas
    pago: (d) => {
      const rut = d.rut, mes = Number(d.mes), anio = S.anioFin;
      const p = C.pagoMes(S.view, rut, anio, mes);
      const j = usuario(rut);
      if (p && p.pagado) {
        abrirModal('Pago de ' + C.MESES[mes] + ' ' + anio, '<p><b>' + h(j.nombre) + '</b></p><p>Pagado ' + clp(p.monto) + ' el ' + h(p.fecha) + ' (' + h(p.metodo) + ')</p>' +
          '<div class="modal-pie"><button class="btn peligro" data-act="anularPago" data-rut="' + rut + '" data-mes="' + mes + '">Anular pago</button><button class="btn" data-act="cerrarModal">Cerrar</button></div>');
        return;
      }
      abrirModal('Registrar pago ' + C.MESES[mes] + ' ' + anio, '<form id="form-modal"><p><b>' + h(j.nombre) + '</b> · ' + h(j.categoria) + '</p>' +
        '<div class="campos">' + campo('Monto', input('monto', C.cuotaDe(S.view, j), 'type="number" min="0" required')) + campo('Fecha de pago', input('fecha', HOY, 'type="date"')) +
        campo('Método', '<select name="metodo">' + opciones(['Transferencia', 'Efectivo', 'Débito', 'Crédito', 'Otro'], 'Transferencia') + '</select>') + '</div>' + pie('Registrar pago') + '</form>',
      (o) => accion('pago.marcar', Object.assign(o, { rut, mes, anio, pagado: true }), 'Pago registrado'));
    },
    anularPago: (d) => enviarConError(accion('pago.marcar', { rut: d.rut, mes: Number(d.mes), anio: S.anioFin, pagado: false }, 'Pago anulado')),
    federativo: (d) => {
      const anio = S.anioFin, j = usuario(d.rut);
      if (C.federativoPagado(S.view, d.rut, anio)) {
        if (confirm('¿Anular el federativo ' + anio + ' de ' + j.nombre + '? Quedará NO habilitado para jugar.')) accion('federativo.marcar', { rut: d.rut, anio, pagado: false }, 'Federativo anulado');
        return;
      }
      abrirModal('Federativo ' + anio, '<form id="form-modal"><p><b>' + h(j.nombre) + '</b></p><div class="campos">' +
        campo('Monto', input('monto', S.view.config.montoFederativo, 'type="number" min="0" required')) + campo('Fecha', input('fecha', HOY, 'type="date"')) + '</div>' +
        '<p class="suave" style="font-size:.85rem">Al registrarlo, el jugador queda habilitado para jugar.</p>' + pie('Registrar federativo') + '</form>',
      (o) => accion('federativo.marcar', Object.assign(o, { rut: d.rut, anio, pagado: true }), 'Federativo registrado: jugador habilitado'));
    },
    nuevoMovimiento: () => abrirModal('Ingreso o gasto', '<form id="form-modal"><div class="campos">' +
      campo('Tipo', '<select name="tipo"><option value="ingreso">Ingreso</option><option value="gasto">Gasto</option></select>') + campo('Fecha', input('fecha', HOY, 'type="date"')) + '</div>' +
      campo('Concepto', input('concepto', '', 'required placeholder="Ej: arriendo gimnasio, auspicio, rifa"')) + campo('Monto', input('monto', '', 'type="number" min="1" required')) + pie('Registrar') + '</form>',
    (o) => accion('movimiento.crear', o, 'Movimiento registrado')),
    borrarMovimiento: (d) => { if (confirm('¿Eliminar este movimiento?')) accion('movimiento.eliminar', { id: d.id }); },

    // Entrenamientos
    nuevoEntrenamiento: () => abrirModal('Programar entrenamiento', formEntrenamiento(), (o) => accion('entrenamiento.guardar', o, 'Entrenamiento programado')),
    editarEntrenamiento: (d) => abrirModal('Editar entrenamiento', formEntrenamiento(S.view.entrenamientos.find((e) => e.id === d.id)), (o) => accion('entrenamiento.guardar', o, 'Guardado')),
    borrarEntrenamiento: (d) => { if (confirm('¿Eliminar este entrenamiento?')) enviarConError(accion('entrenamiento.eliminar', { id: d.id }, 'Eliminado')); },
    asistencia: (d) => {
      const e = S.view.entrenamientos.find((x) => x.id === d.id);
      abrirModal('Asistencia', formAsistencia(e), (o) => {
        const asistencia = {};
        Object.keys(o).forEach((k) => { if (k.startsWith('a_')) asistencia[k.slice(2)] = o[k]; });
        return accion('asistencia.guardar', { id: e.id, asistencia }, 'Asistencia guardada');
      });
    },

    // Partidos
    nuevoPartido: () => abrirModal('Nuevo partido', formPartido(), (o) => accion('partido.guardar', o, 'Partido creado')),
    editarPartido: (d) => abrirModal('Editar partido', formPartido(S.view.partidos.find((m) => m.id === d.id)), (o) => accion('partido.guardar', o, 'Guardado')),
    borrarPartido: (d) => { if (confirm('¿Eliminar este partido?')) enviarConError(accion('partido.eliminar', { id: d.id }, 'Eliminado')); },
    citar: (d) => abrirCitacion(d.id, false),
    citarTodas: (d) => abrirCitacion(d.id, true),
    resultado: (d) => {
      const m = S.view.partidos.find((x) => x.id === d.id);
      abrirModal('Resultado vs ' + m.rival, '<form id="form-modal"><div class="campos">' + campo('Vieux Gaulois', input('nuestro', m.resultado ? m.resultado.nuestro : '', 'type="number" min="0"')) +
        campo(m.rival, input('rival', m.resultado ? m.resultado.rival : '', 'type="number" min="0"')) + '</div>' + pie() + '</form>',
      (o) => accion('partido.resultado', { id: m.id, nuestro: o.nuestro, rival: o.rival }, 'Resultado guardado'));
    },
    responder: (d) => accion('citacion.responder', { id: d.id, respuesta: d.r }, d.r === 'confirmado' ? '¡Confirmado! Nos vemos en la cancha' : 'Avisamos al entrenador'),

    // Lesiones
    lesionPara: (d) => abrirModal(esStaff() ? 'Registrar lesión o dolor' : 'Reportar lesión o dolor', formLesion(null, d.rut), (o) => accion('lesion.crear', o, esStaff() ? 'Registrado' : 'Reporte enviado al entrenador y la directiva')),
    editarLesion: (d) => abrirModal(esStaff() ? 'Gestionar reporte' : 'Actualizar reporte', formLesion(S.view.lesiones.find((l) => l.id === d.id)), (o) => accion('lesion.editar', o, 'Actualizado')),
    lesionVisto: (d) => accion('lesion.visto', { id: d.id }),
    lesionVistoTodo: () => accion('lesion.visto', { ids: sinVer().map((l) => l.id) }, 'Todo revisado'),

    // Convenios
    nuevoConvenio: () => abrirModal('Nuevo convenio', formConvenio(), (o) => accion('convenio.guardar', o, 'Convenio publicado')),
    editarConvenio: (d) => abrirModal('Editar convenio', formConvenio(S.view.convenios.find((c) => c.id === d.id)), (o) => accion('convenio.guardar', o, 'Guardado')),
    borrarConvenio: (d) => { if (confirm('¿Eliminar este convenio?')) enviarConError(accion('convenio.eliminar', { id: d.id }, 'Eliminado')); },

    // Staff
    nuevoStaff: () => abrirModal('Agregar directiva o entrenador', '<form id="form-modal">' +
      campo('RUT', input('rut', '', 'required placeholder="12.345.678-9"')) + campo('Nombre', input('nombre', '', 'required')) +
      '<div class="campos">' + campo('Rol', '<select name="rol"><option value="entrenador">Entrenador</option><option value="directiva">Directiva</option></select>') +
      campo('Cargo', input('cargo', '', 'placeholder="Ej: Tesorero, Entrenador Juvenil"')) + campo('Teléfono', input('telefono', '', 'type="tel"')) + campo('Email', input('email', '', 'type="email"')) + '</div>' +
      '<p class="suave" style="font-size:.82rem">Ingresa con su RUT y los primeros 4 dígitos como clave.</p>' + pie('Agregar') + '</form>',
    (o) => accion('staff.crear', o, 'Usuario agregado')),
    activoStaff: (d) => { if (confirm(d.activo ? '¿Activar esta cuenta?' : '¿Desactivar esta cuenta? No podrá ingresar.')) accion('staff.activo', { rut: d.rut, activo: !!d.activo }, 'Listo'); },
    reiniciarDemo: () => {
      if (!confirm('¿Borrar todos los cambios y volver a los datos de ejemplo?')) return;
      Local.db = C.dbEjemplo(); Local.guardar(); Local.salir(); S.view = null; render();
    },
  };

  function abrirCitacion(id, todas) {
    const m = S.view.partidos.find((x) => x.id === id);
    abrirModal('Citar jugadores', formCitacion(m, todas), (o) => {
      const noHab = (o.ruts || []).filter((r) => !hab(r));
      if (noHab.length && !confirm(noHab.map((r) => usuario(r).nombre).join(', ') + (noHab.length > 1 ? ' no están habilitados' : ' no está habilitado') + ' (federativo pendiente). ¿Citar igual?')) return Promise.resolve(false);
      return accion('citacion.guardar', { id: m.id, ruts: o.ruts || [] }, 'Citación guardada: ' + (o.ruts || []).length + ' jugadores');
    });
  }

  // ---------- Eventos ----------
  document.addEventListener('click', (ev) => {
    const el = ev.target.closest('[data-act]');
    if (el && ACCIONES[el.dataset.act]) {
      ev.preventDefault();
      ACCIONES[el.dataset.act](el.dataset, el);
      return;
    }
    if (ev.target.id === 'modal') cerrarModal();
  });

  document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape' && !$('#modal').hidden) cerrarModal(); });

  document.addEventListener('change', (ev) => {
    const k = ev.target.dataset && ev.target.dataset.cambio;
    if (k === 'filtroCat') { S.filtroCat = ev.target.value; guardarLS('vg_cat', S.filtroCat); render(); }
    else if (k === 'anioFin') { S.anioFin = Number(ev.target.value); render(); }
    else if (k === 'verInactivos') { S.verInactivos = ev.target.checked; render(); }
    else if (k === 'verPasados') { S.verPasados = !!ev.target.value; render(); }
    if (ev.target.name === 'ruts[]') {
      const malos = Array.from(document.querySelectorAll('input[name="ruts[]"]:checked')).filter((i) => i.dataset.hab === '0');
      const av = $('#aviso-hab');
      if (av) { av.hidden = !malos.length; av.textContent = malos.length + ' jugador(es) seleccionados NO están habilitados (federativo pendiente).'; }
    }
  });

  document.addEventListener('input', (ev) => {
    if (ev.target.dataset && ev.target.dataset.cambio === 'busqueda') { S.busqueda = ev.target.value; render(); }
    if (ev.target.id === 'login-rut' || (ev.target.name === 'rut' && ev.target.form && ev.target.form.id === 'form-modal' && ev.target.type !== 'hidden')) {
      const limpio = C.limpiarRut(ev.target.value).slice(0, 9);
      ev.target.value = limpio.length > 1 ? C.formatearRut(limpio.slice(0, -1) + '-' + limpio.slice(-1)) : limpio;
    }
  });

  document.addEventListener('submit', async (ev) => {
    const f = ev.target;
    ev.preventDefault();
    if (f.id === 'form-login') {
      const btn = f.querySelector('button'); btn.disabled = true;
      try {
        S.view = await B().login(f.rut.value, f.clave.value);
        S.tab = null; render();
      } catch (e) {
        $('#login-error').textContent = e.message;
      } finally { btn.disabled = false; }
      return;
    }
    if (f.id === 'form-modal' && alEnviar) {
      const btn = f.querySelector('.modal-pie .primario');
      if (btn) btn.disabled = true;
      try {
        const ok = await alEnviar(datosForm(f));
        if (ok) cerrarModal();
      } catch (e) {
        const err = $('#form-error'); if (err) err.textContent = e.message; else toast(e.message, 'error');
      } finally { if (btn && document.body.contains(btn)) btn.disabled = false; }
      return;
    }
    if (f.dataset.form === 'config') {
      const o = datosForm(f);
      const cuotas = {};
      cats().forEach((c) => { cuotas[c] = o['cuota_' + c]; });
      accion('config.guardar', { cuotas, montoFederativo: o.montoFederativo, diaVencimiento: o.diaVencimiento, mesesCobro: o.mesesCobro }, 'Precios guardados');
    }
    if (f.dataset.form === 'categorias') {
      const lista = f.categorias.value.split('\n').map((s) => s.trim()).filter(Boolean);
      const cuotas = Object.assign({}, S.view.config.cuotas);
      accion('config.guardar', { categorias: lista, cuotas }, 'Categorías guardadas');
    }
  });

  // ---------- Inicio ----------
  async function iniciar() {
    try {
      const r = await fetch('api/ping', { cache: 'no-store' });
      const d = r.ok ? await r.json() : null;
      if (!d || !d.ok) throw new Error('sin servidor');
      S.modo = 'servidor'; S.demo = !!d.demo;
    } catch (e) {
      S.modo = 'local'; S.demo = true; Local.cargar();
    }
    try { S.view = await B().estado(); } catch (e) { S.view = null; }
    render();
  }

  iniciar();
})();
