# Vieux Gaulois Handball

App de gestión del club con cuatro accesos: **Directiva**, **Entrenadores**, **Jugadores** y **Apoderados**.

## Ingreso

- **Jugadores:** usuario = RUT (con o sin puntos y guion), clave = **primeros 4 dígitos del RUT**
  (ej. RUT 20.123.456-5, clave `2012`). La directiva puede restablecerla a esos 4 dígitos.
- **Apoderados:** igual que los jugadores, con su RUT y los 4 primeros dígitos. La cuenta se crea
  al inscribir a un menor (o desde su ficha, "+ Agregar apoderado"). Un apoderado con varios hijos
  en el club los ve todos y cambia entre ellos con un toque.
- **Entrenadores y directiva:** **usuario y clave definidos por la directiva** (Más → Directiva y entrenadores).
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
| Credencial digital con foto y RUT, ficha médica propia | | | ✓ |
| Votar en encuestas, ver galería, goleadores y su evaluación física | | | ✓ |
| Cargar resultado, comentario y estadísticas de cada partido | ✓ | ✓ | |
| Evaluación física y plan de cada entrenamiento | ✓ | ✓ | |
| Ver y editar la ficha médica de los jugadores | | ✓ | |
| Subir fotos a la galería (máximo 3 por álbum) | | ✓ | |
| Inventario, encuestas | ✓ | ✓ | |
| Reporte mensual en Excel y PDF, recordatorios de cuotas | ✓ | | |
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
- **Nómina por categorías:** el entrenador cita de la categoría del partido y de una categoría
  por debajo (misma rama). Los adultos (Junior, Adultos B, Primer Equipo y Master) pueden
  citar desde Juvenil hacia arriba.
- **Estado del jugador:** el cuerpo técnico lo marca como Habilitado o Lesionado desde su ficha.
  Si no pagó el federativo del año aparece como No habilitado.
- **Sticker de la nómina para historias:** desde la convocatoria se genera un PNG con fondo
  transparente (logo, categoría, rival, jugadores por número y cuerpo técnico) en azul o blanco,
  para copiar, compartir o descargar y ponerlo sobre una foto en el estado de WhatsApp.
- **Reserva y cambios:** los jugadores de la categoría que no quedan citados forman la reserva
  de ese partido (cambia con cada convocatoria). Si un citado marca "No puedo", el entrenador
  recibe el aviso y con "Cambiar" elige quién de la reserva entra en su lugar; el que entra
  recibe la notificación para confirmar y el que sale vuelve a la reserva.
  Quien cita puede agregar el cuerpo técnico (Entrenador A, B y C, kinesiólogo/a y
  enfermero/a); sólo aparecen en la convocatoria los cargos con nombre.
- **Consentimiento informado:** la primera vez que un jugador entra debe firmar que su salud es
  compatible con el deporte y que se compromete a asistir y a pagar sus cuotas. Por los menores de
  edad firma su apoderado desde su cuenta. Si la directiva cambia el texto puede pedir una nueva firma.
- **Apoderados:** los menores de 18 se inscriben con su apoderado. La cuenta del menor queda en
  espera hasta que el apoderado entra con su RUT y firma el consentimiento por él. Desde su cuenta
  el apoderado ve el perfil de su hijo o hija, paga e informa pagos, firma documentos, confirma
  citaciones y conversa con la directiva y los entrenadores en nombre de su hijo.
- **Cambio de temporada automático:** el 1 de enero quien estaba en 1er año pasa a 2do, y quien
  estaba en 2do sube a 1er año de la siguiente categoría (Infantil 2do año → Cadete 1er año), en
  la misma rama. Si el número de camiseta ya estaba ocupado en la nueva categoría, queda libre
  para reasignarlo. En el Inicio aparece el resumen de quién subió.
- **Estadísticas:** en cada partido jugado el entrenador carga el marcador, un comentario y, por
  jugador, goles, atajadas, exclusiones de 2 minutos y tarjetas (amarilla, roja, azul). Con eso se
  arma la tabla de goleadores de cada categoría; cada jugador ve la suya y sus números.
- **Evaluación física:** el entrenador registra por categoría el test 5-10-5, salto alto,
  flexiones y sentadillas en 30 segundos, altura y peso. Cada jugador ve un gráfico de su
  evolución con lo que mejoró o bajó desde la medición anterior.
- **Plan de entrenamiento:** cada sesión puede llevar su lista de ejercicios con minutos,
  detalle y una jugada de la pizarra adjunta. El entrenador decide si los jugadores la ven.
- **Ficha médica:** grupo sanguíneo, alergias, enfermedades, medicamentos, previsión, seguro y
  contacto de emergencia. La ven y editan los entrenadores, el jugador y su apoderado; la
  directiva no la ve.
- **Credencial digital:** foto, nombre, RUT, categoría y estado de cuotas, con la fecha y hora en
  vivo para mostrarla en los convenios.
- **Cumpleaños del mes** en el Inicio (y los de su categoría en el perfil de cada jugador).
- **Recordatorios de cuotas:** automáticos unos días antes del vencimiento (y, si se quiere,
  después, si sigue impaga), por notificación, correo o WhatsApp, al jugador o a su apoderado si
  es menor. Se envían una vez por cuota y no se envían si el pago ya fue informado. En Finanzas
  también hay botones para enviar el recordatorio a mano por WhatsApp o correo.
