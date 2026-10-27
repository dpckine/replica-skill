/*
 * Envío de correos por SMTP sin dependencias (TLS directo en el puerto 465 o STARTTLS en el 587).
 * Se configura con variables de entorno; ver README.
 */
'use strict';
const net = require('net');
const tls = require('tls');
const os = require('os');

function configDesdeEntorno(env) {
  env = env || process.env;
  if (!env.SMTP_HOST || !env.SMTP_FROM) return null;
  const port = Number(env.SMTP_PORT) || 465;
  return {
    host: env.SMTP_HOST, port, secure: env.SMTP_SECURE ? env.SMTP_SECURE !== 'false' : port === 465,
    user: env.SMTP_USER || '', pass: env.SMTP_PASS || '', from: env.SMTP_FROM, nombre: env.SMTP_NOMBRE || 'Vieux Gaulois Handball',
    inseguro: env.SMTP_SIN_TLS === '1', // sólo para pruebas locales
  };
}

const limpio = (s) => String(s || '').replace(/[\r\n]+/g, ' ').trim();
const b64 = (s) => Buffer.from(String(s), 'utf8').toString('base64');
const encabezado = (s) => (/^[\x20-\x7e]*$/.test(s) ? s : '=?UTF-8?B?' + b64(s) + '?=');

function mensaje(cfg, para, asunto, texto) {
  const cuerpo = b64(texto).replace(/.{1,76}/g, '$&\r\n');
  return [
    'From: ' + encabezado(limpio(cfg.nombre)) + ' <' + limpio(cfg.from) + '>',
    'To: <' + limpio(para) + '>',
    'Subject: ' + encabezado(limpio(asunto)),
    'Date: ' + new Date().toUTCString(),
    'Message-ID: <' + Date.now().toString(36) + Math.random().toString(36).slice(2) + '@' + limpio(cfg.from).split('@').pop() + '>',
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=utf-8',
    'Content-Transfer-Encoding: base64',
    '', cuerpo,
  ].join('\r\n');
}

function conversar(socket) {
  let buf = '';
  let esperando = null;
  const lineas = [];
  const revisar = () => {
    let i;
    while ((i = buf.indexOf('\r\n')) >= 0) {
      const l = buf.slice(0, i);
      buf = buf.slice(i + 2);
      lineas.push(l);
      if (/^\d{3} /.test(l) || /^\d{3}$/.test(l)) {
        const r = { code: Number(l.slice(0, 3)), lineas: lineas.splice(0) };
        if (esperando) { const e = esperando; esperando = null; e.ok(r); }
      }
    }
  };
  const alDatos = (d) => { buf += d.toString('utf8'); revisar(); };
  const alError = (e) => { if (esperando) { const x = esperando; esperando = null; x.mal(e); } };
  const enganchar = (s) => { s.on('data', alDatos); s.on('error', alError); };
  enganchar(socket);
  return {
    respuesta: () => new Promise((ok, mal) => { esperando = { ok, mal }; revisar(); }),
    cambiar(s) { socket.removeListener('data', alDatos); socket = s; enganchar(s); },
    escribir: (t) => socket.write(t),
    get socket() { return socket; },
  };
}

async function enviarCorreo(cfg, para, asunto, texto) {
  if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(String(para || ''))) throw new Error('Correo no válido');
  const socket = cfg.secure ? tls.connect({ host: cfg.host, port: cfg.port, servername: cfg.host }) : net.connect(cfg.port, cfg.host);
  socket.setTimeout(20000, () => socket.destroy(new Error('Tiempo de espera agotado con el servidor de correo')));
  const s = conversar(socket);
  const pedir = async (cmd, codigos) => {
    if (cmd != null) s.escribir(cmd + '\r\n');
    const r = await s.respuesta();
    if (!codigos.includes(r.code)) throw new Error('SMTP ' + r.code + ': ' + r.lineas.join(' '));
    return r;
  };
  try {
    await pedir(null, [220]);
    let ehlo = await pedir('EHLO ' + (os.hostname() || 'localhost'), [250]);
    if (!cfg.secure) {
      if (ehlo.lineas.some((l) => /STARTTLS/i.test(l))) {
        await pedir('STARTTLS', [220]);
        const seguro = tls.connect({ socket: s.socket, servername: cfg.host });
        await new Promise((ok, mal) => { seguro.once('secureConnect', ok); seguro.once('error', mal); });
        s.cambiar(seguro);
        ehlo = await pedir('EHLO ' + (os.hostname() || 'localhost'), [250]);
      } else if (!cfg.inseguro) {
        throw new Error('El servidor de correo no ofrece conexión segura (STARTTLS)');
      }
    }
    if (cfg.user) {
      await pedir('AUTH LOGIN', [334]);
      await pedir(b64(cfg.user), [334]);
      await pedir(b64(cfg.pass), [235]);
    }
    await pedir('MAIL FROM:<' + limpio(cfg.from) + '>', [250]);
    await pedir('RCPT TO:<' + limpio(para) + '>', [250, 251]);
    await pedir('DATA', [354]);
    // Un punto al inicio de línea se duplica (transparencia SMTP); con base64 no ocurre, pero se cuida igual.
    await pedir(mensaje(cfg, para, asunto, texto).replace(/\r\n\./g, '\r\n..') + '\r\n.', [250]);
    s.escribir('QUIT\r\n');
  } finally {
    setTimeout(() => s.socket.destroy(), 200).unref();
  }
}

module.exports = { configDesdeEntorno, enviarCorreo, mensaje };
