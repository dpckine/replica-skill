'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vg-'));
process.env.DATA_FILE = path.join(dir, 'db.json');
const server = require('../server.js');
const C = require('../public/core.js');

test('API: login con RUT y 4 dígitos, acciones con permisos y bloqueo por intentos', async (t) => {
  await new Promise((r) => server.listen(0, r));
  t.after(() => server.close());
  const base = 'http://127.0.0.1:' + server.address().port;
  const pedir = async (ruta, cuerpo, token) => {
    const r = await fetch(base + ruta, {
      method: cuerpo ? 'POST' : 'GET',
      headers: Object.assign({ 'Content-Type': 'application/json' }, token ? { Authorization: 'Bearer ' + token } : {}),
      body: cuerpo ? JSON.stringify(cuerpo) : undefined,
    });
    return { status: r.status, body: await r.json() };
  };

  assert.strictEqual((await pedir('/api/ping')).body.demo, true);
  const jug = C.rutDesdeCuerpo(20123456);
  const login = await pedir('/api/login', { rut: C.formatearRut(jug), clave: '2012' });
  assert.strictEqual(login.status, 200);
  const tok = login.body.token;
  assert.strictEqual(login.body.view.yo, jug);
  const cons = login.body.view.documentos.find((d) => d.id === 'consentimiento');
  assert.strictEqual((await pedir('/api/action', { type: 'documento.firmar', payload: { id: cons.id, aceptados: cons.puntos.map((_, i) => i), nombreFirma: 'Tomás Rojas' } }, tok)).status, 200);

  const dir = await pedir('/api/login', { rut: 'vieux', clave: 'vieuxg1234' });
  assert.strictEqual(dir.status, 200);
  assert.strictEqual(dir.body.view.yo, 'usr:vieux');
  const creado = await pedir('/api/action', { type: 'staff.crear', payload: { usuario: 'profe', clave: 'profe2026', nombre: 'Profe', rol: 'entrenador' } }, dir.body.token);
  assert.strictEqual(creado.status, 200);
  assert.strictEqual((await pedir('/api/login', { rut: 'profe', clave: 'profe2026' })).status, 200);
  assert.ok(!fs.readFileSync(process.env.DATA_FILE, 'utf8').includes('profe2026'));

  const prohibido = await pedir('/api/action', { type: 'pago.marcar', payload: { rut: jug, anio: 2026, mes: 1, pagado: true } }, tok);
  assert.strictEqual(prohibido.status, 400);
  assert.match(prohibido.body.error, /permiso/);

  const ok = await pedir('/api/action', { type: 'lesion.crear', payload: { zona: 'Rodilla', tipo: 'Dolor', intensidad: 4 } }, tok);
  assert.strictEqual(ok.status, 200);
  assert.ok(JSON.parse(fs.readFileSync(process.env.DATA_FILE, 'utf8')).lesiones.some((l) => l.zona === 'Rodilla'));

  assert.strictEqual((await pedir('/api/state', null, 'malo')).status, 401);

  const otro = C.rutDesdeCuerpo(19876543);
  for (let i = 0; i < 5; i++) assert.strictEqual((await pedir('/api/login', { rut: otro, clave: '0000' })).status, 401);
  assert.strictEqual((await pedir('/api/login', { rut: otro, clave: '1987' })).status, 429);

  const est = await fetch(base + '/');
  assert.strictEqual(est.status, 200);
  assert.strictEqual((await fetch(base + '/..%2Fserver.js')).status, 403);
});

test('Web Push: cifrado aes128gcm y firma VAPID verificables', async () => {
  const webpush = require('../lib/webpush.js');
  const crypto = require('crypto');
  const ua = crypto.createECDH('prime256v1');
  ua.generateKeys();
  const auth = webpush.b64u(crypto.randomBytes(16));
  const cuerpo = webpush.cifrar('{"titulo":"Hola ñandú"}', webpush.b64u(ua.getPublicKey()), auth);
  assert.strictEqual(cuerpo.readUInt32BE(16), 4096);
  assert.strictEqual(webpush.descifrar(cuerpo, ua.getPrivateKey(), auth), '{"titulo":"Hola ñandú"}');
  const claves = webpush.crearClavesVapid();
  const jwt = webpush.jwtVapid('https://fcm.googleapis.com/fcm/send/abc', claves, 'mailto:a@b.cl');
  const [cab, datos, firma] = jwt.split('.');
  assert.strictEqual(JSON.parse(Buffer.from(datos, 'base64url')).aud, 'https://fcm.googleapis.com');
  const pub = crypto.createPublicKey({ format: 'jwk', key: { kty: 'EC', crv: 'P-256', x: webpush.b64u(webpush.desdeB64u(claves.publica).subarray(1, 33)), y: webpush.b64u(webpush.desdeB64u(claves.publica).subarray(33)) } });
  assert.ok(crypto.verify('sha256', Buffer.from(cab + '.' + datos), { key: pub, dsaEncoding: 'ieee-p1363' }, Buffer.from(firma, 'base64url')));
  const sub = { endpoint: 'https://fcm.googleapis.com/fcm/send/x', keys: { p256dh: webpush.b64u(ua.getPublicKey()), auth } };
  assert.ok(webpush.suscripcionValida(sub));
  assert.ok(!webpush.suscripcionValida(Object.assign({}, sub, { endpoint: 'https://169.254.169.254/latest' })));
  assert.ok(!webpush.suscripcionValida(Object.assign({}, sub, { endpoint: 'http://fcm.googleapis.com/x' })));
});