- **Reporte mensual:** ingresos (cuotas, federativos, otros cobros y otros ingresos), gastos,
  balance y jugadores con cuotas atrasadas, para descargar en Excel (.xlsx) o PDF.
- **Inventario:** balones, petos, camisetas y otros materiales, con quién tiene qué, cuántos
  quedan disponibles y las devoluciones. Cada jugador ve el material a su cargo.
- **Encuestas:** para todo el club o una categoría, con fecha de cierre. Los votos son anónimos.
- **Galería:** sólo los entrenadores suben fotos (plantel, partido o evento), máximo 3 por álbum
  y achicadas en el teléfono antes de subirlas para no llenar el servidor.
- **Grupos de mensajes:** la directiva y los entrenadores crean grupos de texto (como los de
  WhatsApp) con jugadores, cuerpo técnico y apoderados; se puede sumar una categoría completa con
  un toque. Los apoderados de los jugadores del grupo también lo ven y pueden escribir.
- **Apoderados sólo con nombre:** en Jugadores → Apoderados se crean con el nombre y, cuando se
  tenga, el RUT (con RUT pueden entrar y firmar). Un jugador puede tener varios apoderados.
- **Notificaciones push:** cada persona las activa en "Mi cuenta". Avisan de citaciones,
  mensajes, avisos, encuestas, fotos, pagos revisados y cuotas por vencer. En iPhone primero hay
  que agregar la app a la pantalla de inicio (Compartir → Agregar a inicio).
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
| Apoderada de Sofía y Martín (firma por ellos) | 15.678.901-1 | 1567 |
| Jugadora menor (espera la firma de su apoderada) | 24.901.234-3 | 2490 |
| Cadete con estadísticas y evaluación física | 24.678.901-0 | 2467 |

### Empezar con el club real (sin datos de ejemplo)

```bash
SIN_DATOS_EJEMPLO=1 npm start
```

Crea una base vacía con una sola cuenta de directiva (`vieux` / `vieuxg1234`). Desde ahí se agregan entrenadores
(Ajustes) y jugadores (Jugadores).

Variables: `PORT` (puerto, 3000 por defecto) y `DATA_FILE` (ruta del archivo de datos).
Respalda la carpeta `data/` con regularidad: ahí están los datos (`db.json`), las fotos
(`fotos/`), las claves de las notificaciones (`vapid.json`) y los dispositivos suscritos (`push.json`).

### Recordatorios por correo y WhatsApp

El servidor revisa cada hora si hay recordatorios que enviar. Las notificaciones push funcionan
sin configurar nada. Para el correo y WhatsApp hay que darle al servidor estas variables:

| Variable | Para qué |
|---|---|
| `SMTP_HOST`, `SMTP_PORT` (465 o 587), `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | Correo del club. Con Gmail: `smtp.gmail.com`, puerto 465 y una "contraseña de aplicación". |
| `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID` | WhatsApp Business Cloud API de Meta (token permanente y el ID del número del club). |
| `WHATSAPP_PLANTILLA` (por defecto `recordatorio_cuota`) | Meta exige una plantilla aprobada para escribir primero. Créala en español con un solo parámetro en el cuerpo, por ejemplo: `{{1}}`. El servidor pone ahí el texto del recordatorio. |
| `VAPID_SUJETO` (por defecto `mailto:contacto@vieuxgaulois.cl`) | Correo de contacto que se envía a los servicios de notificaciones. |

Después, en Ajustes → "Recordatorios automáticos de cuotas", la directiva elige los días de
anticipación y qué canales usar. Ahí mismo se ve el registro de los últimos envíos.

### Modo demo

`vieux-gaulois-demo.html` es la app completa en un solo archivo: se abre con doble clic.
Lo mismo pasa si se abre `public/index.html` sin el servidor: la app funciona
en **modo demo**: los datos quedan sólo en ese navegador. Sirve para mostrarla, no para
uso real, porque cada teléfono vería datos distintos.

## Publicarla

Necesita un servidor Node con disco persistente (Render, Railway, Fly.io, un VPS, etc.):
comando de inicio `npm start` y `DATA_FILE` apuntando a un volumen persistente.
Usa HTTPS para que las claves no viajen en texto plano (las notificaciones push también lo exigen).

## Estructura

- `server.js`: servidor HTTP, sesiones, bloqueo por intentos, guardado en JSON, fotos en disco, notificaciones y recordatorios.
- `lib/`: notificaciones push (`webpush.js`), correo SMTP (`correo.js`) y WhatsApp (`whatsapp.js`), sin dependencias.
- `public/sw.js`: recibe las notificaciones en el teléfono.
- `public/core.js`: reglas del club compartidas por servidor y navegador (RUT, permisos por rol, qué ve cada usuario).
- `public/app.js`, `public/styles.css`, `public/index.html`: la interfaz.
- `test/`: pruebas de permisos, RUT, cuotas, asistencia, apoderados, temporada, estadísticas, cifrado push, correo y API.
