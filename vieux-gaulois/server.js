/*
 * Servidor de Vieux Gaulois Handball. Sin dependencias: sólo Node.js 18+.
 * Guarda los datos en data/db.json (o en la ruta de DATA_FILE), las fotos en data/fotos/
 * y sirve la app de /public. También envía notificaciones push y los recordatorios de cuotas.
 *
 *   node server.js            -> http://localhost:3000
 *   PORT=8080 node server.js
 */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const core = require('./public/core.js');
const webpush = require('./lib/webpush.js');
const correo = require('./lib/correo.js');
const whatsapp = require('./lib/whatsapp.js');

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC = path.join(__dirname, 'public');
const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, 'data', 'db.json');
const DATA_DIR = path.dirname(DATA_FILE);
const FOTOS_DIR = path.join(DATA_DIR, 'fotos');
const PUSH_FILE = path.join(DATA_DIR, 'push.json');
const VAPID_FILE = path.join(DATA_DIR, 'vapid.json');
const VAPID_SUJETO = process.env.VAPID_SUJETO || 'mailto:contacto@vieuxgaulois.cl';
const SMTP = correo.configDesdeEntorno();
const WHATSAPP = whatsapp.configDesdeEntorno();
const SESION_HORAS = 12;
const MAX_INTENTOS = 5;
const BLOQUEO_MIN = 5;

const sha256 = async (s) => crypto.createHash('sha256').update(s).digest('hex');

// ---------- Datos ----------

function cargar() {
  let d;
  try {
    d = core.migrar(JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')));
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
    // Ambas parten con la cuenta de directiva "vieux" (clave vieuxg1234).
    d = process.env.SIN_DATOS_EJEMPLO ? core.dbVacia() : core.dbEjemplo();
  }
  core.cambioTemporada(d);
  guardar(d);
  return d;
}

// Las fotos nuevas pasan de la base a archivos; las borradas se eliminan del disco.
function guardarFotos(d) {
  const ids = Object.keys(d.fotos || {});
  if (ids.length) fs.mkdirSync(FOTOS_DIR, { recursive: true });
  ids.forEach((id) => {
    const m = /^data:image\/(jpeg|png|webp);base64,(.+)$/.exec(d.fotos[id]);
    if (m && /^f[0-9a-f]{24}$/.test(id)) fs.writeFileSync(path.join(FOTOS_DIR, id + '.' + m[1]), Buffer.from(m[2], 'base64'));
  });
  (d.fotosBorradas || []).forEach((id) => {
    if (!/^f[0-9a-f]{24}$/.test(id)) return;
    ['jpeg', 'png', 'webp'].forEach((ext) => fs.rm(path.join(FOTOS_DIR, id + '.' + ext), { force: true }, () => {}));
  });
  d.fotos = {};
  d.fotosBorradas = [];
}

function guardar(d) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  guardarFotos(d);
  const tmp = DATA_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(d, null, 1));
  fs.renameSync(tmp, DATA_FILE);
}

function leerJson(archivo, porDefecto) {
  try { return JSON.parse(fs.readFileSync(archivo, 'utf8')); } catch (e) { return porDefecto; }
}

function escribirJson(archivo, datos) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(archivo, JSON.stringify(datos));
}

let db = cargar();

// ---------- Notificaciones push ----------

let vapid = leerJson(VAPID_FILE, null);
if (!vapid) { vapid = webpush.crearClavesVapid(); escribirJson(VAPID_FILE, vapid); }
let suscripciones = leerJson(PUSH_FILE, {}); // rut -> [suscripción]

async function enviarPush(ruts, datos) {
  let cambio = false;
  await Promise.all(ruts.map(async (rut) => {
    const subs = suscripciones[rut] || [];
    await Promise.all(subs.map(async (sub) => {
      try {
        const st = await webpush.enviar(sub, datos, vapid, VAPID_SUJETO);
        if (st === 404 || st === 410) { sub.vencida = true; cambio = true; }
      } catch (e) { /* sin conexión: se pierde este aviso */ }
    }));
    if (subs.some((s) => s.vencida)) suscripciones[rut] = subs.filter((s) => !s.vencida);
  }));
  if (cambio) escribirJson(PUSH_FILE, suscripciones);
}

function notificar(lista) {
  (lista || []).forEach((n) => enviarPush(n.para, { titulo: n.titulo, cuerpo: n.cuerpo, tab: n.tab }).catch(() => {}));
}

// ---------- Recordatorios de cuotas (se revisan cada hora) ----------

