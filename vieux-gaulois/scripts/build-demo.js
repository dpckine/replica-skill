/*
 * Genera vieux-gaulois-demo.html: la app completa en un solo archivo (modo demo,
 * datos en el navegador). Se abre con doble clic, sin servidor.
 *   node scripts/build-demo.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

const pub = path.join(__dirname, '..', 'public');
const leer = (f) => fs.readFileSync(path.join(pub, f), 'utf8');
const escudo = 'data:image/png;base64,' + fs.readFileSync(path.join(pub, 'escudo.png')).toString('base64');
// Evita que un "</script>" dentro del código cierre la etiqueta antes de tiempo.
const script = (txt) => '<script>\n' + txt.replace(/<\/script/gi, '<\\/script') + '\n</script>';

// El escudo se incrusta una sola vez; app.js y styles.css lo toman de VG_ESCUDO / --escudo.
const inicio = script(
  'window.VG_SOLO_DEMO = true;\n' +
  'window.VG_ESCUDO = ' + JSON.stringify(escudo) + ';\n' +
  'document.documentElement.style.setProperty("--escudo", "url(" + window.VG_ESCUDO + ")");\n' +
  'document.querySelectorAll("img[data-escudo]").forEach(function (i) { i.src = window.VG_ESCUDO; });\n' +
  'document.querySelector("link[rel=icon]").href = window.VG_ESCUDO;'
);

const html = leer('index.html')
  .replace(/\s*<link rel="manifest"[^>]*>/, '')
  .replace(/\s*<link rel="apple-touch-icon"[^>]*>/, '')
  .replace('<link rel="icon" href="escudo.png">', '<link rel="icon" href="">')
  .replace('<img src="escudo.png" alt="">', '<img data-escudo alt="">')
  .replace('<link rel="stylesheet" href="styles.css">', () => '<style>\n' + leer('styles.css') + '\n</style>')
  .replace('<script src="core.js"></script>', () => inicio + '\n  ' + script(leer('core.js')))
  .replace('<script src="app.js"></script>', () => script(leer('app.js')));

if (html.includes('escudo.png"')) throw new Error('Quedó una referencia a escudo.png sin incrustar');
const destino = path.join(__dirname, '..', 'vieux-gaulois-demo.html');
fs.writeFileSync(destino, html);
console.log('Listo: ' + destino + ' (' + Math.round(html.length / 1024) + ' KB)');
