/* Vieux Gaulois Handball: interfaz. Depende de core.js (window.VGCore). */
(function () {
  'use strict';
  const C = window.VGCore;
  const ANIO = new Date().getFullYear();
  const HOY = C.hoyISO();
  // En la versión de un solo archivo el escudo viene incrustado (ver scripts/build-demo.js).
  const ESCUDO = window.VG_ESCUDO || 'escudo.png';

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
    return sha256Js(texto);
  }

  // SHA-256 en JavaScript puro, para navegadores sin crypto.subtle (página abierta sin HTTPS).
  function sha256Js(texto) {
    const K = [];
    let n = 2;
    while (K.length < 64) {
      let primo = true;
      for (let d = 2; d * d <= n; d++) if (n % d === 0) { primo = false; break; }
      if (primo) K.push((Math.pow(n, 1 / 3) % 1) * 4294967296 | 0);
      n++;
    }
    const H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
    const bytes = Array.from(new TextEncoder().encode(texto));
    const bits = bytes.length * 8;
    bytes.push(0x80);
    while (bytes.length % 64 !== 56) bytes.push(0);
    for (let i = 7; i >= 0; i--) bytes.push(i >= 4 ? 0 : (bits >>> (i * 8)) & 0xff);
    const rot = (x, k) => (x >>> k) | (x << (32 - k));
    for (let o = 0; o < bytes.length; o += 64) {
      const W = [];
      for (let i = 0; i < 64; i++) {
        if (i < 16) W[i] = (bytes[o + i * 4] << 24) | (bytes[o + i * 4 + 1] << 16) | (bytes[o + i * 4 + 2] << 8) | bytes[o + i * 4 + 3];
        else {
          const s0 = rot(W[i - 15], 7) ^ rot(W[i - 15], 18) ^ (W[i - 15] >>> 3);
          const s1 = rot(W[i - 2], 17) ^ rot(W[i - 2], 19) ^ (W[i - 2] >>> 10);
          W[i] = (W[i - 16] + s0 + W[i - 7] + s1) | 0;
        }
      }
      let [a, b, c, d, e, f, g, hh] = H;
      for (let i = 0; i < 64; i++) {
        const t1 = (hh + (rot(e, 6) ^ rot(e, 11) ^ rot(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + W[i]) | 0;
        const t2 = ((rot(a, 2) ^ rot(a, 13) ^ rot(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
        hh = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
      }
      [a, b, c, d, e, f, g, hh].forEach((v, i) => { H[i] = (H[i] + v) | 0; });
    }
    return H.map((v) => (v >>> 0).toString(16).padStart(8, '0')).join('');
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
      if (!this.db || !this.db.usuarios || this.db.version !== C.dbVacia().version) { this.db = C.dbEjemplo(); this.guardar(); this.rut = null; }
    },
    guardar() { guardarLS('vg_db', JSON.stringify(this.db)); },
    async login(rut, clave) {
      const r = C.idDeIngreso(rut);
      if (!r) throw new ErrorApi('Ingresa tu RUT (jugadores) o tu usuario (entrenadores y directiva)');
      const u = this.db.usuarios.find((x) => x.rut === r);
      if (!(await C.verificarClave(u, clave, sha256))) throw new ErrorApi('Usuario o clave incorrectos');
      this.rut = r; guardarLS('vg_rut', r);
      return C.viewFor(this.db, r);
    },
    async estado() { return this.rut ? C.viewFor(this.db, this.rut) : null; },
    async accion(type, payload) {
      const copia = C.clone(this.db);
      C.applyAction(copia, this.rut, await C.prepararAccion({ type, payload }, sha256));
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
  const cuentaEntrenador = (rutJugador) => S.view.usuarios.find((u) => u.rol !== 'jugador' && u.activo !== false && u.jugadorRut === rutJugador);
  const lesionesActivas = (rut) => S.view.lesiones.filter((l) => l.rut === rut && l.estado === 'activa');
  const sinVer = () => S.view.lesiones.filter((l) => !l.vistoPor.includes(S.view.yo));
  const porFecha = (a, b) => (a.fecha + (a.hora || '')).localeCompare(b.fecha + (b.hora || ''));
  const proximos = (lista) => lista.filter((e) => e.fecha >= HOY).sort(porFecha);
  const pasados = (lista) => lista.filter((e) => e.fecha < HOY).sort(porFecha).reverse();
  const etiqueta = (j) => C.etiquetaCategoria(j);
  const avisos = () => (S.view.avisos || []).slice().sort((a, b) => (b.fijado ? 1 : 0) - (a.fijado ? 1 : 0) || b.fecha.localeCompare(a.fecha));
  const avisosVistos = () => { try { return JSON.parse(leerLS('vg_av_' + S.view.yo) || '[]'); } catch (e) { return []; } };
  const avisosNuevos = () => { const v = avisosVistos(); return avisos().filter((a) => !v.includes(a.id) && a.autor !== S.view.yo).length; };

  // ---------- Tema día / noche ----------
  // auto sigue al sistema; claro y oscuro se fijan a mano y se recuerdan en este navegador.
  const TEMAS = { auto: 'Automático', claro: 'Día', oscuro: 'Noche' };
  const temaActual = () => (TEMAS[leerLS('vg_tema')] ? leerLS('vg_tema') : 'auto');
  const oscuroSistema = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  function aplicarTema() {
    const t = temaActual();
    if (t === 'auto') delete document.documentElement.dataset.tema; else document.documentElement.dataset.tema = t;
    const noche = t === 'oscuro' || (t === 'auto' && oscuroSistema && oscuroSistema.matches);
    const meta = $('meta[name="theme-color"]');
    if (meta) meta.content = noche ? '#0B1230' : '#14307A';
  }
  aplicarTema();
  if (oscuroSistema && oscuroSistema.addEventListener) oscuroSistema.addEventListener('change', aplicarTema);
  const botonTema = () => { const t = temaActual(); return '<button class="btn-tema" data-act="tema" aria-label="Tema: ' + TEMAS[t] + '" title="Tema: ' + TEMAS[t] + '">' + icono(t) + '</button>'; };

  // ---------- Íconos (trazo de 24px, estilo Material) ----------
  const ICONOS = {
    inicio: '<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
    avisos: '<path d="M3 10v4a1 1 0 0 0 1 1h3l7 4.5V4.5L7 9H4a1 1 0 0 0-1 1z"/><path d="M17.5 8.5a5 5 0 0 1 0 7"/>',
    jugadores: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><circle cx="17" cy="9" r="2.5"/><path d="M16.5 14.3a5 5 0 0 1 5 5.7"/>',
    finanzas: '<rect x="2.5" y="5" width="19" height="14" rx="2.5"/><path d="M2.5 10h19M6 15h4"/>',
    entrenamientos: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5M9.5 2.5h5"/>',
    partidos: '<path d="M8 4h8v5a4 4 0 0 1-8 0zM8 6H4.5a3 3 0 0 0 3.5 4M16 6h3.5a3 3 0 0 1-3.5 4M12 13v4M8 20.5h8M9.5 17h5v3.5h-5z"/>',
    lesiones: '<path d="M12 20.5s-7.5-4.6-9.3-9.2C1.4 7.9 3.6 4.5 7 4.5c2 0 3.6 1.2 5 3 1.4-1.8 3-3 5-3 3.4 0 5.6 3.4 4.3 6.8-1.8 4.6-9.3 9.2-9.3 9.2z"/>',
    documentos: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4M9 12h6M9 16h6"/>',
    convenios: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>',
    ajustes: '<circle cx="12" cy="12" r="3"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"/>',
    calendario: '<rect x="3" y="5" width="18" height="16" rx="2.5"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    perfil: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    mas: '<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>',
    mas2: '<path d="M12 5v14M5 12h14"/>',
    claro: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    oscuro: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>',
    auto: '<circle cx="12" cy="12" r="9"/><path d="M12 3v18" /><path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor"/>',
    flecha: '<path d="M9 5l7 7-7 7"/>',
    salir: '<path d="M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M10 8l-4 4 4 4M6 12h10"/>',
    llave: '<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M17 6l3 3M15 8l2 2"/>',
    pdf: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
    copiar: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>',
    compartir: '<path d="M12 3v12M7.5 7.5L12 3l4.5 4.5M5 12v8a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-8"/>',
  };
  const icono = (n) => '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true">' + ICONOS[n] + '</svg>';

  // ---------- Componentes ----------
  const insignia = (txt, tipo) => '<span class="insignia ' + (tipo || '') + '">' + h(txt) + '</span>';
  const habInsignia = (rut) => (hab(rut) ? insignia('Habilitado', 'ok') : insignia('No habilitado', 'mal'));
  const camiseta = (j) => '<div class="camiseta">' + (j.numero != null ? h(j.numero) : '–') + '</div>';
  const fechaCaja = (iso, partido) => '<div class="fecha-caja' + (partido ? ' partido' : '') + '"><small>' + h(C.MESES[fDia(iso).getMonth()]) + '</small><b>' + fDia(iso).getDate() + '</b></div>';
  const vacio = (txt) => '<div class="vacio">' + h(txt) + '</div>';
  const opciones = (lista, sel, todas) => (todas ? '<option value="">' + h(todas) + '</option>' : '') + lista.map((c) => '<option' + (c === sel ? ' selected' : '') + '>' + h(c) + '</option>').join('');
  const campo = (etq, html, extra) => '<label class="campo"' + (extra || '') + '><span>' + h(etq) + '</span>' + html + '</label>';
  const input = (name, val, extra) => '<input name="' + name + '" value="' + h(val == null ? '' : val) + '" ' + (extra || '') + '>';
  const btnTexto = (txt, act, extra) => '<button class="btn-texto" data-act="' + act + '" ' + (extra || '') + '>' + h(txt) + '</button>';
  const seccion = (titulo, cuerpo, derecha, pieTxt) => '<section class="seccion">' + (titulo ? '<div class="seccion-cab"><h2>' + h(titulo) + '</h2>' + (derecha || '') + '</div>' : '') +
    '<div class="tarjeta">' + cuerpo + '</div>' + (pieTxt ? '<p class="seccion-pie">' + pieTxt + '</p>' : '') + '</section>';
  const linkExterno = (url, txt, clase) => '<a class="btn ' + (clase || '') + '" href="' + h(url) + '" target="_blank" rel="noopener noreferrer">' + h(txt) + '</a>';

  function opcionesCategoria(sel, todas) {
    return (todas ? '<option value="">' + h(todas) + '</option>' : '') + (S.view.config.categoriasBase || []).map((b) => '<optgroup label="' + h(b) + '">' +
      C.RAMAS.map((r) => { const c = b + ' ' + r; return '<option value="' + h(c) + '"' + (c === sel ? ' selected' : '') + '>' + h(c) + '</option>'; }).join('') + '</optgroup>').join('');
  }
  const filtroCategoria = () => '<select data-cambio="filtroCat" aria-label="Categoría">' + opcionesCategoria(S.filtroCat, 'Todas las categorías') + '</select>';

  function chequeosCategorias(name, marcadas) {
    return '<div class="cat-grupos">' + (S.view.config.categoriasBase || []).map((b) => '<div class="cat-fila"><span>' + h(b) + '</span><div>' +
      C.RAMAS.map((r) => { const c = b + ' ' + r; return '<label class="chip"><input type="checkbox" name="' + name + '[]" value="' + h(c) + '"' + (marcadas.includes(c) ? ' checked' : '') + '><span>' + h(r) + '</span></label>'; }).join('') +
      '</div></div>').join('') + '</div>';
  }

  function segmentado(nombre, valor, opcs) {
    return '<div class="segmentado" role="tablist">' + opcs.map(([v, t]) => '<button type="button" class="' + (String(valor) === String(v) ? 'activo' : '') + '" data-act="segmento" data-nombre="' + nombre + '" data-valor="' + v + '">' + h(t) + '</button>').join('') + '</div>';
  }

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

  // ---------- Toast y hojas (modales) ----------
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
    document.body.classList.add('con-hoja');
    const primero = $('#modal-cuerpo input:not([type=hidden]):not([type=checkbox]):not([type=radio]), #modal-cuerpo select, #modal-cuerpo textarea');
    if (primero && window.matchMedia('(min-width: 721px)').matches) primero.focus();
  }
  function cerrarModal() { $('#modal').hidden = true; $('#modal-cuerpo').innerHTML = ''; alEnviar = null; document.body.classList.remove('con-hoja'); }
  const pie = (txt, extra) => '<div class="error" id="form-error"></div><div class="modal-pie">' + (extra || '') + '<button class="btn primario ancho">' + h(txt || 'Guardar') + '</button></div>';

  function datosForm(form) {
    const fd = new FormData(form), o = {};
    for (const [k, v] of fd.entries()) {
      if (k.endsWith('[]')) (o[k.slice(0, -2)] = o[k.slice(0, -2)] || []).push(v);
      else o[k] = v;
    }
    form.querySelectorAll('input[name$="[]"]').forEach((i) => { const k = i.name.slice(0, -2); o[k] = o[k] || []; });
    return o;
  }

  async function copiar(txt) {
    try { await navigator.clipboard.writeText(txt); } catch (e) {
      const ta = document.createElement('textarea'); ta.value = txt; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove();
    }
    toast('Copiado. Pégalo en WhatsApp', 'ok');
  }

  // ---------- Login ----------
  function vistaLogin() {
    const demo = S.demo ? '<div class="demo"><b>Cuentas de prueba</b><span>toca una para rellenar</span>' +
      [['Directiva', 'vieux', 'vieuxg1234'], ['Entrenador', 'jorge', 'jorge1234'], ['Jugador (firma al entrar)', '20.123.456-5', '2012'], ['Jugadora becada', '20.555.666-4', '2055'], ['Entrenador y jugador', 'tomas', 'tomas1234']]
        .map(([r, u, c]) => '<button type="button" data-act="rellenarDemo" data-usuario="' + u + '" data-clave="' + c + '"><span>' + r + '</span><b>' + u + '</b><small>' + c + '</small></button>').join('') +
      '</div>' : '';
    return '<div class="login"><div class="login-fondo" aria-hidden="true"></div>' + botonTema() + '<div class="login-caja">' +
      '<div class="login-marca"><img src="' + ESCUDO + '" alt="Escudo Vieux Gaulois">' +
      '<h1>Vieux Gaulois</h1><div class="lema">HANDBALL CLUB</div><div class="franja" aria-hidden="true"><i></i><i></i><i></i></div></div>' +
      '<form id="form-login" autocomplete="on"><div class="tarjeta grupo-form">' +
      '<input name="rut" id="login-rut" aria-label="RUT o usuario" autocapitalize="none" autocorrect="off" spellcheck="false" autocomplete="username" placeholder="RUT o usuario" required>' +
      '<input name="clave" type="password" aria-label="Clave" autocomplete="current-password" placeholder="Clave" required></div>' +
      '<div class="error" id="login-error"></div>' +
      '<button class="btn primario ancho">Ingresar</button></form>' +
      '<p class="login-ayuda"><b>Jugadores:</b> RUT y los 4 primeros dígitos del RUT.<br><b>Entrenadores y directiva:</b> usuario y clave entregados por la directiva.</p>' +
      demo + '</div></div>';
  }

  // ---------- Firma de documentos (consentimiento / becados) ----------
  function vistaFirma(doc) {
    const j = yo();
    const menor = j.fechaNac && C.edad(j.fechaNac) < 18;
    const parrafos = doc.texto.split(/\n\s*\n/).map((p) => '<p>' + h(p).replace(/\n/g, '<br>') + '</p>').join('');
    return '<div class="firma"><div class="firma-caja">' +
      '<img src="' + ESCUDO + '" alt="" class="firma-escudo"><div class="franja corta" aria-hidden="true"><i></i><i></i><i></i></div>' +
      '<p class="firma-sub">' + (doc.id === 'consentimiento' ? 'Antes de comenzar' : 'La directiva te envió un documento') + '</p>' +
      '<h1>' + h(doc.titulo) + '</h1>' +
      '<div class="tarjeta firma-texto">' + parrafos + '</div>' +
      '<form id="form-firma"><input type="hidden" name="id" value="' + h(doc.id) + '">' +
      '<div class="tarjeta lista-chequeo">' + doc.puntos.map((p, i) => '<label class="celda-chequeo"><input type="checkbox" name="aceptados[]" value="' + i + '" required><span>' + h(p) + '</span></label>').join('') + '</div>' +
      '<div class="tarjeta grupo-form">' + input('nombreFirma', '', 'placeholder="Tu nombre completo (firma)" required autocomplete="name"') +
      (menor ? input('apoderado', '', 'placeholder="Nombre y RUT de tu apoderado" required') : '') + '</div>' +
      (menor ? '<p class="seccion-pie">Eres menor de edad: tu apoderado firma contigo.</p>' : '') +
      '<p class="seccion-pie">Firmas como ' + h(j.nombre) + ' (' + h(C.formatearRut(j.rut)) + ') el ' + h(fLarga(HOY)) + '.</p>' +
      '<div class="error" id="form-error"></div>' +
      '<button class="btn primario ancho">Firmo y acepto</button></form>' +
      '<button class="btn-texto centro" data-act="salir">Salir</button></div></div>';
  }

  // ---------- Pestañas por rol ----------
  const NOMBRES = {
    inicio: 'Inicio', avisos: 'Avisos', jugadores: 'Jugadores', finanzas: 'Finanzas', entrenamientos: 'Entrenamientos', partidos: 'Partidos',
    lesiones: 'Lesiones', documentos: 'Documentos', convenios: 'Convenios', ajustes: 'Ajustes', calendario: 'Calendario', perfil: 'Mi perfil', mas: 'Más',
  };
  const TABS = {
    directiva: { barra: ['inicio', 'jugadores', 'finanzas', 'partidos'], mas: ['avisos', 'entrenamientos', 'lesiones', 'documentos', 'convenios', 'calendario', 'ajustes'] },
    entrenador: { barra: ['inicio', 'jugadores', 'entrenamientos', 'partidos'], mas: ['avisos', 'lesiones', 'calendario'] },
    jugador: { barra: ['perfil', 'avisos', 'calendario'], mas: [] },
  };
  const permitidas = () => { const t = TABS[rol()]; return t.barra.concat(t.mas, t.mas.length ? ['mas'] : []); };
  const contador = (tab) => (tab === 'lesiones' ? sinVer().length : tab === 'avisos' ? avisosNuevos() : tab === 'mas' ? TABS[rol()].mas.reduce((s, t) => s + contador(t), 0) : 0);

  const BOTON_TITULO = {
    jugadores: () => esStaff() && '<button class="btn-redondo" data-act="nuevoJugador" aria-label="Inscribir jugador">' + icono('mas2') + '</button>',
    entrenamientos: () => '<button class="btn-redondo" data-act="nuevoEntrenamiento" aria-label="Programar entrenamiento">' + icono('mas2') + '</button>',
    partidos: () => '<button class="btn-redondo" data-act="nuevoPartido" aria-label="Nuevo partido">' + icono('mas2') + '</button>',
    avisos: () => esStaff() && '<button class="btn-redondo" data-act="nuevoAviso" aria-label="Nuevo aviso">' + icono('mas2') + '</button>',
    lesiones: () => '<button class="btn-redondo" data-act="lesionPara" aria-label="Registrar lesión">' + icono('mas2') + '</button>',
    convenios: () => '<button class="btn-redondo" data-act="nuevoConvenio" aria-label="Nuevo convenio">' + icono('mas2') + '</button>',
    finanzas: () => '<button class="btn-redondo" data-act="nuevoMovimiento" aria-label="Registrar ingreso o gasto">' + icono('mas2') + '</button>',
  };

  function shell(contenido) {
    const u = yo();
    const t = TABS[u.rol];
    const activa = t.mas.includes(S.tab) ? 'mas' : S.tab;
    const barra = t.barra.concat(t.mas.length ? ['mas'] : []).map((id) => {
      const n = contador(id);
      return '<button data-act="tab" data-tab="' + id + '" class="' + (activa === id ? 'activa' : '') + '"' + (activa === id ? ' aria-current="page"' : '') + '>' +
        '<span class="ind">' + icono(id) + (n ? '<i class="punto">' + n + '</i>' : '') + '</span><span class="etq">' + NOMBRES[id] + '</span></button>';
    }).join('');
    const iniciales = u.nombre.split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase();
    const botonTitulo = BOTON_TITULO[S.tab] ? BOTON_TITULO[S.tab]() : '';
    return '<header class="navbar"><img src="' + ESCUDO + '" alt=""><div class="navbar-tit"><b>Vieux Gaulois</b><small>' + h(u.cargo || u.rol) + '</small></div>' +
      botonTema() + '<button class="avatar" data-act="cuenta" aria-label="Mi cuenta">' + h(iniciales) + '</button></header>' +
      '<div class="franja" aria-hidden="true"><i></i><i></i><i></i></div>' +
      (S.modo === 'local' ? '<div class="modo-demo">Modo demo · los datos se guardan sólo en este navegador</div>' : '') +
      '<main><div class="titulo-fila"><h1 class="titulo-grande">' + h(NOMBRES[S.tab]) + '</h1></div>' + contenido + '</main>' +
      (botonTitulo ? '<div class="fab-zona">' + botonTitulo + '</div>' : '') +
      '<nav class="tabbar" aria-label="Secciones">' + barra + '</nav>';
  }

  function vistaMas() {
    const t = TABS[rol()];
    return seccion('', '<ul class="lista clic">' + t.mas.map((id) => {
      const n = contador(id);
      return '<li data-act="tab" data-tab="' + id + '"><span class="ico-celda c-' + id + '">' + icono(id) + '</span><div class="crece"><b>' + NOMBRES[id] + '</b></div>' +
        (n ? '<i class="punto">' + n + '</i>' : '') + '<span class="chevron">' + icono('flecha') + '</span></li>';
    }).join('') + '</ul>') + seccionCuenta();
  }

  function seccionCuenta() {
    return seccion('Cuenta', '<ul class="lista clic">' +
      '<li data-act="tema" data-ciclo="1"><span class="ico-celda c-tema">' + icono(temaActual()) + '</span><div class="crece"><b>Tema</b></div><span class="valor">' + TEMAS[temaActual()] + '</span></li>' +
      '<li data-act="clave"><span class="ico-celda c-gris">' + icono('llave') + '</span><div class="crece"><b>Cambiar clave</b></div><span class="chevron">' + icono('flecha') + '</span></li>' +
      '<li data-act="salir"><span class="ico-celda c-rojo">' + icono('salir') + '</span><div class="crece"><b class="rojo">Cerrar sesión</b></div></li></ul>');
  }

  // ---------- Avisos ----------
  function tarjetaAviso(a, compacto) {
    const autor = usuario(a.autor);
    const puede = esDir() || a.autor === S.view.yo;
    return '<article class="aviso-item' + (a.fijado ? ' fijado' : '') + '">' +
      '<div class="fila" style="gap:6px;margin-bottom:4px">' + (a.fijado ? insignia('Fijado', 'oro') : '') + insignia(a.categoria || 'Todo el club', a.categoria ? '' : 'azul') + '<small class="suave" style="margin-left:auto">' + h(fCorta(a.fecha)) + '</small></div>' +
      '<h3>' + h(a.titulo) + '</h3>' + (a.texto && !compacto ? '<p>' + h(a.texto).replace(/\n/g, '<br>') + '</p>' : a.texto ? '<p class="corto">' + h(a.texto) + '</p>' : '') +
      (a.fechaEvento || a.lugar ? '<p class="aviso-evento">' + (a.fechaEvento ? '🗓️ ' + h(fLarga(a.fechaEvento)) + (a.hora ? ' · ' + h(a.hora) + ' hrs' : '') : '') + (a.lugar ? '<br>🏟️ ' + h(a.lugar) : '') + '</p>' : '') +
      (!compacto ? '<div class="fila" style="gap:8px;margin-top:8px">' + (a.link ? linkExterno(a.link, 'Abrir link', 'mini') : '') +
        '<small class="suave">' + h(autor ? autor.nombre : '') + '</small>' +
        (puede ? '<span style="margin-left:auto" class="fila"><button class="btn mini" data-act="editarAviso" data-id="' + a.id + '">Editar</button><button class="btn mini peligro" data-act="borrarAviso" data-id="' + a.id + '">Eliminar</button></span>' : '') + '</div>' : '') +
      '</article>';
  }

  function vistaAvisos() {
    const lista = avisos();
    return '<p class="intro">Partidos de otras categorías, cambios de horario y noticias del club. Todos los ven.</p>' +
      (lista.length ? '<div class="pila-avisos">' + lista.map((a) => tarjetaAviso(a)).join('') + '</div>' : seccion('', vacio('Aún no hay avisos.')));
  }

  function formAviso(a) {
    const nuevo = !a;
    a = a || {};
    return '<form id="form-modal">' + (nuevo ? '' : '<input type="hidden" name="id" value="' + a.id + '">') +
      campo('Título', input('titulo', a.titulo, 'required maxlength="100" placeholder="Ej: Juvenil Femenino juega el sábado"')) +
      campo('Mensaje', '<textarea name="texto" maxlength="1000">' + h(a.texto || '') + '</textarea>') +
      campo('Categoría', '<select name="categoria">' + opcionesCategoria(a.categoria, 'Todo el club') + '</select>') +
      '<div class="campos">' + campo('Fecha del evento (opcional)', input('fechaEvento', a.fechaEvento, 'type="date"')) + campo('Hora', input('hora', a.hora, 'type="time"')) + '</div>' +
      campo('Lugar (opcional)', input('lugar', a.lugar)) + campo('Link (opcional)', input('link', a.link, 'type="url" placeholder="https://"')) +
      (esDir() ? '<label class="celda-chequeo"><input type="checkbox" name="fijado" value="1"' + (a.fijado ? ' checked' : '') + '><span>Fijar arriba</span></label>' : '') +
      pie(nuevo ? 'Publicar aviso' : 'Guardar') + '</form>';
  }

  // ---------- Inicio (directiva / entrenador) ----------
  function vistaInicio() {
    const js = jugadores();
    const habs = js.filter((j) => hab(j.rut)).length;
    const activas = S.view.lesiones.filter((l) => l.estado === 'activa');
    const nuevas = sinVer();
    const prox = proximos(S.view.partidos)[0];
    let kpis = '<div class="kpi"><small>Jugadores</small><b>' + js.length + '</b></div>' +
      '<div class="kpi verde"><small>Habilitados</small><b>' + habs + '<span>/' + js.length + '</span></b></div>' +
      '<div class="kpi rojo"><small>Lesiones activas</small><b>' + activas.length + '</b></div>';
    if (esDir()) {
      const mes = new Date().getMonth();
      let recaudado = 0, morosos = 0;
      js.forEach((j) => {
        const p = C.pagoMes(S.view, j.rut, ANIO, mes);
        if (p && p.pagado) recaudado += Number(p.monto) || 0;
        if (C.mesesAdeudados(S.view, j.rut, ANIO).filter((m) => m < mes).length) morosos++;
      });
      const pendFirmas = jugadores().filter((j) => C.documentosPendientes(S.view, j.rut).length).length;
      kpis += '<div class="kpi oro"><small>Cuotas ' + C.MESES[mes] + '</small><b>' + clp(recaudado) + '</b></div>' +
        '<div class="kpi rojo"><small>Con cuotas atrasadas</small><b>' + morosos + '</b></div>' +
        '<div class="kpi"><small>Firmas pendientes</small><b>' + pendFirmas + '</b></div>';
    }
    const semana = proximos(S.view.entrenamientos).filter((e) => e.fecha <= C.sumarDias(HOY, 7));
    const ult = avisos().slice(0, 2);
    const hero = '<section class="perfil bienvenida"><div class="perfil-fila"><img class="hero-escudo" src="' + ESCUDO + '" alt=""><div class="crece">' +
      '<small class="hero-sub">Temporada ' + ANIO + '</small><h2>Hola, ' + h(yo().nombre.split(/\s+/)[0]) + '</h2>' +
      '<p>' + (prox ? 'Próximo partido: ' + h(prox.categoria) + ' vs ' + h(prox.rival) + ' · ' + h(fCorta(prox.fecha)) + ' ' + h(prox.hora) + ' hrs' : 'No hay partidos programados') + '</p></div></div></section>';
    return hero + '<div class="kpis">' + kpis + '</div>' +
      seccion('Lesiones y dolores sin revisar', nuevas.length ? '<ul class="lista">' + nuevas.map(itemLesion).join('') + '</ul>' : vacio('No hay reportes nuevos.'),
        nuevas.length ? btnTexto('Marcar revisado', 'lesionVistoTodo') : '') +
      seccion('Próximo partido', prox ? tarjetaPartido(prox) : vacio('No hay partidos programados.'), btnTexto('Ver todos', 'tab', 'data-tab="partidos"')) +
      seccion('Esta semana', semana.length ? '<ul class="lista">' + semana.map(itemEntrenamiento).join('') + '</ul>' : vacio('Sin entrenamientos en los próximos 7 días.'), btnTexto('Ver todos', 'tab', 'data-tab="entrenamientos"')) +
      seccion('Avisos', ult.length ? ult.map((a) => tarjetaAviso(a, true)).join('') : vacio('Sin avisos.'), btnTexto('Ver todos', 'tab', 'data-tab="avisos"'));
  }

  // ---------- Jugadores ----------
  function vistaJugadores() {
    let lista = filtrarCat(jugadores(S.verInactivos));
    const q = S.busqueda.toLowerCase();
    if (q) lista = lista.filter((j) => j.nombre.toLowerCase().includes(q) || j.rut.includes(q.replace(/\./g, '')));
    const filas = lista.map((j) => {
      const les = lesionesActivas(j.rut).length;
      const deuda = esDir() ? C.mesesAdeudados(S.view, j.rut, ANIO).filter((m) => estadoMes(j.rut, ANIO, m) === 'vencido').length : 0;
      const sinFirma = C.documentosPendientes(S.view, j.rut).some((d) => d.id === 'consentimiento');
      return '<li data-act="verJugador" data-rut="' + j.rut + '">' + camiseta(j) +
        '<div class="crece"><b>' + h(j.nombre) + '</b><small>' + h(etiqueta(j)) + (j.posicion ? ' · ' + h(j.posicion) : '') + '</small>' +
        '<div class="fila insignias">' + habInsignia(j.rut) + (les ? insignia('Lesión', 'alerta') : '') + (deuda ? insignia(deuda + ' cuota' + (deuda > 1 ? 's' : '') + ' atrasada' + (deuda > 1 ? 's' : ''), 'mal') : '') +
        (sinFirma ? insignia('Sin consentimiento', 'alerta') : '') + (cuentaEntrenador(j.rut) ? insignia('Entrenador', 'oro') : '') + (j.activo === false ? insignia('Inactivo') : '') + '</div></div>' +
        '<span class="chevron">' + icono('flecha') + '</span></li>';
    }).join('');
    return '<div class="filtros"><input type="search" placeholder="Buscar por nombre o RUT" value="' + h(S.busqueda) + '" data-cambio="busqueda">' + filtroCategoria() +
      (esDir() ? '<label class="chip"><input type="checkbox" data-cambio="verInactivos"' + (S.verInactivos ? ' checked' : '') + '><span>Ver inactivos</span></label>' : '') + '</div>' +
      seccion(lista.length + ' jugador' + (lista.length === 1 ? '' : 'es'), lista.length ? '<ul class="lista clic">' + filas + '</ul>' : vacio('No hay jugadores con ese filtro.'));
  }

  function formJugador(j) {
    const nuevo = !j;
    j = j || { categoria: S.filtroCat || S.view.config.categorias[0] };
    return '<form id="form-modal">' +
      (nuevo ? campo('RUT', input('rut', '', 'required placeholder="12.345.678-9"')) + '<p class="ayuda">Su clave inicial serán los primeros 4 dígitos del RUT.</p>' : '<input type="hidden" name="rut" value="' + h(j.rut) + '">') +
      campo('Nombre completo', input('nombre', j.nombre, 'required maxlength="80"')) +
      '<div class="campos">' +
      campo('Categoría', '<select name="categoria" data-categoria>' + opcionesCategoria(j.categoria) + '</select>') +
      campo('Año en la categoría', '<select name="anioCategoria"><option value="">Elegir…</option><option value="1"' + (j.anioCategoria === '1' ? ' selected' : '') + '>1er año</option><option value="2"' + (j.anioCategoria === '2' ? ' selected' : '') + '>2do año</option></select>', ' id="campo-anio"' + (C.llevaAnio(j.categoria) ? '' : ' hidden')) +
      campo('Fecha de nacimiento', input('fechaNac', j.fechaNac, 'type="date"')) +
      campo('N° de camiseta', input('numero', j.numero, 'type="number" min="0" max="99" inputmode="numeric"')) +
      campo('Posición', '<select name="posicion"><option value="">–</option>' + opciones(C.POSICIONES, j.posicion) + '</select>') +
      campo('Teléfono', input('telefono', j.telefono, 'type="tel"')) +
      campo('Email', input('email', j.email, 'type="email"')) +
      campo('Previsión de salud', input('prevision', j.prevision, 'placeholder="Fonasa, Isapre..."')) +
      (esDir() ? campo('Descuento / beca (%)', input('descuento', j.descuento || 0, 'type="number" min="0" max="100" inputmode="numeric"')) : '') +
      '</div>' + campo('Contacto de emergencia', input('contactoEmergencia', j.contactoEmergencia, 'placeholder="Nombre y teléfono"')) +
      pie(nuevo ? 'Inscribir jugador' : 'Guardar') + '</form>';
  }

  function fichaJugador(rut) {
    const j = usuario(rut);
    const a = C.resumenAsistencia(S.view, j, ANIO);
    const les = S.view.lesiones.filter((l) => l.rut === rut).sort((x, y) => y.fecha.localeCompare(x.fecha));
    const docs = (S.view.documentos || []).filter((d) => C.documentoAplica(d, rut));
    const fila = (k, v) => '<li><div class="crece"><small>' + h(k) + '</small></div><div class="valor">' + v + '</div></li>';
    let html = '<div class="ficha-cab">' + camiseta(j) + '<div class="crece"><b>' + h(j.nombre) + '</b><small>' + h(C.formatearRut(j.rut)) + '</small><small>' + h(etiqueta(j)) + (j.posicion ? ' · ' + h(j.posicion) : '') + '</small></div>' + habInsignia(rut) + '</div>' +
      '<div class="tarjeta"><ul class="lista">' +
      fila('Edad', C.edad(j.fechaNac) == null ? '–' : C.edad(j.fechaNac) + ' años') +
      fila('Teléfono', h(j.telefono || '–')) + fila('Email', h(j.email || '–')) +
      fila('Emergencia', h(j.contactoEmergencia || '–')) + fila('Previsión', h(j.prevision || '–')) +
      fila('Asistencia ' + ANIO, a.asistidos + ' de ' + a.realizados + ' (' + a.porcentaje + '%)') +
      fila('Federativo ' + ANIO, C.federativoPagado(S.view, rut, ANIO) ? insignia('Pagado', 'ok') : insignia('Pendiente', 'mal'));
    if (esDir()) {
      const deuda = C.mesesAdeudados(S.view, rut, ANIO).filter((m) => estadoMes(rut, ANIO, m) === 'vencido');
      html += fila('Cuota mensual', clp(C.cuotaDe(S.view, j)) + (j.descuento ? ' (' + j.descuento + '% beca)' : '')) +
        fila('Cuotas atrasadas', deuda.length ? deuda.map((m) => C.MESES[m]).join(', ') : 'Al día');
    }
    html += docs.map((d) => { const f = C.firmaDe(S.view, rut, d); return fila(d.titulo, f ? insignia('Firmado ' + fCorta(f.fecha), 'ok') : insignia('Pendiente', 'alerta')); }).join('');
    html += '</ul></div>';
    html += '<h3 class="sub">Lesiones y dolores</h3><div class="tarjeta">' + (les.length ? '<ul class="lista">' + les.map(itemLesion).join('') + '</ul>' : vacio('Sin reportes.')) + '</div>';
    html += '<div class="modal-pie columna"><button class="btn primario ancho" data-act="editarJugador" data-rut="' + rut + '">Editar datos</button>' +
      '<button class="btn ancho" data-act="lesionPara" data-rut="' + rut + '">Registrar lesión o dolor</button>' +
      (esDir() ? '<button class="btn ancho" data-act="resetClave" data-rut="' + rut + '">Restablecer clave (4 dígitos del RUT)</button><button class="btn ancho peligro" data-act="activoJugador" data-rut="' + rut + '" data-activo="' + (j.activo === false ? '1' : '') + '">' + (j.activo === false ? 'Reactivar jugador' : 'Dar de baja') + '</button>' : '') + '</div>';
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
        if (e === 'vencido' || e === 'pagado') esperado += e === 'pagado' ? Number(p.monto) || 0 : cuota;
        if (e === 'pagado') recaudado += Number(p.monto) || 0;
        if (e === 'vencido') deuda += cuota;
        const txt = e === 'pagado' ? '✓' : e === 'vencido' ? '!' : e === 'no' ? '·' : '';
        const tit = nom + ': ' + (e === 'pagado' ? 'pagado ' + clp(p.monto) + ' el ' + p.fecha : e === 'vencido' ? 'vencido' : e === 'no' ? 'no se cobra' : 'por vencer');
        return '<td class="c"><button class="celda ' + e + '" title="' + h(tit) + '" ' + (e === 'no' ? 'disabled' : 'data-act="pago" data-rut="' + j.rut + '" data-mes="' + m + '"') + '>' + txt + '</button></td>';
      }).join('');
      const fed = C.federativoPagado(S.view, j.rut, anio);
      if (fed) { fedN++; fedMonto += Number(S.view.federativo[j.rut][anio].monto) || 0; }
      return '<tr><td class="nombre">' + h(j.nombre) + '<br><small>' + h(etiqueta(j)) + ' · ' + clp(cuota) + '</small></td>' +
        '<td class="c"><button class="celda fed ' + (fed ? 'pagado' : 'vencido') + '" data-act="federativo" data-rut="' + j.rut + '" title="Federativo ' + anio + '">' + (fed ? '✓' : '✗') + '</button></td>' +
        celdas + '<td class="num">' + (deuda ? '<b class="rojo">' + clp(deuda) + '</b>' : '–') + '</td></tr>';
    }).join('');

    const movs = (S.view.movimientos || []).filter((m) => m.fecha.startsWith(String(anio))).sort((a, b) => b.fecha.localeCompare(a.fecha));
    const ingresos = movs.filter((m) => m.tipo === 'ingreso').reduce((s, m) => s + m.monto, 0);
    const gastos = movs.filter((m) => m.tipo === 'gasto').reduce((s, m) => s + m.monto, 0);
    const balance = recaudado + fedMonto + ingresos - gastos;

    return '<div class="filtros">' + segmentado('anioFin', anio, [[ANIO - 1, ANIO - 1], [ANIO, ANIO], [ANIO + 1, ANIO + 1]]) + filtroCategoria() + '</div>' +
      '<div class="kpis">' +
      '<div class="kpi verde"><small>Cuotas recaudadas</small><b>' + clp(recaudado) + '</b><small>de ' + clp(esperado) + ' vencido</small></div>' +
      '<div class="kpi rojo"><small>Cuotas vencidas</small><b>' + clp(Math.max(0, esperado - recaudado)) + '</b></div>' +
      '<div class="kpi oro"><small>Federativos</small><b>' + fedN + '<span>/' + js.length + '</span></b><small>' + clp(fedMonto) + '</small></div>' +
      '<div class="kpi"><small>Otros ingresos − gastos</small><b>' + clp(ingresos - gastos) + '</b></div>' +
      '<div class="kpi ' + (balance >= 0 ? 'verde' : 'rojo') + '"><small>Balance ' + anio + '</small><b>' + clp(balance) + '</b></div></div>' +
      seccion('Mensualidades y federativo', js.length ? '<div class="tabla-envoltura"><table class="tabla matriz"><thead><tr><th>Jugador</th><th class="c">Fed</th>' + C.MESES.map((m) => '<th class="c">' + m + '</th>').join('') + '<th class="num">Deuda</th></tr></thead><tbody>' + filas + '</tbody></table></div>' : vacio('No hay jugadores.'),
        btnTexto('Precios y links', 'tab', 'data-tab="ajustes"'), 'Toca una casilla para registrar o anular un pago. ✓ pagado · ! vencido · vacío por vencer · punto = mes sin cobro. <b>Fed</b> = federativo (habilita para jugar).') +
      seccion('Otros ingresos y gastos', movs.length ? '<ul class="lista">' + movs.map((m) => '<li><div class="crece"><b>' + h(m.concepto) + '</b><small>' + fCorta(m.fecha) + '</small></div><b class="' + (m.tipo === 'gasto' ? 'rojo' : 'verde') + '">' + (m.tipo === 'gasto' ? '−' : '+') + clp(m.monto) + '</b><button class="btn-icono" data-act="borrarMovimiento" data-id="' + m.id + '" aria-label="Eliminar">&times;</button></li>').join('') + '</ul>' : vacio('Sin movimientos este año.'),
        btnTexto('Registrar', 'nuevoMovimiento'));
  }

  // ---------- Entrenamientos ----------
  const cortoCats = (lista) => (lista || []).map((c) => c.replace(' Masculino', ' Masc.').replace(' Femenino', ' Fem.')).join(', ');

  function itemEntrenamiento(e) {
    const n = Object.values(e.asistencia || {});
    const resumen = e.asistenciaTomada ? insignia(n.filter((x) => x === 'P').length + '/' + n.length + ' presentes', 'ok') : (e.fecha <= HOY ? insignia('Falta asistencia', 'alerta') : '');
    const mia = e.miAsistencia ? insignia({ P: 'Asististe', A: 'Ausente', J: 'Justificado' }[e.miAsistencia], { P: 'ok', A: 'mal', J: 'alerta' }[e.miAsistencia]) : '';
    return '<li>' + fechaCaja(e.fecha) + '<div class="crece"><b>' + h(e.tema || 'Entrenamiento') + '</b><small>' + h(e.hora) + ' hrs · ' + h(e.lugar || '') + '</small>' +
      (esStaff() ? '<small>' + h(cortoCats(e.categorias)) + '</small><div class="fila insignias">' + resumen + '<button class="btn mini" data-act="asistencia" data-id="' + e.id + '">Asistencia</button><button class="btn mini" data-act="editarEntrenamiento" data-id="' + e.id + '">Editar</button></div>' : mia) + '</div></li>';
  }

  function vistaEntrenamientos() {
    const lista = S.filtroCat ? S.view.entrenamientos.filter((e) => e.categorias.includes(S.filtroCat)) : S.view.entrenamientos;
    const pas = pasados(lista);
    const pendientes = pas.filter((e) => !e.asistenciaTomada);
    const mostrar = S.verPasados ? pas.slice(0, 40) : proximos(lista);
    return '<div class="filtros">' + segmentado('verPasados', S.verPasados ? 1 : 0, [[0, 'Próximos'], [1, 'Realizados']]) + filtroCategoria() + '</div>' +
      (pendientes.length ? '<div class="aviso">Hay ' + pendientes.length + ' entrenamiento(s) realizados sin asistencia registrada.</div>' : '') +
      seccion('', mostrar.length ? '<ul class="lista">' + mostrar.map(itemEntrenamiento).join('') + '</ul>' : vacio(S.verPasados ? 'Aún no hay entrenamientos realizados.' : 'No hay entrenamientos programados.'));
  }

  function formEntrenamiento(e) {
    const nuevo = !e;
    e = e || { fecha: HOY, hora: '20:00', duracion: 90, categorias: S.filtroCat ? [S.filtroCat] : [] };
    return '<form id="form-modal">' + (nuevo ? '' : '<input type="hidden" name="id" value="' + e.id + '">') +
      '<div class="campos">' + campo('Fecha', input('fecha', e.fecha, 'type="date" required')) + campo('Hora', input('hora', e.hora, 'type="time" required')) +
      campo('Duración (min)', input('duracion', e.duracion, 'type="number" min="15" max="600" inputmode="numeric"')) + campo('Lugar', input('lugar', e.lugar, 'placeholder="Gimnasio"')) + '</div>' +
      campo('Tema / objetivo', input('tema', e.tema, 'placeholder="Ej: contraataque, defensa 5:1"')) +
      '<p class="etiqueta">Categorías</p>' + chequeosCategorias('categorias', e.categorias) +
      (nuevo ? campo('Repetir semanalmente (semanas extra)', input('repetirSemanas', 0, 'type="number" min="0" max="26" inputmode="numeric"')) : '') +
      pie(nuevo ? 'Programar' : 'Guardar', nuevo ? '' : '<button type="button" class="btn ancho peligro" data-act="borrarEntrenamiento" data-id="' + e.id + '">Eliminar entrenamiento</button>') + '</form>';
  }

  function formAsistencia(e) {
    const js = jugadores().filter((j) => e.categorias.includes(j.categoria));
    if (!js.length) return vacio('No hay jugadores en ' + e.categorias.join(', ') + '.');
    const filas = js.map((j) => {
      const val = (e.asistencia || {})[j.rut] || (e.asistenciaTomada ? 'A' : 'P');
      const op = (k, t) => '<label><input type="radio" name="a_' + j.rut + '" value="' + k + '"' + (val === k ? ' checked' : '') + '><span class="' + k + '" title="' + t + '">' + k + '</span></label>';
      return '<li>' + camiseta(j) + '<div class="crece"><b>' + h(j.nombre) + '</b><small>' + h(etiqueta(j)) + (lesionesActivas(j.rut).length ? ' · lesión activa' : '') + '</small></div><div class="asis">' + op('P', 'Presente') + op('A', 'Ausente') + op('J', 'Justificado') + '</div></li>';
    }).join('');
    return '<p class="ayuda">' + h(fLarga(e.fecha)) + ' · ' + h(e.hora) + ' hrs · P presente, A ausente, J justificado</p>' +
      '<form id="form-modal"><input type="hidden" name="id" value="' + e.id + '"><div class="tarjeta"><ul class="lista">' + filas + '</ul></div>' + pie('Guardar asistencia') + '</form>';
  }

  // ---------- Partidos y convocatorias ----------
  function nombresConvocados(m) {
    if (m.citadosLista) return m.citadosLista.map((c) => ({ nombre: c.nombre, numero: c.numero, estado: null }));
    return Object.keys(m.citados || {}).map((r) => { const u = usuario(r) || { nombre: '?' }; return { rut: r, nombre: u.nombre, numero: u.numero, estado: m.citados[r] }; })
      .sort((a, b) => (a.numero == null ? 999 : a.numero) - (b.numero == null ? 999 : b.numero) || a.nombre.localeCompare(b.nombre));
  }

  function lineasConvocatoria(m) {
    const d = fDia(m.fecha);
    const dia = d.toLocaleDateString('es-CL', { weekday: 'long' });
    const fecha = dia.charAt(0).toUpperCase() + dia.slice(1) + ' ' + String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0');
    const l = [['🆚', m.rival + (m.hora ? ' ' + m.hora + ' hrs' : '')], ['🗓️', fecha]];
    if (m.presentacion) l.push(['⏰', 'Citación ' + m.presentacion + ' hrs']);
    if (m.vestimenta) l.push(['🧦', m.vestimenta]);
    if (m.lugar) l.push(['🏟️', m.lugar]);
    if (m.indicaciones) l.push(['💳', m.indicaciones]);
    return l;
  }

  const tituloConvocatoria = (m) => 'Fecha ' + m.categoria + (m.competicion ? ' · ' + m.competicion : '');

  // Mismo formato que la citación de WhatsApp del club.
  function textoConvocatoria(m) {
    return [tituloConvocatoria(m)].concat(lineasConvocatoria(m).map(([e, t]) => e + ' ' + t), [''], nombresConvocados(m).map((c, i) => (i + 1) + '. ' + c.nombre)).join('\n');
  }

  function vistaConvocatoria(m) {
    const lista = nombresConvocados(m);
    const estados = { confirmado: insignia('Confirmó', 'ok'), rechazado: insignia('No puede', 'mal'), pendiente: insignia('Sin responder') };
    const autor = m.citadoPor && usuario(m.citadoPor);
    return '<div class="convocatoria">' +
      '<div class="conv-cab"><img src="' + ESCUDO + '" alt=""><div><b>' + h(tituloConvocatoria(m)) + '</b><small>Vieux Gaulois Handball</small></div></div>' +
      '<ul class="conv-lineas">' + lineasConvocatoria(m).map(([e, t]) => '<li><span>' + e + '</span>' + h(t) + '</li>').join('') + '</ul>' +
      (lista.length ? '<ol class="conv-lista">' + lista.map((c) => '<li><span>' + h(c.nombre) + '</span>' + (c.estado ? estados[c.estado] : '') + (c.rut && !hab(c.rut) ? insignia('No habilitado', 'mal') : '') + '</li>').join('') + '</ol>' : vacio('Todavía no hay jugadores citados.')) +
      '</div>' +
      (m.citacionFecha ? '<p class="seccion-pie">Guardada el ' + h(fCorta(m.citacionFecha)) + (autor ? ' por ' + h(autor.nombre) : '') + '.</p>' : '') +
      '<div class="modal-pie columna">' +
      (m.miCitacion ? '<div class="fila" style="gap:8px"><button class="btn primario crece" data-act="responder" data-id="' + m.id + '" data-r="confirmado">Voy ✓</button><button class="btn crece" data-act="responder" data-id="' + m.id + '" data-r="rechazado">No puedo</button></div>' : '') +
      '<button class="btn ancho" data-act="pdfConvocatoria" data-id="' + m.id + '">' + icono('pdf') + ' Descargar PDF</button>' +
      '<button class="btn ancho" data-act="copiarConvocatoria" data-id="' + m.id + '">' + icono('copiar') + ' Copiar texto para WhatsApp</button>' +
      (navigator.share ? '<button class="btn ancho" data-act="compartirConvocatoria" data-id="' + m.id + '">' + icono('compartir') + ' Compartir</button>' : '') +
      (esStaff() ? '<button class="btn ancho" data-act="citar" data-id="' + m.id + '">Editar citados</button>' : '') + '</div>';
  }

  // El PDF se genera con el diálogo de impresión del sistema ("Guardar como PDF").
  function imprimirConvocatoria(m) {
    const lista = nombresConvocados(m);
    let el = $('#imprimir');
    if (!el) { el = document.createElement('div'); el.id = 'imprimir'; document.body.appendChild(el); }
    el.innerHTML = '<div class="pdf"><div class="pdf-cab"><img src="' + ESCUDO + '" alt=""><div><b>VIEUX GAULOIS HANDBALL</b><span>Convocatoria</span></div></div>' +
      '<h1>' + h(tituloConvocatoria(m)) + '</h1>' +
      lineasConvocatoria(m).map(([e, t]) => '<p class="pdf-linea"><span>' + e + '</span>' + h(t) + '</p>').join('') +
      '<ol class="pdf-lista">' + lista.map((c) => '<li>' + h(c.nombre) + '</li>').join('') + '</ol>' +
      '<p class="pdf-pie">Confirma tu asistencia en la app del club. Documento generado el ' + h(fLarga(HOY)) + '.</p></div>';
    const titulo = document.title;
    document.title = 'Convocatoria ' + m.categoria + ' vs ' + m.rival + ' ' + m.fecha;
    document.body.classList.add('imprimiendo');
    const fin = () => { document.body.classList.remove('imprimiendo'); document.title = titulo; window.removeEventListener('afterprint', fin); };
    window.addEventListener('afterprint', fin);
    setTimeout(() => { window.print(); }, 60);
  }

  function tarjetaPartido(m) {
    const r = citacionResumen(m);
    const res = m.resultado ? '<b class="marcador">' + m.resultado.nuestro + ' – ' + m.resultado.rival + '</b>' + insignia(m.resultado.nuestro > m.resultado.rival ? 'Victoria' : m.resultado.nuestro < m.resultado.rival ? 'Derrota' : 'Empate', m.resultado.nuestro > m.resultado.rival ? 'ok' : m.resultado.nuestro < m.resultado.rival ? 'mal' : '') : '';
    const jug = !esStaff();
    return '<div class="tarjeta-partido">' + fechaCaja(m.fecha, true) + '<div class="crece">' +
      '<b>vs ' + h(m.rival) + '</b><small>' + h(fLarga(m.fecha)) + ' · ' + h(m.hora) + ' hrs' + (m.presentacion ? ' · citación ' + h(m.presentacion) : '') + '</small>' +
      '<small>' + h(m.condicion) + ' · ' + h(m.lugar || '') + (m.vestimenta ? ' · 🧦 ' + h(m.vestimenta) : '') + '</small>' +
      '<div class="fila insignias">' + insignia(m.categoria, 'oro') +
      (jug ? (m.miCitacion ? insignia('Estás citado', 'ok') + (m.miCitacion === 'confirmado' ? insignia('Confirmaste', 'ok') : m.miCitacion === 'rechazado' ? insignia('No puedes', 'mal') : insignia('Responde', 'alerta')) : '')
        : insignia(r.total + ' citados') + (r.ok ? insignia(r.ok + ' confirmados', 'ok') : '') + (r.no ? insignia(r.no + ' no pueden', 'mal') : '')) + res + '</div>' +
      '<div class="fila insignias">' +
      (jug && m.miCitacion && m.fecha >= HOY ? '<button class="btn mini primario" data-act="responder" data-id="' + m.id + '" data-r="confirmado">Voy</button><button class="btn mini" data-act="responder" data-id="' + m.id + '" data-r="rechazado">No puedo</button>' : '') +
      ((jug ? m.citadosLista.length : r.total) ? '<button class="btn mini' + (jug ? '' : ' primario') + '" data-act="convocatoria" data-id="' + m.id + '">Convocatoria</button>' : '') +
      (!jug ? '<button class="btn mini" data-act="citar" data-id="' + m.id + '">Citar</button>' + (m.fecha <= HOY ? '<button class="btn mini" data-act="resultado" data-id="' + m.id + '">Resultado</button>' : '') +
        '<button class="btn mini" data-act="editarPartido" data-id="' + m.id + '">Editar</button>' : '') + '</div>' +
      (m.notas ? '<p class="nota">' + h(m.notas) + '</p>' : '') + '</div></div>';
  }

  function vistaPartidos() {
    const lista = filtrarCat(S.view.partidos);
    const mostrar = S.verPasados ? pasados(lista) : proximos(lista);
    return '<div class="filtros">' + segmentado('verPasados', S.verPasados ? 1 : 0, [[0, 'Próximos'], [1, 'Jugados']]) + filtroCategoria() + '</div>' +
      seccion('', mostrar.length ? '<ul class="lista">' + mostrar.map((m) => '<li>' + tarjetaPartido(m) + '</li>').join('') + '</ul>' : vacio(S.verPasados ? 'Aún no hay partidos jugados.' : 'No hay partidos programados.'));
  }

  function formPartido(m) {
    const nuevo = !m;
    m = m || { fecha: C.sumarDias(HOY, 7), hora: '18:00', condicion: 'Local', categoria: S.filtroCat || S.view.config.categorias[0], indicaciones: S.view.config.indicacionesCitacion };
    return '<form id="form-modal">' + (nuevo ? '' : '<input type="hidden" name="id" value="' + m.id + '">') +
      campo('Rival', input('rival', m.rival, 'required maxlength="80"')) +
      '<div class="campos">' + campo('Categoría', '<select name="categoria">' + opcionesCategoria(m.categoria) + '</select>') +
      campo('Fecha', input('fecha', m.fecha, 'type="date" required')) + campo('Hora del partido', input('hora', m.hora, 'type="time" required')) +
      campo('Hora de citación', input('presentacion', m.presentacion, 'type="time"')) +
      campo('Condición', '<select name="condicion">' + opciones(['Local', 'Visita'], m.condicion) + '</select>') +
      campo('Competición', input('competicion', m.competicion, 'placeholder="Liga, copa, amistoso"')) + '</div>' +
      campo('🏟️ Lugar', input('lugar', m.lugar)) +
      campo('🧦 Calcetas / indumentaria', input('vestimenta', m.vestimenta, 'placeholder="Ej: Negras"')) +
      campo('💳 Indicaciones', '<textarea name="indicaciones" maxlength="300">' + h(m.indicaciones || '') + '</textarea>') +
      campo('Notas internas', '<textarea name="notas" maxlength="300">' + h(m.notas || '') + '</textarea>') +
      pie(nuevo ? 'Crear partido' : 'Guardar', nuevo ? '' : '<button type="button" class="btn ancho peligro" data-act="borrarPartido" data-id="' + m.id + '">Eliminar partido</button>') + '</form>';
  }

  function formCitacion(m, todas) {
    const js = jugadores().filter((j) => todas || j.categoria === m.categoria || m.citados[j.rut]);
    const filas = js.map((j) => {
      const les = lesionesActivas(j.rut).length;
      return '<li><label class="check-citar"><input type="checkbox" name="ruts[]" value="' + j.rut + '"' + (m.citados[j.rut] ? ' checked' : '') + ' data-hab="' + (hab(j.rut) ? 1 : 0) + '"><span class="marca"></span>' +
        '<div class="crece"><b>' + (j.numero != null ? '#' + h(j.numero) + ' ' : '') + h(j.nombre) + '</b><small>' + h(etiqueta(j)) + (j.posicion ? ' · ' + h(j.posicion) : '') + '</small>' +
        '<div class="fila insignias">' + habInsignia(j.rut) + (les ? insignia('Lesión', 'alerta') : '') + '</div></div></label></li>';
    }).join('');
    return '<p class="ayuda">vs ' + h(m.rival) + ' · ' + h(fLarga(m.fecha)) + ' · ' + h(m.categoria) + '</p>' +
      '<div class="aviso info">Sólo los jugadores <b>habilitados</b> (federativo ' + ANIO + ' pagado) pueden jugar.</div>' +
      '<form id="form-modal"><input type="hidden" name="id" value="' + m.id + '">' +
      (todas ? '' : '<button type="button" class="btn-texto" data-act="citarTodas" data-id="' + m.id + '">Mostrar todas las categorías</button>') +
      '<div class="tarjeta"><ul class="lista">' + (filas || '<li>' + vacio('No hay jugadores en esta categoría.') + '</li>') + '</ul></div>' +
      '<div class="aviso mal" id="aviso-hab" hidden></div>' + pie('Guardar convocatoria') + '</form>';
  }

  // ---------- Lesiones ----------
  function itemLesion(l) {
    const j = usuario(l.rut) || { nombre: '?' };
    const nueva = !l.vistoPor.includes(S.view.yo);
    const intens = l.intensidad >= 7 ? 'mal' : l.intensidad >= 4 ? 'alerta' : '';
    return '<li class="' + (nueva && esStaff() ? 'nueva' : '') + '"><div class="crece">' +
      (esStaff() ? '<b>' + h(j.nombre) + '</b><small>' + h(j.categoria ? etiqueta(j) : '') + '</small>' : '') +
      '<div class="fila insignias">' + insignia(l.tipo, l.tipo === 'Lesión' ? 'mal' : 'alerta') + '<b>' + h(l.zona) + '</b>' + insignia(l.intensidad + '/10', intens) +
      (l.estado === 'resuelta' ? insignia('Recuperado', 'ok') : '') + (nueva && esStaff() ? insignia('Nuevo', 'mal') : '') + '</div>' +
      (l.descripcion ? '<p>' + h(l.descripcion) + '</p>' : '') +
      (l.notaStaff ? '<p class="suave"><b>Cuerpo técnico:</b> ' + h(l.notaStaff) + '</p>' : '') +
      '<small>Desde ' + fCorta(l.fecha) + (l.resuelta ? ' · recuperado ' + fCorta(l.resuelta) : '') + '</small>' +
      '<div class="fila insignias">' + (nueva && esStaff() ? '<button class="btn mini" data-act="lesionVisto" data-id="' + l.id + '">Revisado</button>' : '') +
      '<button class="btn mini" data-act="editarLesion" data-id="' + l.id + '">' + (esStaff() ? 'Gestionar' : 'Actualizar') + '</button></div></div></li>';
  }

  function vistaLesiones() {
    const todas = S.view.lesiones.filter((l) => !S.filtroCat || (usuario(l.rut) || {}).categoria === S.filtroCat)
      .sort((a, b) => (a.estado === b.estado ? b.fecha.localeCompare(a.fecha) : a.estado === 'activa' ? -1 : 1));
    const activas = todas.filter((l) => l.estado === 'activa'), resueltas = todas.filter((l) => l.estado !== 'activa');
    return '<div class="filtros">' + filtroCategoria() + (sinVer().length ? '<button class="btn" data-act="lesionVistoTodo">Marcar todo revisado</button>' : '') + '</div>' +
      seccion('Activas (' + activas.length + ')', activas.length ? '<ul class="lista">' + activas.map(itemLesion).join('') + '</ul>' : vacio('Ningún jugador reporta lesiones ni dolores.')) +
      seccion('Historial', resueltas.length ? '<ul class="lista">' + resueltas.slice(0, 50).map(itemLesion).join('') + '</ul>' : vacio('Sin historial.'));
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
      campo('Intensidad (1 a 10)', input('intensidad', l.intensidad, 'type="number" min="1" max="10" required inputmode="numeric"')) + '</div>' +
      campo('Descripción', '<textarea name="descripcion" maxlength="500" placeholder="¿Cuándo empezó? ¿Qué movimientos duelen?">' + h(l.descripcion || '') + '</textarea>') +
      (!nuevo && esStaff() ? campo('Nota del cuerpo técnico', '<textarea name="notaStaff" maxlength="300">' + h(l.notaStaff || '') + '</textarea>') : '') +
      (!nuevo ? campo('Estado', '<select name="estado"><option value="activa"' + (l.estado === 'activa' ? ' selected' : '') + '>Activa</option><option value="resuelta"' + (l.estado === 'resuelta' ? ' selected' : '') + '>Recuperado</option></select>') : '') +
      (nuevo && !esStaff() ? '<p class="ayuda">Tu reporte le llega al entrenador y a la directiva.</p>' : '') +
      pie(nuevo ? 'Enviar reporte' : 'Guardar') + '</form>';
  }

  // ---------- Documentos (directiva) ----------
  const destinatariosDe = (d) => (d.destinatarios === 'todos' ? jugadores().map((j) => j.rut) : d.destinatarios.filter((r) => usuario(r)));

  function vistaDocumentos() {
    const docs = S.view.documentos || [];
    return '<p class="intro">Documentos que los jugadores firman en la app. El consentimiento informado se pide al ingresar por primera vez.</p>' +
      seccion('', '<ul class="lista clic">' + docs.map((d) => {
        const dest = destinatariosDe(d);
        const firmados = dest.filter((r) => C.firmaDe(S.view, r, d)).length;
        return '<li data-act="verDocumento" data-id="' + h(d.id) + '"><span class="ico-celda c-documentos">' + icono('documentos') + '</span><div class="crece"><b>' + h(d.titulo) + '</b>' +
          '<small>' + (d.destinatarios === 'todos' ? 'Todos los jugadores' : dest.length + ' jugador(es)') + ' · versión ' + d.version + '</small></div>' +
          insignia(firmados + '/' + dest.length + ' firmas', firmados === dest.length ? 'ok' : 'alerta') + '<span class="chevron">' + icono('flecha') + '</span></li>';
      }).join('') + '</ul>') +
      '<button class="btn primario ancho" data-act="nuevoDocumento">Enviar compromiso a becados</button>';
  }

  function verDocumento(d) {
    const dest = destinatariosDe(d);
    const filas = dest.map((r) => {
      const j = usuario(r);
      const f = C.firmaDe(S.view, r, d);
      return '<li><div class="crece"><b>' + h(j.nombre) + '</b><small>' + h(etiqueta(j)) + (f ? ' · firmó "' + h(f.nombreFirma) + '"' + (f.apoderado ? ' · apoderado: ' + h(f.apoderado) : '') : '') + '</small></div>' +
        (f ? insignia(fCorta(f.fecha), 'ok') : insignia('Pendiente', 'alerta')) + '</li>';
    }).join('');
    return '<details class="tarjeta doc-texto"><summary>Ver texto del documento</summary>' + d.texto.split(/\n\s*\n/).map((p) => '<p>' + h(p) + '</p>').join('') +
      '<ul>' + d.puntos.map((p) => '<li>' + h(p) + '</li>').join('') + '</ul></details>' +
      '<h3 class="sub">Firmas</h3><div class="tarjeta"><ul class="lista">' + (filas || '<li>' + vacio('Sin destinatarios.') + '</li>') + '</ul></div>' +
      '<div class="modal-pie columna"><button class="btn primario ancho" data-act="editarDocumento" data-id="' + h(d.id) + '">Editar</button>' +
      (d.id !== 'consentimiento' ? '<button class="btn ancho peligro" data-act="borrarDocumento" data-id="' + h(d.id) + '">Eliminar</button>' : '') + '</div>';
  }

  function formDocumento(d) {
    const nuevo = !d;
    d = d || Object.assign({ destinatarios: jugadores().filter((j) => Number(j.descuento) > 0).map((j) => j.rut) }, C.COMPROMISO_BECA);
    const elegir = d.id !== 'consentimiento';
    return '<form id="form-modal">' + (nuevo ? '' : '<input type="hidden" name="id" value="' + h(d.id) + '">') +
      campo('Título', input('titulo', d.titulo, 'required maxlength="120"')) +
      campo('Texto', '<textarea name="texto" rows="8" required>' + h(d.texto) + '</textarea>') +
      campo('Puntos que el jugador debe aceptar (uno por línea)', '<textarea name="puntos" rows="4">' + h(d.puntos.join('\n')) + '</textarea>') +
      (elegir ? '<p class="etiqueta">Enviar a (se marcan los becados)</p><div class="tarjeta"><ul class="lista">' + jugadores().map((j) => '<li><label class="check-citar"><input type="checkbox" name="destinatarios[]" value="' + j.rut + '"' + (d.destinatarios.includes(j.rut) ? ' checked' : '') + '><span class="marca"></span><div class="crece"><b>' + h(j.nombre) + '</b><small>' + h(etiqueta(j)) + (Number(j.descuento) > 0 ? ' · beca ' + j.descuento + '%' : '') + '</small></div></label></li>').join('') + '</ul></div>' : '') +
      (!nuevo ? '<label class="celda-chequeo"><input type="checkbox" name="nuevaVersion" value="1"><span>Pedir nueva firma a todos (versión ' + (d.version + 1) + ')</span></label>' : '') +
      pie(nuevo ? 'Enviar para firmar' : 'Guardar') + '</form>';
  }

  // ---------- Convenios ----------
  function listaConvenios(editable) {
    const cs = S.view.convenios;
    if (!cs.length) return vacio('El club aún no tiene convenios publicados.');
    return '<ul class="lista">' + cs.map((c) => '<li><span class="ico-celda c-convenios">' + icono('convenios') + '</span><div class="crece"><b>' + h(c.empresa) + '</b>' +
      (c.beneficio ? '<span class="beneficio">' + h(c.beneficio) + '</span>' : '') + (c.detalle ? '<small>' + h(c.detalle) + '</small>' : '') + '</div>' +
      (editable ? '<button class="btn mini" data-act="editarConvenio" data-id="' + c.id + '">Editar</button>' : '') + '</li>').join('') + '</ul>';
  }

  const vistaConvenios = () => seccion('', listaConvenios(true), '', 'Los jugadores ven estos convenios en su perfil.');

  function formConvenio(c) {
    const nuevo = !c;
    c = c || {};
    return '<form id="form-modal">' + (nuevo ? '' : '<input type="hidden" name="id" value="' + c.id + '">') +
      campo('Empresa / institución', input('empresa', c.empresa, 'required maxlength="80"')) +
      campo('Beneficio', input('beneficio', c.beneficio, 'placeholder="Ej: 20% de descuento" maxlength="120"')) +
      campo('Detalle / cómo usarlo', '<textarea name="detalle" maxlength="400">' + h(c.detalle || '') + '</textarea>') +
      pie(nuevo ? 'Publicar' : 'Guardar', nuevo ? '' : '<button type="button" class="btn ancho peligro" data-act="borrarConvenio" data-id="' + c.id + '">Eliminar convenio</button>') + '</form>';
  }

  // ---------- Ajustes (directiva) ----------
  function vistaAjustes() {
    const cfg = S.view.config;
    const staff = S.view.usuarios.filter((u) => u.rol !== 'jugador').sort((a, b) => a.rol.localeCompare(b.rol) || a.nombre.localeCompare(b.nombre));
    return seccion('Precios de cuotas', '<form data-form="config" class="form-interno"><div class="campos">' + cfg.categoriasBase.map((b) => campo(b + ' (M y F)', '<input name="cuota_' + h(b) + '" type="number" min="0" step="500" inputmode="numeric" value="' + (cfg.cuotas[b] || 0) + '">')).join('') + '</div>' +
      '<div class="campos">' + campo('Monto federativo anual', input('montoFederativo', cfg.montoFederativo, 'type="number" min="0" step="500" inputmode="numeric"')) +
      campo('Día de vencimiento', input('diaVencimiento', cfg.diaVencimiento, 'type="number" min="1" max="28" inputmode="numeric"')) + '</div>' +
      '<p class="etiqueta">Meses que se cobran</p><div class="chequeos">' + C.MESES.map((m, i) => '<label class="chip"><input type="checkbox" name="mesesCobro[]" value="' + i + '"' + (cfg.mesesCobro.includes(i) ? ' checked' : '') + '><span>' + m + '</span></label>').join('') + '</div>' +
      '<button class="btn primario ancho">Guardar precios</button></form>', '', 'Descuentos o becas se asignan en la ficha de cada jugador.') +
      seccion('Pagos online', '<form data-form="pagos" class="form-interno">' +
        campo('Link de pago de cuotas', input('linkCuota', cfg.linkCuota, 'type="url" placeholder="https://"')) +
        campo('Link de pago federativo', input('linkFederativo', cfg.linkFederativo, 'type="url" placeholder="https://"')) +
        campo('Datos de transferencia', '<textarea name="datosTransferencia" rows="4" placeholder="Nombre, RUT, banco, tipo y N° de cuenta, email">' + h(cfg.datosTransferencia || '') + '</textarea>') +
        '<button class="btn primario ancho">Guardar pagos</button></form>', '', 'Los jugadores ven estos botones en sus mensualidades y federativo.') +
      seccion('Citaciones', '<form data-form="citacion" class="form-interno">' +
        campo('💳 Indicaciones por defecto', '<textarea name="indicacionesCitacion" rows="3">' + h(cfg.indicacionesCitacion || '') + '</textarea>') +
        '<button class="btn primario ancho">Guardar</button></form>') +
      seccion('Categorías', '<form data-form="categorias" class="form-interno"><textarea class="entrada" name="categoriasBase" rows="8">' + h(cfg.categoriasBase.join('\n')) + '</textarea>' +
        '<button class="btn primario ancho" style="margin-top:12px">Guardar categorías</button></form>', '', 'Una por línea. Cada una se crea en rama Masculina y Femenina. Infantil, Cadete y Juvenil piden 1er o 2do año.') +
      seccion('Directiva y entrenadores', '<ul class="lista">' + staff.map((u) => {
        const j = u.jugadorRut && usuario(u.jugadorRut);
        return '<li class="envolver"><div class="crece"><b>' + h(u.nombre) + '</b><small>Usuario: ' + h(u.usuario || u.rut) + ' · ' + h(u.cargo || u.rol) + (j ? ' · también juega en ' + h(j.categoria) : '') + '</small>' +
          '<div class="fila insignias">' + insignia(u.rol === 'directiva' ? 'Directiva' : 'Entrenador', u.rol === 'directiva' ? 'oro' : '') + (u.activo === false ? insignia('Inactivo', 'mal') : '') +
          (u.rut !== S.view.yo ? '<button class="btn mini" data-act="definirClave" data-rut="' + u.rut + '">Clave</button><button class="btn mini peligro" data-act="activoStaff" data-rut="' + u.rut + '" data-activo="' + (u.activo === false ? '1' : '') + '">' + (u.activo === false ? 'Activar' : 'Desactivar') + '</button>' : '') + '</div></div></li>';
      }).join('') + '</ul>', btnTexto('Agregar', 'nuevoStaff')) +
      (S.modo === 'local' ? seccion('Demo', '<button class="btn ancho peligro" data-act="reiniciarDemo">Reiniciar datos de ejemplo</button>', '', 'Borra los cambios hechos en este navegador.') : '');
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
      const nombre = new Date(+a, +m - 1, 1).toLocaleDateString('es-CL', { month: 'long', year: 'numeric' });
      return seccion(nombre.charAt(0).toUpperCase() + nombre.slice(1), '<ul class="lista">' +
        grupos[k].map((x) => x._t === 'p'
          ? '<li>' + fechaCaja(x.fecha, true) + '<div class="crece"><b>Partido vs ' + h(x.rival) + '</b><small>' + h(fLarga(x.fecha)) + ' · ' + h(x.hora) + ' hrs · ' + h(x.condicion) + '</small><small>' + h(x.lugar || '') + '</small><div class="fila insignias">' + insignia(x.categoria, 'oro') + (jug && x.miCitacion ? insignia('Citado', 'ok') : '') + '</div></div></li>'
          : itemEntrenamiento(x)).join('') + '</ul>');
    }).join('');
    return '<div class="filtros">' + segmentado('verPasados', S.verPasados ? 1 : 0, [[0, 'Próximos'], [1, 'Anteriores']]) + (jug ? '' : filtroCategoria()) + '</div>' +
      (html || seccion('', vacio('No hay eventos.')));
  }

  // ---------- Perfil del jugador ----------
  function bloquePago(link, txt) {
    const cfg = S.view.config;
    return (link || cfg.datosTransferencia ? '<div class="pago-botones">' + (link ? linkExterno(link, txt, 'primario') : '') +
      (cfg.datosTransferencia ? '<button class="btn" data-act="verTransferencia">Datos de transferencia</button>' : '') + '</div>' : '');
  }

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
    const ent = cuentaEntrenador(j.rut);
    const ult = avisos().slice(0, 2);
    const firmas = (S.view.documentos || []).map((d) => [d, C.firmaDe(S.view, j.rut, d)]).filter((x) => x[1]);

    return (ent ? '<div class="aviso info">También eres <b>' + h(ent.cargo || 'entrenador') + '</b>. Para tu perfil de entrenador sal y entra con tu usuario <b>' + h(ent.rut.replace('usr:', '')) + '</b>.</div>' : '') +
      (j.claveInicial ? '<div class="aviso">Estás usando tu clave inicial (4 primeros dígitos del RUT). <button class="btn-texto" data-act="clave">Cámbiala aquí</button></div>' : '') +
      '<section class="perfil"><div class="perfil-fila"><div class="numero">' + (j.numero != null ? h(j.numero) : '–') + '</div><div class="crece"><h2>' + h(j.nombre) + '</h2>' +
      '<p>' + h(etiqueta(j)) + '</p>' + (fed ? insignia('Habilitado para jugar', 'ok') : insignia('No habilitado · federativo pendiente', 'mal')) + '</div></div>' +
      '<div class="datos"><div><small>Edad</small><b>' + (e == null ? '–' : e + ' años') + '</b></div><div><small>N° camiseta</small><b>' + (j.numero != null ? h(j.numero) : '–') + '</b></div>' +
      '<div><small>Posición</small><b>' + h(j.posicion || '–') + '</b></div><div><small>RUT</small><b>' + h(C.formatearRut(j.rut)) + '</b></div></div>' +
      '<button class="btn mini claro" data-act="misDatos">Editar mis datos de contacto</button></section>' +

      (ult.length ? seccion('Avisos del club', ult.map((x) => tarjetaAviso(x, true)).join(''), btnTexto('Ver todos', 'tab', 'data-tab="avisos"')) : '') +
      seccion('Próximos partidos', misPartidos.length ? '<ul class="lista">' + misPartidos.map((m) => '<li>' + tarjetaPartido(m) + '</li>').join('') + '</ul>' : vacio('No hay partidos próximos para tu categoría.')) +
      seccion('Lesiones y dolores', les.length ? '<ul class="lista">' + les.map(itemLesion).join('') + '</ul>' : vacio('No tienes lesiones ni dolores reportados.'), btnTexto('Reportar', 'lesionPara'), 'Lo que reportes lo ven tu entrenador y la directiva.') +
      seccion('Próximos entrenamientos', misEntr.length ? '<ul class="lista">' + misEntr.map(itemEntrenamiento).join('') + '</ul>' : vacio('Sin entrenamientos programados.'), btnTexto('Calendario', 'tab', 'data-tab="calendario"')) +

      seccion('Mensualidades ' + ANIO, '<div class="fila entre" style="margin-bottom:12px"><div><b>' + clp(res.cuota) + '</b> <small class="suave">al mes · vence el día ' + S.view.config.diaVencimiento + '</small></div>' + (vencidos ? insignia(vencidos + ' atrasada' + (vencidos > 1 ? 's' : ''), 'mal') : insignia('Al día', 'ok')) + '</div>' +
        '<div class="meses">' + C.MESES.map((nom, m) => {
          const est = estadoMes(j.rut, ANIO, m);
          return '<div class="mes ' + est + '">' + nom + '<span>' + ({ pagado: '✓', vencido: 'Debe', pendiente: '–', no: '' }[est]) + '</span></div>';
        }).join('') + '</div>' + (vencidos || pagados < cobrados.length ? bloquePago(S.view.config.linkCuota, 'Pagar cuota') : ''), '', pagados + ' de ' + cobrados.length + ' cuotas pagadas.') +
      seccion('Federativo ' + ANIO, '<div class="fila entre"><div><b>' + clp(S.view.config.montoFederativo) + '</b><br><small class="suave">Necesario para jugar partidos oficiales</small></div>' + (fed ? insignia('Pagado', 'ok') : insignia('Pendiente', 'mal')) + '</div>' +
        (fed ? '' : bloquePago(S.view.config.linkFederativo, 'Pagar federativo'))) +
      seccion('Asistencia a entrenamientos', '<div class="fila" style="gap:16px"><div class="anillo" style="--p:' + a.porcentaje + '"><b>' + a.porcentaje + '%</b></div><div class="crece">Asististe a <b>' + a.asistidos + '</b> de <b>' + a.realizados + '</b> entrenamientos realizados' + (a.justificados ? '<br><small class="suave">' + a.justificados + ' ausencias justificadas</small>' : '') + '</div></div>') +
      (firmas.length ? seccion('Documentos firmados', '<ul class="lista">' + firmas.map(([d, f]) => '<li><span class="ico-celda c-documentos">' + icono('documentos') + '</span><div class="crece"><b>' + h(d.titulo) + '</b><small>Firmado el ' + h(fCorta(f.fecha)) + '</small></div></li>').join('') + '</ul>') : '') +
      seccion('Convenios del club', listaConvenios(false)) + seccionCuenta();
  }

  function formMisDatos(j) {
    return '<form id="form-modal"><input type="hidden" name="rut" value="' + j.rut + '">' +
      campo('Teléfono', input('telefono', j.telefono, 'type="tel"')) + campo('Email', input('email', j.email, 'type="email"')) +
      campo('Contacto de emergencia', input('contactoEmergencia', j.contactoEmergencia, 'placeholder="Nombre y teléfono"')) +
      campo('Previsión de salud', input('prevision', j.prevision)) +
      '<p class="ayuda">Nombre, categoría y número de camiseta los actualiza el entrenador o la directiva.</p>' + pie() + '</form>';
  }

  // ---------- Render ----------
  const VISTAS = {
    inicio: vistaInicio, avisos: vistaAvisos, jugadores: vistaJugadores, finanzas: vistaFinanzas, entrenamientos: vistaEntrenamientos, partidos: vistaPartidos,
    lesiones: vistaLesiones, documentos: vistaDocumentos, convenios: vistaConvenios, ajustes: vistaAjustes, calendario: vistaCalendario, perfil: vistaPerfil, mas: vistaMas,
  };

  function render() {
    const app = $('#app');
    document.body.classList.toggle('sin-sesion', !S.view);
    if (!S.view) { app.innerHTML = vistaLogin(); return; }
    // Documentos pendientes de firma: el jugador debe firmarlos antes de entrar.
    if (rol() === 'jugador' && (S.view.pendientes || []).length) {
      const doc = S.view.documentos.find((d) => d.id === S.view.pendientes[0]);
      document.body.classList.add('sin-sesion');
      app.innerHTML = vistaFirma(doc);
      return;
    }
    if (!permitidas().includes(S.tab)) S.tab = TABS[rol()].barra[0];
    if (S.tab === 'avisos') guardarLS('vg_av_' + S.view.yo, JSON.stringify(avisos().map((a) => a.id)));
    const enfocado = document.activeElement && document.activeElement.dataset && document.activeElement.dataset.cambio;
    const y = window.scrollY;
    app.innerHTML = shell(VISTAS[S.tab]());
    window.scrollTo(0, y);
    if (enfocado === 'busqueda') { const i = $('[data-cambio="busqueda"]'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }
  }

  function enviarConError(promesa) {
    return promesa.then((ok) => { if (ok) cerrarModal(); });
  }

  const partido = (id) => S.view.partidos.find((m) => m.id === id);

  // ---------- Acciones de botones ----------
  const ACCIONES = {
    tab: (d) => { cerrarModal(); S.tab = d.tab; S.verPasados = false; render(); window.scrollTo(0, 0); },
    segmento: (d) => {
      if (d.nombre === 'anioFin') S.anioFin = Number(d.valor);
      if (d.nombre === 'verPasados') S.verPasados = d.valor === '1';
      render();
    },
    cerrarModal,
    // El botón de la barra alterna día/noche; en "Mi cuenta" se recorre también "Automático".
    tema: (d) => {
      const t = temaActual();
      const noche = t === 'oscuro' || (t === 'auto' && oscuroSistema && oscuroSistema.matches);
      const orden = Object.keys(TEMAS);
      const sig = d.ciclo ? orden[(orden.indexOf(t) + 1) % orden.length] : noche ? 'claro' : 'oscuro';
      guardarLS('vg_tema', sig === 'auto' ? null : sig);
      aplicarTema();
      const enHoja = !$('#modal').hidden;
      if (enHoja) cerrarModal();
      render();
      toast('Tema: ' + TEMAS[sig]);
    },
    cuenta: () => {
      const u = yo();
      abrirModal('Mi cuenta', '<div class="ficha-cab"><div class="avatar grande">' + h(u.nombre.split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase()) + '</div><div class="crece"><b>' + h(u.nombre) + '</b><small>' + h(u.cargo || u.rol) + '</small><small>' + h(u.usuario ? 'Usuario: ' + u.usuario : C.formatearRut(u.rut)) + '</small></div></div>' + seccionCuenta());
    },
    salir: async () => { cerrarModal(); await B().salir(); S.view = null; S.tab = null; render(); },
    rellenarDemo: (d) => {
      const f = $('#form-login');
      f.rut.value = d.usuario; f.clave.value = d.clave;
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

    // Avisos
    nuevoAviso: () => abrirModal('Nuevo aviso', formAviso(), (o) => accion('aviso.guardar', o, 'Aviso publicado para todo el club')),
    editarAviso: (d) => abrirModal('Editar aviso', formAviso(S.view.avisos.find((a) => a.id === d.id)), (o) => accion('aviso.guardar', o, 'Aviso guardado')),
    borrarAviso: (d) => { if (confirm('¿Eliminar este aviso?')) accion('aviso.eliminar', { id: d.id }, 'Aviso eliminado'); },

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
        abrirModal('Pago de ' + C.MESES[mes] + ' ' + anio, '<div class="tarjeta"><ul class="lista"><li><div class="crece"><b>' + h(j.nombre) + '</b><small>Pagado ' + clp(p.monto) + ' el ' + h(p.fecha) + ' (' + h(p.metodo) + ')</small></div></li></ul></div>' +
          '<div class="modal-pie columna"><button class="btn ancho peligro" data-act="anularPago" data-rut="' + rut + '" data-mes="' + mes + '">Anular pago</button></div>');
        return;
      }
      abrirModal('Pago ' + C.MESES[mes] + ' ' + anio, '<form id="form-modal"><p class="ayuda"><b>' + h(j.nombre) + '</b> · ' + h(etiqueta(j)) + '</p>' +
        '<div class="campos">' + campo('Monto', input('monto', C.cuotaDe(S.view, j), 'type="number" min="0" required inputmode="numeric"')) + campo('Fecha de pago', input('fecha', HOY, 'type="date"')) +
        campo('Método', '<select name="metodo">' + opciones(['Transferencia', 'Link de pago', 'Efectivo', 'Débito', 'Crédito', 'Otro'], 'Transferencia') + '</select>') + '</div>' + pie('Registrar pago') + '</form>',
      (o) => accion('pago.marcar', Object.assign(o, { rut, mes, anio, pagado: true }), 'Pago registrado'));
    },
    anularPago: (d) => enviarConError(accion('pago.marcar', { rut: d.rut, mes: Number(d.mes), anio: S.anioFin, pagado: false }, 'Pago anulado')),
    federativo: (d) => {
      const anio = S.anioFin, j = usuario(d.rut);
      if (C.federativoPagado(S.view, d.rut, anio)) {
        if (confirm('¿Anular el federativo ' + anio + ' de ' + j.nombre + '? Quedará NO habilitado para jugar.')) accion('federativo.marcar', { rut: d.rut, anio, pagado: false }, 'Federativo anulado');
        return;
      }
      abrirModal('Federativo ' + anio, '<form id="form-modal"><p class="ayuda"><b>' + h(j.nombre) + '</b></p><div class="campos">' +
        campo('Monto', input('monto', S.view.config.montoFederativo, 'type="number" min="0" required inputmode="numeric"')) + campo('Fecha', input('fecha', HOY, 'type="date"')) + '</div>' +
        '<p class="ayuda">Al registrarlo, el jugador queda habilitado para jugar.</p>' + pie('Registrar federativo') + '</form>',
      (o) => accion('federativo.marcar', Object.assign(o, { rut: d.rut, anio, pagado: true }), 'Federativo registrado: jugador habilitado'));
    },
    nuevoMovimiento: () => abrirModal('Ingreso o gasto', '<form id="form-modal"><div class="campos">' +
      campo('Tipo', '<select name="tipo"><option value="ingreso">Ingreso</option><option value="gasto">Gasto</option></select>') + campo('Fecha', input('fecha', HOY, 'type="date"')) + '</div>' +
      campo('Concepto', input('concepto', '', 'required placeholder="Ej: arriendo gimnasio, auspicio, rifa"')) + campo('Monto', input('monto', '', 'type="number" min="1" required inputmode="numeric"')) + pie('Registrar') + '</form>',
    (o) => accion('movimiento.crear', o, 'Movimiento registrado')),
    borrarMovimiento: (d) => { if (confirm('¿Eliminar este movimiento?')) accion('movimiento.eliminar', { id: d.id }); },
    verTransferencia: () => abrirModal('Datos de transferencia', '<div class="tarjeta transferencia">' + h(S.view.config.datosTransferencia).replace(/\n/g, '<br>') + '</div>' +
      '<p class="ayuda">Envía el comprobante a la directiva para que registre tu pago.</p><div class="modal-pie columna"><button class="btn primario ancho" data-act="copiarTransferencia">' + icono('copiar') + ' Copiar datos</button></div>'),
    copiarTransferencia: () => copiar(S.view.config.datosTransferencia),

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

    // Partidos y convocatorias
    nuevoPartido: () => abrirModal('Nuevo partido', formPartido(), (o) => accion('partido.guardar', o, 'Partido creado')),
    editarPartido: (d) => abrirModal('Editar partido', formPartido(partido(d.id)), (o) => accion('partido.guardar', o, 'Guardado')),
    borrarPartido: (d) => { if (confirm('¿Eliminar este partido?')) enviarConError(accion('partido.eliminar', { id: d.id }, 'Eliminado')); },
    citar: (d) => abrirCitacion(d.id, false),
    citarTodas: (d) => abrirCitacion(d.id, true),
    convocatoria: (d) => abrirModal('Convocatoria', vistaConvocatoria(partido(d.id))),
    pdfConvocatoria: (d) => imprimirConvocatoria(partido(d.id)),
    copiarConvocatoria: (d) => copiar(textoConvocatoria(partido(d.id))),
    compartirConvocatoria: (d) => navigator.share({ text: textoConvocatoria(partido(d.id)) }).catch(() => {}),
    resultado: (d) => {
      const m = partido(d.id);
      abrirModal('Resultado vs ' + m.rival, '<form id="form-modal"><div class="campos">' + campo('Vieux Gaulois', input('nuestro', m.resultado ? m.resultado.nuestro : '', 'type="number" min="0" inputmode="numeric"')) +
        campo(m.rival, input('rival', m.resultado ? m.resultado.rival : '', 'type="number" min="0" inputmode="numeric"')) + '</div>' + pie() + '</form>',
      (o) => accion('partido.resultado', { id: m.id, nuestro: o.nuestro, rival: o.rival }, 'Resultado guardado'));
    },
    responder: async (d) => {
      const ok = await accion('citacion.responder', { id: d.id, respuesta: d.r }, d.r === 'confirmado' ? '¡Confirmado! Nos vemos en la cancha' : 'Le avisamos al entrenador');
      if (ok && !$('#modal').hidden) abrirModal('Convocatoria', vistaConvocatoria(partido(d.id)));
    },

    // Lesiones
    lesionPara: (d) => abrirModal(esStaff() ? 'Registrar lesión o dolor' : 'Reportar lesión o dolor', formLesion(null, d.rut), (o) => accion('lesion.crear', o, esStaff() ? 'Registrado' : 'Reporte enviado al entrenador y la directiva')),
    editarLesion: (d) => abrirModal(esStaff() ? 'Gestionar reporte' : 'Actualizar reporte', formLesion(S.view.lesiones.find((l) => l.id === d.id)), (o) => accion('lesion.editar', o, 'Actualizado')),
    lesionVisto: (d) => accion('lesion.visto', { id: d.id }),
    lesionVistoTodo: () => accion('lesion.visto', { ids: sinVer().map((l) => l.id) }, 'Todo revisado'),

    // Documentos
    verDocumento: (d) => { const doc = S.view.documentos.find((x) => x.id === d.id); abrirModal(doc.titulo, verDocumento(doc)); },
    nuevoDocumento: () => abrirModal('Compromiso para becados', formDocumento(), (o) => accion('documento.guardar', o, 'Enviado: lo firmarán al ingresar')),
    editarDocumento: (d) => abrirModal('Editar documento', formDocumento(S.view.documentos.find((x) => x.id === d.id)), (o) => accion('documento.guardar', Object.assign(o, { nuevaVersion: !!o.nuevaVersion }), 'Documento guardado')),
    borrarDocumento: (d) => { if (confirm('¿Eliminar este documento? Se pierden sus firmas.')) enviarConError(accion('documento.eliminar', { id: d.id }, 'Eliminado')); },

    // Convenios
    nuevoConvenio: () => abrirModal('Nuevo convenio', formConvenio(), (o) => accion('convenio.guardar', o, 'Convenio publicado')),
    editarConvenio: (d) => abrirModal('Editar convenio', formConvenio(S.view.convenios.find((c) => c.id === d.id)), (o) => accion('convenio.guardar', o, 'Guardado')),
    borrarConvenio: (d) => { if (confirm('¿Eliminar este convenio?')) enviarConError(accion('convenio.eliminar', { id: d.id }, 'Eliminado')); },

    // Staff
    nuevoStaff: () => abrirModal('Agregar directiva o entrenador', '<form id="form-modal">' +
      campo('Nombre', input('nombre', '', 'required')) +
      '<div class="campos">' + campo('Usuario', input('usuario', '', 'required autocapitalize="none" autocomplete="off" placeholder="Ej: jperez" pattern="[A-Za-z][A-Za-z0-9._\\-]{2,29}" title="3 a 30 caracteres, empieza con letra, sin espacios"')) +
      campo('Clave', input('clave', '', 'required minlength="4" autocomplete="new-password"')) +
      campo('Rol', '<select name="rol"><option value="entrenador">Entrenador</option><option value="directiva">Directiva</option></select>') +
      campo('Cargo', input('cargo', '', 'placeholder="Ej: Tesorero, Entrenador Juvenil"')) + campo('Teléfono', input('telefono', '', 'type="tel"')) + campo('Email', input('email', '', 'type="email"')) + '</div>' +
      campo('¿También es jugador del club?', '<select name="jugadorRut"><option value="">No</option>' + jugadores().map((j) => '<option value="' + j.rut + '">' + h(j.nombre) + ' (' + h(j.categoria) + ')</option>').join('') + '</select>') +
      '<p class="ayuda">Entra con este usuario y clave. Si también es jugador, su perfil de jugador sigue entrando con su RUT.</p>' + pie('Agregar') + '</form>',
    (o) => accion('staff.crear', o, 'Usuario "' + o.usuario.trim().toLowerCase() + '" creado')),
    definirClave: (d) => {
      const u = usuario(d.rut);
      abrirModal('Nueva clave para ' + u.nombre, '<form id="form-modal"><p class="ayuda">Usuario: <b>' + h(u.usuario) + '</b></p>' +
        campo('Nueva clave', input('clave', '', 'required minlength="4" autocomplete="new-password"')) + pie('Guardar clave') + '</form>',
      (o) => accion('clave.definir', { rut: u.rut, clave: o.clave }, 'Clave actualizada'));
    },
    activoStaff: (d) => { if (confirm(d.activo ? '¿Activar esta cuenta?' : '¿Desactivar esta cuenta? No podrá ingresar.')) accion('staff.activo', { rut: d.rut, activo: !!d.activo }, 'Listo'); },
    reiniciarDemo: () => {
      if (!confirm('¿Borrar todos los cambios y volver a los datos de ejemplo?')) return;
      Local.db = C.dbEjemplo(); Local.guardar(); Local.salir(); S.view = null; render();
    },
  };

  function abrirCitacion(id, todas) {
    const m = partido(id);
    abrirModal('Citar jugadores', formCitacion(m, todas), async (o) => {
      const noHab = (o.ruts || []).filter((r) => !hab(r));
      if (noHab.length && !confirm(noHab.map((r) => usuario(r).nombre).join(', ') + (noHab.length > 1 ? ' no están habilitados' : ' no está habilitado') + ' (federativo pendiente). ¿Citar igual?')) return false;
      const ok = await accion('citacion.guardar', { id: m.id, ruts: o.ruts || [] }, 'Convocatoria guardada: ' + (o.ruts || []).length + ' jugadores');
      if (ok) abrirModal('Convocatoria', vistaConvocatoria(partido(m.id)));
      return false;
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
    else if (k === 'verInactivos') { S.verInactivos = ev.target.checked; render(); }
    if (ev.target.hasAttribute && ev.target.hasAttribute('data-categoria')) {
      const c = $('#campo-anio');
      if (c) c.hidden = !C.llevaAnio(ev.target.value);
    }
    if (ev.target.name === 'ruts[]') {
      const malos = Array.from(document.querySelectorAll('input[name="ruts[]"]:checked')).filter((i) => i.dataset.hab === '0');
      const av = $('#aviso-hab');
      if (av) { av.hidden = !malos.length; av.textContent = malos.length + ' jugador(es) seleccionados NO están habilitados (federativo pendiente).'; }
    }
  });

  document.addEventListener('input', (ev) => {
    if (ev.target.dataset && ev.target.dataset.cambio === 'busqueda') { S.busqueda = ev.target.value; render(); }
    if (ev.target.id === 'login-rut' || (ev.target.name === 'rut' && ev.target.form && ev.target.form.getAttribute('id') === 'form-modal' && ev.target.type !== 'hidden')) {
      // En el login también se escriben usuarios: sólo se da formato si parte con un número.
      if (!/^\d/.test(ev.target.value.trim())) return;
      const limpio = C.limpiarRut(ev.target.value).slice(0, 9);
      ev.target.value = limpio.length > 1 ? C.formatearRut(limpio.slice(0, -1) + '-' + limpio.slice(-1)) : limpio;
    }
  });

  document.addEventListener('submit', async (ev) => {
    const f = ev.target;
    // getAttribute: si el formulario tiene un campo name="id", f.id devuelve ese campo y no el id del formulario.
    const idForm = f.getAttribute('id');
    ev.preventDefault();
    if (idForm === 'form-login') {
      const btn = f.querySelector('button'); btn.disabled = true;
      try {
        S.view = await B().login(f.rut.value, f.clave.value);
        S.tab = null; render(); window.scrollTo(0, 0);
      } catch (e) {
        $('#login-error').textContent = e.message;
      } finally { btn.disabled = false; }
      return;
    }
    if (idForm === 'form-firma') {
      const o = datosForm(f);
      try {
        S.view = await B().accion('documento.firmar', { id: o.id, aceptados: o.aceptados, nombreFirma: o.nombreFirma, apoderado: o.apoderado });
        render(); window.scrollTo(0, 0); toast('Documento firmado. ¡Gracias!', 'ok');
      } catch (e) { $('#form-error').textContent = e.message; }
      return;
    }
    if (idForm === 'form-modal' && alEnviar) {
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
    const o = datosForm(f);
    if (f.dataset.form === 'config') {
      const cuotas = {};
      S.view.config.categoriasBase.forEach((b) => { cuotas[b] = o['cuota_' + b]; });
      accion('config.guardar', { cuotas, montoFederativo: o.montoFederativo, diaVencimiento: o.diaVencimiento, mesesCobro: o.mesesCobro }, 'Precios guardados');
    }
    if (f.dataset.form === 'pagos') accion('config.guardar', { linkCuota: o.linkCuota, linkFederativo: o.linkFederativo, datosTransferencia: o.datosTransferencia }, 'Datos de pago guardados');
    if (f.dataset.form === 'citacion') accion('config.guardar', { indicacionesCitacion: o.indicacionesCitacion }, 'Indicaciones guardadas');
    if (f.dataset.form === 'categorias') {
      accion('config.guardar', { categoriasBase: o.categoriasBase.split('\n').map((s) => s.trim()).filter(Boolean), cuotas: {} }, 'Categorías guardadas');
    }
  });

  // ---------- Inicio ----------
  async function iniciar() {
    try {
      // El HTML de un solo archivo (o abierto con doble clic) no tiene servidor: va directo a modo demo.
      if (window.VG_SOLO_DEMO || location.protocol === 'file:') throw new Error('sin servidor');
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
