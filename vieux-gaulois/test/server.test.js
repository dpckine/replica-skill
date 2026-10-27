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
