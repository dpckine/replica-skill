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
    hilo: null, borrador: {}, piz: null,
    // Apoderado: S.apo guarda la vista completa (todos sus hijos); S.view es la del hijo elegido.
    apo: null, hijo: leerLS('vg_hijo') || '', catEst: '', catFis: '', verDevueltos: false,
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
    foto: (id) => 'api/foto/' + id + '?t=' + encodeURIComponent(Servidor.token || ''),
  };

  const Local = {
    db: null, rut: leerLS('vg_rut'),
    cargar() {
      try { this.db = JSON.parse(leerLS('vg_db')); } catch (e) { this.db = null; }
      const nueva = !this.db || !this.db.usuarios || this.db.version !== C.dbVacia().version;
      if (nueva) { this.db = C.dbEjemplo(); this.rut = null; }
      if ((C.cambioTemporada(this.db) || nueva)) { try { this.guardar(); } catch (e) { /* sin almacenamiento */ } }
    },
    guardar() {
      // En modo demo no hay a quién enviar notificaciones ni archivos que borrar.
      this.db.notificar = [];
      this.db.fotosBorradas = [];
      localStorage.setItem('vg_db', JSON.stringify(this.db));
    },
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
      const antes = this.db;
      this.db = copia;
      try { this.guardar(); } catch (e) {
        this.db = antes;
        throw new ErrorApi('Este navegador no tiene más espacio para la demo (las fotos ocupan mucho). Borra un álbum o reinicia la demo.');
      }
      return C.viewFor(this.db, this.rut);
    },
    async clave(actual, nueva) {
      const copia = C.clone(this.db);
      await C.cambiarClave(copia, this.rut, actual, nueva, sha256);
      this.db = copia; try { this.guardar(); } catch (e) { /* sin espacio */ }
      return C.viewFor(this.db, this.rut);
    },
    async salir() { this.rut = null; guardarLS('vg_rut', null); },
    foto(id) { return (this.db.fotos || {})[id] || ''; },
  };

  const B = () => (S.modo === 'servidor' ? Servidor : Local);

  // Para el apoderado, cada acción va a nombre del hijo o hija que está mirando.
  const llamar = (type, payload) => B().accion(type, S.apo ? Object.assign({ hijo: S.view.yo }, payload) : payload);

  // Recibe la vista del servidor. La del apoderado trae una vista por hijo: se muestra la elegida.
  function recibir(v) {
    if (v && v.hijos) {
      S.apo = v;
      const elegido = v.hijos.find((x) => x.yo === S.hijo) || v.hijos[0];
      S.view = elegido ? Object.assign({}, elegido, { apoderado: v.apoderado, servidor: v.servidor }) : null;
      if (!elegido) S.sinHijos = v.apoderado;
      return S.view;
    }
    S.apo = null;
    S.view = v;
    return v;
  }
  const fotoUrl = (id) => (id ? B().foto(id) : '');
  const yoId = () => S.view.yoReal || S.view.yo;

  async function accion(type, payload, okMsg) {
    try {
      recibir(await llamar(type, payload));
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
  const esPersonal = (u) => u.rol === 'directiva' || u.rol === 'entrenador';
  const cuentaEntrenador = (rutJugador) => S.view.usuarios.find((u) => esPersonal(u) && u.activo !== false && u.jugadorRut === rutJugador);
  const apoderados = (rut) => S.view.usuarios.filter((u) => u.rol === 'apoderado' && (u.hijos ? u.hijos.includes(rut) && u.activo !== false : S.view.yo === rut));
  const menor = (j) => !!(j && j.fechaNac && C.edad(j.fechaNac) < 18);
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
    chat: '<path d="M20 15a2 2 0 0 1-2 2H8l-4 4V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2z"/>',
    pizarra: '<rect x="3" y="4" width="18" height="13" rx="1.5"/><path d="M12 4v13M3 10.5h3.5v0M17.5 10.5H21M9 21l3-4 3 4"/>',
    jugadas: '<circle cx="6" cy="17" r="2.5"/><path d="M8.5 15.2C12 12.5 13 9 18 6.5"/><path d="M14.5 6h3.7v3.7"/><path d="M15 15l4 4m0-4l-4 4"/>',
    enviar: '<path d="M4 12l16-8-6 16-3-6.5z"/><path d="M11 13.5L20 4"/>',
    atras: '<path d="M15 5l-7 7 7 7"/>',
    deshacer: '<path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>',
    play: '<path d="M7 4.5v15l12.5-7.5z"/>',
    mover: '<path d="M12 3v18M3 12h18M9.5 5.5L12 3l2.5 2.5M9.5 18.5L12 21l2.5-2.5M5.5 9.5L3 12l2.5 2.5M18.5 9.5L21 12l-2.5 2.5"/>',
    lapiz: '<path d="M4 20l4-1L19 8l-3-3L5 16z"/><path d="M14 7l3 3"/>',
    goma: '<path d="M8 20h12M5.5 15.5l9-9 5 5-8.5 8.5H9.5z"/><path d="M10 11l5 5"/>',
    movimiento: '<path d="M5 19L18 6"/><path d="M11 6h7v7"/>',
    pase: '<path d="M5 19L18 6" stroke-dasharray="2.6 2.6"/><path d="M11 6h7v7"/>',
    lanzamiento: '<path d="M5 19L18 6" stroke-width="3.2"/><path d="M11 6h7v7" stroke-width="3.2"/>',
    guardar: '<path d="M5 3h11l3 3v15H5z"/><path d="M8 3v5h7V3M8 21v-7h8v7"/>',
    basura: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
    claro: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    oscuro: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>',
    auto: '<circle cx="12" cy="12" r="9"/><path d="M12 3v18" /><path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor"/>',
    flecha: '<path d="M9 5l7 7-7 7"/>',
    salir: '<path d="M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M10 8l-4 4 4 4M6 12h10"/>',
    llave: '<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M17 6l3 3M15 8l2 2"/>',
    pdf: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
    copiar: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>',
    compartir: '<path d="M12 3v12M7.5 7.5L12 3l4.5 4.5M5 12v8a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-8"/>',
    estadisticas: '<path d="M4 20V10M10 20V4M16 20v-7M21 20H3"/>',
    fisico: '<path d="M6.5 7v10M17.5 7v10M3.5 9.5v5M20.5 9.5v5M6.5 12h11"/>',
    encuestas: '<rect x="3.5" y="4" width="17" height="16" rx="2.5"/><path d="M7.5 9l1.5 1.5 3-3M7.5 15.5h.01M12.5 9.5h4M12.5 15.5h4"/>',
    galeria: '<rect x="3" y="5" width="18" height="14" rx="2.5"/><circle cx="9" cy="10" r="1.8"/><path d="M21 16l-5-5-8 8"/>',
    inventario: '<path d="M3.5 8L12 3.5 20.5 8v8L12 20.5 3.5 16z"/><path d="M3.5 8L12 12.5 20.5 8M12 12.5v8"/>',
    camara: '<path d="M4 8h3l1.5-2.5h7L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13" r="3.5"/>',
    credencial: '<rect x="2.5" y="5" width="19" height="14" rx="2.5"/><circle cx="8.5" cy="11" r="2.2"/><path d="M5 16a3.5 3.5 0 0 1 7 0M14.5 10h4M14.5 13.5h4"/>',
    campana: '<path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>',
    medica: '<rect x="3.5" y="6" width="17" height="14" rx="2.5"/><path d="M9 6V4h6v2M12 10v6M9 13h6"/>',
    cumple: '<path d="M4 20h16v-7a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1zM4 16c2 1.2 4-1.2 6 0s4-1.2 6 0 3 .5 4 0"/><path d="M12 12V9M12 6.5c-.8-.6-.8-1.6 0-2.5.8.9.8 1.9 0 2.5z"/>',
    excel: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4M9 11l5 6M14 11l-5 6"/>',
    whatsapp: '<path d="M4 20l1.2-3.6A8 8 0 1 1 8 19z"/><path d="M9 9.5c.3 2.3 2.2 4.2 4.5 4.5l1-1.2 1.8.8c-.3 1.2-1.3 1.9-2.5 1.8A6 6 0 0 1 8.4 10c-.1-1.2.6-2.2 1.8-2.5l.8 1.8z"/>',
    correo: '<rect x="3" y="5.5" width="18" height="13" rx="2"/><path d="M3.5 7l8.5 6 8.5-6"/>',
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
      [['Directiva', 'vieux', 'vieuxg1234'], ['Entrenador', 'jorge', 'jorge1234'], ['Jugador (firma al entrar)', '20.123.456-5', '2012'], ['Jugadora becada', '20.555.666-4', '2055'],
        ['Apoderada (2 hijos, firma)', '15.678.901-1', '1567'], ['Jugadora menor (espera firma)', '24.901.234-3', '2490'], ['Cadete (estadísticas)', '24.678.901-' + C.dvRut(24678901), '2467'], ['Entrenador y jugador', 'tomas', 'tomas1234']]
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
      '<p class="login-ayuda"><b>Jugadores y apoderados:</b> RUT y los 4 primeros dígitos del RUT.<br><b>Entrenadores y directiva:</b> usuario y clave entregados por la directiva.</p>' +
      demo + '</div></div>';
  }

  // ---------- Firma de documentos (consentimiento / becados) ----------
  function vistaFirma(doc) {
    const j = yo();
    const apo = S.apo ? S.view.apoderado : null;
    const parrafos = doc.texto.split(/\n\s*\n/).map((p) => '<p>' + h(p).replace(/\n/g, '<br>') + '</p>').join('');
    return '<div class="firma"><div class="firma-caja">' +
      '<img src="' + ESCUDO + '" alt="" class="firma-escudo"><div class="franja corta" aria-hidden="true"><i></i><i></i><i></i></div>' +
      (S.apo && S.apo.hijos.length > 1 ? selectorHijos() : '') +
      '<p class="firma-sub">' + (apo ? 'Firma como apoderado de ' + h(j.nombre) : doc.id === 'consentimiento' ? 'Antes de comenzar' : 'La directiva te envió un documento') + '</p>' +
      '<h1>' + h(doc.titulo) + '</h1>' +
      '<div class="tarjeta firma-texto">' + parrafos + '</div>' +
      '<form id="form-firma"><input type="hidden" name="id" value="' + h(doc.id) + '">' +
      '<div class="tarjeta lista-chequeo">' + doc.puntos.map((p, i) => '<label class="celda-chequeo"><input type="checkbox" name="aceptados[]" value="' + i + '" required><span>' + h(p) + '</span></label>').join('') + '</div>' +
      '<div class="tarjeta grupo-form">' + input('nombreFirma', '', 'placeholder="' + (apo ? 'Tu nombre completo (apoderado)' : 'Tu nombre completo (firma)') + '" required autocomplete="name"') + '</div>' +
      '<p class="seccion-pie">' + (apo ? 'Firmas como ' + h(apo.nombre) + ' (' + h(C.formatearRut(apo.rut)) + '), apoderado de ' + h(j.nombre) + ' (' + h(C.formatearRut(j.rut)) + '), el ' + h(fLarga(HOY)) + '.'
        : 'Firmas como ' + h(j.nombre) + ' (' + h(C.formatearRut(j.rut)) + ') el ' + h(fLarga(HOY)) + '.') + '</p>' +
      '<div class="error" id="form-error"></div>' +
      '<button class="btn primario ancho">Firmo y acepto</button></form>' +
      '<button class="btn-texto centro" data-act="salir">Salir</button></div></div>';
  }

  // Menor de edad: su cuenta se habilita cuando el apoderado firma el consentimiento desde su cuenta.
  function vistaEsperaApoderado() {
    const j = yo();
    const aps = apoderados(j.rut);
    return '<div class="firma"><div class="firma-caja">' +
      '<img src="' + ESCUDO + '" alt="" class="firma-escudo"><div class="franja corta" aria-hidden="true"><i></i><i></i><i></i></div>' +
      '<p class="firma-sub">Hola, ' + h(j.nombre.split(/\s+/)[0]) + '</p><h1>Tu cuenta se activa cuando tu apoderado firme</h1>' +
      '<div class="tarjeta firma-texto">' + (aps.length
        ? '<p>Como eres menor de edad, el consentimiento informado lo firma tu apoderado desde su propia cuenta:</p><ul>' + aps.map((a) => '<li><b>' + h(a.nombre) + '</b></li>').join('') + '</ul>' +
          '<p>Entra con su RUT y, como clave, los 4 primeros dígitos de su RUT. Apenas firme, podrás usar la app.</p>'
        : '<p>Aún no está registrado tu apoderado. Pídele a tu entrenador o a la directiva que lo agreguen en tu ficha; con eso tu apoderado podrá entrar y firmar.</p>') + '</div>' +
      '<button class="btn primario ancho" data-act="recargar">Ya firmó: actualizar</button>' +
      '<button class="btn-texto centro" data-act="salir">Salir</button></div></div>';
  }

  // Apoderado con más de un hijo o hija en el club: elige a quién está mirando.
  function selectorHijos() {
    return '<div class="hijos" role="tablist" aria-label="Hijos">' + S.apo.hijos.map((x) => {
      const u = x.usuarios[0];
      const pend = (x.pendientes || []).length;
      return '<button class="chip-hijo' + (x.yo === S.view.yo ? ' activo' : '') + '" data-act="elegirHijo" data-rut="' + h(x.yo) + '">' + h(u.nombre.split(/\s+/)[0]) +
        '<small>' + h(u.categoria) + '</small>' + (pend ? '<i class="punto">' + pend + '</i>' : '') + '</button>';
    }).join('') + '</div>';
  }

  // ---------- Pestañas por rol ----------
  const NOMBRES = {
    inicio: 'Inicio', avisos: 'Avisos', jugadores: 'Jugadores', finanzas: 'Finanzas', entrenamientos: 'Entrenamientos', partidos: 'Partidos',
    lesiones: 'Lesiones', documentos: 'Documentos', convenios: 'Convenios', ajustes: 'Ajustes', calendario: 'Calendario', perfil: 'Mi perfil', mas: 'Más',
    chat: 'Mensajes', pizarra: 'Pizarra', jugadas: 'Jugadas',
    estadisticas: 'Estadísticas', fisico: 'Evaluación física', encuestas: 'Encuestas', galeria: 'Galería', inventario: 'Inventario',
  };
  const TABS = {
    directiva: { barra: ['inicio', 'jugadores', 'finanzas', 'chat'], mas: ['partidos', 'entrenamientos', 'estadisticas', 'fisico', 'pizarra', 'avisos', 'encuestas', 'galeria', 'lesiones', 'inventario', 'documentos', 'convenios', 'calendario', 'ajustes'] },
    entrenador: { barra: ['inicio', 'jugadores', 'partidos', 'pizarra'], mas: ['entrenamientos', 'estadisticas', 'fisico', 'chat', 'avisos', 'encuestas', 'galeria', 'lesiones', 'inventario', 'convenios', 'calendario'] },
    jugador: { barra: ['perfil', 'finanzas', 'chat', 'avisos'], mas: ['calendario', 'estadisticas', 'jugadas', 'encuestas', 'galeria', 'convenios'] },
  };
  const permitidas = () => { const t = TABS[rol()]; return t.barra.concat(t.mas, t.mas.length ? ['mas'] : []); };
  const contador = (tab) => (tab === 'lesiones' ? sinVer().length : tab === 'avisos' ? avisosNuevos() : tab === 'chat' ? chatSinLeer()
    : tab === 'finanzas' && esDir() ? informesPendientes().length : tab === 'convenios' && esDir() ? propuestasConvenio().length : tab === 'encuestas' && !esStaff() ? encuestasPorVotar().length : tab === 'mas' ? TABS[rol()].mas.reduce((s, t) => s + contador(t), 0) : 0);

  const BOTON_TITULO = {
    jugadores: () => esStaff() && '<button class="btn-redondo" data-act="nuevoJugador" aria-label="Inscribir jugador">' + icono('mas2') + '</button>',
    entrenamientos: () => '<button class="btn-redondo" data-act="nuevoEntrenamiento" aria-label="Programar entrenamiento">' + icono('mas2') + '</button>',
    partidos: () => '<button class="btn-redondo" data-act="nuevoPartido" aria-label="Nuevo partido">' + icono('mas2') + '</button>',
    avisos: () => esStaff() && '<button class="btn-redondo" data-act="nuevoAviso" aria-label="Nuevo aviso">' + icono('mas2') + '</button>',
    lesiones: () => '<button class="btn-redondo" data-act="lesionPara" aria-label="Registrar lesión">' + icono('mas2') + '</button>',
    convenios: () => (esDir() ? '<button class="btn-redondo" data-act="nuevoConvenio" aria-label="Nuevo convenio">' + icono('mas2') + '</button>'
      : '<button class="btn-redondo" data-act="proponerConvenio" aria-label="Proponer convenio">' + icono('mas2') + '</button>'),
    finanzas: () => (esDir() ? '<button class="btn-redondo" data-act="nuevoMovimiento" aria-label="Registrar ingreso o gasto">' + icono('mas2') + '</button>'
      : '<button class="btn-redondo" data-act="informarPago" aria-label="Informar un pago">' + icono('mas2') + '</button>'),
    chat: () => esStaff() && !S.hilo && '<button class="btn-redondo" data-act="nuevoChat" aria-label="Nuevo mensaje">' + icono('mas2') + '</button>',
    fisico: () => esStaff() && '<button class="btn-redondo" data-act="nuevaEvaluacion" aria-label="Nueva evaluación">' + icono('mas2') + '</button>',
    encuestas: () => esStaff() && '<button class="btn-redondo" data-act="nuevaEncuesta" aria-label="Nueva encuesta">' + icono('mas2') + '</button>',
    galeria: () => rol() === 'entrenador' && '<button class="btn-redondo" data-act="nuevoAlbum" aria-label="Subir fotos">' + icono('mas2') + '</button>',
    inventario: () => esStaff() && '<button class="btn-redondo" data-act="nuevoMaterial" aria-label="Agregar material">' + icono('mas2') + '</button>',
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
    const quien = S.apo ? S.view.apoderado : u;
    const iniciales = quien.nombre.split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase();
    const botonTitulo = BOTON_TITULO[S.tab] ? BOTON_TITULO[S.tab]() : '';
    const sub = S.apo ? 'Apoderado · ' + u.nombre.split(/\s+/)[0] : (u.cargo || u.rol);
    return '<header class="navbar"><img src="' + ESCUDO + '" alt=""><div class="navbar-tit"><b>Vieux Gaulois</b><small>' + h(sub) + '</small></div>' +
      botonTema() + '<button class="avatar" data-act="cuenta" aria-label="Mi cuenta">' + h(iniciales) + '</button></header>' +
      '<div class="franja" aria-hidden="true"><i></i><i></i><i></i></div>' +
      (S.modo === 'local' ? '<div class="modo-demo">Modo demo · los datos se guardan sólo en este navegador</div>' : '') +
      (S.apo && S.apo.hijos.length > 1 ? selectorHijos() : '') +
      '<main class="tab-' + S.tab + (S.tab === 'chat' && S.hilo ? ' en-hilo' : '') + '"><div class="titulo-fila">' +
      (S.tab === 'chat' && S.hilo ? '<button class="btn-icono atras" data-act="cerrarHilo" aria-label="Volver">' + icono('atras') + '</button><h1 class="titulo-grande">' + h(tituloHilo(S.hilo)) + '</h1>'
        : '<h1 class="titulo-grande">' + h(NOMBRES[S.tab]) + '</h1>') + '</div>' + contenido + '</main>' +
      (botonTitulo ? '<div class="fab-zona">' + botonTitulo + '</div>' : '') +
      '<nav class="tabbar" aria-label="Secciones">' + barra + '</nav>';
  }

  function vistaMas() {
    const t = TABS[rol()];
    return seccion('', '<ul class="lista clic">' + t.mas.map((id) => {
      const n = contador(id);
      return '<li data-act="tab" data-tab="' + id + '"><span class="ico-celda c-' + id + '">' + icono(id) + '</span><div class="crece"><b>' + NOMBRES[id] + '</b></div>' +
        (n ? '<i class="punto">' + n + '</i>' : '') + '<span class="chevron">' + icono('flecha') + '</span></li>';
    }).join('') + '</ul>');
  }

  function seccionCuenta() {
    return seccion('Cuenta', '<ul class="lista clic">' +
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
    const hero = '<section class="perfil bienvenida"><div class="perfil-fila"><img class="hero-escudo" src="' + ESCUDO + '" alt=""><div class="crece">' +
      '<small class="hero-sub">Temporada ' + ANIO + '</small><h2>Hola, ' + h(yo().nombre.split(/\s+/)[0]) + '</h2>' +
      '<p>' + (prox ? 'Próximo partido: ' + h(prox.categoria) + ' vs ' + h(prox.rival) + ' · ' + h(fCorta(prox.fecha)) + ' ' + h(prox.hora) + ' hrs' : 'No hay partidos programados') + '</p></div></div></section>';
    const mes = new Date().getMonth();
    const cumples = C.cumpleanosDelMes(S.view, mes, ANIO);
    const temporada = (S.view.cambiosTemporada || []).filter((x) => x.anio === ANIO && x.cambios.length).pop();
    return hero + '<div class="kpis">' + kpis + '</div>' +
      (temporada && leerLS('vg_temp_' + ANIO) !== '1' ? '<div class="aviso info fila entre"><span>Nueva temporada ' + ANIO + ': <b>' + temporada.cambios.length + '</b> jugadores subieron de año o de categoría automáticamente.</span><button class="btn mini" data-act="verTemporada">Ver cambios</button></div>' : '') +
      seccion('Lesiones y dolores sin revisar', nuevas.length ? '<ul class="lista">' + nuevas.map(itemLesion).join('') + '</ul>' : vacio('No hay reportes nuevos.'),
        nuevas.length ? btnTexto('Marcar revisado', 'lesionVistoTodo') : '') +
      seccion('Próximo partido', prox ? tarjetaPartido(prox) : vacio('No hay partidos programados.'), btnTexto('Ver todos', 'tab', 'data-tab="partidos"')) +
      (esDir() && informesPendientes().length ? seccion('Pagos informados por revisar', '<ul class="lista">' + informesPendientes().map(itemInforme).join('') + '</ul>', btnTexto('Finanzas', 'tab', 'data-tab="finanzas"')) : '') +
      (esDir() && propuestasConvenio().length ? seccion('Convenios propuestos', '<ul class="lista">' + propuestasConvenio().map(itemPropuesta).join('') + '</ul>', btnTexto('Convenios', 'tab', 'data-tab="convenios"')) : '') +
      seccion('Esta semana', semana.length ? '<ul class="lista">' + semana.map(itemEntrenamiento).join('') + '</ul>' : vacio('Sin entrenamientos en los próximos 7 días.'), btnTexto('Ver todos', 'tab', 'data-tab="entrenamientos"')) +
      (cumples.length ? seccion('🎂 Cumpleaños de ' + C.MESES_LARGOS[mes].toLowerCase(), listaCumples(cumples)) : '');
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
      return '<li data-act="verJugador" data-rut="' + j.rut + '">' + (j.foto ? avatarFoto(j, 'camiseta foto') : camiseta(j)) +
        '<div class="crece"><b>' + h(j.nombre) + '</b><small>' + h(etiqueta(j)) + (j.posicion ? ' · ' + h(j.posicion) : '') + '</small>' +
        '<div class="fila insignias">' + habInsignia(j.rut) + (les ? insignia('Lesión', 'alerta') : '') + (deuda ? insignia(deuda + ' cuota' + (deuda > 1 ? 's' : '') + ' atrasada' + (deuda > 1 ? 's' : ''), 'mal') : '') +
        (sinFirma ? insignia(menor(j) ? 'Falta firma del apoderado' : 'Sin consentimiento', 'alerta') : '') + (menor(j) && !apoderados(j.rut).length ? insignia('Sin apoderado', 'mal') : '') + (cuentaEntrenador(j.rut) ? insignia('Entrenador', 'oro') : '') + (j.activo === false ? insignia('Inactivo') : '') + '</div></div>' +
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
      campo('Fecha de nacimiento', input('fechaNac', j.fechaNac, 'type="date" required')) +
      campo('N° de camiseta', input('numero', j.numero, 'type="number" min="0" max="99" inputmode="numeric"')) +
      campo('Posición', '<select name="posicion"><option value="">–</option>' + opciones(C.POSICIONES, j.posicion) + '</select>') +
      campo('Teléfono', input('telefono', j.telefono, 'type="tel"')) +
      campo('Email', input('email', j.email, 'type="email"')) +
      (esDir() ? campo('Descuento / beca (%)', input('descuento', j.descuento || 0, 'type="number" min="0" max="100" inputmode="numeric"')) : '') +
      '</div>' +
      (nuevo ? '<p class="sub">Apoderado (obligatorio si es menor de 18)</p><p class="ayuda">Se crea su cuenta: entra con su RUT y los 4 primeros dígitos. La cuenta del menor se habilita cuando el apoderado firma el consentimiento.</p>' +
        '<div class="campos">' + campo('RUT del apoderado', input('apoderadoRut', '', 'placeholder="12.345.678-9" data-rut')) + campo('Nombre del apoderado', input('apoderadoNombre', '', 'maxlength="80"')) +
        campo('Teléfono', input('apoderadoTelefono', '', 'type="tel"')) + campo('Email', input('apoderadoEmail', '', 'type="email"')) + '</div>' : '') +
      pie(nuevo ? 'Inscribir jugador' : 'Guardar') + '</form>';
  }

  function fichaJugador(rut) {
    const j = usuario(rut);
    const a = C.resumenAsistencia(S.view, j, ANIO);
    const les = S.view.lesiones.filter((l) => l.rut === rut).sort((x, y) => y.fecha.localeCompare(x.fecha));
    const docs = (S.view.documentos || []).filter((d) => C.documentoAplica(d, rut));
    const fila = (k, v) => '<li><div class="crece"><small>' + h(k) + '</small></div><div class="valor">' + v + '</div></li>';
    let html = '<div class="ficha-cab">' + (j.foto ? avatarFoto(j, 'camiseta foto') : camiseta(j)) + '<div class="crece"><b>' + h(j.nombre) + '</b><small>' + h(C.formatearRut(j.rut)) + '</small><small>' + h(etiqueta(j)) + (j.posicion ? ' · ' + h(j.posicion) : '') + '</small></div>' + habInsignia(rut) + '</div>' +
      '<div class="tarjeta"><ul class="lista">' +
      fila('Edad', C.edad(j.fechaNac) == null ? '–' : C.edad(j.fechaNac) + ' años') +
      fila('Teléfono', h(j.telefono || '–')) + fila('Email', h(j.email || '–')) +
      fila('Asistencia ' + ANIO, a.asistidos + ' de ' + a.realizados + ' (' + a.porcentaje + '%)') +
      fila('Federativo ' + ANIO, C.federativoPagado(S.view, rut, ANIO) ? insignia('Pagado', 'ok') : insignia('Pendiente', 'mal'));
    if (esDir()) {
      const deuda = C.mesesAdeudados(S.view, rut, ANIO).filter((m) => estadoMes(rut, ANIO, m) === 'vencido');
      html += fila('Cuota mensual', clp(C.cuotaDe(S.view, j)) + (j.descuento ? ' (' + j.descuento + '% beca)' : '')) +
        fila('Cuotas atrasadas', deuda.length ? deuda.map((m) => C.MESES[m]).join(', ') : 'Al día');
    }
    html += docs.map((d) => { const f = C.firmaDe(S.view, rut, d); return fila(d.titulo, f ? insignia('Firmado ' + fCorta(f.fecha), 'ok') : insignia('Pendiente', 'alerta')); }).join('');
    html += '</ul></div>';
    // Apoderados: obligatorios para menores; su cuenta firma y gestiona por el jugador.
    const aps = apoderados(rut);
    html += '<h3 class="sub">Apoderado' + (aps.length > 1 ? 's' : '') + '</h3><div class="tarjeta">' + (aps.length ? '<ul class="lista">' + aps.map((a) => {
      const wa = telWa(a.telefono);
      return '<li class="envolver"><div class="crece"><b>' + h(a.nombre) + '</b><small>' + h(C.formatearRut(a.rut)) + (a.telefono ? ' · ' + h(a.telefono) : '') + (a.email ? ' · ' + h(a.email) : '') + '</small>' +
        '<div class="fila insignias">' + (a.claveInicial ? insignia('Clave inicial') : insignia('Ya entró', 'ok')) + (wa ? '<a class="btn mini" href="https://wa.me/' + wa + '" target="_blank" rel="noopener noreferrer">WhatsApp</a>' : '') +
        (esDir() ? '<button class="btn mini" data-act="resetClave" data-rut="' + a.rut + '">Restablecer clave</button>' : '') +
        '<button class="btn mini peligro" data-act="quitarApoderado" data-rut="' + rut + '" data-apoderado="' + a.rut + '">Quitar</button></div></div></li>';
    }).join('') + '</ul>' : vacio(menor(j) ? 'Es menor de edad y no tiene apoderado: su cuenta no se habilita hasta que el apoderado firme.' : 'Sin apoderado (no es obligatorio para mayores de edad).')) +
      '<button class="btn ancho" data-act="agregarApoderado" data-rut="' + rut + '">+ Agregar apoderado</button></div>';
    // Ficha médica: sólo la ve el cuerpo técnico (no la directiva).
    if (rol() === 'entrenador') html += '<h3 class="sub">Ficha médica</h3><div class="tarjeta">' + vistaFichaMedica(j) + '<button class="btn ancho" data-act="fichaMedica" data-rut="' + rut + '">Editar ficha médica</button></div>';
    const est = C.estadisticasJugador(S.view, rut, ANIO);
    if (est.pj) html += '<h3 class="sub">Estadísticas ' + ANIO + '</h3><div class="tarjeta"><div class="fila insignias">' + insignia(est.pj + ' partidos') + insignia(est.g + ' goles', 'ok') + (est.at ? insignia(est.at + ' atajadas') : '') + (est.dm ? insignia(est.dm + ' × 2 min', 'alerta') : '') + (est.am + est.ro + est.az ? insignia((est.am + est.ro + est.az) + ' tarjetas', 'mal') : '') + '</div></div>';
    const evs = (S.view.evaluaciones || []).filter((e) => e.rut === rut);
    if (evs.length) html += '<h3 class="sub">Evaluación física</h3><div class="tarjeta">' + bloqueEvaluaciones(evs) + '</div>';
    const mat = (S.view.prestamos || []).filter((x) => x.rut === rut && !x.devuelto);
    if (mat.length) html += '<h3 class="sub">Material a su cargo</h3><div class="tarjeta"><ul class="lista">' + mat.map((x) => '<li><div class="crece"><b>' + x.cantidad + ' × ' + h(((S.view.inventario || []).find((i) => i.id === x.itemId) || { nombre: '?' }).nombre) + '</b><small>Desde ' + h(fCorta(x.fecha)) + (x.nota ? ' · ' + h(x.nota) : '') + '</small></div></li>').join('') + '</ul></div>';
    html += '<h3 class="sub">Lesiones y dolores</h3><div class="tarjeta">' + (les.length ? '<ul class="lista">' + les.map(itemLesion).join('') + '</ul>' : vacio('Sin reportes.')) + '</div>';
    html += '<div class="modal-pie columna"><button class="btn primario ancho" data-act="editarJugador" data-rut="' + rut + '">Editar datos</button>' +
      '<button class="btn ancho" data-act="credencial" data-rut="' + rut + '">' + icono('credencial') + ' Credencial y foto</button>' +
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

    const pend = informesPendientes();
    return '<div class="filtros">' + segmentado('anioFin', anio, [[ANIO - 1, ANIO - 1], [ANIO, ANIO], [ANIO + 1, ANIO + 1]]) + filtroCategoria() +
      '<button class="btn" data-act="reporte">' + icono('excel') + ' Reporte mensual</button></div>' +
      (pend.length ? seccion('Pagos informados por revisar', '<ul class="lista">' + pend.map(itemInforme).join('') + '</ul>', '', 'Al aprobar, el pago queda registrado automáticamente.') : '') +
      '<div class="kpis">' +
      '<div class="kpi verde"><small>Cuotas recaudadas</small><b>' + clp(recaudado) + '</b><small>de ' + clp(esperado) + ' vencido</small></div>' +
      '<div class="kpi rojo"><small>Cuotas vencidas</small><b>' + clp(Math.max(0, esperado - recaudado)) + '</b></div>' +
      '<div class="kpi oro"><small>Federativos</small><b>' + fedN + '<span>/' + js.length + '</span></b><small>' + clp(fedMonto) + '</small></div>' +
      '<div class="kpi"><small>Otros ingresos − gastos</small><b>' + clp(ingresos - gastos) + '</b></div>' +
      '<div class="kpi ' + (balance >= 0 ? 'verde' : 'rojo') + '"><small>Balance ' + anio + '</small><b>' + clp(balance) + '</b></div></div>' +
      seccion('Mensualidades y federativo', js.length ? '<div class="tabla-envoltura"><table class="tabla matriz"><thead><tr><th>Jugador</th><th class="c">Fed</th>' + C.MESES.map((m) => '<th class="c">' + m + '</th>').join('') + '<th class="num">Deuda</th></tr></thead><tbody>' + filas + '</tbody></table></div>' : vacio('No hay jugadores.'),
        btnTexto('Precios', 'tab', 'data-tab="ajustes"'), 'Toca una casilla para registrar o anular un pago. ✓ pagado · ! vencido · vacío por vencer · punto = mes sin cobro. <b>Fed</b> = federativo (habilita para jugar).') +
      seccionCobros() + seccionRecordatorios() +
      seccion('Otros ingresos y gastos', movs.length ? '<ul class="lista">' + movs.map((m) => '<li><div class="crece"><b>' + h(m.concepto) + '</b><small>' + fCorta(m.fecha) + '</small></div><b class="' + (m.tipo === 'gasto' ? 'rojo' : 'verde') + '">' + (m.tipo === 'gasto' ? '−' : '+') + clp(m.monto) + '</b><button class="btn-icono" data-act="borrarMovimiento" data-id="' + m.id + '" aria-label="Eliminar">&times;</button></li>').join('') + '</ul>' : vacio('Sin movimientos este año.'),
        btnTexto('Registrar', 'nuevoMovimiento'));
  }

  // Cobros: por cada concepto la directiva activa link de pago, transferencia o ambos.
  function seccionCobros() {
    const medios = (c) => {
      const m = C.mediosDe(S.view, c);
      return (m.link ? insignia('Link de pago', 'ok') : insignia('Sin link')) + (m.transferencia ? insignia('Transferencia', 'ok') : insignia('Sin transferencia'));
    };
    const js = jugadores();
    const fila = (id, nombre, detalle, extra) => '<li class="envolver"><span class="ico-celda c-finanzas">' + icono('finanzas') + '</span><div class="crece"><b>' + h(nombre) + '</b><small>' + detalle + '</small>' +
      '<div class="fila insignias">' + medios(id) + '</div><div class="fila insignias">' + extra + '</div></div></li>';
    return seccion('Cobros y medios de pago', '<ul class="lista">' +
      fila('cuota', 'Mensualidad', 'Monto según categoría · vence el día ' + S.view.config.diaVencimiento, '<button class="btn mini" data-act="editarMedios" data-concepto="cuota">Medios de pago</button>') +
      fila('federativo', 'Federativo ' + ANIO, clp(S.view.config.montoFederativo) + ' · habilita para jugar', '<button class="btn mini" data-act="editarMedios" data-concepto="federativo">Medios de pago</button>') +
      (S.view.cobros || []).map((c) => {
        const aplica = js.filter((j) => C.cobroAplica(c, j));
        const pag = aplica.filter((j) => C.cobroPagado(S.view, c.id, j.rut)).length;
        return fila(c.id, c.nombre + (c.activo === false ? ' (pausado)' : ''), clp(c.monto) + ' · ' + (c.categorias.length ? h(cortoCats(c.categorias)) : 'Todo el club') + (c.vence ? ' · vence ' + h(fCorta(c.vence)) : '') + ' · <b>' + pag + '/' + aplica.length + '</b> pagados',
          '<button class="btn mini primario" data-act="verCobro" data-id="' + c.id + '">Pagos</button><button class="btn mini" data-act="editarCobro" data-id="' + c.id + '">Editar</button>');
      }).join('') + '</ul>', btnTexto('Nuevo cobro', 'nuevoCobro'), 'Activa o desactiva el link de pago y la transferencia por concepto. Los datos de transferencia se editan en Ajustes.');
  }

  function formMedios(concepto) {
    const cfg = S.view.config;
    const m = (cfg.medios && cfg.medios[concepto]) || { link: true, transferencia: true };
    const campoLink = concepto === 'cuota' ? 'linkCuota' : 'linkFederativo';
    return '<form id="form-modal">' +
      '<div class="tarjeta lista-chequeo"><label class="celda-chequeo"><input type="checkbox" name="usarLink" value="1"' + (m.link !== false ? ' checked' : '') + '><span><b>Link de pago</b><br><small>Botón "Pagar" que abre el link</small></span></label>' +
      '<label class="celda-chequeo"><input type="checkbox" name="usarTransferencia" value="1"' + (m.transferencia !== false ? ' checked' : '') + '><span><b>Transferencia</b><br><small>Muestra los datos de transferencia del club</small></span></label></div>' +
      '<div style="height:12px"></div>' + campo('Link de pago', input('link', cfg[campoLink], 'type="url" placeholder="https://"')) +
      (cfg.datosTransferencia ? '' : '<div class="aviso">Aún no hay datos de transferencia: agrégalos en Ajustes.</div>') + pie() + '</form>';
  }

  function formCobro(c) {
    const nuevo = !c;
    c = c || { usarTransferencia: true, categorias: [], activo: true };
    return '<form id="form-modal">' + (nuevo ? '' : '<input type="hidden" name="id" value="' + c.id + '">') +
      campo('Concepto', input('nombre', c.nombre, 'required maxlength="80" placeholder="Ej: Torneo Nacional, polerón, viaje"')) +
      '<div class="campos">' + campo('Monto', input('monto', c.monto, 'type="number" min="1" required inputmode="numeric"')) + campo('Vence (opcional)', input('vence', c.vence, 'type="date"')) + '</div>' +
      '<p class="etiqueta">Medios de pago</p><div class="tarjeta lista-chequeo"><label class="celda-chequeo"><input type="checkbox" name="usarLink" value="1"' + (c.usarLink ? ' checked' : '') + '><span>Link de pago</span></label>' +
      '<label class="celda-chequeo"><input type="checkbox" name="usarTransferencia" value="1"' + (c.usarTransferencia ? ' checked' : '') + '><span>Transferencia</span></label></div><div style="height:12px"></div>' +
      campo('Link de pago', input('link', c.link, 'type="url" placeholder="https://"')) +
      '<p class="etiqueta">¿A quién se cobra? (vacío = todo el club)</p>' + chequeosCategorias('categorias', c.categorias) +
      '<label class="celda-chequeo"><input type="checkbox" name="activo" value="1"' + (c.activo !== false ? ' checked' : '') + '><span>Cobro activo (los jugadores lo ven)</span></label>' +
      pie(nuevo ? 'Crear cobro' : 'Guardar', nuevo ? '' : '<button type="button" class="btn peligro" data-act="borrarCobro" data-id="' + c.id + '">Eliminar</button>') + '</form>';
  }

  function vistaCobro(c) {
    const aplica = jugadores().filter((j) => C.cobroAplica(c, j));
    return '<p class="ayuda">' + clp(c.monto) + ' · toca para marcar o anular el pago.</p><div class="tarjeta"><ul class="lista clic">' + (aplica.map((j) => {
      const p = S.view.pagosCobro[c.id] && S.view.pagosCobro[c.id][j.rut];
      return '<li data-act="marcarCobro" data-id="' + c.id + '" data-rut="' + j.rut + '"><div class="crece"><b>' + h(j.nombre) + '</b><small>' + h(etiqueta(j)) + (p ? ' · ' + h(p.metodo) + ' ' + h(fCorta(p.fecha)) : '') + '</small></div>' +
        (p && p.pagado ? insignia('Pagado', 'ok') : insignia('Pendiente', 'alerta')) + '</li>';
    }).join('') || '<li>' + vacio('Ningún jugador activo en estas categorías.') + '</li>') + '</ul></div>';
  }

  // ---------- Entrenamientos ----------
  const cortoCats = (lista) => (lista || []).map((c) => c.replace(' Masculino', ' Masc.').replace(' Femenino', ' Fem.')).join(', ');

  function itemEntrenamiento(e) {
    const n = Object.values(e.asistencia || {});
    const resumen = e.asistenciaTomada ? insignia(n.filter((x) => x === 'P').length + '/' + n.length + ' presentes', 'ok') : (e.fecha <= HOY ? insignia('Falta asistencia', 'alerta') : '');
    const mia = e.miAsistencia ? insignia({ P: 'Asististe', A: 'Ausente', J: 'Justificado' }[e.miAsistencia], { P: 'ok', A: 'mal', J: 'alerta' }[e.miAsistencia]) : '';
    const plan = (e.plan || []).length ? '<button class="btn mini' + (esStaff() ? '' : ' primario') + '" data-act="verPlan" data-id="' + e.id + '">Plan · ' + e.plan.length + ' ejercicios</button>' : '';
    return '<li>' + fechaCaja(e.fecha) + '<div class="crece"><b>' + h(e.tema || 'Entrenamiento') + '</b><small>' + h(e.hora) + ' hrs · ' + h(e.lugar || '') + '</small>' +
      (esStaff() ? '<small>' + h(cortoCats(e.categorias)) + '</small><div class="fila insignias">' + resumen + '<button class="btn mini" data-act="asistencia" data-id="' + e.id + '">Asistencia</button>' +
        (plan || '<button class="btn mini" data-act="editarPlan" data-id="' + e.id + '">+ Plan</button>') + '<button class="btn mini" data-act="editarEntrenamiento" data-id="' + e.id + '">Editar</button></div>'
        : (mia || plan ? '<div class="fila insignias">' + mia + plan + '</div>' : '')) + '</div></li>';
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

  const lineasCuerpoTecnico = (m) => C.CUERPO_TECNICO.filter(([k]) => m.cuerpoTecnico && m.cuerpoTecnico[k]).map(([k, etq]) => etq + ': ' + m.cuerpoTecnico[k]);
  const tituloConvocatoria = (m) => 'Fecha ' + m.categoria + (m.competicion ? ' · ' + m.competicion : '');

  // Mismo formato que la citación de WhatsApp del club.
  function textoConvocatoria(m) {
    const ct = lineasCuerpoTecnico(m);
    return [tituloConvocatoria(m)].concat(lineasConvocatoria(m).map(([e, t]) => e + ' ' + t), [''], nombresConvocados(m).map((c, i) => (i + 1) + '. ' + c.nombre),
      ct.length ? ['', '👥 Cuerpo técnico'].concat(ct) : []).join('\n');
  }

  function vistaConvocatoria(m) {
    const lista = nombresConvocados(m);
    const estados = { confirmado: insignia('Confirmó', 'ok'), rechazado: insignia('No puede', 'mal'), pendiente: insignia('Sin responder') };
    const autor = m.citadoPor && usuario(m.citadoPor);
    return '<div class="convocatoria">' +
      '<div class="conv-cab"><img src="' + ESCUDO + '" alt=""><div><b>' + h(tituloConvocatoria(m)) + '</b><small>Vieux Gaulois Handball</small></div></div>' +
      '<ul class="conv-lineas">' + lineasConvocatoria(m).map(([e, t]) => '<li><span>' + e + '</span>' + h(t) + '</li>').join('') + '</ul>' +
      (lista.length ? '<ol class="conv-lista">' + lista.map((c) => '<li><span>' + h(c.nombre) + '</span>' + (c.estado ? estados[c.estado] : '') + (c.rut && !hab(c.rut) ? insignia('No habilitado', 'mal') : '') + '</li>').join('') + '</ol>' : vacio('Todavía no hay jugadores citados.')) +
      (lineasCuerpoTecnico(m).length ? '<div class="conv-ct"><b>👥 Cuerpo técnico</b>' + lineasCuerpoTecnico(m).map((t) => '<span>' + h(t) + '</span>').join('') + '</div>' : '') +
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
    imprimir('<div class="pdf"><div class="pdf-cab"><img src="' + ESCUDO + '" alt=""><div><b>VIEUX GAULOIS HANDBALL</b><span>Convocatoria</span></div></div>' +
      '<h1>' + h(tituloConvocatoria(m)) + '</h1>' +
      lineasConvocatoria(m).map(([e, t]) => '<p class="pdf-linea"><span>' + e + '</span>' + h(t) + '</p>').join('') +
      '<ol class="pdf-lista">' + lista.map((c) => '<li>' + h(c.nombre) + '</li>').join('') + '</ol>' +
      (lineasCuerpoTecnico(m).length ? '<div class="pdf-ct"><b>👥 Cuerpo técnico</b>' + lineasCuerpoTecnico(m).map((t) => '<p>' + h(t) + '</p>').join('') + '</div>' : '') +
      '<p class="pdf-pie">Confirma tu asistencia en la app del club. Documento generado el ' + h(fLarga(HOY)) + '.</p></div>', 'Convocatoria ' + m.categoria + ' vs ' + m.rival + ' ' + m.fecha);
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
      (!jug ? '<button class="btn mini" data-act="citar" data-id="' + m.id + '">Citar</button>' + (m.fecha <= HOY ? '<button class="btn mini" data-act="resultado" data-id="' + m.id + '">Resultado y estadísticas</button>' : '') +
        '<button class="btn mini" data-act="editarPartido" data-id="' + m.id + '">Editar</button>' : '') + '</div>' +
      (jug && m.miEstadistica ? '<p class="nota">Tus números: ' + m.miEstadistica.g + ' goles' + (m.miEstadistica.at ? ', ' + m.miEstadistica.at + ' atajadas' : '') + (m.miEstadistica.dm ? ', ' + m.miEstadistica.dm + ' × 2 min' : '') + '</p>' : '') +
      (m.comentario ? '<p class="nota">💬 ' + h(m.comentario) + '</p>' : '') +
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
      '<div class="aviso mal" id="aviso-hab" hidden></div>' +
      '<p class="sub">Cuerpo técnico (opcional)</p><p class="ayuda">Completa sólo los que van; los vacíos no aparecen en la convocatoria.</p>' +
      '<datalist id="nombres-staff">' + S.view.usuarios.filter((u) => esPersonal(u) && u.activo !== false).map((u) => '<option value="' + h(u.nombre) + '">').join('') + '</datalist>' +
      '<div class="tarjeta"><div class="campos">' + C.CUERPO_TECNICO.map(([k, etq]) => campo(etq, input('ct_' + k, (m.cuerpoTecnico || {})[k], 'list="nombres-staff" maxlength="60" placeholder="Nombre"'))).join('') + '</div></div>' +
      pie('Guardar convocatoria') + '</form>';
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
  // Los publicados los ve todo el club; las propuestas de jugadores y entrenadores esperan a la directiva.
  const conveniosPublicados = () => S.view.convenios.filter(C.convenioPublicado);
  const propuestasConvenio = () => S.view.convenios.filter((c) => c.estado === 'propuesto');
  const ESTADO_CONVENIO = { propuesto: ['En revisión', 'oro'], rechazado: ['No aceptado', 'mal'] };

  function itemConvenio(c, extra) {
    return '<li><span class="ico-celda c-convenios">' + icono('convenios') + '</span><div class="crece"><b>' + h(c.empresa) + '</b>' +
      (c.beneficio ? '<span class="beneficio">' + h(c.beneficio) + '</span>' : '') + (c.detalle ? '<small>' + h(c.detalle) + '</small>' : '') +
      (c.contacto ? '<small>Contacto: ' + h(c.contacto) + '</small>' : '') + (extra || '') + '</div></li>';
  }

  function itemPropuesta(c) {
    if (esDir()) {
      const quien = usuario(c.propuestoPor);
      return itemConvenio(c, '<small class="suave">Propuesto por ' + h(quien ? quien.nombre : '?') + (quien && quien.rol === 'entrenador' ? ' (entrenador)' : '') + ' · ' + h(fCorta(c.creado)) + '</small>' +
        '<div class="fila" style="gap:8px;margin-top:8px;flex-wrap:wrap"><button class="btn mini primario" data-act="revisarConvenio" data-id="' + c.id + '" data-ok="1">Aprobar y publicar</button>' +
        '<button class="btn mini contorno" data-act="editarConvenio" data-id="' + c.id + '">Editar</button>' +
        '<button class="btn mini peligro" data-act="revisarConvenio" data-id="' + c.id + '">Rechazar</button></div>');
    }
    const [txt, tipo] = ESTADO_CONVENIO[c.estado] || ESTADO_CONVENIO.propuesto;
    return itemConvenio(c, '<div class="fila" style="gap:8px;margin-top:6px">' + insignia(txt, tipo) + '<small class="suave">' + h(fCorta(c.creado)) + '</small>' +
      '<button class="btn mini contorno" style="margin-left:auto" data-act="borrarConvenio" data-id="' + c.id + '">Retirar</button></div>' +
      (c.nota ? '<small>Directiva: ' + h(c.nota) + '</small>' : ''));
  }

  function vistaConvenios() {
    const pub = conveniosPublicados();
    const lista = pub.length ? '<ul class="lista">' + pub.map((c) => itemConvenio(c, esDir() ? '<div style="margin-top:6px"><button class="btn mini" data-act="editarConvenio" data-id="' + c.id + '">Editar</button></div>' : '')).join('') + '</ul>'
      : vacio('El club aún no tiene convenios publicados.');
    if (esDir()) {
      const prop = propuestasConvenio();
      return (prop.length ? seccion('Propuestas por revisar', '<ul class="lista">' + prop.map(itemPropuesta).join('') + '</ul>', '', 'Se publican sólo cuando las apruebas.') : '') +
        seccion('Convenios publicados', lista, '', 'Todo el club ve estos convenios.');
    }
    const mias = S.view.convenios.filter((c) => c.propuestoPor === yoId() && !C.convenioPublicado(c));
    return seccion('Convenios del club', lista) +
      seccion('Mis propuestas', mias.length ? '<ul class="lista">' + mias.map(itemPropuesta).join('') + '</ul>' : vacio('¿Conoces una empresa que pueda dar un beneficio al club? Propónla y la directiva la revisará.'),
        btnTexto('Proponer', 'proponerConvenio'));
  }

  function formConvenio(c, propuesta) {
    const nuevo = !c;
    c = c || {};
    return '<form id="form-modal">' + (nuevo ? '' : '<input type="hidden" name="id" value="' + c.id + '">') +
      (propuesta ? '<p class="suave">La directiva revisará tu propuesta antes de publicarla para todo el club.</p>' : '') +
      campo('Empresa / institución', input('empresa', c.empresa, 'required maxlength="80"')) +
      campo('Beneficio', input('beneficio', c.beneficio, 'placeholder="Ej: 20% de descuento" maxlength="120"')) +
      campo('Detalle / cómo usarlo', '<textarea name="detalle" maxlength="400">' + h(c.detalle || '') + '</textarea>') +
      campo('Contacto', input('contacto', c.contacto, 'placeholder="Teléfono, email o persona" maxlength="120"')) +
      pie(propuesta ? 'Enviar propuesta' : nuevo ? 'Publicar' : 'Guardar', nuevo ? '' : '<button type="button" class="btn ancho peligro" data-act="borrarConvenio" data-id="' + c.id + '">Eliminar</button>') + '</form>';
  }

  // ---------- Ajustes (directiva) ----------
  function vistaAjustes() {
    const cfg = S.view.config;
    const staff = S.view.usuarios.filter(esPersonal).sort((a, b) => a.rol.localeCompare(b.rol) || a.nombre.localeCompare(b.nombre));
    return seccion('Precios de cuotas', '<form data-form="config" class="form-interno"><div class="campos">' + cfg.categoriasBase.map((b) => campo(b + ' (M y F)', '<input name="cuota_' + h(b) + '" type="number" min="0" step="500" inputmode="numeric" value="' + (cfg.cuotas[b] || 0) + '">')).join('') + '</div>' +
      '<div class="campos">' + campo('Monto federativo anual', input('montoFederativo', cfg.montoFederativo, 'type="number" min="0" step="500" inputmode="numeric"')) +
      campo('Día de vencimiento', input('diaVencimiento', cfg.diaVencimiento, 'type="number" min="1" max="28" inputmode="numeric"')) + '</div>' +
      '<p class="etiqueta">Meses que se cobran</p><div class="chequeos">' + C.MESES.map((m, i) => '<label class="chip"><input type="checkbox" name="mesesCobro[]" value="' + i + '"' + (cfg.mesesCobro.includes(i) ? ' checked' : '') + '><span>' + m + '</span></label>').join('') + '</div>' +
      '<button class="btn primario ancho">Guardar precios</button></form>', '', 'Descuentos o becas se asignan en la ficha de cada jugador.') +
      seccion('Datos de transferencia', '<form data-form="pagos" class="form-interno">' +
        campo('Cuenta del club', '<textarea name="datosTransferencia" rows="4" placeholder="Nombre, RUT, banco, tipo y N° de cuenta, email">' + h(cfg.datosTransferencia || '') + '</textarea>') +
        '<button class="btn primario ancho">Guardar datos</button></form>', btnTexto('Links y cobros', 'tab', 'data-tab="finanzas"'), 'Los links de pago y qué medio usa cada cobro se configuran en Finanzas.') +
      seccionAutomaticos() +
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

  function seccionAutomaticos() {
    const r = S.view.config.recordatorios || {};
    const srv = S.view.servidor;
    const canal = (k, t, ok, sin) => '<label class="celda-chequeo"><input type="checkbox" name="' + k + '" value="1"' + (r[k] ? ' checked' : '') + '><span><b>' + t + '</b><br><small>' + (srv ? (ok ? 'Configurado en el servidor' : sin) : 'Funciona con la app publicada en el servidor') + '</small></span></label>';
    const log = (S.view.recordatoriosLog || []).slice(-8).reverse();
    return seccion('Recordatorios automáticos de cuotas', '<form data-form="recordatorios" class="form-interno">' +
      '<label class="celda-chequeo"><input type="checkbox" name="activo" value="1"' + (r.activo ? ' checked' : '') + '><span><b>Enviar recordatorios automáticos</b></span></label>' +
      '<div class="campos">' + campo('Días antes del vencimiento', input('diasAntes', r.diasAntes == null ? 3 : r.diasAntes, 'type="number" min="0" max="15" inputmode="numeric"')) + '</div>' +
      '<label class="celda-chequeo"><input type="checkbox" name="atraso" value="1"' + (r.atraso ? ' checked' : '') + '><span>Avisar también si la cuota sigue impaga después del vencimiento</span></label>' +
      '<p class="etiqueta">Canales</p><div class="tarjeta lista-chequeo">' + canal('push', 'Notificación en el celular', srv && srv.push, '') +
      canal('correo', 'Correo electrónico', srv && srv.correo, 'Falta configurar el correo del club (SMTP) en el servidor') +
      canal('whatsapp', 'WhatsApp', srv && srv.whatsapp, 'Falta conectar WhatsApp Business en el servidor') + '</div>' +
      '<button class="btn primario ancho" style="margin-top:12px">Guardar</button></form>' +
      (log.length ? '<p class="etiqueta">Últimos enviados</p><ul class="lista">' + log.map((x) => '<li><div class="crece"><b>' + h(x.nombre) + '</b><small>' + h(fCorta(x.fecha)) + ' · ' + (x.tipo === 'antes' ? 'por vencer' : 'atrasada') + ' · ' + h(C.MESES[x.mes]) + '</small></div><small class="suave">' + h(x.canales.join(', ') || 'sin canal') + '</small></li>').join('') + '</ul>' : ''),
    '', 'Se envían una vez por cuota, al jugador o, si es menor, a su apoderado. Si el pago ya fue informado, no se envía.');
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
  // ---------- Cobros y pagos ----------
  const nombreConcepto = (c) => (c === 'cuota' ? 'Mensualidad' : c === 'federativo' ? 'Federativo' : ((S.view.cobros || []).find((x) => x.id === c) || { nombre: 'Cobro eliminado' }).nombre);
  const informesPendientes = () => (S.view.pagosInformados || []).filter((x) => x.estado === 'pendiente').sort((a, b) => a.creado.localeCompare(b.creado));
  const informePendiente = (concepto, mes) => (S.view.pagosInformados || []).find((x) => x.rut === S.view.yo && x.estado === 'pendiente' && x.concepto === concepto && (mes == null || x.mes === mes));
  const ESTADO_INFORME = { pendiente: ['En revisión', 'alerta'], aprobado: ['Aprobado', 'ok'], rechazado: ['Rechazado', 'mal'] };

  function itemInforme(x) {
    const j = usuario(x.rut) || { nombre: '?' };
    const que = nombreConcepto(x.concepto) + (x.mes != null ? ' ' + C.MESES[x.mes] + ' ' + x.anio : x.concepto === 'federativo' ? ' ' + x.anio : '');
    const est = ESTADO_INFORME[x.estado];
    return '<li class="envolver"><span class="ico-celda c-finanzas">' + icono('finanzas') + '</span><div class="crece">' +
      '<b>' + (esStaff() ? h(j.nombre) + ' · ' : '') + h(que) + '</b><small>' + clp(x.monto) + ' · ' + h(x.medio) + ' · ' + h(fCorta(x.fecha)) + '</small>' +
      (x.detalle ? '<small>' + h(x.detalle) + '</small>' : '') + (x.nota ? '<small>Directiva: ' + h(x.nota) + '</small>' : '') +
      '<div class="fila insignias">' + insignia(est[0], est[1]) +
      (esDir() && x.estado === 'pendiente' ? '<button class="btn mini primario" data-act="revisarPago" data-id="' + x.id + '" data-ok="1">Aprobar</button><button class="btn mini peligro" data-act="revisarPago" data-id="' + x.id + '">Rechazar</button>' : '') +
      '</div></div></li>';
  }

  // Botones de pago según lo que la directiva activó para ese concepto, más "Informar pago".
  function bloquePago(concepto, txt, mes) {
    const m = C.mediosDe(S.view, concepto);
    const informado = informePendiente(concepto, mes);
    return '<div class="pago-botones">' + (m.link ? linkExterno(m.link, txt, 'primario') : '') +
      (m.transferencia ? '<button class="btn" data-act="verTransferencia">Datos de transferencia</button>' : '') +
      (informado ? '<span class="insignia alerta">Pago informado · en revisión</span>'
        : '<button class="btn' + (m.link || m.transferencia ? ' contorno' : ' primario') + '" data-act="informarPago" data-concepto="' + h(concepto) + '"' + (mes != null ? ' data-mes="' + mes + '"' : '') + '>Ya pagué: informar pago</button>') + '</div>' +
      (!m.link && !m.transferencia ? '<p class="seccion-pie">Paga directamente a la directiva y luego informa el pago aquí.</p>' : '');
  }

  function formInformarPago(concepto, mes) {
    const j = yo();
    const debe = S.view.config.mesesCobro.filter((x) => !(C.pagoMes(S.view, j.rut, ANIO, x) || {}).pagado && !informePendiente('cuota', x));
    const ops = [];
    if (debe.length) ops.push(['cuota', 'Mensualidad', S.view.resumen.cuota]);
    if (!C.federativoPagado(S.view, j.rut, ANIO) && !informePendiente('federativo')) ops.push(['federativo', 'Federativo ' + ANIO, S.view.config.montoFederativo]);
    (S.view.cobros || []).forEach((c) => { if (!C.cobroPagado(S.view, c.id, j.rut) && !informePendiente(c.id)) ops.push([c.id, c.nombre, c.monto]); });
    if (!ops.length) return '<div class="vacio">No tienes pagos pendientes por informar. ¡Estás al día!</div>';
    const sel = ops.some((o) => o[0] === concepto) ? concepto : ops[0][0];
    const monto = ops.find((o) => o[0] === sel)[2];
    const primerDebe = mes != null && debe.includes(Number(mes)) ? Number(mes) : debe[0];
    return '<form id="form-modal"><input type="hidden" name="anio" value="' + ANIO + '">' +
      campo('¿Qué pagaste?', '<select name="concepto" data-concepto-pago required>' + ops.map((o) => '<option value="' + h(o[0]) + '" data-monto="' + o[2] + '"' + (o[0] === sel ? ' selected' : '') + '>' + h(o[1]) + '</option>').join('') + '</select>') +
      campo('Mes', '<select name="mes">' + debe.map((x) => '<option value="' + x + '"' + (x === primerDebe ? ' selected' : '') + '>' + C.MESES[x] + ' ' + ANIO + '</option>').join('') + '</select>', ' id="campo-mes"' + (sel === 'cuota' ? '' : ' hidden')) +
      '<div class="campos">' + campo('Monto', input('monto', monto, 'type="number" min="1" required inputmode="numeric"')) + campo('Fecha de pago', input('fecha', HOY, 'type="date" required')) + '</div>' +
      campo('Medio', '<select name="medio">' + opciones(['Transferencia', 'Link de pago', 'Efectivo'], 'Transferencia') + '</select>') +
      campo('N° de operación o comentario', input('detalle', '', 'maxlength="200" placeholder="Ej: transferencia Banco Estado, op. 123456"')) +
      '<p class="ayuda">La directiva revisa el pago y lo marca como pagado.</p>' + pie('Informar pago') + '</form>';
  }

  // ---------- Finanzas del jugador ----------
  function vistaMisFinanzas() {
    const j = yo();
    const fed = C.federativoPagado(S.view, j.rut, ANIO);
    const cobrados = S.view.config.mesesCobro;
    const pagados = cobrados.filter((m) => estadoMes(j.rut, ANIO, m) === 'pagado').length;
    const vencidos = cobrados.filter((m) => estadoMes(j.rut, ANIO, m) === 'vencido').length;
    const informes = (S.view.pagosInformados || []).slice().sort((a, b) => b.creado.localeCompare(a.creado));
    const proxMes = cobrados.find((m) => estadoMes(j.rut, ANIO, m) === 'vencido' || estadoMes(j.rut, ANIO, m) === 'pendiente');
    const otros = S.view.cobros || [];
    return seccion('Mensualidades ' + ANIO, '<div class="fila entre" style="margin-bottom:12px"><div><b>' + clp(S.view.resumen.cuota) + '</b> <small class="suave">al mes · vence el día ' + S.view.config.diaVencimiento + '</small></div>' + (vencidos ? insignia(vencidos + ' atrasada' + (vencidos > 1 ? 's' : ''), 'mal') : insignia('Al día', 'ok')) + '</div>' +
        '<div class="meses">' + C.MESES.map((nom, m) => {
          let est = estadoMes(j.rut, ANIO, m);
          const inf = est !== 'pagado' && est !== 'no' && informePendiente('cuota', m);
          if (inf) est = 'informado';
          return '<div class="mes ' + est + '">' + nom + '<span>' + ({ pagado: '✓', vencido: 'Debe', pendiente: '–', no: '', informado: '⏳' }[est]) + '</span></div>';
        }).join('') + '</div>' + (proxMes != null ? bloquePago('cuota', 'Pagar cuota', proxMes) : ''), '', pagados + ' de ' + cobrados.length + ' cuotas pagadas. ⏳ = pago informado, en revisión.') +
      seccion('Federativo ' + ANIO, '<div class="fila entre"><div><b>' + clp(S.view.config.montoFederativo) + '</b><br><small class="suave">Necesario para jugar partidos oficiales</small></div>' + (fed ? insignia('Pagado', 'ok') : insignia('Pendiente', 'mal')) + '</div>' +
        (fed ? '' : bloquePago('federativo', 'Pagar federativo'))) +
      (otros.length ? seccion('Otros cobros', otros.map((c) => {
        const pag = C.cobroPagado(S.view, c.id, j.rut);
        return '<div class="tarjeta cobro"><div class="fila entre"><div class="crece"><b>' + h(c.nombre) + '</b><br><small class="suave">' + clp(c.monto) + (c.vence ? ' · vence el ' + h(fCorta(c.vence)) : '') + '</small></div>' +
          (pag ? insignia('Pagado', 'ok') : insignia('Pendiente', 'alerta')) + '</div>' + (pag ? '' : bloquePago(c.id, 'Pagar')) + '</div>';
      }).join('<div style="height:10px"></div>')) : '') +
      seccion('Pagos que informaste', informes.length ? '<ul class="lista">' + informes.map(itemInforme).join('') + '</ul>' : vacio('Cuando pagues por transferencia o link, infórmalo aquí para que la directiva lo registre.'), btnTexto('Informar', 'informarPago'));
  }

  function vistaPerfil() {
    const j = yo();
    const e = C.edad(j.fechaNac);
    const res = S.view.resumen;
    const a = res.asistencia;
    const fed = C.federativoPagado(S.view, j.rut, ANIO);
    const vencidos = S.view.config.mesesCobro.filter((m) => estadoMes(j.rut, ANIO, m) === 'vencido').length;
    const misPartidos = proximos(S.view.partidos);
    const misEntr = proximos(S.view.entrenamientos).slice(0, 4);
    const les = S.view.lesiones.slice().sort((x, y) => (x.estado === y.estado ? y.fecha.localeCompare(x.fecha) : x.estado === 'activa' ? -1 : 1));
    const ent = cuentaEntrenador(j.rut);
    const firmas = (S.view.documentos || []).map((d) => [d, C.firmaDe(S.view, j.rut, d)]).filter((x) => x[1]);

    const mesAct = new Date().getMonth();
    const venceDia = S.view.config.diaVencimiento;
    const porVencer = S.view.config.mesesCobro.includes(mesAct) && estadoMes(j.rut, ANIO, mesAct) === 'pendiente' && !informePendiente('cuota', mesAct) && venceDia - new Date().getDate() <= ((S.view.config.recordatorios || {}).diasAntes || 3);
    const est = S.view.misEstadisticas || {};
    const evs = S.view.evaluaciones || [];
    const mat = S.view.miMaterial || [];
    const cumples = S.view.cumpleanos || [];
    const claveIni = S.apo ? S.view.apoderado.claveInicial : j.claveInicial;
    return (ent ? '<div class="aviso info">También eres <b>' + h(ent.cargo || 'entrenador') + '</b>. Para tu perfil de entrenador sal y entra con tu usuario <b>' + h(ent.rut.replace('usr:', '')) + '</b>.</div>' : '') +
      (claveIni ? '<div class="aviso">Estás usando tu clave inicial (4 primeros dígitos del RUT). <button class="btn-texto" data-act="clave">Cámbiala aquí</button></div>' : '') +
      (S.apo ? '<div class="aviso info">Estás viendo el perfil de <b>' + h(j.nombre) + '</b> como su apoderado. Puedes confirmar citaciones, pagar, informar pagos y escribir al club por ' + h(j.nombre.split(/\s+/)[0]) + '.</div>' : '') +
      '<section class="perfil"><div class="perfil-fila">' + (j.foto ? '<button class="perfil-foto" data-act="credencial" aria-label="Ver credencial"><img src="' + h(fotoUrl(j.foto)) + '" alt=""><span>' + (j.numero != null ? h(j.numero) : '') + '</span></button>' : '<div class="numero">' + (j.numero != null ? h(j.numero) : '–') + '</div>') + '<div class="crece"><h2>' + h(j.nombre) + '</h2>' +
      '<p>' + h(etiqueta(j)) + '</p>' + (fed ? insignia('Habilitado para jugar', 'ok') : insignia('No habilitado · federativo pendiente', 'mal')) + '</div></div>' +
      '<div class="datos"><div><small>Edad</small><b>' + (e == null ? '–' : e + ' años') + '</b></div><div><small>N° camiseta</small><b>' + (j.numero != null ? h(j.numero) : '–') + '</b></div>' +
      '<div><small>Posición</small><b>' + h(j.posicion || '–') + '</b></div><div><small>RUT</small><b>' + h(C.formatearRut(j.rut)) + '</b></div></div>' +
      '<div class="fila insignias"><button class="btn mini claro" data-act="credencial">' + icono('credencial') + ' Credencial</button>' + (j.foto ? '' : '<button class="btn mini claro" data-act="fotoPerfil" data-rut="' + h(j.rut) + '">' + icono('camara') + ' Agregar foto</button>') +
      '<button class="btn mini claro" data-act="misDatos">Datos de contacto</button></div></section>' +
      (porVencer && !vencidos ? '<div class="aviso fila entre"><span>' + (S.apo ? 'La cuota de ' + h(j.nombre.split(/\s+/)[0]) + ' de ' : 'Tu cuota de ') + C.MESES_LARGOS[mesAct].toLowerCase() + ' vence el día ' + venceDia + '.</span><button class="btn mini" data-act="tab" data-tab="finanzas">Pagar</button></div>' : '') +
      (vencidos ? '<div class="aviso mal fila entre"><span>' + (S.apo ? h(j.nombre.split(/\s+/)[0]) + ' tiene ' : 'Tienes ') + vencidos + ' cuota' + (vencidos > 1 ? 's' : '') + ' atrasada' + (vencidos > 1 ? 's' : '') + '.</span><button class="btn mini" data-act="tab" data-tab="finanzas">Ver finanzas</button></div>' : '') +

      seccion('Próximos partidos', misPartidos.length ? '<ul class="lista">' + misPartidos.map((m) => '<li>' + tarjetaPartido(m) + '</li>').join('') + '</ul>' : vacio('No hay partidos próximos para tu categoría.')) +
      seccion('Próximos entrenamientos', misEntr.length ? '<ul class="lista">' + misEntr.map(itemEntrenamiento).join('') + '</ul>' : vacio('Sin entrenamientos programados.'), btnTexto('Calendario', 'tab', 'data-tab="calendario"')) +
      (est.pj ? seccion('Mis estadísticas ' + ANIO, '<div class="mini-kpis"><div><b>' + est.pj + '</b><small>partidos</small></div><div><b>' + est.g + '</b><small>goles</small></div>' + (est.at ? '<div><b>' + est.at + '</b><small>atajadas</small></div>' : '') +
        '<div><b>' + est.dm + '</b><small>× 2 min</small></div><div><b>' + (est.am + est.ro + est.az) + '</b><small>tarjetas</small></div></div>', btnTexto('Goleadores', 'tab', 'data-tab="estadisticas"')) : '') +
      (evs.length ? seccion('Evaluación física', bloqueEvaluaciones(evs), '', 'La registra tu entrenador. Toca un punto para ver la fecha y el valor.') : '') +
      seccion('Ficha médica', vistaFichaMedica(j), btnTexto('Editar', 'fichaMedica', 'data-rut="' + h(j.rut) + '"'), (S.apo ? 'La ven sólo sus entrenadores y tú.' : 'La ven sólo tus entrenadores.')) +
      (mat.length ? seccion('Material del club a tu cargo', '<ul class="lista">' + mat.map((x) => '<li><span class="ico-celda c-inventario">' + icono('inventario') + '</span><div class="crece"><b>' + x.cantidad + ' × ' + h(x.nombre) + '</b><small>Desde ' + h(fCorta(x.fecha)) + (x.nota ? ' · ' + h(x.nota) : '') + '</small></div></li>').join('') + '</ul>') : '') +
      (cumples.length ? seccion('🎂 Cumpleaños de ' + C.MESES_LARGOS[mesAct].toLowerCase() + ' en tu categoría', listaCumples(cumples)) : '') +
      seccion('Lesiones y dolores', les.length ? '<ul class="lista">' + les.map(itemLesion).join('') + '</ul>' : vacio('No tienes lesiones ni dolores reportados.'), btnTexto('Reportar', 'lesionPara'), 'Lo que reportes lo ven tu entrenador y la directiva.') +
      seccion('Asistencia a entrenamientos', '<div class="fila" style="gap:16px"><div class="anillo" style="--p:' + a.porcentaje + '"><b>' + a.porcentaje + '%</b></div><div class="crece">Asististe a <b>' + a.asistidos + '</b> de <b>' + a.realizados + '</b> entrenamientos realizados' + (a.justificados ? '<br><small class="suave">' + a.justificados + ' ausencias justificadas</small>' : '') + '</div></div>') +
      (firmas.length ? seccion('Documentos firmados', '<ul class="lista">' + firmas.map(([d, f]) => '<li><span class="ico-celda c-documentos">' + icono('documentos') + '</span><div class="crece"><b>' + h(d.titulo) + '</b><small>Firmado el ' + h(fCorta(f.fecha)) + '</small></div></li>').join('') + '</ul>') : '');
  }

  // ---------- Chat ----------
  function hilosVisibles() {
    const yoU = yo();
    const hilos = {};
    (S.view.mensajes || []).forEach((m) => { (hilos[m.hilo] = hilos[m.hilo] || []).push(m); });
    // Conversaciones que siempre aparecen aunque estén vacías.
    if (yoU.rol === 'jugador') { hilos['dir:' + yoU.rut] = hilos['dir:' + yoU.rut] || []; hilos['ent:' + yoU.rut] = hilos['ent:' + yoU.rut] || []; }
    if (yoU.rol === 'entrenador') hilos['dir:' + yoU.rut] = hilos['dir:' + yoU.rut] || [];
    if (S.hilo && !hilos[S.hilo]) hilos[S.hilo] = [];
    return Object.keys(hilos).map((k) => ({ hilo: k, msjs: hilos[k].sort((a, b) => a.fecha.localeCompare(b.fecha)) }))
      .sort((a, b) => (b.msjs.length ? b.msjs[b.msjs.length - 1].fecha : '').localeCompare(a.msjs.length ? a.msjs[a.msjs.length - 1].fecha : ''));
  }
  const noLeidos = (msjs) => msjs.filter((m) => !m.leidoPor.includes(yoId())).length;
  const chatSinLeer = () => (S.view.mensajes || []).filter((m) => !m.leidoPor.includes(yoId())).length;

  function tituloHilo(hilo) {
    const [tipo, id] = [hilo.slice(0, 3), hilo.slice(4)];
    const otro = usuario(id);
    if (tipo === 'dir') return esDir() ? (otro ? otro.nombre : '?') : 'Directiva';
    return rol() === 'jugador' ? 'Entrenadores' : (otro ? otro.nombre : '?');
  }
  function subtituloHilo(hilo) {
    const [tipo, id] = [hilo.slice(0, 3), hilo.slice(4)];
    const otro = usuario(id);
    if (rol() === 'jugador') return tipo === 'dir' ? 'Cuotas, pagos, documentos y temas del club' : 'Tus entrenadores';
    if (tipo === 'dir' && !esDir()) return 'Conversación con la directiva';
    return otro ? (otro.rol === 'jugador' ? etiqueta(otro) : (otro.cargo || 'Entrenador')) : '';
  }
  const horaMsj = (iso) => {
    const d = new Date(iso);
    const hm = d.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
    return C.hoyISO(d) === HOY ? hm : d.toLocaleDateString('es-CL', { day: 'numeric', month: 'short' }) + ' ' + hm;
  };

  function vistaChat() {
    if (S.hilo) {
      const msjs = (S.view.mensajes || []).filter((m) => m.hilo === S.hilo).sort((a, b) => a.fecha.localeCompare(b.fecha));
      if (noLeidos(msjs)) setTimeout(() => { if (S.hilo) llamar('chat.leer', { hilo: S.hilo }).then((v) => { recibir(v); render(); }).catch(() => {}); }, 300);
      let ultimoDia = '';
      const burbujas = msjs.map((m) => {
        const mio = m.de === yoId();
        const autor = usuario(m.de);
        const dia = m.fecha.slice(0, 10);
        const fechaDia = new Date(m.fecha).toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' });
        const sep = dia !== ultimoDia ? '<div class="chat-dia">' + h(fechaDia.charAt(0).toUpperCase() + fechaDia.slice(1)) + '</div>' : '';
        ultimoDia = dia;
        return sep + '<div class="burbuja' + (mio ? ' mia' : '') + '">' + (!mio ? '<b>' + h(autor ? autor.nombre : '?') + (autor && autor.rol === 'apoderado' ? ' · apoderado' : autor && autor.rol !== 'jugador' ? ' · ' + h(autor.cargo || autor.rol) : '') + '</b>' : '') +
          '<p>' + h(m.texto).replace(/\n/g, '<br>') + '</p><small>' + h(horaMsj(m.fecha)) + '</small></div>';
      }).join('');
      return '<p class="intro">' + h(subtituloHilo(S.hilo)) + '</p>' +
        '<div class="chat" id="chat-msjs">' + (burbujas || vacio('Escribe el primer mensaje.')) + '</div>' +
        '<form id="form-chat" class="chat-caja"><textarea id="chat-texto" name="texto" rows="1" maxlength="1000" placeholder="Escribe un mensaje" required>' + h(S.borrador[S.hilo] || '') + '</textarea>' +
        '<button class="btn-enviar" aria-label="Enviar">' + icono('enviar') + '</button></form>';
    }
    const hilos = hilosVisibles();
    const intro = rol() === 'jugador' ? 'Escríbele directo a la directiva o a tus entrenadores.' : esDir() ? 'Conversaciones de jugadores y entrenadores con la directiva.' : 'Conversaciones con tus jugadores y con la directiva.';
    return '<p class="intro">' + intro + '</p>' + seccion('', hilos.length ? '<ul class="lista clic">' + hilos.map(({ hilo, msjs }) => {
      const ult = msjs[msjs.length - 1];
      const n = noLeidos(msjs);
      const tit = tituloHilo(hilo);
      const ini = hilo.startsWith('dir:') && !esDir() ? 'VG' : tit.split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase();
      return '<li data-act="abrirHilo" data-hilo="' + h(hilo) + '"><span class="avatar-chat' + (hilo.startsWith('dir:') ? ' dir' : '') + '">' + h(ini) + '</span><div class="crece"><b>' + h(tit) + '</b>' +
        '<small>' + (ult ? (ult.de === yoId() ? 'Tú: ' : '') + h(ult.texto.slice(0, 80)) : h(subtituloHilo(hilo))) + '</small></div>' +
        '<div class="chat-meta">' + (ult ? '<small>' + h(horaMsj(ult.fecha)) + '</small>' : '') + (n ? '<i class="punto">' + n + '</i>' : '') + '</div></li>';
    }).join('') + '</ul>' : vacio('Aún no hay conversaciones.'));
  }

  function formNuevoChat() {
    const js = jugadores();
    const ops = esDir()
      ? '<optgroup label="Entrenadores">' + S.view.usuarios.filter((u) => u.rol === 'entrenador' && u.activo !== false).map((u) => '<option value="dir:' + h(u.rut) + '">' + h(u.nombre) + '</option>').join('') + '</optgroup>' +
        '<optgroup label="Jugadores">' + js.map((j) => '<option value="dir:' + h(j.rut) + '">' + h(j.nombre) + ' · ' + h(j.categoria) + '</option>').join('') + '</optgroup>'
      : '<option value="dir:' + h(S.view.yo) + '">Directiva</option><optgroup label="Jugadores">' + js.map((j) => '<option value="ent:' + h(j.rut) + '">' + h(j.nombre) + ' · ' + h(j.categoria) + '</option>').join('') + '</optgroup>';
    return '<form id="form-modal">' + campo('¿Con quién?', '<select name="hilo" required>' + ops + '</select>') + pie('Abrir conversación') + '</form>';
  }

  function formMisDatos(j, propio) {
    return '<form id="form-modal"><input type="hidden" name="rut" value="' + j.rut + '">' +
      campo('Teléfono', input('telefono', j.telefono, 'type="tel"')) + campo('Email', input('email', j.email, 'type="email"')) +
      '<p class="ayuda">' + (propio ? 'Los usamos para avisarte de cuotas y citaciones.' : 'Nombre, categoría y número de camiseta los actualiza el entrenador o la directiva. El contacto de emergencia va en la ficha médica.') + '</p>' + pie() + '</form>';
  }

  // ---------- Pizarra táctica y jugadas ----------
  // La cancha mide 40 x 20 m; atacamos hacia el arco de la derecha (x = 40).
  const VISTA_CANCHA = { completa: '-1.4 -1.2 42.8 22.4', media: '18.6 -1.2 22.8 22.4' };
  const HERRAMIENTAS = [['mover', 'Mover', 'mover'], ['mov', 'Desplazamiento', 'movimiento'], ['pase', 'Pase', 'pase'], ['lanz', 'Lanzamiento', 'lanzamiento'], ['libre', 'Lápiz', 'lapiz'], ['goma', 'Borrar', 'goma']];
  const pizNueva = () => ({ pasos: [{ fichas: C.formacionInicial(), trazos: [] }], i: 0, herr: 'mover', cancha: 'media', jugadaId: null, nombre: '', descripcion: '', categorias: [], historial: [], soloVer: false, cambios: false });

  function svgCancha(cancha) {
    const area = (r) => 'M40 ' + (8.5 - r) + ' A' + r + ' ' + r + ' 0 0 0 ' + (40 - r) + ' 8.5 L' + (40 - r) + ' 11.5 A' + r + ' ' + r + ' 0 0 0 40 ' + (11.5 + r);
    const areaIzq = (r) => 'M0 ' + (8.5 - r) + ' A' + r + ' ' + r + ' 0 0 1 ' + r + ' 8.5 L' + r + ' 11.5 A' + r + ' ' + r + ' 0 0 1 0 ' + (11.5 + r);
    const flecha = (id, color) => '<marker id="' + id + '" viewBox="0 0 10 10" refX="7" refY="5" markerUnits="userSpaceOnUse" markerWidth="1.3" markerHeight="1.3" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="' + color + '"/></marker>';
    return '<svg class="cancha" id="cancha" viewBox="' + VISTA_CANCHA[cancha] + '" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Pizarra táctica">' +
      '<defs><clipPath id="clip-cancha"><rect x="0" y="0" width="40" height="20"/></clipPath>' + flecha('fl-mov', '#FFD34D') + flecha('fl-pase', '#FFFFFF') + flecha('fl-lanz', '#FF5A4E') + '</defs>' +
      '<rect class="c-fuera" x="-2" y="-2" width="44" height="24"/><rect class="c-piso" x="0" y="0" width="40" height="20"/>' +
      '<image href="' + ESCUDO + '" x="17.2" y="7" width="5.6" height="6" opacity=".14"/>' +
      '<g clip-path="url(#clip-cancha)"><path class="c-area" d="' + area(6) + 'Z"/><path class="c-area" d="' + areaIzq(6) + 'Z"/>' +
      '<path class="c-9m" d="' + area(9) + '"/><path class="c-9m" d="' + areaIzq(9) + '"/></g>' +
      '<g class="c-lineas"><rect x="0" y="0" width="40" height="20"/><path d="M20 0V20M33 9.5V10.5M7 9.5V10.5M36 9.85V10.15M4 9.85V10.15"/><path d="' + area(6) + '"/><path d="' + areaIzq(6) + '"/>' +
      '<circle cx="20" cy="10" r=".25" fill="#fff"/></g><g class="c-arcos"><rect x="40" y="8.5" width="1" height="3"/><rect x="-1" y="8.5" width="1" height="3"/></g>' +
      '<g class="trazos"></g><g class="temp"></g><g class="fichas"></g></svg>';
  }

  function svgTrazo(t, i) {
    const d = 'M' + t.p.map((q) => q[0] + ' ' + q[1]).join(' L');
    const fin = t.t === 'libre' ? '' : ' marker-end="url(#fl-' + t.t + ')"';
    return '<g data-trazo="' + i + '"><path class="hit" d="' + d + '"/><path class="t-' + t.t + '" d="' + d + '"' + fin + '/></g>';
  }
  function svgFicha(f) {
    return '<g class="ficha f-' + f.t + '" data-id="' + h(f.id) + '" transform="translate(' + f.x + ' ' + f.y + ')"><circle r="' + (f.t === 'b' ? 0.45 : 0.85) + '"/>' +
      (f.n ? '<text>' + h(f.n) + '</text>' : '') + '</g>';
  }

  // Calcula el paso siguiente: quien tiene un desplazamiento llega a su destino y el balón sigue al pase o lanzamiento.
  function siguientePaso(paso) {
    const fichas = paso.fichas.map((f) => Object.assign({}, f));
    const balon = fichas.find((f) => f.t === 'b');
    const cerca = (p) => {
      let mejor = null, dist = 1.6;
      fichas.forEach((f) => { const d = Math.hypot(f.x - p[0], f.y - p[1]); if (f.t !== 'b' && d < dist) { dist = d; mejor = f; } });
      return mejor;
    };
    let hayPase = false;
    const movidos = [];
    paso.trazos.forEach((t) => {
      const ini = t.p[0], fin = t.p[t.p.length - 1];
      if (t.t === 'mov') { const f = cerca(ini); if (f) { movidos.push([f.x, f.y, fin[0] - f.x, fin[1] - f.y]); f.x = fin[0]; f.y = fin[1]; } }
      if ((t.t === 'pase' || t.t === 'lanz') && balon) { hayPase = true; balon.x = fin[0]; balon.y = fin[1]; }
    });
    // Sin pase, el balón acompaña al jugador que lo lleva.
    if (balon && !hayPase) {
      const m = movidos.find(([x, y]) => Math.hypot(balon.x - x, balon.y - y) < 1.4);
      if (m) { balon.x = Math.round((balon.x + m[2]) * 100) / 100; balon.y = Math.round((balon.y + m[3]) * 100) / 100; }
    }
    return { fichas, trazos: [] };
  }

  const Pizarra = {
    svg: null, arrastre: null, trazo: null,
    paso() { return S.piz.pasos[S.piz.i]; },
    montar() {
      const svg = $('#cancha');
      if (!svg || !S.piz) return;
      this.svg = svg;
      this.dibujar(this.paso());
      if (S.piz.soloVer || S.piz.reproduciendo) return;
      svg.addEventListener('pointerdown', (e) => this.bajar(e));
      svg.addEventListener('pointermove', (e) => this.mover(e));
      svg.addEventListener('pointerup', (e) => this.subir(e));
      svg.addEventListener('pointercancel', (e) => this.subir(e));
      svg.addEventListener('dblclick', (e) => this.renombrar(e));
    },
    dibujar(paso) {
      if (!this.svg) return;
      this.svg.querySelector('.trazos').innerHTML = paso.trazos.map(svgTrazo).join('');
      this.svg.querySelector('.fichas').innerHTML = paso.fichas.slice().sort((a, b) => (a.t === 'b') - (b.t === 'b')).map(svgFicha).join('');
    },
    punto(e) {
      const pt = this.svg.createSVGPoint();
      pt.x = e.clientX; pt.y = e.clientY;
      const q = pt.matrixTransform(this.svg.getScreenCTM().inverse());
      return [Math.round(Math.min(41, Math.max(-1, q.x)) * 100) / 100, Math.round(Math.min(20.8, Math.max(-0.8, q.y)) * 100) / 100];
    },
    historial() {
      S.piz.historial.push(JSON.stringify({ pasos: S.piz.pasos, i: S.piz.i }));
      if (S.piz.historial.length > 40) S.piz.historial.shift();
      S.piz.cambios = true;
    },
    bajar(e) {
      const p = this.punto(e), herr = S.piz.herr, paso = this.paso();
      const fichaEl = e.target.closest('.ficha');
      if (herr === 'goma') {
        const tr = e.target.closest('[data-trazo]');
        if (tr) { this.historial(); paso.trazos.splice(Number(tr.dataset.trazo), 1); this.dibujar(paso); }
        else if (fichaEl) { this.historial(); paso.fichas = paso.fichas.filter((f) => f.id !== fichaEl.dataset.id); this.dibujar(paso); }
        return;
      }
      if (herr === 'mover') {
        if (!fichaEl) return;
        const f = paso.fichas.find((x) => x.id === fichaEl.dataset.id);
        this.historial();
        this.arrastre = { f, el: fichaEl, dx: f.x - p[0], dy: f.y - p[1] };
      } else {
        // Las flechas parten desde el centro de la ficha tocada.
        const f = fichaEl && paso.fichas.find((x) => x.id === fichaEl.dataset.id);
        this.trazo = { t: herr, p: [f ? [f.x, f.y] : p] };
      }
      this.svg.setPointerCapture(e.pointerId);
      e.preventDefault();
    },
    mover(e) {
      if (!this.arrastre && !this.trazo) return;
      const p = this.punto(e);
      if (this.arrastre) {
        const a = this.arrastre;
        a.f.x = Math.round((p[0] + a.dx) * 100) / 100; a.f.y = Math.round((p[1] + a.dy) * 100) / 100;
        a.el.setAttribute('transform', 'translate(' + a.f.x + ' ' + a.f.y + ')');
        return;
      }
      const t = this.trazo;
      if (t.t === 'libre') { const u = t.p[t.p.length - 1]; if (Math.hypot(u[0] - p[0], u[1] - p[1]) > 0.3) t.p.push(p); } else t.p[1] = p;
      this.svg.querySelector('.temp').innerHTML = t.p.length > 1 ? svgTrazo(t, -1) : '';
    },
    subir() {
      if (this.arrastre) { this.arrastre = null; this.dibujar(this.paso()); }
      if (this.trazo) {
        const t = this.trazo;
        this.trazo = null;
        this.svg.querySelector('.temp').innerHTML = '';
        const largo = t.p.length > 1 ? Math.hypot(t.p[t.p.length - 1][0] - t.p[0][0], t.p[t.p.length - 1][1] - t.p[0][1]) : 0;
        if (largo > 0.6 || (t.t === 'libre' && t.p.length > 3)) { this.historial(); this.paso().trazos.push(t); this.dibujar(this.paso()); }
      }
    },
    renombrar(e) {
      const el = e.target.closest('.ficha');
      if (!el || S.piz.herr !== 'mover') return;
      const f = this.paso().fichas.find((x) => x.id === el.dataset.id);
      if (f.t === 'b') return;
      const n = prompt('Número o sigla (hasta 3 caracteres):', f.n);
      if (n == null) return;
      this.historial();
      // El nombre se cambia en todos los pasos para que la ficha sea la misma.
      S.piz.pasos.forEach((ps) => ps.fichas.forEach((x) => { if (x.id === f.id) x.n = n.trim().slice(0, 3); }));
      this.dibujar(this.paso());
    },
    // Animación entre pasos: las fichas se deslizan y se ven las flechas del paso que se está ejecutando.
    animar() {
      const P = S.piz, dur = 1100, pausa = 450;
      let k = 0, t0 = null;
      const suave = (u) => (u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2);
      const tick = (ts) => {
        if (S.piz !== P || !P.reproduciendo || !this.svg || !document.body.contains(this.svg)) return;
        if (t0 == null) t0 = ts;
        const a = P.pasos[k], b = P.pasos[k + 1];
        const u = suave(Math.min(1, (ts - t0) / dur));
        const fichas = b.fichas.map((fb) => { const fa = a.fichas.find((x) => x.id === fb.id) || fb; return Object.assign({}, fb, { x: fa.x + (fb.x - fa.x) * u, y: fa.y + (fb.y - fa.y) * u }); });
        this.dibujar({ fichas, trazos: a.trazos });
        if (ts - t0 >= dur + pausa) {
          k++; t0 = ts;
          if (k >= P.pasos.length - 1) { P.reproduciendo = false; P.i = P.pasos.length - 1; render(); return; }
        }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    },
  };

  function barraPasos(P) {
    return '<div class="piz-pasos">' + P.pasos.map((_, i) => '<button class="paso-chip' + (i === P.i ? ' activo' : '') + '" data-act="pizPaso" data-i="' + i + '"' + (P.reproduciendo ? ' disabled' : '') + '>' + (i + 1) + '</button>').join('') +
      (P.soloVer ? '' : '<button class="paso-chip mas" data-act="pizNuevoPaso" title="Nuevo paso"' + (P.reproduciendo ? ' disabled' : '') + '>+ Paso</button>') +
      '<span class="crece"></span>' +
      (P.pasos.length > 1 ? (P.reproduciendo ? '<button class="btn mini primario" data-act="pizDetener">■ Detener</button>' : '<button class="btn mini primario" data-act="pizReproducir">' + icono('play') + ' Reproducir</button>') : '') + '</div>';
  }

  function vistaPizarra() {
    if (!S.piz || S.piz.soloVer) S.piz = pizNueva();
    const P = S.piz;
    const jugadas = (S.view.jugadas || []).slice().sort((a, b) => b.fecha.localeCompare(a.fecha));
    const herr = HERRAMIENTAS.map(([id, nom, ico]) => '<button class="herr' + (P.herr === id ? ' activa' : '') + '" data-act="pizHerr" data-h="' + id + '" title="' + nom + '" aria-label="' + nom + '"' + (P.reproduciendo ? ' disabled' : '') + '>' + icono(ico) + '<span>' + nom + '</span></button>').join('');
    return '<div class="piz-cab"><div class="crece"><b>' + h(P.nombre || 'Jugada sin guardar') + '</b><small>' + (P.jugadaId ? 'Guardada' + (P.cambios ? ' · con cambios sin guardar' : '') : 'Pizarra libre: dibuja y guarda como jugada') + '</small></div>' +
      '<button class="btn mini" data-act="pizNueva">Nueva</button><button class="btn mini primario" data-act="pizGuardar">' + icono('guardar') + ' Guardar</button></div>' +
      '<div class="filtros">' + segmentado('cancha', P.cancha, [['media', 'Media cancha'], ['completa', 'Cancha completa']]) + '</div>' +
      '<div class="piz-herr">' + herr + '</div>' +
      '<div class="cancha-caja">' + svgCancha(P.cancha) + '</div>' +
      barraPasos(P) +
      '<div class="piz-acciones"><button class="btn mini" data-act="pizAgregar" data-t="a"><i class="punto-f f-a"></i> Atacante</button><button class="btn mini" data-act="pizAgregar" data-t="d"><i class="punto-f f-d"></i> Defensor</button>' +
      '<button class="btn mini" data-act="pizAgregar" data-t="b"><i class="punto-f f-b"></i> Balón</button><span class="crece"></span>' +
      '<button class="btn mini" data-act="pizDeshacer"' + (P.historial.length ? '' : ' disabled') + '>' + icono('deshacer') + ' Deshacer</button><button class="btn mini" data-act="pizLimpiar">Borrar flechas</button>' +
      (P.pasos.length > 1 ? '<button class="btn mini peligro" data-act="pizBorrarPaso">Quitar paso</button>' : '') + '</div>' +
      '<p class="seccion-pie piz-ayuda"><b>Mover</b> arrastra las fichas (doble toque para cambiar el número). <b>Desplazamiento</b>, <b>pase</b> y <b>lanzamiento</b> dibujan flechas desde una ficha. Con <b>+ Paso</b> los jugadores avanzan a donde apuntan sus flechas y el balón sigue al pase: así se arma la jugada paso a paso.</p>' +
      seccion('Jugadas del club', jugadas.length ? '<ul class="lista clic">' + jugadas.map((j) => {
        const autor = usuario(j.autor);
        return '<li data-act="abrirJugada" data-id="' + j.id + '"><span class="ico-celda c-partidos">' + icono('jugadas') + '</span><div class="crece"><b>' + h(j.nombre) + '</b>' +
          '<small>' + j.pasos.length + ' pasos · ' + (j.categorias.length ? 'compartida con ' + h(cortoCats(j.categorias)) : 'sólo cuerpo técnico') + (autor ? ' · ' + h(autor.nombre) : '') + '</small></div>' +
          ((esDir() || j.autor === S.view.yo) ? '<button class="btn-icono" data-act="borrarJugada" data-id="' + j.id + '" aria-label="Eliminar">' + icono('basura') + '</button>' : '') + '</li>';
      }).join('') + '</ul>' : vacio('Aún no hay jugadas guardadas.'), '', 'Las jugadas compartidas con una categoría las ven esos jugadores en su app.');
  }

  function vistaJugadas() {
    if (S.piz && S.piz.soloVer) {
      const P = S.piz;
      return '<div class="piz-cab"><button class="btn-icono atras" data-act="cerrarJugada" aria-label="Volver">' + icono('atras') + '</button><div class="crece"><b>' + h(P.nombre) + '</b><small>Paso ' + (P.i + 1) + ' de ' + P.pasos.length + '</small></div></div>' +
        (P.descripcion ? '<p class="intro">' + h(P.descripcion) + '</p>' : '') +
        '<div class="cancha-caja">' + svgCancha(P.cancha) + '</div>' + barraPasos(P) +
        '<p class="seccion-pie piz-ayuda"><span class="ley mov"></span> desplazamiento · <span class="ley pase"></span> pase · <span class="ley lanz"></span> lanzamiento</p>';
    }
    const js = S.view.jugadas || [];
    return '<p class="intro">Jugadas que tu cuerpo técnico compartió con tu categoría.</p>' + seccion('', js.length ? '<ul class="lista clic">' + js.map((j) => '<li data-act="abrirJugada" data-id="' + j.id + '"><span class="ico-celda c-partidos">' + icono('jugadas') + '</span><div class="crece"><b>' + h(j.nombre) + '</b><small>' + j.pasos.length + ' pasos' + (j.descripcion ? ' · ' + h(j.descripcion.slice(0, 70)) : '') + '</small></div><span class="chevron">' + icono('flecha') + '</span></li>').join('') + '</ul>' : vacio('Todavía no hay jugadas compartidas.'));
  }

  function formJugada() {
    const P = S.piz;
    return '<form id="form-modal">' + campo('Nombre de la jugada', input('nombre', P.nombre, 'required maxlength="80" placeholder="Ej: Cruce central - lateral"')) +
      campo('Descripción (opcional)', '<textarea name="descripcion" maxlength="500" placeholder="Qué busca la jugada, señal para iniciarla...">' + h(P.descripcion) + '</textarea>') +
      '<p class="etiqueta">Compartir con los jugadores de (opcional)</p>' + chequeosCategorias('categorias', P.categorias) +
      '<p class="ayuda">Sin categorías, la jugada la ve sólo el cuerpo técnico.</p>' + pie(P.jugadaId ? 'Guardar cambios' : 'Guardar jugada') + '</form>';
  }

  function cargarJugada(j, soloVer) {
    S.piz = { pasos: C.clone(j.pasos), i: 0, herr: 'mover', cancha: j.cancha || 'media', jugadaId: j.id, nombre: j.nombre, descripcion: j.descripcion || '', categorias: (j.categorias || []).slice(), historial: [], soloVer, cambios: false };
  }

  // ---------- Fotos ----------
  // Se comprimen en el navegador antes de subirlas (el servidor guarda máximo 3 por álbum).
  async function comprimir(archivo, maxLado, maxKB, cuadrado) {
    const url = URL.createObjectURL(archivo);
    try {
      const img = await new Promise((ok, mal) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => mal(new Error('No se pudo leer la imagen')); i.src = url; });
      let sx = 0, sy = 0, sw = img.naturalWidth, sh = img.naturalHeight;
      if (cuadrado) { const m = Math.min(sw, sh); sx = (sw - m) / 2; sy = (sh - m) / 2; sw = sh = m; }
      const esc = Math.min(1, maxLado / Math.max(sw, sh));
      const c = document.createElement('canvas');
      c.width = Math.round(sw * esc); c.height = Math.round(sh * esc);
      c.getContext('2d').drawImage(img, sx, sy, sw, sh, 0, 0, c.width, c.height);
      for (let q = 0.85; q >= 0.35; q -= 0.1) {
        const d = c.toDataURL('image/jpeg', q);
        if ((d.length - 23) * 0.75 <= maxKB * 1024) return d;
      }
      throw new Error('La foto es demasiado pesada');
    } finally { URL.revokeObjectURL(url); }
  }

  function elegirArchivos(multiple) {
    return new Promise((ok) => {
      const i = document.createElement('input');
      i.type = 'file'; i.accept = 'image/*'; i.multiple = !!multiple;
      i.addEventListener('change', () => ok(Array.from(i.files || [])));
      i.click();
    });
  }

  const iniciales = (n) => String(n || '?').split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase();
  const avatarFoto = (u, clase) => (u.foto ? '<img class="' + (clase || 'foto-mini') + '" src="' + h(fotoUrl(u.foto)) + '" alt="">' : '<span class="' + (clase || 'foto-mini') + ' sin-foto">' + h(iniciales(u.nombre)) + '</span>');

  // ---------- Credencial digital ----------
  function vistaCredencial(j) {
    const vencidas = S.view.config.mesesCobro.filter((m) => estadoMes(j.rut, ANIO, m) === 'vencido').length;
    return '<div class="credencial">' +
      '<div class="cred-cab"><img src="' + ESCUDO + '" alt=""><div class="crece"><b>VIEUX GAULOIS</b><small>Handball Club</small></div><span>Temporada ' + ANIO + '</span></div><div class="franja" aria-hidden="true"><i></i><i></i><i></i></div>' +
      '<div class="cred-cuerpo">' + avatarFoto(j, 'cred-foto') + '<div class="crece"><h3>' + h(j.nombre) + '</h3>' +
      '<p><small>RUT</small><b>' + h(C.formatearRut(j.rut)) + '</b></p><p><small>Categoría</small><b>' + h(etiqueta(j)) + '</b></p>' +
      (j.numero != null ? '<p><small>N° camiseta</small><b>' + h(j.numero) + '</b></p>' : '') + '</div></div>' +
      '<div class="cred-pie">' + insignia('Jugador activo', 'ok') + (vencidas ? insignia(vencidas + ' cuota' + (vencidas > 1 ? 's' : '') + ' pendiente' + (vencidas > 1 ? 's' : ''), 'mal') : insignia('Cuotas al día', 'ok')) +
      '<span class="reloj" data-reloj>' + h(relojTexto()) + '</span></div></div>' +
      '<p class="ayuda">Muéstrala en los convenios del club. La fecha y hora corren en vivo: así se nota que no es una captura de pantalla.</p>' +
      '<div class="modal-pie columna"><button class="btn ancho" data-act="fotoPerfil" data-rut="' + h(j.rut) + '">' + icono('camara') + (j.foto ? ' Cambiar foto' : ' Agregar foto') + '</button></div>';
  }
  const relojTexto = () => new Date().toLocaleString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  setInterval(() => { document.querySelectorAll('[data-reloj]').forEach((e) => { e.textContent = relojTexto(); }); }, 1000);

  // ---------- Ficha médica (cuerpo técnico, el jugador y su apoderado) ----------
  const CAMPOS_MEDICA = [['sangre', 'Grupo sanguíneo'], ['alergias', 'Alergias'], ['condiciones', 'Enfermedades o condiciones'], ['medicamentos', 'Medicamentos'],
    ['prevision', 'Previsión de salud'], ['seguro', 'Seguro'], ['emergencia', 'Contacto de emergencia'], ['obs', 'Observaciones']];

  function vistaFichaMedica(j) {
    const m = j.medica || {};
    const llenos = CAMPOS_MEDICA.filter(([k]) => m[k]);
    return (llenos.length ? '<ul class="lista">' + llenos.map(([k, t]) => '<li><div class="crece"><small>' + h(t) + '</small><b>' + h(m[k]) + '</b></div></li>').join('') + '</ul>'
      : vacio('Sin datos médicos registrados.')) + (m.actualizada ? '<p class="seccion-pie">Actualizada el ' + h(fCorta(m.actualizada)) + '.</p>' : '');
  }

  function formFichaMedica(j) {
    const m = j.medica || {};
    return '<form id="form-modal"><input type="hidden" name="rut" value="' + h(j.rut) + '"><p class="ayuda">La ven sólo los entrenadores' + (S.apo ? ', tú y ' + h(j.nombre.split(/\s+/)[0]) : ' y tú') + '. Sirve para actuar rápido ante una emergencia.</p>' +
      '<div class="campos">' + campo('Grupo sanguíneo', '<select name="sangre"><option value="">No sé</option>' + opciones(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'], m.sangre) + '</select>') +
      campo('Previsión de salud', input('prevision', m.prevision, 'placeholder="Fonasa, Isapre..." maxlength="60"')) + '</div>' +
      campo('Alergias', input('alergias', m.alergias, 'placeholder="Medicamentos, alimentos... o Ninguna" maxlength="200"')) +
      campo('Enfermedades o condiciones', input('condiciones', m.condiciones, 'placeholder="Asma, diabetes, epilepsia..." maxlength="200"')) +
      campo('Medicamentos que toma', input('medicamentos', m.medicamentos, 'maxlength="200"')) +
      campo('Seguro', input('seguro', m.seguro, 'placeholder="Seguro escolar, deportivo, clínica..." maxlength="100"')) +
      campo('Contacto de emergencia', input('emergencia', m.emergencia, 'placeholder="Nombre, parentesco y teléfono" maxlength="120"')) +
      campo('Observaciones', '<textarea name="obs" maxlength="300">' + h(m.obs || '') + '</textarea>') + pie('Guardar ficha médica') + '</form>';
  }

  // ---------- Estadísticas ----------
  const CORTO_EST = { g: 'Goles', at: 'Ataj.', dm: '2 min', am: 'Amarilla', ro: 'Roja', az: 'Azul' };

  function tablaEstadisticas(filas, conPromedio) {
    if (!filas.length) return vacio('Aún no hay estadísticas registradas.');
    return '<div class="tabla-envoltura"><table class="tabla est"><thead><tr><th class="c">#</th><th>Jugador</th><th class="num">PJ</th><th class="num">Goles</th>' + (conPromedio ? '<th class="num">Prom.</th>' : '') +
      '<th class="num">Ataj.</th><th class="num">2 min</th><th class="num" title="Amarillas">TA</th><th class="num" title="Rojas">TR</th><th class="num" title="Azules">TAz</th></tr></thead><tbody>' +
      filas.map((x, i) => '<tr class="' + (x.esYo ? 'yo' : '') + '"><td class="c">' + (i + 1) + '</td><td>' + (x.numero != null ? '<small class="suave">' + h(x.numero) + '</small> ' : '') + h(x.nombre) + '</td><td class="num">' + x.pj + '</td><td class="num"><b>' + x.g + '</b></td>' +
        (conPromedio ? '<td class="num">' + (x.pj ? (x.g / x.pj).toFixed(1).replace('.', ',') : '–') + '</td>' : '') + '<td class="num">' + x.at + '</td><td class="num">' + x.dm + '</td><td class="num">' + x.am + '</td><td class="num">' + x.ro + '</td><td class="num">' + x.az + '</td></tr>').join('') +
      '</tbody></table></div>';
  }

  function itemResultado(m) {
    const r = m.resultado;
    const est = r ? (r.nuestro > r.rival ? ['Victoria', 'ok'] : r.nuestro < r.rival ? ['Derrota', 'mal'] : ['Empate', '']) : null;
    const mia = m.miEstadistica;
    return '<li>' + fechaCaja(m.fecha, true) + '<div class="crece"><b>vs ' + h(m.rival) + '</b><small>' + h(m.categoria) + (m.competicion ? ' · ' + h(m.competicion) : '') + '</small>' +
      '<div class="fila insignias">' + (r ? '<b class="marcador">' + r.nuestro + ' – ' + r.rival + '</b>' + insignia(est[0], est[1]) : insignia('Sin resultado')) +
      (mia ? insignia('Tus goles: ' + mia.g + (mia.at ? ' · atajadas: ' + mia.at : ''), 'azul') : '') +
      (esStaff() ? '<button class="btn mini" data-act="resultado" data-id="' + m.id + '">' + (m.estadisticas && Object.keys(m.estadisticas).length ? 'Editar estadísticas' : 'Cargar estadísticas') + '</button>' : '') + '</div>' +
      (m.comentario ? '<p class="nota">💬 ' + h(m.comentario) + '</p>' : '') + '</div></li>';
  }

  function vistaEstadisticas() {
    if (!esStaff()) {
      const me = S.view.misEstadisticas || {};
      const jugados = pasados(S.view.partidos).filter((m) => m.resultado || m.comentario).slice(0, 15);
      return '<div class="kpis"><div class="kpi"><small>Partidos jugados</small><b>' + (me.pj || 0) + '</b></div><div class="kpi verde"><small>Goles</small><b>' + (me.g || 0) + '</b></div>' +
        '<div class="kpi"><small>Atajadas</small><b>' + (me.at || 0) + '</b></div><div class="kpi oro"><small>Exclusiones 2 min</small><b>' + (me.dm || 0) + '</b></div>' +
        '<div class="kpi rojo"><small>Tarjetas</small><b>' + ((me.am || 0) + (me.ro || 0) + (me.az || 0)) + '</b></div></div>' +
        seccion('Goleadores · ' + yo().categoria + ' ' + ANIO, tablaEstadisticas(S.view.goleadores || [], true), '', 'Tu fila aparece destacada.') +
        seccion('Resultados', jugados.length ? '<ul class="lista">' + jugados.map(itemResultado).join('') + '</ul>' : vacio('Aún no hay partidos jugados.'));
    }
    const conDatos = cats().filter((c) => S.view.partidos.some((m) => m.categoria === c && m.estadisticas && Object.keys(m.estadisticas).length));
    const cat = S.catEst || S.filtroCat || conDatos[0] || cats()[0];
    const jugados = pasados(S.view.partidos).filter((m) => m.categoria === cat).slice(0, 20);
    return '<div class="filtros"><select data-cambio="catEst" aria-label="Categoría">' + opcionesCategoria(cat) + '</select></div>' +
      seccion('Goleadores ' + ANIO, tablaEstadisticas(C.tablaGoleadores(S.view, cat, ANIO), true), '', 'Se suman las estadísticas que cargas en cada partido (botón "Resultado").') +
      seccion('Partidos jugados', jugados.length ? '<ul class="lista">' + jugados.map(itemResultado).join('') + '</ul>' : vacio('Esta categoría aún no juega partidos.'));
  }

  function formResultado(m) {
    const ruts = Array.from(new Set(Object.keys(m.citados || {}).concat(Object.keys(m.estadisticas || {}))));
    const lista = (ruts.length ? ruts.map(usuario).filter(Boolean) : jugadores().filter((j) => j.categoria === m.categoria))
      .sort((a, b) => (a.numero == null ? 999 : a.numero) - (b.numero == null ? 999 : b.numero) || a.nombre.localeCompare(b.nombre));
    const hay = m.estadisticas && Object.keys(m.estadisticas).length;
    const filas = lista.map((j) => {
      const e = (m.estadisticas || {})[j.rut] || {};
      const jugo = hay ? !!m.estadisticas[j.rut] : (m.citados || {})[j.rut] !== 'rechazado';
      return '<div class="est-fila"><label class="est-jugo"><input type="checkbox" name="jugo[]" value="' + h(j.rut) + '"' + (jugo ? ' checked' : '') + '><span><b>' + (j.numero != null ? '#' + h(j.numero) + ' ' : '') + h(j.nombre) + '</b><small>Jugó</small></span></label>' +
        '<div class="est-campos">' + C.CAMPOS_ESTADISTICA.map(([k, , max]) => '<label><span>' + CORTO_EST[k] + '</span><input name="e_' + h(j.rut) + '_' + k + '" type="number" min="0" max="' + max + '" inputmode="numeric" value="' + (e[k] || '') + '" placeholder="0"></label>').join('') + '</div></div>';
    }).join('');
    return '<form id="form-modal"><input type="hidden" name="id" value="' + m.id + '">' +
      '<div class="campos">' + campo('Vieux Gaulois', input('nuestro', m.resultado ? m.resultado.nuestro : '', 'type="number" min="0" inputmode="numeric"')) +
      campo(m.rival, input('rival', m.resultado ? m.resultado.rival : '', 'type="number" min="0" inputmode="numeric"')) + '</div>' +
      campo('Comentario del entrenador', '<textarea name="comentario" maxlength="600" placeholder="Lo mejor del partido, qué corregir...">' + h(m.comentario || '') + '</textarea>') +
      '<p class="sub">Estadísticas por jugador</p><p class="ayuda">Marca quién jugó. Vacío cuenta como 0. Las tarjetas son 0 o 1 y los 2 minutos, de 0 a 3.</p>' +
      (filas ? '<div class="tarjeta est-lista">' + filas + '</div>' : vacio('No hay jugadores citados.')) + pie('Guardar resultado') + '</form>';
  }

  // ---------- Evaluación física ----------
  const TEST = (k) => C.TESTS_FISICOS.find((t) => t[0] === k);
  const TEST_CORTO = { t5105: '5-10-5 (s)', salto: 'Salto (cm)', flex: 'Flexiones 30 s', sent: 'Sentadillas 30 s', altura: 'Altura (cm)', peso: 'Peso (kg)' };
  // Categoría por defecto: la elegida, o la de la última evaluación registrada.
  const catEvaluada = () => {
    const u = (S.view.evaluaciones || []).slice().sort((a, b) => b.fecha.localeCompare(a.fecha))[0];
    const j = u && usuario(u.rut);
    return S.catFis || S.filtroCat || (j && j.categoria) || (jugadores()[0] || {}).categoria || cats()[0];
  };
  const numTxt = (v) => String(v).replace('.', ',');

  // Un gráfico pequeño por test (una sola serie: no lleva leyenda; el título la nombra).
  function graficoTest(evals, k) {
    const [, nombre, unidad, mejor] = TEST(k);
    const pts = evals.filter((e) => e.valores && e.valores[k] != null).sort((a, b) => a.fecha.localeCompare(b.fecha)).map((e) => ({ f: e.fecha, v: e.valores[k] }));
    if (!pts.length) return '';
    const W = 300, H = 104, L = 10, R = 10, T = 16, B = 20;
    let min = Math.min.apply(null, pts.map((p) => p.v)), max = Math.max.apply(null, pts.map((p) => p.v));
    if (min === max) { min -= 1; max += 1; }
    const m = (max - min) * 0.18; min -= m; max += m;
    const x = (i) => (pts.length === 1 ? W / 2 : L + i * (W - L - R) / (pts.length - 1));
    const y = (v) => T + (max - v) / (max - min) * (H - T - B);
    const linea = pts.map((p, i) => (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(p.v).toFixed(1)).join(' ');
    const ult = pts[pts.length - 1], ant = pts[pts.length - 2];
    const d = ant ? Math.round((ult.v - ant.v) * 100) / 100 : null;
    const bien = d == null || !d || !mejor ? null : mejor === 'menos' ? d < 0 : d > 0;
    const cambio = d == null ? '' : d === 0 ? '<small class="suave">igual que la anterior</small>'
      : bien == null ? '<small class="suave">' + (d > 0 ? '▲ +' : '▼ ') + numTxt(d) + ' ' + unidad + '</small>'
        : insignia((bien ? '▲ Mejoró ' : '▼ Bajó ') + numTxt(Math.abs(d)) + ' ' + unidad, bien ? 'ok' : 'mal');
    return '<figure class="graf"><figcaption><span>' + h(nombre) + (mejor === 'menos' ? ' <small class="suave">(menos es mejor)</small>' : '') + '</span><b>' + numTxt(ult.v) + ' <small>' + h(unidad) + '</small></b>' + cambio + '</figcaption>' +
      '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Evolución de ' + h(nombre) + '">' +
      '<line class="g-base" x1="' + L + '" x2="' + (W - R) + '" y1="' + (H - B) + '" y2="' + (H - B) + '"/>' +
      (pts.length > 1 ? '<path class="g-linea" d="' + linea + '"/>' : '') +
      pts.map((p, i) => '<g class="g-punto"><circle class="g-hit" cx="' + x(i).toFixed(1) + '" cy="' + y(p.v).toFixed(1) + '" r="12"/><circle class="g-marca" cx="' + x(i).toFixed(1) + '" cy="' + y(p.v).toFixed(1) + '" r="4.5"/>' +
        '<title>' + h(fCorta(p.f)) + ': ' + numTxt(p.v) + ' ' + h(unidad) + '</title></g>').join('') +
      '<text class="g-eje" x="' + L + '" y="' + (H - 5) + '">' + h(fCorta(pts[0].f)) + '</text>' +
      (pts.length > 1 ? '<text class="g-eje" text-anchor="end" x="' + (W - R) + '" y="' + (H - 5) + '">' + h(fCorta(ult.f)) + '</text>' : '') +
      '</svg></figure>';
  }

  function bloqueEvaluaciones(evals, borrar) {
    if (!evals.length) return vacio('Aún no hay evaluaciones físicas.');
    const orden = evals.slice().sort((a, b) => b.fecha.localeCompare(a.fecha));
    return '<div class="grafs">' + C.TESTS_FISICOS.map(([k]) => graficoTest(evals, k)).join('') + '</div>' +
      '<details class="tabla-detalle"><summary>Ver todas las mediciones</summary><div class="tabla-envoltura"><table class="tabla"><thead><tr><th>Fecha</th>' +
      C.TESTS_FISICOS.map(([, n, u]) => '<th class="num">' + h(n) + ' (' + h(u) + ')</th>').join('') + (borrar ? '<th></th>' : '') + '</tr></thead><tbody>' +
      orden.map((e) => '<tr><td>' + h(fCorta(e.fecha)) + '</td>' + C.TESTS_FISICOS.map(([k]) => '<td class="num">' + (e.valores[k] != null ? numTxt(e.valores[k]) : '–') + '</td>').join('') +
        (borrar ? '<td><button class="btn-icono" data-act="borrarEvaluacion" data-id="' + e.id + '" aria-label="Eliminar">&times;</button></td>' : '') + '</tr>').join('') +
      '</tbody></table></div></details>';
  }

  function vistaFisico() {
    const cat = catEvaluada();
    const js = jugadores().filter((j) => j.categoria === cat);
    const evs = S.view.evaluaciones || [];
    const filas = js.map((j) => {
      const mias = evs.filter((e) => e.rut === j.rut).sort((a, b) => b.fecha.localeCompare(a.fecha));
      const u = mias[0];
      return '<li data-act="verEvolucion" data-rut="' + j.rut + '">' + camiseta(j) + '<div class="crece"><b>' + h(j.nombre) + '</b>' +
        (u ? '<small>Última: ' + h(fCorta(u.fecha)) + ' · ' + mias.length + ' evaluacion' + (mias.length > 1 ? 'es' : '') + '</small><div class="fila insignias">' +
          ['t5105', 'salto', 'flex', 'sent'].filter((k) => u.valores[k] != null).map((k) => insignia(TEST(k)[1].replace(' en 30 s', '') + ': ' + numTxt(u.valores[k]) + ' ' + TEST(k)[2])).join('') + '</div>'
          : '<small>Sin evaluaciones</small>') + '</div><span class="chevron">' + icono('flecha') + '</span></li>';
    }).join('');
    return '<div class="filtros"><select data-cambio="catFis" aria-label="Categoría">' + opcionesCategoria(cat) + '</select><button class="btn" data-act="nuevaEvaluacion" data-cat="' + h(cat) + '">Registrar tests</button></div>' +
      '<p class="intro">Tests recomendados: <b>5-10-5</b> (segundos), <b>salto alto</b> (cm), <b>flexiones</b> y <b>sentadillas en 30 segundos</b>, más <b>altura</b> y <b>peso</b>. Cada jugador ve su evolución en su perfil.</p>' +
      seccion(js.length + ' jugador' + (js.length === 1 ? '' : 'es'), js.length ? '<ul class="lista clic">' + filas + '</ul>' : vacio('No hay jugadores en esta categoría.'));
  }

  function formEvaluacion(cat, fecha) {
    const js = jugadores().filter((j) => j.categoria === cat);
    const evs = S.view.evaluaciones || [];
    return '<form id="form-modal"><div class="campos">' + campo('Categoría', '<select name="cat" data-eval-cat>' + opcionesCategoria(cat) + '</select>') + campo('Fecha', input('fecha', fecha, 'type="date" required')) + '</div>' +
      '<p class="ayuda">Deja en blanco lo que no se midió. Usa coma o punto para decimales (5-10-5 en segundos, ej. 5,4).</p>' +
      (js.length ? '<div class="tarjeta est-lista">' + js.map((j) => {
        const ant = evs.filter((e) => e.rut === j.rut && e.fecha !== fecha).sort((a, b) => b.fecha.localeCompare(a.fecha))[0];
        const hoyE = evs.find((e) => e.rut === j.rut && e.fecha === fecha);
        return '<div class="est-fila"><b class="eval-nombre">' + (j.numero != null ? '#' + h(j.numero) + ' ' : '') + h(j.nombre) + '</b><div class="est-campos">' +
          C.TESTS_FISICOS.map(([k]) => '<label><span>' + TEST_CORTO[k] + '</span><input name="v_' + h(j.rut) + '_' + k + '" inputmode="decimal" value="' + (hoyE && hoyE.valores[k] != null ? numTxt(hoyE.valores[k]) : '') + '" placeholder="' + (ant && ant.valores[k] != null ? numTxt(ant.valores[k]) : '') + '"></label>').join('') + '</div></div>';
      }).join('') + '</div>' : vacio('No hay jugadores en esta categoría.')) + pie('Guardar evaluación') + '</form>';
  }

  // ---------- Plan de entrenamiento ----------
  const filaPlan = (x, jugadas) => '<div class="plan-fila tarjeta"><div class="campos">' + campo('Ejercicio', '<input name="pn[]" value="' + h(x.nombre || '') + '" maxlength="80" placeholder="Ej: Calentamiento con balón">') +
    campo('Minutos', '<input name="pm[]" type="number" min="0" max="300" inputmode="numeric" value="' + h(x.minutos || '') + '">') + '</div>' +
    campo('Detalle', '<input name="pd[]" value="' + h(x.detalle || '') + '" maxlength="300" placeholder="Series, reglas, objetivo">') +
    campo('Jugada de la pizarra (opcional)', '<select name="pj[]"><option value="">Ninguna</option>' + jugadas.map((jg) => '<option value="' + jg.id + '"' + (jg.id === x.jugada ? ' selected' : '') + '>' + h(jg.nombre) + '</option>').join('') + '</select>') + '</div>';

  function formPlan(e) {
    const jugadas = S.view.jugadas || [];
    const plan = (e.plan || []).concat([{}, {}]);
    return '<form id="form-modal"><input type="hidden" name="id" value="' + e.id + '"><p class="ayuda">' + h(fLarga(e.fecha)) + ' · ' + h(e.hora) + ' hrs · ' + h(e.tema || 'Entrenamiento') + '</p>' +
      '<div id="plan-filas">' + plan.map((x) => filaPlan(x, jugadas)).join('') + '</div>' +
      '<button type="button" class="btn ancho" data-act="agregarFilaPlan">+ Agregar ejercicio</button>' +
      '<label class="celda-chequeo"><input type="checkbox" name="planVisible" value="1"' + (e.planVisible ? ' checked' : '') + '><span>Los jugadores pueden ver este plan</span></label>' +
      pie('Guardar plan') + '</form>';
  }

  function verPlan(e) {
    const plan = e.plan || [];
    const total = plan.reduce((s, x) => s + (Number(x.minutos) || 0), 0);
    return '<p class="ayuda">' + h(fLarga(e.fecha)) + ' · ' + h(e.hora) + ' hrs · ' + total + ' min en total</p><div class="tarjeta"><ol class="plan-lista">' + plan.map((x) => '<li><div class="fila entre"><b>' + h(x.nombre) + '</b>' + (x.minutos ? insignia(x.minutos + ' min') : '') + '</div>' +
      (x.detalle ? '<p>' + h(x.detalle) + '</p>' : '') + (x.jugada && (S.view.jugadas || []).some((j) => j.id === x.jugada) ? '<button class="btn mini" data-act="abrirJugadaPlan" data-id="' + x.jugada + '">' + icono('jugadas') + ' Ver jugada</button>' : '') + '</li>').join('') + '</ol></div>' +
      (esStaff() ? '<div class="modal-pie columna"><button class="btn primario ancho" data-act="editarPlan" data-id="' + e.id + '">Editar plan</button></div>' : '');
  }

  // ---------- Encuestas ----------
  const encuestasPorVotar = () => (S.view.encuestas || []).filter((e) => !e.cerrada && e.miVoto == null);

  function tarjetaEncuesta(e) {
    const cambiar = S.cambiarVoto === e.id;
    const verRes = esStaff() || (e.miVoto != null && !cambiar) || e.cerrada;
    const autor = usuario(e.autor);
    const puede = esDir() || e.autor === S.view.yo;
    const cuerpo = verRes ? e.opciones.map((o, i) => {
      const pct = e.total ? Math.round(e.conteo[i] / e.total * 100) : 0;
      return '<div class="enc-op' + (e.miVoto === i ? ' mia' : '') + '"><div class="fila entre"><span>' + h(o) + (e.miVoto === i ? ' <small>(tu voto)</small>' : '') + '</span><b>' + pct + '%</b></div>' +
        '<div class="enc-barra"><i style="width:' + pct + '%"></i></div><small class="suave">' + e.conteo[i] + ' voto' + (e.conteo[i] === 1 ? '' : 's') + '</small></div>';
    }).join('') : '<div class="enc-votar">' + e.opciones.map((o, i) => '<button class="btn ancho' + (e.miVoto === i ? ' primario' : '') + '" data-act="votar" data-id="' + e.id + '" data-op="' + i + '">' + h(o) + '</button>').join('') + '</div>';
    return '<article class="tarjeta encuesta"><div class="fila insignias">' + insignia(e.categoria || 'Todo el club', e.categoria ? '' : 'azul') +
      (e.cerrada ? insignia('Cerrada') : e.cierre ? insignia('Cierra el ' + fCorta(e.cierre), 'oro') : '') + '</div><h3>' + h(e.pregunta) + '</h3>' + cuerpo +
      '<div class="fila insignias" style="margin-top:8px"><small class="suave">' + (esStaff() ? e.total + ' de ' + e.habilitados + ' votaron' : e.total + ' voto' + (e.total === 1 ? '' : 's')) + (autor ? ' · ' + h(autor.nombre) : '') + '</small>' +
      (!esStaff() && !e.cerrada && e.miVoto != null && !cambiar ? '<button class="btn mini" data-act="cambiarVoto" data-id="' + e.id + '">Cambiar voto</button>' : '') +
      (esStaff() && puede ? (!e.cerrada ? '<button class="btn mini" data-act="cerrarEncuesta" data-id="' + e.id + '">Cerrar</button>' : '') + '<button class="btn mini peligro" data-act="borrarEncuesta" data-id="' + e.id + '">Eliminar</button>' : '') + '</div></article>';
  }

  function vistaEncuestas() {
    const lista = (S.view.encuestas || []).filter((e) => !esStaff() || !S.filtroCat || !e.categoria || e.categoria === S.filtroCat)
      .sort((a, b) => (a.cerrada ? 1 : 0) - (b.cerrada ? 1 : 0) || b.fecha.localeCompare(a.fecha));
    return (esStaff() ? '<div class="filtros">' + filtroCategoria() + '</div>' : '') +
      '<p class="intro">' + (esStaff() ? 'Pregunta al club o a una categoría. Los votos son anónimos: se ven sólo los totales.' : 'Vota en las encuestas del club. Los votos son anónimos.') + '</p>' +
      (lista.length ? '<div class="pila-avisos">' + lista.map(tarjetaEncuesta).join('') + '</div>' : seccion('', vacio('No hay encuestas.')));
  }

  function formEncuesta() {
    return '<form id="form-modal">' + campo('Pregunta', input('pregunta', '', 'required maxlength="160" placeholder="Ej: ¿Qué día hacemos el entrenamiento extra?"')) +
      campo('Opciones (una por línea)', '<textarea name="opciones" rows="4" required placeholder="Lunes&#10;Miércoles&#10;Sábado"></textarea>') +
      '<div class="campos">' + campo('¿Quiénes votan?', '<select name="categoria">' + opcionesCategoria(S.filtroCat, 'Todo el club') + '</select>') +
      campo('Cierra el (opcional)', input('cierre', C.sumarDias(HOY, 7), 'type="date"')) + '</div>' + pie('Publicar encuesta') + '</form>';
  }

  // ---------- Galería ----------
  function vistaGaleria() {
    const lista = (S.view.galeria || []).filter((a) => !esStaff() || !S.filtroCat || !a.categoria || a.categoria === S.filtroCat).sort((a, b) => b.fecha.localeCompare(a.fecha));
    const TIPOS = { plantel: 'Foto de plantel', partido: 'Partido', evento: 'Evento' };
    return (esStaff() ? '<div class="filtros">' + filtroCategoria() + '</div>' : '') +
      '<p class="intro">Fotos del plantel y de los partidos. Las suben los entrenadores, máximo ' + C.MAX_FOTOS_ALBUM + ' por álbum.</p>' +
      (lista.length ? lista.map((a) => {
        const mio = a.autor === S.view.yo;
        const m = a.partidoId && S.view.partidos.find((x) => x.id === a.partidoId);
        return '<article class="tarjeta album"><div class="fila entre"><div class="crece"><b>' + h(a.titulo) + '</b><small class="suave">' + h(fCorta(a.fecha)) + ' · ' + h(TIPOS[a.tipo] || '') + ' · ' + h(a.categoria || 'Todo el club') + (m ? ' · vs ' + h(m.rival) : '') + '</small></div>' +
          (mio && a.fotos.length < C.MAX_FOTOS_ALBUM ? '<button class="btn mini" data-act="agregarFotos" data-id="' + a.id + '">+ Foto</button>' : '') +
          (mio || esDir() ? '<button class="btn-icono" data-act="borrarAlbum" data-id="' + a.id + '" aria-label="Eliminar álbum">' + icono('basura') + '</button>' : '') + '</div>' +
          '<div class="album-fotos n' + a.fotos.length + '">' + a.fotos.map((f) => '<button class="foto" data-act="verFoto" data-id="' + a.id + '" data-foto="' + f + '"><img src="' + h(fotoUrl(f)) + '" loading="lazy" alt="Foto de ' + h(a.titulo) + '"></button>').join('') + '</div></article>';
      }).join('') : seccion('', vacio(rol() === 'entrenador' ? 'Sube la primera foto del plantel con el botón +.' : 'Aún no hay fotos.')));
  }

  function formAlbum() {
    const partidos = S.view.partidos.filter((m) => m.fecha >= C.sumarDias(HOY, -60) && m.fecha <= C.sumarDias(HOY, 7)).sort(porFecha).reverse();
    return '<form id="form-modal">' + campo('Título', input('titulo', '', 'required maxlength="80" placeholder="Ej: Plantel Cadetes 2026"')) +
      '<div class="campos">' + campo('Tipo', '<select name="tipo"><option value="plantel">Foto de plantel</option><option value="partido">Partido</option><option value="evento">Evento</option></select>') + campo('Fecha', input('fecha', HOY, 'type="date" required')) +
      campo('Categoría', '<select name="categoria">' + opcionesCategoria(S.filtroCat, 'Todo el club') + '</select>') +
      campo('Partido (opcional)', '<select name="partidoId"><option value="">–</option>' + partidos.map((m) => '<option value="' + m.id + '">' + h(fCorta(m.fecha) + ' · ' + m.categoria + ' vs ' + m.rival) + '</option>').join('') + '</select>') + '</div>' +
      campo('Fotos (máximo ' + C.MAX_FOTOS_ALBUM + ')', '<input type="file" name="archivos" accept="image/*" multiple required>') +
      '<p class="ayuda">Se achican automáticamente antes de subirlas para no llenar el servidor.</p>' + pie('Subir fotos') + '</form>';
  }

  // ---------- Inventario ----------
  function vistaInventario() {
    const items = (S.view.inventario || []).slice().sort((a, b) => a.tipo.localeCompare(b.tipo) || a.nombre.localeCompare(b.nombre));
    const pr = S.view.prestamos || [];
    const activos = pr.filter((x) => !x.devuelto).sort((a, b) => b.fecha.localeCompare(a.fecha));
    const devueltos = pr.filter((x) => x.devuelto).sort((a, b) => b.devuelto.localeCompare(a.devuelto)).slice(0, 30);
    const quien = (r) => (usuario(r) || { nombre: '?' }).nombre;
    const item = (id) => items.find((i) => i.id === id) || { nombre: '?' };
    const filaPr = (x) => '<li><div class="crece"><b>' + h(quien(x.rut)) + '</b><small>' + x.cantidad + ' × ' + h(item(x.itemId).nombre) + ' · ' + h(fCorta(x.fecha)) + (x.nota ? ' · ' + h(x.nota) : '') + (x.devuelto ? ' · devuelto ' + h(fCorta(x.devuelto)) : '') + '</small></div>' +
      (x.devuelto ? insignia('Devuelto', 'ok') : '<button class="btn mini" data-act="devolver" data-id="' + x.id + '">Devuelto</button>') + '</li>';
    return seccion('Material del club', items.length ? '<ul class="lista">' + items.map((i) => {
      const fuera = activos.filter((x) => x.itemId === i.id).reduce((s, x) => s + x.cantidad, 0);
      return '<li class="envolver"><span class="ico-celda c-inventario">' + icono('inventario') + '</span><div class="crece"><b>' + h(i.nombre) + '</b><small>' + h(i.tipo) + ' · ' + i.total + ' en total' + (i.notas ? ' · ' + h(i.notas) : '') + '</small>' +
        '<div class="fila insignias">' + insignia((i.total - fuera) + ' disponibles', i.total - fuera ? 'ok' : 'mal') + (fuera ? insignia(fuera + ' entregados', 'oro') : '') +
        '<button class="btn mini primario" data-act="entregar" data-id="' + i.id + '">Entregar</button><button class="btn mini" data-act="editarMaterial" data-id="' + i.id + '">Editar</button></div></div></li>';
    }).join('') + '</ul>' : vacio('Agrega balones, petos, camisetas y otros materiales con el botón +.')) +
      seccion('Quién tiene qué (' + activos.length + ')', activos.length ? '<ul class="lista">' + activos.map(filaPr).join('') + '</ul>' : vacio('No hay material entregado.')) +
      (devueltos.length ? '<details class="tabla-detalle"><summary>Devoluciones recientes</summary><div class="tarjeta"><ul class="lista">' + devueltos.map(filaPr).join('') + '</ul></div></details>' : '');
  }

  function formMaterial(i) {
    const nuevo = !i;
    i = i || { tipo: 'Balones' };
    return '<form id="form-modal">' + (nuevo ? '' : '<input type="hidden" name="id" value="' + i.id + '">') + campo('Material', input('nombre', i.nombre, 'required maxlength="80" placeholder="Ej: Balones talla 3"')) +
      '<div class="campos">' + campo('Tipo', '<select name="tipo">' + opciones(['Balones', 'Petos', 'Camisetas', 'Conos', 'Botiquín', 'Otros'], i.tipo) + '</select>') + campo('Cantidad total', input('total', i.total, 'type="number" min="0" required inputmode="numeric"')) + '</div>' +
      campo('Notas', input('notas', i.notas, 'maxlength="200" placeholder="Dónde se guarda, estado..."')) +
      pie(nuevo ? 'Agregar' : 'Guardar', nuevo ? '' : '<button type="button" class="btn peligro" data-act="borrarMaterial" data-id="' + i.id + '">Eliminar</button>') + '</form>';
  }

  function formEntrega(i) {
    const staff = S.view.usuarios.filter((u) => esPersonal(u) && u.activo !== false);
    return '<form id="form-modal"><input type="hidden" name="itemId" value="' + i.id + '"><p class="ayuda"><b>' + h(i.nombre) + '</b></p>' +
      campo('¿A quién?', '<select name="rut" required><optgroup label="Cuerpo técnico y directiva">' + staff.map((u) => '<option value="' + u.rut + '">' + h(u.nombre) + '</option>').join('') + '</optgroup>' +
        '<optgroup label="Jugadores">' + jugadores().map((j) => '<option value="' + j.rut + '">' + h(j.nombre) + ' · ' + h(j.categoria) + '</option>').join('') + '</optgroup></select>') +
      '<div class="campos">' + campo('Cantidad', input('cantidad', 1, 'type="number" min="1" required inputmode="numeric"')) + campo('Fecha', input('fecha', HOY, 'type="date"')) + '</div>' +
      campo('Nota', input('nota', '', 'maxlength="120" placeholder="Ej: camiseta N° 10"')) + pie('Registrar entrega') + '</form>';
  }

  // ---------- Cumpleaños ----------
  function listaCumples(lista) {
    const hoyD = new Date().getDate();
    return '<ul class="lista">' + lista.map((c) => '<li><span class="ico-celda c-cumple"><b>' + c.dia + '</b></span><div class="crece"><b>' + h(c.nombre) + (c.esYo ? ' (tú)' : '') + '</b><small>Cumple ' + c.cumple + (c.categoria ? ' · ' + h(c.categoria) : '') + '</small></div>' +
      (c.dia === hoyD ? insignia('¡Hoy! 🎂', 'oro') : c.dia < hoyD ? '<small class="suave">ya pasó</small>' : '') + '</li>').join('') + '</ul>';
  }

  // ---------- Reporte mensual (PDF y Excel) ----------
  function imprimir(html, titulo) {
    let el = $('#imprimir');
    if (!el) { el = document.createElement('div'); el.id = 'imprimir'; document.body.appendChild(el); }
    el.innerHTML = html;
    const antes = document.title;
    document.title = titulo;
    document.body.classList.add('imprimiendo');
    const fin = () => { document.body.classList.remove('imprimiendo'); document.title = antes; window.removeEventListener('afterprint', fin); };
    window.addEventListener('afterprint', fin);
    setTimeout(() => { window.print(); }, 60);
  }

  function formReporte() {
    const m = new Date().getMonth();
    return '<div class="campos">' + campo('Mes', '<select id="rep-mes">' + C.MESES_LARGOS.map((n, i) => '<option value="' + i + '"' + (i === m ? ' selected' : '') + '>' + n + '</option>').join('') + '</select>') +
      campo('Año', '<select id="rep-anio">' + [ANIO - 1, ANIO].map((a) => '<option' + (a === ANIO ? ' selected' : '') + '>' + a + '</option>').join('') + '</select>') + '</div>' +
      '<div id="rep-resumen">' + resumenReporte(C.reporteMensual(S.view, ANIO, m)) + '</div>' +
      '<div class="modal-pie columna"><button class="btn primario ancho" data-act="reporteExcel">' + icono('excel') + ' Descargar Excel</button><button class="btn ancho" data-act="reportePdf">' + icono('pdf') + ' Descargar PDF</button></div>';
  }
  const reporteElegido = () => C.reporteMensual(S.view, Number($('#rep-anio').value), Number($('#rep-mes').value));
  const resumenReporte = (r) => '<div class="kpis"><div class="kpi verde"><small>Ingresos</small><b>' + clp(r.totales.ingresos) + '</b></div><div class="kpi rojo"><small>Gastos</small><b>' + clp(r.totales.gastos) + '</b></div>' +
    '<div class="kpi ' + (r.totales.balance >= 0 ? 'verde' : 'rojo') + '"><small>Balance</small><b>' + clp(r.totales.balance) + '</b></div><div class="kpi oro"><small>Morosos</small><b>' + r.totales.morosos + '</b><small>' + clp(r.totales.deuda) + '</small></div></div>';

  function descargarExcel(r) {
    const t = r.totales;
    const hojas = [
      { nombre: 'Resumen', filas: [['Reporte ' + r.titulo, ''], ['Cuotas', t.cuotas], ['Federativos', t.federativos], ['Otros cobros', t.cobros], ['Otros ingresos', t.otros], ['Total ingresos', t.ingresos], ['Gastos', t.gastos], ['Balance', t.balance], ['Jugadores con cuotas atrasadas', t.morosos], ['Deuda total', t.deuda]] },
      { nombre: 'Ingresos', filas: [['Fecha', 'Tipo', 'Detalle', 'Jugador', 'Categoría', 'Medio', 'Monto']].concat(r.ingresos.map((x) => [x.fecha, x.tipo, x.detalle, x.nombre, x.categoria, x.medio, x.monto])) },
      { nombre: 'Gastos', filas: [['Fecha', 'Detalle', 'Monto']].concat(r.gastos.map((x) => [x.fecha, x.detalle, x.monto])) },
      { nombre: 'Morosos', filas: [['Jugador', 'Categoría', 'Meses adeudados', 'Deuda', 'Teléfono']].concat(r.morosos.map((x) => [x.nombre, x.categoria, x.meses.map((m) => C.MESES[m]).join(', '), x.deuda, x.telefono])) },
    ];
    const blob = new Blob([C.crearXlsx(hojas)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'Reporte Vieux Gaulois ' + r.titulo + '.xlsx';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }

  function imprimirReporte(r) {
    const t = r.totales;
    const tabla = (cab, filas) => '<table class="pdf-tabla"><thead><tr>' + cab.map((c) => '<th>' + h(c) + '</th>').join('') + '</tr></thead><tbody>' + (filas.length ? filas.map((f) => '<tr>' + f.map((c) => '<td>' + h(c) + '</td>').join('') + '</tr>').join('') : '<tr><td colspan="' + cab.length + '">Sin registros</td></tr>') + '</tbody></table>';
    imprimir('<div class="pdf"><div class="pdf-cab"><img src="' + ESCUDO + '" alt=""><div><b>VIEUX GAULOIS HANDBALL</b><span>Reporte financiero</span></div></div><h1>' + h(r.titulo) + '</h1>' +
      tabla(['Resumen', 'Monto'], [['Cuotas', clp(t.cuotas)], ['Federativos', clp(t.federativos)], ['Otros cobros', clp(t.cobros)], ['Otros ingresos', clp(t.otros)], ['Total ingresos', clp(t.ingresos)], ['Gastos', clp(t.gastos)], ['Balance', clp(t.balance)], ['Deuda de ' + t.morosos + ' jugadores', clp(t.deuda)]]) +
      '<h2>Ingresos</h2>' + tabla(['Fecha', 'Tipo', 'Detalle', 'Jugador', 'Monto'], r.ingresos.map((x) => [fCorta(x.fecha), x.tipo, x.detalle, x.nombre, clp(x.monto)])) +
      '<h2>Gastos</h2>' + tabla(['Fecha', 'Detalle', 'Monto'], r.gastos.map((x) => [fCorta(x.fecha), x.detalle, clp(x.monto)])) +
      '<h2>Cuotas atrasadas</h2>' + tabla(['Jugador', 'Categoría', 'Meses', 'Deuda'], r.morosos.map((x) => [x.nombre, x.categoria, x.meses.map((m) => C.MESES[m]).join(', '), clp(x.deuda)])) +
      '<p class="pdf-pie">Generado el ' + h(fLarga(HOY)) + ' desde la app del club.</p></div>', 'Reporte Vieux Gaulois ' + r.titulo);
  }

  // ---------- Recordatorios de cuota (manuales, desde Finanzas) ----------
  const contactoDe = (j) => (menor(j) ? apoderados(j.rut)[0] : null) || j;
  const telWa = (t) => { let d = String(t || '').replace(/\D/g, ''); if (d.length === 9 && d[0] === '9') d = '56' + d; return d.length >= 10 ? d : ''; };
  function textoRecordatorio(j, mes, c) {
    const venc = String(S.view.config.diaVencimiento).padStart(2, '0') + '/' + String(mes + 1).padStart(2, '0');
    const vencida = estadoMes(j.rut, ANIO, mes) === 'vencido';
    return 'Hola ' + c.nombre.split(/\s+/)[0] + ', ' + (vencida ? 'te contamos que ' : 'te recordamos que ') + (c.rut !== j.rut ? 'la cuota de ' + j.nombre.split(/\s+/)[0] : 'tu cuota') +
      ' de ' + C.MESES_LARGOS[mes].toLowerCase() + ' (' + clp(C.cuotaDe(S.view, j)) + ') ' + (vencida ? 'venció el ' + venc + ' y aún aparece pendiente.' : 'vence el ' + venc + '.') +
      ' Puedes pagar e informar el pago en la app de Vieux Gaulois. ¡Gracias!';
  }

  function seccionRecordatorios() {
    const mes = new Date().getMonth();
    if (!S.view.config.mesesCobro.includes(mes)) return '';
    const informado = (j) => (S.view.pagosInformados || []).some((x) => x.rut === j.rut && x.estado === 'pendiente' && x.concepto === 'cuota' && x.mes === mes);
    const lista = jugadores().filter((j) => ['pendiente', 'vencido'].includes(estadoMes(j.rut, ANIO, mes)) && !informado(j));
    if (!lista.length) return '';
    return seccion('Recordar cuota de ' + C.MESES_LARGOS[mes].toLowerCase() + ' (' + lista.length + ')', '<ul class="lista">' + lista.slice(0, 40).map((j) => {
      const c = contactoDe(j);
      const txt = textoRecordatorio(j, mes, c);
      const wa = telWa(c.telefono);
      return '<li class="envolver"><div class="crece"><b>' + h(j.nombre) + '</b><small>' + h(etiqueta(j)) + (c.rut !== j.rut ? ' · apoderado: ' + h(c.nombre) : '') + '</small>' +
        '<div class="fila insignias">' + (estadoMes(j.rut, ANIO, mes) === 'vencido' ? insignia('Vencida', 'mal') : insignia('Por vencer', 'alerta')) +
        (wa ? '<a class="btn mini" href="https://wa.me/' + wa + '?text=' + encodeURIComponent(txt) + '" target="_blank" rel="noopener noreferrer">' + icono('whatsapp') + ' WhatsApp</a>' : '') +
        (c.email ? '<a class="btn mini" href="mailto:' + h(c.email) + '?subject=' + encodeURIComponent('Cuota de ' + C.MESES_LARGOS[mes].toLowerCase() + ' · Vieux Gaulois') + '&body=' + encodeURIComponent(txt) + '">' + icono('correo') + ' Correo</a>' : '') +
        (!wa && !c.email ? '<small class="suave">sin teléfono ni correo</small>' : '') + '</div></div></li>';
    }).join('') + '</ul>', btnTexto('Automáticos', 'tab', 'data-tab="ajustes"'), 'Los recordatorios automáticos (notificación, correo y WhatsApp) se configuran en Ajustes. Estos botones abren WhatsApp o tu correo con el mensaje listo.');
  }

  // ---------- Notificaciones push ----------
  const PUSH_OK = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  const esIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent);
  function estadoPush() {
    if (S.modo !== 'servidor') return ['demo', 'Con la app publicada'];
    if (!PUSH_OK()) return ['no', esIOS() ? 'Agrega la app a tu inicio' : 'No disponible'];
    if (Notification.permission === 'denied') return ['bloqueado', 'Bloqueadas'];
    return leerLS('vg_push') === S.view.yo && Notification.permission === 'granted' ? ['activo', 'Activadas'] : ['inactivo', 'Desactivadas'];
  }
  const b64uBytes = (s) => { const b = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)); return Uint8Array.from(b, (c) => c.charCodeAt(0)); };

  async function activarPush() {
    const [est] = estadoPush();
    if (est === 'demo') { toast('Las notificaciones funcionan con la app publicada en el servidor, no en el HTML de prueba'); return; }
    if (est === 'no') { toast(esIOS() ? 'En iPhone: Compartir → "Agregar a inicio", abre la app desde ahí y actívalas' : 'Este navegador no permite notificaciones', 'error'); return; }
    if (est === 'bloqueado') { toast('Las notificaciones están bloqueadas: actívalas en los ajustes del navegador', 'error'); return; }
    try {
      if (est === 'activo') {
        const reg = await navigator.serviceWorker.getRegistration();
        const sub = reg && await reg.pushManager.getSubscription();
        if (sub) { await Servidor.pedir('POST', 'api/push/quitar', { endpoint: sub.endpoint }); await sub.unsubscribe(); }
        guardarLS('vg_push', null);
        toast('Notificaciones desactivadas');
      } else {
        if (await Notification.requestPermission() !== 'granted') { toast('No diste permiso para notificaciones', 'error'); return; }
        await navigator.serviceWorker.register('sw.js');
        const reg = await navigator.serviceWorker.ready;
        const { clave } = await Servidor.pedir('GET', 'api/push/clave');
        const sub = await reg.pushManager.getSubscription() || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64uBytes(clave) });
        await Servidor.pedir('POST', 'api/push/suscribir', { sub: sub.toJSON() });
        guardarLS('vg_push', S.view.yo);
        toast('Listo: te avisaremos de citaciones, mensajes, avisos y cuotas', 'ok');
      }
    } catch (e) { toast('No se pudieron activar: ' + e.message, 'error'); }
    ACCIONES.cuenta();
  }

  // ---------- Render ----------
  const VISTAS = {
    inicio: vistaInicio, avisos: vistaAvisos, jugadores: vistaJugadores, finanzas: () => (esDir() ? vistaFinanzas() : vistaMisFinanzas()), entrenamientos: vistaEntrenamientos, partidos: vistaPartidos,
    lesiones: vistaLesiones, documentos: vistaDocumentos, convenios: vistaConvenios, ajustes: vistaAjustes, calendario: vistaCalendario, perfil: vistaPerfil, mas: vistaMas,
    chat: vistaChat, pizarra: vistaPizarra, jugadas: vistaJugadas,
    estadisticas: vistaEstadisticas, fisico: vistaFisico, encuestas: vistaEncuestas, galeria: vistaGaleria, inventario: vistaInventario,
  };

  function render() {
    const app = $('#app');
    document.body.classList.toggle('sin-sesion', !S.view);
    if (!S.view && S.sinHijos) {
      document.body.classList.add('sin-sesion');
      app.innerHTML = '<div class="firma"><div class="firma-caja"><img src="' + ESCUDO + '" alt="" class="firma-escudo"><h1>Hola, ' + h(S.sinHijos.nombre.split(/\s+/)[0]) + '</h1>' +
        '<div class="tarjeta firma-texto"><p>Tu cuenta de apoderado no tiene jugadores activos asociados. Si es un error, avísale a la directiva del club.</p></div>' +
        '<button class="btn-texto centro" data-act="salir">Salir</button></div></div>';
      return;
    }
    if (!S.view) { app.innerHTML = vistaLogin(); return; }
    // Documentos pendientes de firma: el jugador (o su apoderado, si es menor) los firma antes de entrar.
    const pend = S.view.pendientes || [];
    if (rol() === 'jugador' && pend.length) {
      if (S.apo || !S.view.menor) {
        const doc = S.view.documentos.find((d) => d.id === pend[0]);
        document.body.classList.add('sin-sesion');
        app.innerHTML = vistaFirma(doc);
        return;
      }
      if (pend.includes('consentimiento')) {
        document.body.classList.add('sin-sesion');
        app.innerHTML = vistaEsperaApoderado();
        return;
      }
    }
    if (!permitidas().includes(S.tab)) S.tab = TABS[rol()].barra[0];
    if (S.tab === 'avisos') guardarLS('vg_av_' + S.view.yo, JSON.stringify(avisos().map((a) => a.id)));
    const enfocado = document.activeElement && document.activeElement.dataset && document.activeElement.dataset.cambio;
    const chatEnfocado = document.activeElement && document.activeElement.id === 'chat-texto';
    const y = window.scrollY;
    app.innerHTML = shell(VISTAS[S.tab]());
    window.scrollTo(0, y);
    if (enfocado === 'busqueda') { const i = $('[data-cambio="busqueda"]'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }
    if (chatEnfocado && $('#chat-texto')) { const t = $('#chat-texto'); t.focus(); t.setSelectionRange(t.value.length, t.value.length); }
    if (S.tab === 'pizarra' || (S.tab === 'jugadas' && S.piz)) Pizarra.montar();
  }

  function irAlFinalChat() {
    const c = $('#chat-msjs');
    if (c) window.scrollTo(0, document.body.scrollHeight);
    const t = $('#chat-texto');
    if (t && window.matchMedia('(min-width: 721px)').matches) t.focus();
  }

  function enviarConError(promesa) {
    return promesa.then((ok) => { if (ok) cerrarModal(); });
  }

  const partido = (id) => S.view.partidos.find((m) => m.id === id);

  // ---------- Acciones de botones ----------
  const ACCIONES = {
    tab: (d) => { cerrarModal(); S.tab = d.tab; S.verPasados = false; S.hilo = null; render(); window.scrollTo(0, 0); },
    segmento: (d) => {
      if (d.nombre === 'anioFin') S.anioFin = Number(d.valor);
      if (d.nombre === 'verPasados') S.verPasados = d.valor === '1';
      if (d.nombre === 'cancha' && S.piz) S.piz.cancha = d.valor;
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
      const u = S.apo ? Object.assign({ rol: 'apoderado', cargo: 'Apoderado de ' + S.apo.hijos.map((x) => x.usuarios[0].nombre.split(/\s+/)[0]).join(' y ') }, S.view.apoderado) : yo();
      const [, txtPush] = estadoPush();
      abrirModal('Mi cuenta', '<div class="ficha-cab"><div class="avatar grande">' + h(iniciales(u.nombre)) + '</div><div class="crece"><b>' + h(u.nombre) + '</b><small>' + h(u.cargo || u.rol) + '</small><small>' + h(u.usuario ? 'Usuario: ' + u.usuario : C.formatearRut(u.rut)) + '</small></div></div>' +
        seccion('Avisos', '<ul class="lista clic"><li data-act="activarPush"><span class="ico-celda c-avisos">' + icono('campana') + '</span><div class="crece"><b>Notificaciones en este dispositivo</b><small>Citaciones, mensajes, avisos y cuotas</small></div><span class="valor">' + h(txtPush) + '</span></li>' +
          (S.apo ? '<li data-act="misDatosApoderado"><span class="ico-celda c-gris">' + icono('perfil') + '</span><div class="crece"><b>Mis datos de contacto</b><small>Para recordatorios de cuotas</small></div><span class="chevron">' + icono('flecha') + '</span></li>' : '') + '</ul>') +
        seccionCuenta());
    },
    activarPush: () => activarPush(),
    misDatosApoderado: () => abrirModal('Mis datos de contacto', formMisDatos(S.view.apoderado, true), (o) => accion('jugador.editar', o, 'Datos guardados')),
    recargar: async () => { try { recibir(await B().estado()); render(); } catch (e) { toast(e.message, 'error'); } },
    elegirHijo: (d) => { S.hijo = d.rut; guardarLS('vg_hijo', d.rut); S.hilo = null; S.piz = null; recibir(S.apo); render(); window.scrollTo(0, 0); },
    verTemporada: () => {
      const t = (S.view.cambiosTemporada || []).filter((x) => x.anio === ANIO).pop();
      abrirModal('Temporada ' + ANIO, '<p class="ayuda">El ' + h(fLarga(t.fecha)) + ' los jugadores subieron de año (1er → 2do) o de categoría (2do año → 1er año de la siguiente). Revisa los números marcados: quedaron libres porque ya estaban ocupados.</p>' +
        '<div class="tarjeta"><ul class="lista">' + t.cambios.map((c) => '<li><div class="crece"><b>' + h(c.nombre) + '</b><small>' + h(c.de) + ' → ' + h(c.a) + '</small></div>' + (c.numeroLiberado != null ? insignia('Asignar N° (tenía ' + c.numeroLiberado + ')', 'alerta') : '') + '</li>').join('') + '</ul></div>' +
        '<div class="modal-pie columna"><button class="btn primario ancho" data-act="temporadaVista">Entendido</button></div>');
    },
    temporadaVista: () => { guardarLS('vg_temp_' + ANIO, '1'); cerrarModal(); render(); },
    salir: async () => { cerrarModal(); await B().salir(); S.view = null; S.apo = null; S.sinHijos = null; S.tab = null; S.hilo = null; S.piz = null; S.borrador = {}; render(); },
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
      recibir(await B().clave(o.actual, o.nueva));
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
    misDatos: () => abrirModal('Datos de contacto', formMisDatos(yo()), (o) => accion('jugador.editar', o, 'Datos guardados')),
    credencial: (d) => abrirModal('Credencial digital', vistaCredencial(d.rut ? usuario(d.rut) : yo())),
    fotoPerfil: async (d) => {
      const [f] = await elegirArchivos(false);
      if (!f) return;
      try {
        const data = await comprimir(f, 480, 140, true);
        if (await accion('foto.perfil', { rut: d.rut, data }, 'Foto actualizada')) abrirModal('Credencial digital', vistaCredencial(usuario(d.rut)));
      } catch (e) { toast(e.message, 'error'); }
    },
    fichaMedica: (d) => abrirModal('Ficha médica', formFichaMedica(usuario(d.rut)), (o) => accion('ficha.guardar', o, 'Ficha médica guardada')),
    agregarApoderado: (d) => abrirModal('Agregar apoderado', '<form id="form-modal"><input type="hidden" name="rut" value="' + h(d.rut) + '"><p class="ayuda">Si ya tiene cuenta (otro hijo en el club), basta con el RUT. Entra con su RUT y los 4 primeros dígitos.</p>' +
      campo('RUT del apoderado', input('apoderadoRut', '', 'required placeholder="12.345.678-9"')) + campo('Nombre', input('apoderadoNombre', '', 'maxlength="80"')) +
      '<div class="campos">' + campo('Teléfono', input('apoderadoTelefono', '', 'type="tel"')) + campo('Email', input('apoderadoEmail', '', 'type="email"')) + '</div>' + pie('Agregar') + '</form>',
    async (o) => { const ok = await accion('apoderado.vincular', o, 'Apoderado agregado'); if (ok) abrirModal('Ficha del jugador', fichaJugador(d.rut)); return false; }),
    quitarApoderado: (d) => { if (confirm('¿Quitar a este apoderado? Ya no podrá ver ni gestionar a este jugador.')) accion('apoderado.desvincular', { rut: d.rut, apoderadoRut: d.apoderado }, 'Apoderado quitado').then((ok) => { if (ok) abrirModal('Ficha del jugador', fichaJugador(d.rut)); }); },
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
      '<p class="ayuda">Después de transferir, toca "Ya pagué: informar pago" para que la directiva lo registre.</p><div class="modal-pie columna"><button class="btn primario ancho" data-act="copiarTransferencia">' + icono('copiar') + ' Copiar datos</button></div>'),
    copiarTransferencia: () => copiar(S.view.config.datosTransferencia),
    informarPago: (d) => abrirModal('Informar un pago', formInformarPago(d.concepto, d.mes), (o) => accion('pago.informar', Object.assign(o, { anio: ANIO, mes: o.concepto === 'cuota' ? Number(o.mes) : null }), 'Pago informado: la directiva lo revisará')),
    revisarPago: (d) => {
      if (d.ok) { accion('pago.revisar', { id: d.id, aprobar: true }, 'Pago aprobado y registrado'); return; }
      const nota = prompt('Motivo del rechazo (lo verá el jugador):', 'No encontramos el pago');
      if (nota != null) accion('pago.revisar', { id: d.id, aprobar: false, nota }, 'Pago rechazado');
    },
    editarMedios: (d) => abrirModal('Medios de pago · ' + nombreConcepto(d.concepto), formMedios(d.concepto), (o) => accion('config.guardar', {
      medios: { [d.concepto]: { link: !!o.usarLink, transferencia: !!o.usarTransferencia } }, [d.concepto === 'cuota' ? 'linkCuota' : 'linkFederativo']: o.link,
    }, 'Medios de pago guardados')),
    nuevoCobro: () => abrirModal('Nuevo cobro', formCobro(), (o) => accion('cobro.guardar', Object.assign(o, { usarLink: !!o.usarLink, usarTransferencia: !!o.usarTransferencia, activo: !!o.activo }), 'Cobro creado: los jugadores ya lo ven')),
    editarCobro: (d) => abrirModal('Editar cobro', formCobro(S.view.cobros.find((c) => c.id === d.id)), (o) => accion('cobro.guardar', Object.assign(o, { usarLink: !!o.usarLink, usarTransferencia: !!o.usarTransferencia, activo: !!o.activo }), 'Cobro guardado')),
    borrarCobro: (d) => { if (confirm('¿Eliminar este cobro y sus pagos registrados?')) enviarConError(accion('cobro.eliminar', { id: d.id }, 'Cobro eliminado')); },
    verCobro: (d) => { const c = S.view.cobros.find((x) => x.id === d.id); abrirModal(c.nombre, vistaCobro(c)); },
    marcarCobro: async (d) => {
      const pagado = C.cobroPagado(S.view, d.id, d.rut);
      if (pagado && !confirm('¿Anular este pago?')) return;
      const ok = await accion('cobro.marcar', { id: d.id, rut: d.rut, pagado: !pagado }, pagado ? 'Pago anulado' : 'Pago registrado');
      if (ok) { const c = S.view.cobros.find((x) => x.id === d.id); abrirModal(c.nombre, vistaCobro(c)); }
    },

    // Pizarra y jugadas
    pizHerr: (d) => { S.piz.herr = d.h; render(); },
    pizPaso: (d) => { S.piz.i = Number(d.i); render(); },
    pizNuevoPaso: () => {
      Pizarra.historial();
      if (S.piz.pasos.length >= 30) { toast('Máximo 30 pasos por jugada', 'error'); return; }
      S.piz.pasos.splice(S.piz.i + 1, 0, siguientePaso(Pizarra.paso()));
      S.piz.i++;
      render();
    },
    pizBorrarPaso: () => { Pizarra.historial(); S.piz.pasos.splice(S.piz.i, 1); S.piz.i = Math.max(0, S.piz.i - 1); render(); },
    pizDeshacer: () => {
      const ant = S.piz.historial.pop();
      if (!ant) return;
      const o = JSON.parse(ant);
      S.piz.pasos = o.pasos; S.piz.i = Math.min(o.i, o.pasos.length - 1);
      render();
    },
    pizLimpiar: () => { if (!Pizarra.paso().trazos.length) return; Pizarra.historial(); Pizarra.paso().trazos = []; render(); },
    pizAgregar: (d) => {
      const paso = Pizarra.paso();
      if (d.t === 'b' && paso.fichas.some((f) => f.t === 'b')) { toast('Ya hay un balón en la cancha'); return; }
      if (paso.fichas.length >= 20) { toast('Máximo 20 fichas', 'error'); return; }
      Pizarra.historial();
      const n = d.t === 'a' ? String(paso.fichas.filter((f) => f.t === 'a').length + 1) : d.t === 'd' ? String(paso.fichas.filter((f) => f.t === 'd').length + 1) : '';
      const f = { id: C.uid().slice(-6), t: d.t, n, x: S.piz.cancha === 'media' ? 30 : 20, y: 10 + (paso.fichas.length % 5) - 2 };
      // La ficha nueva aparece desde este paso en adelante.
      S.piz.pasos.slice(S.piz.i).forEach((ps) => ps.fichas.push(Object.assign({}, f)));
      render();
    },
    pizReproducir: () => { S.piz.reproduciendo = true; S.piz.i = 0; render(); Pizarra.animar(); },
    pizDetener: () => { S.piz.reproduciendo = false; render(); },
    pizNueva: () => { if (S.piz.cambios && !confirm('¿Empezar una pizarra nueva? Se pierden los cambios sin guardar.')) return; S.piz = pizNueva(); render(); },
    pizGuardar: () => abrirModal(S.piz.jugadaId ? 'Guardar jugada' : 'Nueva jugada', formJugada(), async (o) => {
      const P = S.piz;
      const ok = await accion('jugada.guardar', { id: P.jugadaId || undefined, nombre: o.nombre, descripcion: o.descripcion, categorias: o.categorias || [], cancha: P.cancha, pasos: P.pasos }, 'Jugada guardada');
      if (ok) {
        if (!P.jugadaId) { const j = S.view.jugadas.filter((x) => x.nombre === o.nombre.trim() && x.autor === S.view.yo).pop(); if (j) P.jugadaId = j.id; }
        Object.assign(P, { nombre: o.nombre.trim(), descripcion: o.descripcion || '', categorias: o.categorias || [], cambios: false });
        render();
      }
      return ok;
    }),
    abrirJugada: (d) => {
      const j = S.view.jugadas.find((x) => x.id === d.id);
      if (esStaff() && S.piz && S.piz.cambios && S.piz.jugadaId !== j.id && !confirm('¿Abrir esta jugada? Se pierden los cambios sin guardar de la pizarra.')) return;
      cargarJugada(j, !esStaff());
      render(); window.scrollTo(0, 0);
    },
    cerrarJugada: () => { S.piz = null; render(); },
    borrarJugada: (d) => {
      if (!confirm('¿Eliminar esta jugada?')) return;
      enviarConError(accion('jugada.eliminar', { id: d.id }, 'Jugada eliminada'));
      if (S.piz && S.piz.jugadaId === d.id) S.piz = pizNueva();
    },

    // Chat
    abrirHilo: (d) => { S.hilo = d.hilo; render(); irAlFinalChat(); },
    cerrarHilo: () => { S.hilo = null; render(); window.scrollTo(0, 0); },
    nuevoChat: () => abrirModal('Nuevo mensaje', formNuevoChat(), (o) => { S.tab = 'chat'; S.hilo = o.hilo; cerrarModal(); render(); irAlFinalChat(); return false; }),

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
      abrirModal('Resultado vs ' + m.rival, formResultado(m), (o) => {
        const estadisticas = {};
        (o.jugo || []).forEach((rut) => { estadisticas[rut] = {}; C.CAMPOS_ESTADISTICA.forEach(([k]) => { estadisticas[rut][k] = o['e_' + rut + '_' + k] || 0; }); });
        return accion('partido.resultado', { id: m.id, nuestro: o.nuestro, rival: o.rival, comentario: o.comentario, estadisticas }, 'Resultado y estadísticas guardados');
      });
    },

    // Plan de entrenamiento
    verPlan: (d) => { const e = S.view.entrenamientos.find((x) => x.id === d.id); abrirModal('Plan del entrenamiento', verPlan(e)); },
    editarPlan: (d) => {
      const e = S.view.entrenamientos.find((x) => x.id === d.id);
      abrirModal('Plan del entrenamiento', formPlan(e), (o) => {
        const plan = (o.pn || []).map((nombre, i) => ({ nombre, minutos: (o.pm || [])[i], detalle: (o.pd || [])[i], jugada: (o.pj || [])[i] })).filter((x) => x.nombre.trim());
        return accion('entrenamiento.plan', { id: e.id, plan, planVisible: !!o.planVisible }, 'Plan guardado');
      });
    },
    agregarFilaPlan: () => { $('#plan-filas').insertAdjacentHTML('beforeend', filaPlan({}, S.view.jugadas || [])); },
    abrirJugadaPlan: (d) => {
      const j = S.view.jugadas.find((x) => x.id === d.id);
      cerrarModal();
      cargarJugada(j, !esStaff());
      S.tab = esStaff() ? 'pizarra' : 'jugadas';
      render(); window.scrollTo(0, 0);
    },

    // Evaluación física
    nuevaEvaluacion: (d) => abrirEvaluacion(d.cat || catEvaluada(), HOY),
    verEvolucion: (d) => { const j = usuario(d.rut); abrirModal(j.nombre, '<p class="ayuda">' + h(etiqueta(j)) + '</p>' + bloqueEvaluaciones((S.view.evaluaciones || []).filter((e) => e.rut === d.rut), true)); },
    borrarEvaluacion: (d) => {
      if (!confirm('¿Eliminar esta medición?')) return;
      const e = S.view.evaluaciones.find((x) => x.id === d.id);
      accion('evaluacion.eliminar', { id: d.id }, 'Eliminada').then((ok) => { if (ok) ACCIONES.verEvolucion({ rut: e.rut }); });
    },

    // Encuestas
    nuevaEncuesta: () => abrirModal('Nueva encuesta', formEncuesta(), (o) => accion('encuesta.guardar', o, 'Encuesta publicada')),
    votar: (d) => { S.cambiarVoto = null; accion('encuesta.votar', { id: d.id, opcion: Number(d.op) }, '¡Gracias por votar!'); },
    cambiarVoto: (d) => { S.cambiarVoto = d.id; render(); },
    cerrarEncuesta: (d) => { if (confirm('¿Cerrar la encuesta? Ya no se podrá votar.')) accion('encuesta.cerrar', { id: d.id }, 'Encuesta cerrada'); },
    borrarEncuesta: (d) => { if (confirm('¿Eliminar la encuesta y sus votos?')) accion('encuesta.eliminar', { id: d.id }, 'Encuesta eliminada'); },

    // Galería
    nuevoAlbum: () => abrirModal('Subir fotos', formAlbum(), async (o) => {
      const archivos = Array.from($('#form-modal input[type=file]').files || []);
      if (archivos.length > C.MAX_FOTOS_ALBUM) throw new Error('Elige máximo ' + C.MAX_FOTOS_ALBUM + ' fotos');
      $('#form-error').textContent = 'Preparando fotos…';
      const fotos = [];
      for (const f of archivos) fotos.push(await comprimir(f, 1280, 260, false));
      $('#form-error').textContent = '';
      return accion('galeria.guardar', { titulo: o.titulo, fecha: o.fecha, tipo: o.tipo, categoria: o.categoria, partidoId: o.partidoId, fotos }, 'Fotos publicadas');
    }),
    agregarFotos: async (d) => {
      const a = S.view.galeria.find((x) => x.id === d.id);
      const libres = C.MAX_FOTOS_ALBUM - a.fotos.length;
      const archivos = (await elegirArchivos(true)).slice(0, libres);
      if (!archivos.length) return;
      try {
        const fotos = [];
        for (const f of archivos) fotos.push(await comprimir(f, 1280, 260, false));
        accion('galeria.guardar', { id: a.id, titulo: a.titulo, fecha: a.fecha, tipo: a.tipo, categoria: a.categoria, partidoId: a.partidoId, fotos }, 'Foto agregada');
      } catch (e) { toast(e.message, 'error'); }
    },
    verFoto: (d) => {
      const a = S.view.galeria.find((x) => x.id === d.id);
      const puede = esDir() || a.autor === S.view.yo;
      abrirModal(a.titulo, '<img class="foto-grande" src="' + h(fotoUrl(d.foto)) + '" alt="">' +
        '<div class="modal-pie columna"><a class="btn ancho" href="' + h(fotoUrl(d.foto)) + '" download="' + h(a.titulo) + '.jpg">Descargar</a>' +
        (puede ? '<button class="btn ancho peligro" data-act="quitarFoto" data-id="' + a.id + '" data-foto="' + d.foto + '">Quitar foto</button>' : '') + '</div>');
    },
    quitarFoto: (d) => { if (confirm('¿Quitar esta foto?')) enviarConError(accion('galeria.quitarFoto', { id: d.id, foto: d.foto }, 'Foto quitada')); },
    borrarAlbum: (d) => { if (confirm('¿Eliminar el álbum con todas sus fotos?')) accion('galeria.eliminar', { id: d.id }, 'Álbum eliminado'); },

    // Inventario
    nuevoMaterial: () => abrirModal('Agregar material', formMaterial(), (o) => accion('inventario.guardar', o, 'Material agregado')),
    editarMaterial: (d) => abrirModal('Editar material', formMaterial(S.view.inventario.find((x) => x.id === d.id)), (o) => accion('inventario.guardar', o, 'Guardado')),
    borrarMaterial: (d) => { if (confirm('¿Eliminar este material del inventario?')) enviarConError(accion('inventario.eliminar', { id: d.id }, 'Eliminado')); },
    entregar: (d) => abrirModal('Entregar material', formEntrega(S.view.inventario.find((x) => x.id === d.id)), (o) => accion('prestamo.crear', o, 'Entrega registrada')),
    devolver: (d) => accion('prestamo.devolver', { id: d.id }, 'Devolución registrada'),

    // Reporte mensual
    reporte: () => abrirModal('Reporte mensual', formReporte()),
    reporteExcel: () => descargarExcel(reporteElegido()),
    reportePdf: () => { const r = reporteElegido(); cerrarModal(); imprimirReporte(r); },
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
    borrarConvenio: (d) => { if (confirm(esDir() ? '¿Eliminar este convenio?' : '¿Retirar esta propuesta?')) enviarConError(accion('convenio.eliminar', { id: d.id }, esDir() ? 'Eliminado' : 'Propuesta retirada')); },
    proponerConvenio: () => abrirModal('Proponer convenio', formConvenio(null, true), (o) => accion('convenio.proponer', o, 'Propuesta enviada a la directiva')),
    revisarConvenio: (d) => {
      if (d.ok) { accion('convenio.revisar', { id: d.id, aprobar: true }, 'Convenio publicado para todo el club'); return; }
      const nota = prompt('Motivo (lo verá quien lo propuso):', '');
      if (nota != null) accion('convenio.revisar', { id: d.id, aprobar: false, nota }, 'Propuesta rechazada');
    },

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
      Local.db = C.dbEjemplo(); try { Local.guardar(); } catch (e) { /* sin almacenamiento */ } Local.salir(); S.view = null; S.apo = null; render();
    },
  };

  function abrirEvaluacion(cat, fecha) {
    abrirModal('Registrar tests físicos', formEvaluacion(cat, fecha), (o) => {
      const registros = jugadores().filter((j) => j.categoria === o.cat).map((j) => {
        const valores = {};
        C.TESTS_FISICOS.forEach(([k]) => { valores[k] = o['v_' + j.rut + '_' + k]; });
        return { rut: j.rut, valores };
      });
      return accion('evaluacion.guardar', { fecha: o.fecha, registros }, 'Evaluación guardada');
    });
  }

  function abrirCitacion(id, todas) {
    const m = partido(id);
    abrirModal('Citar jugadores', formCitacion(m, todas), async (o) => {
      const noHab = (o.ruts || []).filter((r) => !hab(r));
      if (noHab.length && !confirm(noHab.map((r) => usuario(r).nombre).join(', ') + (noHab.length > 1 ? ' no están habilitados' : ' no está habilitado') + ' (federativo pendiente). ¿Citar igual?')) return false;
      const cuerpoTecnico = {};
      C.CUERPO_TECNICO.forEach(([k]) => { cuerpoTecnico[k] = o['ct_' + k] || ''; });
      const ok = await accion('citacion.guardar', { id: m.id, ruts: o.ruts || [], cuerpoTecnico }, 'Convocatoria guardada: ' + (o.ruts || []).length + ' jugadores');
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
    else if (k === 'catEst') { S.catEst = ev.target.value; render(); }
    else if (k === 'catFis') { S.catFis = ev.target.value; render(); }
    if (ev.target.hasAttribute && ev.target.hasAttribute('data-eval-cat')) abrirEvaluacion(ev.target.value, ev.target.form.fecha.value || HOY);
    if (ev.target.id === 'rep-mes' || ev.target.id === 'rep-anio') $('#rep-resumen').innerHTML = resumenReporte(reporteElegido());
    if (ev.target.hasAttribute && ev.target.hasAttribute('data-concepto-pago')) {
      const op = ev.target.selectedOptions[0];
      $('#campo-mes').hidden = ev.target.value !== 'cuota';
      ev.target.form.monto.value = op.dataset.monto;
    }
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

  document.addEventListener('keydown', (ev) => {
    // En el computador, Enter envía el mensaje y Shift+Enter hace un salto de línea.
    if (ev.target.id === 'chat-texto' && ev.key === 'Enter' && !ev.shiftKey && window.matchMedia('(min-width: 721px)').matches) {
      ev.preventDefault();
      ev.target.form.requestSubmit();
    }
  });

  document.addEventListener('input', (ev) => {
    if (ev.target.id === 'chat-texto') S.borrador[S.hilo] = ev.target.value;
    if (ev.target.dataset && ev.target.dataset.cambio === 'busqueda') { S.busqueda = ev.target.value; render(); }
    if (ev.target.id === 'login-rut' || ((ev.target.name === 'rut' || ev.target.name === 'apoderadoRut') && ev.target.form && ev.target.form.getAttribute('id') === 'form-modal' && ev.target.type !== 'hidden')) {
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
        S.sinHijos = null;
        recibir(await B().login(f.rut.value, f.clave.value));
        S.tab = null; render(); window.scrollTo(0, 0);
      } catch (e) {
        $('#login-error').textContent = e.message;
      } finally { btn.disabled = false; }
      return;
    }
    if (idForm === 'form-firma') {
      const o = datosForm(f);
      try {
        recibir(await llamar('documento.firmar', { id: o.id, aceptados: o.aceptados, nombreFirma: o.nombreFirma }));
        render(); window.scrollTo(0, 0); toast('Documento firmado. ¡Gracias!', 'ok');
      } catch (e) { $('#form-error').textContent = e.message; }
      return;
    }
    if (idForm === 'form-chat') {
      const t = f.texto.value.trim();
      if (!t) return;
      const ok = await accion('chat.enviar', { hilo: S.hilo, texto: t });
      if (ok) { delete S.borrador[S.hilo]; render(); irAlFinalChat(); }
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
    if (f.dataset.form === 'pagos') accion('config.guardar', { datosTransferencia: o.datosTransferencia }, 'Datos de transferencia guardados');
    if (f.dataset.form === 'recordatorios') {
      accion('config.guardar', { recordatorios: { activo: !!o.activo, diasAntes: o.diasAntes, atraso: !!o.atraso, push: !!o.push, correo: !!o.correo, whatsapp: !!o.whatsapp } }, 'Recordatorios guardados');
    }
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
      // El service worker recibe las notificaciones aunque la app esté cerrada.
      if ('serviceWorker' in navigator && window.isSecureContext) navigator.serviceWorker.register('sw.js').catch(() => {});
    } catch (e) {
      S.modo = 'local'; S.demo = true; Local.cargar();
    }
    try { recibir(await B().estado()); } catch (e) { S.view = null; }
    // Una notificación abre la app en su sección (#chat, #finanzas...).
    const ancla = location.hash.slice(1);
    if (ancla && NOMBRES[ancla]) S.tab = ancla;
    render();
  }

  // Con servidor, se buscan mensajes y cambios nuevos cada 15 segundos (sin interrumpir si hay una hoja abierta).
  setInterval(async () => {
    if (S.modo !== 'servidor' || !S.view || !$('#modal').hidden || document.visibilityState !== 'visible' || (S.piz && S.piz.reproduciendo)) return;
    try {
      const v = await B().estado();
      if (v && JSON.stringify(v) !== JSON.stringify(S.apo || S.view)) {
        const abajo = window.innerHeight + window.scrollY >= document.body.scrollHeight - 80;
        recibir(v); render();
        if (S.hilo && abajo) window.scrollTo(0, document.body.scrollHeight);
      }
    } catch (e) { /* sin conexión: se reintenta */ }
  }, 15000);

  iniciar();
})();