async function revisarRecordatorios() {
  core.cambioTemporada(db);
  const cfg = db.config.recordatorios || {};
  const lista = core.recordatoriosPendientes(db);
  if (!lista.length) return;
  const registro = [];
  for (const r of lista) {
    const canales = [];
    if (cfg.push !== false) {
      const ruts = Array.from(new Set([r.rut].concat(r.destinatarios.map((d) => d.rut))));
      if (ruts.some((x) => (suscripciones[x] || []).length)) { await enviarPush(ruts, { titulo: r.titulo, cuerpo: r.texto, tab: 'finanzas' }); canales.push('push'); }
    }
    for (const d of r.destinatarios) {
      if (cfg.correo && SMTP && d.email) {
        try { await correo.enviarCorreo(SMTP, d.email, r.titulo + ' · Vieux Gaulois', 'Hola ' + d.nombre.split(/\s+/)[0] + ',\n\n' + r.texto.replace(/^Hola, /, '') + '\n\nVieux Gaulois Handball'); canales.push('correo'); } catch (e) { console.error('Correo a ' + d.email + ': ' + e.message); }
      }
      if (cfg.whatsapp && WHATSAPP && d.telefono) {
        try { await whatsapp.enviarWhatsApp(WHATSAPP, d.telefono, r.texto); canales.push('whatsapp'); } catch (e) { console.error('WhatsApp a ' + d.telefono + ': ' + e.message); }
      }
    }
    core.marcarRecordatorio(db, r.clave);
    registro.push({ fecha: core.hoyISO(), nombre: r.nombre, tipo: r.tipo, mes: r.mes, canales: Array.from(new Set(canales)) });
  }
  db.recordatoriosLog = (db.recordatoriosLog || []).concat(registro).slice(-200);
  guardar(db);
}

// ---------- Sesiones ----------

const sesiones = new Map(); // token -> { rut, expira }
const intentos = new Map(); // rut -> { n, hasta }

// La vista de cada usuario, más qué canales de aviso tiene configurados el servidor.
function vista(rut) {
  const v = core.viewFor(db, rut);
  if (v) v.servidor = { push: true, correo: !!SMTP, whatsapp: !!WHATSAPP };
  return v;
}

function crearSesion(rut) {
  const token = crypto.randomBytes(24).toString('hex');
  sesiones.set(token, { rut, expira: Date.now() + SESION_HORAS * 3600e3 });
  return token;
}

function sesionDe(req) {
  // Las imágenes (<img>) no pueden enviar encabezados: el token viaja en ?t=.
  const m = /^Bearer (\w+)$/.exec(req.headers.authorization || '') || /^(\w+)$/.exec(new URL(req.url, 'http://x').searchParams.get('t') || '');
  const s = m && sesiones.get(m[1]);
  if (!s) return null;
  if (s.expira < Date.now()) { sesiones.delete(m[1]); return null; }
  const u = db.usuarios.find((x) => x.rut === s.rut);
  if (!u || u.activo === false) { sesiones.delete(m[1]); return null; }
  return { token: m[1], rut: s.rut };
}

// ---------- HTTP ----------

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json',
};

function json(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
}

function leerCuerpo(req) {
  return new Promise((resolve, reject) => {
    let datos = '';
    req.on('data', (c) => {
      datos += c;
      // Hasta 3 fotos comprimidas por álbum.
      if (datos.length > 3e6) { reject(new Error('Solicitud demasiado grande')); req.destroy(); }
    });
    req.on('end', () => {
      try { resolve(datos ? JSON.parse(datos) : {}); } catch (e) { reject(new Error('JSON no válido')); }
    });
  });
}

function estatico(req, res) {
  let rel = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (rel === '/') rel = '/index.html';
  const archivo = path.normalize(path.join(PUBLIC, rel));
  if (!archivo.startsWith(PUBLIC + path.sep)) { res.writeHead(403); return res.end(); }
  fs.readFile(archivo, (e, buf) => {
    if (e) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('No encontrado'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(archivo)] || 'application/octet-stream' });
    res.end(buf);
  });
}

