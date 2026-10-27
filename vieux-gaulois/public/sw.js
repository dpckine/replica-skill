/* Vieux Gaulois Handball: recibe las notificaciones push y abre la app en la sección que corresponde. */
'use strict';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (ev) => ev.waitUntil(self.clients.claim()));

self.addEventListener('push', (ev) => {
  let d = {};
  try { d = ev.data ? ev.data.json() : {}; } catch (e) { d = { cuerpo: ev.data ? ev.data.text() : '' }; }
  ev.waitUntil(self.registration.showNotification(d.titulo || 'Vieux Gaulois', {
    body: d.cuerpo || '', icon: 'escudo.png', badge: 'escudo.png', lang: 'es', tag: d.tab || 'vieux-gaulois',
    data: { tab: d.tab || '' },
  }));
});

self.addEventListener('notificationclick', (ev) => {
  ev.notification.close();
  const url = new URL('./', self.registration.scope).href + (ev.notification.data && ev.notification.data.tab ? '#' + ev.notification.data.tab : '');
  ev.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((ws) => {
    const abierta = ws.find((w) => w.url.startsWith(self.registration.scope));
    if (abierta) { abierta.navigate(url).catch(() => {}); return abierta.focus(); }
    return self.clients.openWindow(url);
  }));
});
