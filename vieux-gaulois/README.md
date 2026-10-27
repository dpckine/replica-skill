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
| Finanzas propias: mensualidades, federativo y otros cobros; informar un pago | | | ✓ |
| Chat directo con la directiva y con los entrenadores | ✓ | ✓ | ✓ |
| Pizarra táctica y creador de jugadas | ✓ | ✓ | |
| Ver las jugadas compartidas con su categoría | | | ✓ |
| Ver entrenamientos realizados y a cuántos asistió | | | ✓ |
| Ver convenios del club y calendario de partidos | ✓ | ✓ | ✓ |
| Proponer un convenio (se publica cuando la directiva lo aprueba) | | ✓ | ✓ |
| Confirmar o rechazar una citación | | | ✓ |
| Inscribir jugadores y editar sus datos | ✓ | ✓ | |
| Programar entrenamientos y marcar asistencia | ✓ | ✓ | |
| Crear partidos y citar jugadores | ✓ | ✓ | |
| Ver quién está **habilitado** (federativo pagado) | ✓ | ✓ | |
| Finanzas: precios de cuotas, pagos mensuales, federativo, otros cobros, ingresos y gastos | ✓ | | |
| Activar link de pago o transferencia por concepto; aprobar pagos informados | ✓ | | |
| Publicar convenios y aprobar o rechazar propuestas; categorías, cuentas de directiva y entrenadores, dar de baja | ✓ | | |

Un jugador está **habilitado para jugar** cuando su federativo del año está pagado.
Al citar a un jugador no habilitado, la app avisa al entrenador.

## Funciones del club

- **Categorías:** Mini, Infantil, Cadete, Juvenil, Junior, Adultos B, Primer Equipo y Master,
  cada una en rama Masculina y Femenina. En Infantil, Cadete y Juvenil se indica si el jugador
  es de 1er o 2do año. La cuota se fija por categoría (igual para ambas ramas).
- **Cobros y medios de pago:** en Finanzas la directiva decide, para cada concepto
  (mensualidad, federativo u otros cobros como torneos, indumentaria o viajes), si se paga con
  link de pago, con transferencia o con ambos. Los otros cobros pueden ser para todo el club o
  para algunas categorías. Los datos de transferencia del club se escriben en Ajustes.
- **Informar un pago:** en su pestaña Finanzas el jugador ve sólo los botones que la directiva
  activó y, después de pagar, toca "Ya pagué: informar pago" (monto, fecha, medio y N° de
  operación). La directiva lo aprueba (queda registrado como pagado) o lo rechaza con un motivo.
- **Perfil del jugador:** arriba su ficha, luego próximos partidos y próximos entrenamientos,
  lesiones y asistencia. Las finanzas, los avisos y los convenios tienen su propia pestaña.
- **Mensajes:** chat directo de cada jugador con la directiva y con sus entrenadores, y de cada
  entrenador con la directiva. Cada uno ve sólo sus conversaciones. Con servidor, los mensajes
  nuevos aparecen solos cada 15 segundos.
- **Pizarra táctica:** cancha de balonmano (media o completa) con atacantes, defensores y balón
  que se arrastran; flechas de desplazamiento, pase y lanzamiento, y lápiz libre.
- **Jugadas:** con "+ Paso" cada jugador avanza hasta donde apunta su flecha y el balón sigue al
  pase; la jugada se reproduce animada, se guarda con nombre y se puede compartir con una o
  más categorías, cuyos jugadores la ven en su app.
- **Avisos:** directiva y entrenadores publican avisos para todo el club (partidos de otras
  categorías, cambios de horario, etc.). Todos los ven; la directiva puede fijarlos arriba.
- **Convocatorias:** al citar jugadores la convocatoria queda guardada en el partido, con
  rival, hora, fecha, calcetas, lugar e indicaciones, en el mismo formato que la citación de
  WhatsApp. Se puede descargar en PDF (opción "Guardar como PDF" del diálogo de impresión),
  copiar el texto para WhatsApp o compartirla. Los jugadores confirman con "Voy" o "No puedo".
  Quien cita puede agregar el cuerpo técnico (Entrenador A, B y C, kinesiólogo/a y
  enfermero/a); sólo aparecen en la convocatoria los cargos con nombre.
- **Consentimiento informado:** la primera vez que un jugador entra debe firmar que su salud es
  compatible con el deporte y que se compromete a asistir y a pagar sus cuotas. Los menores de
  edad firman con su apoderado. Si la directiva cambia el texto puede pedir una nueva firma.
- **Compromiso de becados:** la directiva envía (en Documentos) un compromiso extra a los
  jugadores becados, que lo firman al ingresar. En Documentos se ve quién firmó y cuándo.

Diseño Material Design 3 con los colores del escudo (azul, rojo y oro): barra de navegación
abajo en el teléfono y riel lateral en el computador, botón flotante para crear, hojas que suben
desde abajo. Tema día / noche: sigue al teléfono o se cambia con el botón de la barra superior
(en "Mi cuenta" también se puede volver a Automático).

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
| Jugador (debe firmar el consentimiento al entrar) | 20.123.456-5 | 2012 |
| Jugadora becada (firma el compromiso) | 20.555.666-4 | 2055 |
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
