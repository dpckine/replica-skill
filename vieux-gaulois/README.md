# Vieux Gaulois Handball

App de gestión del club con tres accesos: **Directiva**, **Entrenadores** y **Jugadores**.

## Ingreso

- **Usuario:** RUT (con o sin puntos y guion).
- **Clave:** los **primeros 4 dígitos del RUT** (ej. RUT 20.123.456-5, clave `2012`).
- Cada usuario puede cambiar su clave con el botón "Clave". La directiva puede restablecerla.
- Tras 5 intentos fallidos el RUT queda bloqueado 5 minutos.

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
```

La primera vez se crea `data/db.json` con datos de ejemplo:

| Rol | RUT | Clave |
|---|---|---|
| Directiva | 11.111.111-1 | 1111 |
| Entrenador | 12.222.222-5 | 1222 |
| Jugador | 20.123.456-5 | 2012 |

### Empezar con el club real (sin datos de ejemplo)

```bash
SIN_DATOS_EJEMPLO=1 ADMIN_RUT=12.345.678-5 ADMIN_NOMBRE="Presidente" npm start
```

Crea una base vacía con una sola cuenta de directiva. Desde ahí se agregan entrenadores
(Ajustes) y jugadores (Jugadores).

Variables: `PORT` (puerto, 3000 por defecto) y `DATA_FILE` (ruta del archivo de datos).
Respalda `data/db.json` con regularidad: ahí está toda la información del club.

### Modo demo

Si se abre `public/index.html` sin el servidor (o en un hosting estático), la app funciona
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