test('Correo SMTP: conversa con el servidor y envía el texto en UTF-8', async (t) => {
  const net = require('net');
  const correo = require('../lib/correo.js');
  const recibido = [];
  const srv = net.createServer((c) => {
    let buf = '', enDatos = false;
    c.write('220 prueba\r\n');
    c.on('data', (d) => {
      buf += d;
      let i;
      while ((i = buf.indexOf('\r\n')) >= 0) {
        const l = buf.slice(0, i); buf = buf.slice(i + 2);
        if (enDatos) { if (l === '.') { enDatos = false; c.write('250 ok\r\n'); } else recibido.push(l); continue; }
        recibido.push('> ' + l);
        if (/^EHLO/.test(l)) c.write('250-prueba\r\n250 AUTH LOGIN\r\n');
        else if (l === 'AUTH LOGIN') c.write('334 VXNlcm5hbWU6\r\n');
        else if (recibido.filter((x) => x.startsWith('> ')).length <= 4 && !/^(MAIL|RCPT|DATA|QUIT)/.test(l)) c.write(l === Buffer.from('clave').toString('base64') ? '235 ok\r\n' : '334 UGFzc3dvcmQ6\r\n');
        else if (l === 'DATA') { enDatos = true; c.write('354 go\r\n'); }
        else if (l === 'QUIT') { c.write('221 chao\r\n'); c.end(); }
        else c.write('250 ok\r\n');
      }
    });
  });
  await new Promise((r) => srv.listen(0, r));
  t.after(() => srv.close());
  const cfg = { host: '127.0.0.1', port: srv.address().port, secure: false, inseguro: true, user: 'yo', pass: 'clave', from: 'club@vieux.cl', nombre: 'Vieux Gaulois' };
  await correo.enviarCorreo(cfg, 'apoderada@correo.cl', 'Cuota por vencer · ñ', 'Hola, tu cuota de noviembre vence el 10/11.');
  assert.ok(recibido.includes('> MAIL FROM:<club@vieux.cl>') && recibido.includes('> RCPT TO:<apoderada@correo.cl>'));
  const cuerpo = recibido.slice(recibido.indexOf('Content-Transfer-Encoding: base64') + 2).join('');
  assert.match(Buffer.from(cuerpo, 'base64').toString('utf8'), /noviembre vence el 10\/11/);
  assert.ok(recibido.some((l) => l.startsWith('Subject: =?UTF-8?B?')));
  await assert.rejects(correo.enviarCorreo(Object.assign({}, cfg, { inseguro: false }), 'a@b.cl', 'x', 'y'), /STARTTLS/);
  await assert.rejects(correo.enviarCorreo(cfg, 'no es correo\r\nRCPT', 'x', 'y'), /no válido/);
});

test('WhatsApp: normaliza celulares chilenos', () => {
  const w = require('../lib/whatsapp.js');
  assert.strictEqual(w.normalizarTelefono('+56 9 1234 5678'), '56912345678');
  assert.strictEqual(w.normalizarTelefono('912345678'), '56912345678');
  assert.strictEqual(w.normalizarTelefono('123'), '');
  assert.strictEqual(w.cuerpoMensaje({ plantilla: 'recordatorio_cuota', idioma: 'es' }, '912345678', 'Hola').template.components[0].parameters[0].text, 'Hola');
});

