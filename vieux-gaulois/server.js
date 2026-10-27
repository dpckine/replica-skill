/*
 * Servidor de Vieux Gaulois Handball. Sin dependencias: sólo Node.js 18+.
 * Guarda los datos en data/db.json (o en la ruta de DATA_FILE) y sirve la app de /public.
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

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC = path.join(__dirname, 'public');
const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, 'data', 'db.json');
const SESION_HORAS = 12;
const MAX_INTENTOS = 5;
const BLOQUEO_MIN = 5;

const sha256 = async (s) => crypto.createHash('sha256').update(s).digest('hex');

// ---------- Datos ----------

function cargar() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
    const db = process.env.SIN_DATOS_EJEMPLO ? core.dbVacia() : core.dbEjemplo();
    if (process.env.SIN_DATOS_EJEMPLO) {
      // Primera cuenta de directiva, definida por variables de entorno.
      const rut = core.normalizarRut(process.env.ADMIN_RUT || '');
      if (!rut) throw new Error('Con SIN_DATOS_EJEMPLO debes definir ADMIN_RUT (RUT de la primera cuenta de directiva)');
      db.usuarios.push({ rut, rol: 'directiva', nombre: process.env.ADMIN_NOMBRE || 'Directiva', activo: true, creado: core.hoyISO() });
    }
    guardar(db);
    return db;
  }
}

function guardar(db) {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  const tmp = DATA_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 1));
  fs.renameSync(tmp, DATA_FILE);
}

let db = cargar();

// ---------- Sesiones ----------

const sesiones = new Map(); // token -> { rut, expira }
const intentos = new Map(); // rut -> { n, hasta }

function crearSesion(rut) {
  const token = crypto.randomBytes(24).toString('hex');
  sesiones.set(token, { rut, expira: Date.now() + SESION_HORAS * 3600e3 });
  return token;
}

function sesionDe(req) {
  const m = /^Bearer (\w+)$/.exec(req.headers.authorization || '');
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
      if (datos.length > 1e6) { reject(new Error('Solicitud demasiado grande')); req.destroy(); }
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
    const demo = db.usuarios.some((u) => u.rut === '11111111-1' && !u.claveHash && u.activo !== false);
    return json(res, 200, { ok: true, club: db.config.club, demo });
  }

  if (ruta === '/api/login' && req.method === 'POST') {
    const { rut, clave } = await leerCuerpo(req);
    const r = core.normalizarRut(rut);
    if (!r) return json(res, 400, { error: 'RUT no válido' });
    const bloqueo = intentos.get(r);
    if (bloqueo && bloqueo.hasta > Date.now()) {
      return json(res, 429, { error: 'Demasiados intentos. Espera ' + BLOQUEO_MIN + ' minutos.' });
    }
    const u = db.usuarios.find((x) => x.rut === r);
    if (!(await core.verificarClave(u, clave, sha256))) {
      // Si un bloqueo anterior ya venció, el conteo parte de cero.
      const n = (!bloqueo || (bloqueo.hasta && bloqueo.hasta <= Date.now()) ? 0 : bloqueo.n) + 1;
      intentos.set(r, { n, hasta: n >= MAX_INTENTOS ? Date.now() + BLOQUEO_MIN * 60e3 : 0 });
      return json(res, 401, { error: 'RUT o clave incorrectos' });
    }
    intentos.delete(r);
    return json(res, 200, { token: crearSesion(r), view: core.viewFor(db, r) });
  }

  const s = sesionDe(req);
  if (!s) return json(res, 401, { error: 'Sesión expirada, vuelve a ingresar' });

  if (ruta === '/api/state' && req.method === 'GET') return json(res, 200, { view: core.viewFor(db, s.rut) });

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
    return json(res, 200, { view: core.viewFor(db, s.rut) });
  }

  if (ruta === '/api/action' && req.method === 'POST') {
    const accion = await leerCuerpo(req);
    // Se aplica sobre una copia: si falla, la base no queda a medias.
    const copia = core.clone(db);
    core.applyAction(copia, s.rut, accion);
    db = copia;
    guardar(db);
    return json(res, 200, { view: core.viewFor(db, s.rut) });
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
  server.listen(PORT, () => console.log('Vieux Gaulois Handball en http://localhost:' + PORT + '  (datos: ' + DATA_FILE + ')'));
}

module.exports = server;