async function api(req, res, ruta) {
  if (ruta === '/api/ping') {
    // demo = todavía existe la cuenta de ejemplo con su clave inicial: se muestran las cuentas de prueba en el login.
    const demo = db.usuarios.some((u) => u.rut === '20123456-5' && !u.claveHash && u.activo !== false);
    return json(res, 200, { ok: true, club: db.config.club, demo });
  }

  if (ruta === '/api/login' && req.method === 'POST') {
    const { rut, clave } = await leerCuerpo(req);
    const r = core.idDeIngreso(rut);
    if (!r) return json(res, 400, { error: 'Ingresa tu RUT (jugadores) o tu usuario (entrenadores y directiva)' });
    const bloqueo = intentos.get(r);
    if (bloqueo && bloqueo.hasta > Date.now()) {
      return json(res, 429, { error: 'Demasiados intentos. Espera ' + BLOQUEO_MIN + ' minutos.' });
    }
    const u = db.usuarios.find((x) => x.rut === r);
    if (!(await core.verificarClave(u, clave, sha256))) {
      // Si un bloqueo anterior ya venció, el conteo parte de cero.
      const n = (!bloqueo || (bloqueo.hasta && bloqueo.hasta <= Date.now()) ? 0 : bloqueo.n) + 1;
      intentos.set(r, { n, hasta: n >= MAX_INTENTOS ? Date.now() + BLOQUEO_MIN * 60e3 : 0 });
      return json(res, 401, { error: 'Usuario o clave incorrectos' });
    }
    intentos.delete(r);
    return json(res, 200, { token: crearSesion(r), view: vista(r) });
  }

  if (ruta === '/api/push/clave') return json(res, 200, { clave: vapid.publica });

  const s = sesionDe(req);
  if (!s) return json(res, 401, { error: 'Sesión expirada, vuelve a ingresar' });
  if (core.cambioTemporada(db)) guardar(db);

  const foto = /^\/api\/foto\/(f[0-9a-f]{24})$/.exec(ruta);
  if (foto && req.method === 'GET') {
    for (const [ext, tipo] of [['jpeg', 'image/jpeg'], ['png', 'image/png'], ['webp', 'image/webp']]) {
      const archivo = path.join(FOTOS_DIR, foto[1] + '.' + ext);
      if (fs.existsSync(archivo)) {
        res.writeHead(200, { 'Content-Type': tipo, 'Cache-Control': 'private, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff' });
        return fs.createReadStream(archivo).pipe(res);
      }
    }
    res.writeHead(404);
    return res.end();
  }

  if (ruta === '/api/push/suscribir' && req.method === 'POST') {
    const { sub } = await leerCuerpo(req);
    if (!sub || !sub.keys || !webpush.suscripcionValida(sub)) return json(res, 400, { error: 'Suscripción no válida' });
    const lista = (suscripciones[s.rut] || []).filter((x) => x.endpoint !== sub.endpoint);
    lista.push({ endpoint: sub.endpoint, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth } });
    suscripciones[s.rut] = lista.slice(-5);
    escribirJson(PUSH_FILE, suscripciones);
    return json(res, 200, { ok: true });
  }

  if (ruta === '/api/push/quitar' && req.method === 'POST') {
    const { endpoint } = await leerCuerpo(req);
    suscripciones[s.rut] = (suscripciones[s.rut] || []).filter((x) => x.endpoint !== endpoint);
    escribirJson(PUSH_FILE, suscripciones);
    return json(res, 200, { ok: true });
  }

  if (ruta === '/api/state' && req.method === 'GET') return json(res, 200, { view: vista(s.rut) });

  if (ruta === '/api/logout' && req.method === 'POST') {
    sesiones.delete(s.token);
    return json(res, 200, { ok: true });
  }

  if (ruta === '/api/clave' && req.method === 'POST') {
    const { actual, nueva } = await leerCuerpo(req);
    const copia = core.clone(db);
    await core.cambiarClave(copia, s.rut, actual, nueva, sha256);
    db = copia;
    guardar(db);
    return json(res, 200, { view: vista(s.rut) });
  }

  if (ruta === '/api/action' && req.method === 'POST') {
    const accion = await core.prepararAccion(await leerCuerpo(req), sha256);
    // Se aplica sobre una copia: si falla, la base no queda a medias.
    const copia = core.clone(db);
    core.applyAction(copia, s.rut, accion);
    const avisos = copia.notificar;
    copia.notificar = [];
    db = copia;
    guardar(db);
    notificar(avisos);
    return json(res, 200, { view: vista(s.rut) });
  }

  return json(res, 404, { error: 'Ruta no encontrada' });
}

const server = http.createServer(async (req, res) => {
  const ruta = new URL(req.url, 'http://x').pathname;
  try {
    if (ruta.startsWith('/api/')) return await api(req, res, ruta);
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end(); }
    estatico(req, res);
  } catch (e) {
    if (!e.publico) console.error(e);
    json(res, e.publico ? 400 : 500, { error: e.publico ? e.message : (e.message === 'JSON no válido' || e.message === 'Solicitud demasiado grande' ? e.message : 'Error interno') });
  }
});

if (require.main === module) {
  server.listen(PORT, () => console.log('Vieux Gaulois Handball en http://localhost:' + PORT + '  (datos: ' + DATA_FILE + ')' +
    '\nAvisos: push sí · correo ' + (SMTP ? 'sí' : 'no (falta SMTP_HOST)') + ' · WhatsApp ' + (WHATSAPP ? 'sí' : 'no (falta WHATSAPP_TOKEN)')));
  setTimeout(() => revisarRecordatorios().catch((e) => console.error(e)), 10e3).unref();
  setInterval(() => revisarRecordatorios().catch((e) => console.error(e)), 3600e3).unref();
}

module.exports = server;
module.exports.revisarRecordatorios = revisarRecordatorios;
module.exports.estado = () => ({ db, suscripciones });
