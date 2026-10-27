/*
 * Recordatorios por WhatsApp con la API oficial (WhatsApp Business Cloud API de Meta).
 * Meta exige una plantilla aprobada para escribir primero a una persona: se usa una plantilla
 * con 1 parámetro en el cuerpo, que recibe el texto del recordatorio. Ver README.
 */
'use strict';

function configDesdeEntorno(env) {
  env = env || process.env;
  if (!env.WHATSAPP_TOKEN || !env.WHATSAPP_PHONE_ID) return null;
  return { token: env.WHATSAPP_TOKEN, phoneId: env.WHATSAPP_PHONE_ID, plantilla: env.WHATSAPP_PLANTILLA || 'recordatorio_cuota', idioma: env.WHATSAPP_IDIOMA || 'es' };
}

// "+56 9 1234 5678", "912345678" o "56912345678" -> "56912345678". Devuelve '' si no parece un celular.
function normalizarTelefono(t) {
  let d = String(t || '').replace(/\D/g, '');
  if (d.length === 9 && d[0] === '9') d = '56' + d;
  return d.length >= 10 && d.length <= 15 ? d : '';
}

function cuerpoMensaje(cfg, telefono, texto) {
  return {
    messaging_product: 'whatsapp', to: normalizarTelefono(telefono), type: 'template',
    template: { name: cfg.plantilla, language: { code: cfg.idioma }, components: [{ type: 'body', parameters: [{ type: 'text', text: String(texto).slice(0, 900) }] }] },
  };
}

async function enviarWhatsApp(cfg, telefono, texto) {
  if (!normalizarTelefono(telefono)) throw new Error('Teléfono no válido');
  const r = await fetch('https://graph.facebook.com/v20.0/' + encodeURIComponent(cfg.phoneId) + '/messages', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + cfg.token, 'Content-Type': 'application/json' },
    body: JSON.stringify(cuerpoMensaje(cfg, telefono, texto)),
  });
  if (!r.ok) throw new Error('WhatsApp ' + r.status + ': ' + (await r.text()).slice(0, 200));
}

module.exports = { configDesdeEntorno, normalizarTelefono, cuerpoMensaje, enviarWhatsApp };
