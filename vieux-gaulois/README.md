# Vieux Gaulois Handball

App de gestión del club con tres accesos: **Directiva**, **Entrenadores** y **Jugadores**.

## Ingreso

- **Jugadores:** usuario = RUT (con o sin puntos y guion), clave = **primeros 4 dígitos del RUT**
  (ej. RUT 20.123.456-5, clave `2012`). La directiva puede restablecerla a esos 4 dígitos.
- **Entrenadores y directiva:** **usuario y clave definidos por la directiva** (Ajustes).
  La directiva puede cambiarles la clave cuando quiera.
- **Cuenta inicial de directiva:** usuario `vieux`, clave `vieuxg1234`. Cámbiala con el botón "Clave".
- **Jugadores que también son entrenadores:** siguen entrando con su RUT a su perfil de jugador,
  y con su usuario y clave a su perfil de entrenador. Al crear la cuenta de entrenador se marca
  "¿También es jugador del club?" para dejarlos vinculados.
- Cada usuario puede cambiar su clave con el botón "Clave".
- Tras 5 intentos fallidos la cuenta queda bloqueada 5 minutos.

## Qué puede hacer cada rol

| | Directiva | Entrenador | Jugador |
|---|:-:|:-:|:-:|
| Ver su perfil (nombre, edad, categoría, N° camiseta, posición) | | | ✓ |
| Reportar lesiones o dolores (le llegan a entrenador y directiva) | ✓ | ✓ | ✓ |
| Ver sus mensualidades del año (pagadas o no) y el federativo | | | ✓ |
| Ver entrenamientos realizados y a cuántos asistió | | | ✓ |
| Ver convenios del club y calendario de partidos | ✓ | ✓ | ✓ |
| Confirmar o rechazar una citación | | | ✓ |
| Inscribir jugadores y editar sus datos | ✓ | ✓ | |
| Programar entrenamientos y marcar asistencia | ✓ | ✓ | |
| Crear partidos y citar jugadores | ✓ | ✓ | |
| Ver quién está **habilitado** (federativo pagado) | ✓ | ✓ | |
| Finanzas: precios de cuotas, pagos mensuales, federativo, ingresos y gastos | ✓ | | |
| Convenios, categorías, cuentas de directiva y entrenadores, dar de baja | ✓ | | |

Un jugador está **habilitado para jugar** cuando su federativo del año está pagado.
Al citar a un jugador no habilitado, la app avisa al entrenador.

## Cómo correrla

Requiere Node.js 18 o superior. No hay dependencias que instalar.

```bash
cd vieux-gaulois
npm start          # http://localhost:3000
npm test           # pruebas
npm run demo       # genera vieux-gaulois-demo.html (todo en un archivo, para probar sin servidor)
```

La primera vez se crea `data/db.json` con datos de ejemplo:

| Rol | Usuario | Clave |
|---|---|---|
| Directiva | vieux | vieuxg1234 |
| Entrenador | jorge | jorge1234 |
| Jugador | 20.123.456-5 | 2012 |
| Entrenador que también juega | tomas | tomas1234 |

### Empezar con el club real (sin datos de ejemplo)

```bash
SIN_DATOS_EJEMPLO=1 npm start
```

Crea una base vacía con una sola cuenta de directiva (`vieux` / `vieuxg1234`). Desde ahí se agregan entrenadores
(Ajustes) y jugadores (Jugadores).

Variables: `PORT` (puerto, 3000 por defecto) y `DATA_FILE` (ruta del archivo de datos).
Respalda `data/db.json` con regularidad: ahí está toda la información del club.

### Modo demo

`vieux-gaulois-demo.html` es la app completa en un solo archivo: se abre con doble clic.
Lo mismo pasa si se abre `public/index.html` sin el servidor: la app funciona
en **modo demo**: los datos quedan sólo en ese navegador. Sirve para mostrarla, no para
uso real, porque cada teléfono vería datos distintos.

## Publicarla

Necesita un servidor Node con disco persistente (Render, Railway, Fly.io, un VPS, etc.):
comando de inicio `npm start` y `DATA_FILE` apuntando a un volumen persistente.
Usa HTTPS para que las claves no viajen en texto plano.

## Estructura

- `server.js`: servidor HTTP, sesiones, bloqueo por intentos y guardado en JSON.
- `public/core.js`: reglas del club compartidas por servidor y navegador (RUT, permisos por rol, qué ve cada usuario).
- `public/app.js`, `public/styles.css`, `public/index.html`: la interfaz.
- `test/`: pruebas de permisos, RUT, cuotas, asistencia y API.