test('API: fotos en disco, push al citar y recordatorios', async (t) => {
  await new Promise((r) => server.listen(0, r));
  t.after(() => server.close());
  const base = 'http://127.0.0.1:' + server.address().port;
  const pedir = async (ruta, cuerpo, token) => {
    const r = await fetch(base + ruta, { method: cuerpo ? 'POST' : 'GET', headers: Object.assign({ 'Content-Type': 'application/json' }, token ? { Authorization: 'Bearer ' + token } : {}), body: cuerpo ? JSON.stringify(cuerpo) : undefined });
    return { status: r.status, body: await r.json().catch(() => null) };
  };
  const ent = (await pedir('/api/login', { rut: 'jorge', clave: 'jorge1234' })).body.token;
  const img = 'data:image/jpeg;base64,' + Buffer.alloc(2000, 9).toString('base64');
  const r = await pedir('/api/action', { type: 'galeria.guardar', payload: { titulo: 'Plantel', fecha: C.hoyISO(), tipo: 'plantel', fotos: [img] } }, ent);
  assert.strictEqual(r.status, 200);
  const id = r.body.view.galeria[0].fotos[0];
  const enDisco = JSON.parse(fs.readFileSync(process.env.DATA_FILE, 'utf8'));
  assert.deepStrictEqual(enDisco.fotos, {});
  assert.ok(fs.existsSync(path.join(dir, 'fotos', id + '.jpeg')));
  assert.strictEqual((await fetch(base + '/api/foto/' + id)).status, 401);
  const f = await fetch(base + '/api/foto/' + id + '?t=' + ent);
  assert.strictEqual(f.headers.get('content-type'), 'image/jpeg');
  assert.strictEqual(Buffer.from(await f.arrayBuffer()).length, 2000);
  assert.strictEqual((await pedir('/api/push/suscribir', { sub: { endpoint: 'https://evil.example/x', keys: { p256dh: 'a', auth: 'b' } } }, ent)).status, 400);

  // Push real a un servicio falso: llega cifrado al jugador citado.
  const webpush = require('../lib/webpush.js');
  const crypto = require('crypto');
  const ua = crypto.createECDH('prime256v1'); ua.generateKeys();
  const auth = webpush.b64u(crypto.randomBytes(16));
  const llegados = [];
  const http = require('http');
  const falso = http.createServer((req, res) => {
    const partes = []; req.on('data', (d) => partes.push(d));
    req.on('end', () => { llegados.push({ auth: req.headers.authorization, datos: JSON.parse(webpush.descifrar(Buffer.concat(partes), ua.getPrivateKey(), auth)) }); res.writeHead(201); res.end(); });
  });
  await new Promise((r2) => falso.listen(0, r2));
  t.after(() => falso.close());
  const renato = C.rutDesdeCuerpo(24678901);
  server.estado().suscripciones[renato] = [{ endpoint: 'http://127.0.0.1:' + falso.address().port + '/push', keys: { p256dh: webpush.b64u(ua.getPublicKey()), auth } }];
  const v = (await pedir('/api/state', null, ent)).body.view;
  const m = v.partidos.find((x) => x.rival === 'UdeC');
  await pedir('/api/action', { type: 'citacion.guardar', payload: { id: m.id, ruts: Object.keys(m.citados).filter((x) => x !== renato) } }, ent);
  await pedir('/api/action', { type: 'citacion.guardar', payload: { id: m.id, ruts: Object.keys(m.citados) } }, ent);
  for (let i = 0; i < 50 && !llegados.length; i++) await new Promise((r2) => setTimeout(r2, 20));
  assert.strictEqual(llegados.length, 1);
  assert.match(llegados[0].datos.titulo, /Convocatoria: Cadete Masculino vs UdeC/);
  assert.match(llegados[0].auth, /^vapid t=.+, k=/);

  // Recordatorios: se envían una vez y quedan registrados.
  const est = server.estado();
  const hoy = new Date();
  est.db.config.mesesCobro = [hoy.getMonth()];
  est.db.config.diaVencimiento = Math.min(28, hoy.getDate() + 1);
  est.db.config.recordatorios = { activo: true, diasAntes: 3, atraso: false, push: true, correo: true, whatsapp: false };
  delete est.db.pagos[renato][hoy.getFullYear()][hoy.getMonth()];
  llegados.length = 0;
  await server.revisarRecordatorios();
  assert.ok(llegados.some((x) => x.datos.titulo === 'Cuota por vencer'));
  assert.ok(server.estado().db.recordatoriosLog.some((x) => x.nombre === 'Renato Flores' && x.canales.includes('push')));
  const antes = llegados.length;
  await server.revisarRecordatorios();
  assert.strictEqual(llegados.length, antes);
});
