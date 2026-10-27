/*
 * Notificaciones Web Push sin dependencias (RFC 8291 cifrado aes128gcm + RFC 8292 VAPID).
 * Las claves VAPID se crean una vez y se guardan junto a los datos (ver server.js).
 */
'use strict';
const crypto = require('crypto');

const b64u = (buf) => Buffer.from(buf).toString('base64url');
const desdeB64u = (s) => Buffer.from(String(s), 'base64url');

function crearClavesVapid() {
  const ecdh = crypto.createECDH('prime256v1');
  ecdh.generateKeys();
  return { publica: b64u(ecdh.getPublicKey()), privada: b64u(ecdh.getPrivateKey()) };
}

// HKDF de un solo bloque (alcanza para 16 y 32 bytes).
function hkdf(salt, ikm, info, largo) {
  const prk = crypto.createHmac('sha256', salt).update(ikm).digest();
  return crypto.createHmac('sha256', prk).update(Buffer.concat([info, Buffer.from([1])])).digest().subarray(0, largo);
}

// Cifra el contenido para una suscripción (p256dh y auth en base64url). "fijo" sólo se usa en pruebas.
function cifrar(contenido, p256dh, auth, fijo) {
  fijo = fijo || {};
  const uaPub = desdeB64u(p256dh);
  const secreto = desdeB64u(auth);
  const as = crypto.createECDH('prime256v1');
  if (fijo.privada) as.setPrivateKey(fijo.privada); else as.generateKeys();
  const asPub = as.getPublicKey();
  const ikm = hkdf(secreto, as.computeSecret(uaPub), Buffer.concat([Buffer.from('WebPush: info\0'), uaPub, asPub]), 32);
  const salt = fijo.salt || crypto.randomBytes(16);
  const cek = hkdf(salt, ikm, Buffer.from('Content-Encoding: aes128gcm\0'), 16);
  const nonce = hkdf(salt, ikm, Buffer.from('Content-Encoding: nonce\0'), 12);
  const c = crypto.createCipheriv('aes-128-gcm', cek, nonce);
  // Un solo registro: contenido + delimitador 0x02.
  const cuerpo = Buffer.concat([c.update(Buffer.concat([Buffer.from(contenido), Buffer.from([2])])), c.final(), c.getAuthTag()]);
  const rs = Buffer.alloc(4);
  rs.writeUInt32BE(4096);
  return Buffer.concat([salt, rs, Buffer.from([asPub.length]), asPub, cuerpo]);
}

// Lo inverso, con la clave privada del navegador: sirve para probar el cifrado.
function descifrar(cuerpo, uaPrivada, auth) {
  const salt = cuerpo.subarray(0, 16);
  const idlen = cuerpo[20];
  const asPub = cuerpo.subarray(21, 21 + idlen);
  const ua = crypto.createECDH('prime256v1');
  ua.setPrivateKey(uaPrivada);
  const uaPub = ua.getPublicKey();
  const ikm = hkdf(desdeB64u(auth), ua.computeSecret(asPub), Buffer.concat([Buffer.from('WebPush: info\0'), uaPub, asPub]), 32);
  const cek = hkdf(salt, ikm, Buffer.from('Content-Encoding: aes128gcm\0'), 16);
  const nonce = hkdf(salt, ikm, Buffer.from('Content-Encoding: nonce\0'), 12);
  const datos = cuerpo.subarray(21 + idlen);
  const d = crypto.createDecipheriv('aes-128-gcm', cek, nonce);
  d.setAuthTag(datos.subarray(datos.length - 16));
  const plano = Buffer.concat([d.update(datos.subarray(0, datos.length - 16)), d.final()]);
  return plano.subarray(0, plano.lastIndexOf(2)).toString();
}

function jwtVapid(endpoint, claves, sujeto) {
  const cab = b64u(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
  const cuerpo = b64u(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: sujeto }));
  const pub = desdeB64u(claves.publica);
  const key = crypto.createPrivateKey({ format: 'jwk', key: { kty: 'EC', crv: 'P-256', d: claves.privada, x: b64u(pub.subarray(1, 33)), y: b64u(pub.subarray(33, 65)) } });
  const firma = crypto.sign('sha256', Buffer.from(cab + '.' + cuerpo), { key, dsaEncoding: 'ieee-p1363' });
  return cab + '.' + cuerpo + '.' + b64u(firma);
}

// Devuelve el código HTTP del servicio push: 201 = enviado; 404 o 410 = la suscripción ya no existe.
async function enviar(sub, datos, claves, sujeto) {
  const r = await fetch(sub.endpoint, {
    method: 'POST',
    headers: {
      'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream', TTL: '86400', Urgency: 'normal',
      Authorization: 'vapid t=' + jwtVapid(sub.endpoint, claves, sujeto) + ', k=' + claves.publica,
    },
    body: cifrar(JSON.stringify(datos), sub.keys.p256dh, sub.keys.auth),
  });
  return r.status;
}

// Servicios push de los navegadores. Evita que una suscripción falsa haga que el servidor llame a cualquier URL.
const SERVICIOS = ['fcm.googleapis.com', 'android.googleapis.com', 'updates.push.services.mozilla.com', 'push.services.mozilla.com', 'push.apple.com', 'notify.windows.com'];
function suscripcionValida(sub) {
  try {
    const u = new URL(sub.endpoint);
    const host = u.hostname.toLowerCase();
    return u.protocol === 'https:' && SERVICIOS.some((s) => host === s || host.endsWith('.' + s))
      && desdeB64u(sub.keys.p256dh).length === 65 && desdeB64u(sub.keys.auth).length >= 16;
  } catch (e) {
    return false;
  }
}

module.exports = { crearClavesVapid, cifrar, descifrar, jwtVapid, enviar, suscripcionValida, b64u, desdeB64u };
