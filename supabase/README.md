# Supabase

La base de datos de Contame. Guarda los datos de cada persona en su propia
cuenta para que se sincronicen entre dispositivos y para que otras fuentes
(avisos del banco, atajos, un modelo de IA) puedan escribir gastos.

Una compilación sin la dirección y la clave del proyecto sigue funcionando: todo
lo relacionado con la cuenta queda oculto y los datos viven solo en el teléfono.

## Qué hay aquí

- `migrations/`: el esquema. Cada tabla tiene la clave `(user_id, id)`, fecha
  de cambio puesta por el servidor, borrado suave y reglas de acceso para que
  cada usuario solo vea y escriba lo suyo.
- `test/`: corre la migración sobre un Postgres dentro de Node y comprueba esas
  reglas. Va incluido en `npm test`.

## Cómo está configurado

- **Proyecto:** `Contame` (`qsxulbccuhqkurdrhkem`), en el plan gratis.
- **Esquema:** aplicado con las migraciones de `migrations/`, cada archivo
  con la misma versión que quedó registrada en el proyecto.
- **Acceso:** solo pueden crear cuenta los correos de la lista
  `private.allowed_emails`. La lista vive en un esquema que la API no expone, y
  los correos se agregan como datos, no en una migración, para que no queden
  publicados en este repositorio.
- **La app** lee la dirección y la clave pública de `.env.production`. Las dos
  son públicas por diseño; lo que protege los datos son las reglas por fila.
  **Nunca pongas ahí la *secret key* ni la *service_role*.**

Para cambiar de proyecto basta con editar ese archivo y volver a desplegar.

## Lo que se hace a mano en el panel

Los nombres de los menús de Supabase cambian de vez en cuando; si alguno no
coincide exacto, busca el más parecido.

1. **Código en vez de enlace** (opcional). Con la plantilla que trae Supabase
   llega un enlace. **No hay que abrirlo**: se mantiene presionado, se copia y
   se pega en la app, que lo usa para entrar. Abrirlo lo gasta, y además en una
   app instalada en el iPhone se abriría en Safari, que guarda sus datos
   aparte.

   Si prefieres recibir un código, que es más cómodo porque iOS lo puede
   proponer desde Mail, edita las plantillas *Magic Link* y *Confirm signup*
   en [Authentication → Emails](https://supabase.com/dashboard/project/qsxulbccuhqkurdrhkem/auth/templates)
   para que muestren `{{ .Token }}` en lugar del enlace. Desde el celular el
   panel se ve mejor pidiendo la versión de escritorio del sitio. Por ejemplo:

   ```html
   <h2>Tu código para entrar a Contame</h2>
   <p style="font-size: 28px; letter-spacing: 4px"><strong>{{ .Token }}</strong></p>
   <p>Escríbelo en la app. Vence en una hora.</p>
   ```

2. **Quién puede entrar.** No hace falta apagar el registro de cuentas nuevas:
   la base rechaza crear cualquier cuenta cuyo correo no esté en la lista, y la
   app muestra "Este correo no tiene acceso a Contame". Para dar acceso a
   alguien, desde el *SQL Editor*:

   ```sql
   insert into private.allowed_emails (email) values ('alguien@ejemplo.com');
   ```

   Para quitarlo, `delete from private.allowed_emails where email = '...'`.
   Quitarlo impide que cree una cuenta nueva, pero no cierra una que ya
   exista; esa se borra en *Authentication → Users*.

Si aplicas una migración nueva desde el *SQL Editor* en vez de con la línea de
comandos, guarda también el archivo en `migrations/` con la versión que quede
registrada, para que el repositorio y la base no se separen.

## Límites del plan gratis que conviene saber

El correo que manda Supabase por defecto tiene un límite bajo de envíos por
hora. Para entrar una vez por dispositivo sobra, pero si pides varios códigos
seguidos puede decirte que esperes.

Un proyecto gratis se pausa si pasa una semana sin actividad en la base. Los
datos no se pierden; se reactiva desde el panel.

## Sincronización

La app guarda todo en el teléfono y sincroniza en segundo plano (`src/cloud/sync/`):

- Cada fila tiene un id creado en el dispositivo, así que se puede crear sin señal.
- El teléfono guarda en `contame:sync` una huella de cada fila tal como la acordó con el servidor. Lo que difiere se envía; lo que falta se marca como borrado (`deleted_at`) para que los otros dispositivos también lo borren.
- Para recibir, pide por tabla las filas con `updated_at` posterior a la última vista (con unos segundos de margen). Si una fila cambió en el teléfono y en el servidor, gana la del teléfono que sincroniza; en la primera sincronización gana el servidor.
- El chat en el teléfono guarda solo los últimos mensajes; los más viejos se recortan en el teléfono pero se quedan en la cuenta.
- Antes de la primera sincronización se guarda una copia en `contame:backup:antes-de-sincronizar`.
- Si el teléfono intenta borrar de golpe la mayoría de lo que tenía sincronizado sin que la persona lo pidiera (por ejemplo, porque perdió sus datos), la sincronización se detiene y pregunta.

## Bandeja de movimientos

`inbox_items` guarda las compras que llegan solas (avisos del banco) hasta que se confirman. La app no las copia al teléfono: las consulta mientras está abierta y muestra el botón "N movimientos nuevos".

- Al guardar una, se vuelve un gasto normal con id `bank:<id del movimiento>`, así que guardarla dos veces (o en dos teléfonos) no la duplica. El gasto queda con `origin = 'bank'`.
- La decisión (`saved` o `discarded`) se anota en el servidor; si no hay señal, queda en cola en `contame:inbox:decisions` y se envía después.
- La app propone la cuenta por los últimos 4 dígitos de la tarjeta (`accounts.cards`) y la categoría por la regla guardada para ese comercio (`settings.merchant_categories`) o por palabras clave. Ambas cosas se aprenden al confirmar.
- Una compra del mismo monto anotada a mano el mismo día (o uno antes o después) se marca "¿ya anotado?" y queda sin marcar.

## Buzón

`receive_notice` y `receive_unmatched` son las dos únicas puertas del buzón (ver `inbox/README.md`). Se pueden llamar sin sesión, pero piden la clave del buzón: la buscan por su huella en `inbox_tokens` y escriben solo en la bandeja de su dueño. `inbox_unmatched` guarda los últimos 10 correos que no eran compras.

El linter de Supabase avisa que ambas son `SECURITY DEFINER` y se pueden llamar sin sesión: es a propósito, porque el buzón (el Apps Script) no inicia sesión; lo que las protege es la clave, que se revisa adentro.
