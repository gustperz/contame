# Supabase

La base de datos de Contame. Guarda los datos de cada persona en su propia
cuenta para que se sincronicen entre dispositivos y para que otras fuentes
(avisos del banco, atajos, un modelo de IA) puedan escribir gastos.

La app sigue funcionando sin esto: mientras el despliegue no tenga las dos
variables de abajo, todo lo relacionado con la cuenta queda oculto y los datos
viven solo en el teléfono, como siempre.

## Qué hay aquí

- `migrations/`: el esquema. Cada tabla tiene la clave `(user_id, id)`, fecha
  de cambio puesta por el servidor, borrado suave y reglas de acceso para que
  cada usuario solo vea y escriba lo suyo.
- `test/`: corre la migración sobre un Postgres dentro de Node y comprueba esas
  reglas. Va incluido en `npm test`.

## Cómo dejarlo andando

Los nombres de los menús de Supabase cambian de vez en cuando; si alguno no
coincide exacto, busca el más parecido.

1. **Crear el proyecto** en [supabase.com](https://supabase.com), en el plan
   gratis. La región da casi igual para esto.
2. **Crear las tablas.** En *SQL Editor*, pega el contenido de
   `migrations/20260925000000_init.sql` y dale *Run*.
3. **Código en vez de enlace.** En *Authentication → Email Templates*, edita
   las plantillas *Magic Link* y *Confirm signup* para que muestren el código
   con `{{ .Token }}` en lugar del enlace `{{ .ConfirmationURL }}`. Por ejemplo:

   ```html
   <h2>Tu código para entrar a Contame</h2>
   <p style="font-size: 28px; letter-spacing: 4px"><strong>{{ .Token }}</strong></p>
   <p>Escríbelo en la app. Vence en una hora.</p>
   ```

   Se usa código y no enlace porque en una app instalada en el iPhone el enlace
   se abre en Safari, que guarda sus datos aparte, y la sesión quedaría allá y
   no en Contame.
4. **Copiar la dirección y la clave pública** desde *Project Settings → API*:
   la *Project URL* y la *publishable key* (en proyectos viejos se llama
   *anon key*). Ninguna de las dos es secreta. **No copies la *secret key* ni
   la *service_role*.**
5. **Dárselas al despliegue.** En GitHub, en el repositorio: *Settings →
   Secrets and variables → Actions → pestaña Variables*, crea dos variables:
   - `SUPABASE_URL` con la Project URL
   - `SUPABASE_PUBLISHABLE_KEY` con la publishable key
6. **Volver a desplegar.** En la pestaña *Actions*, abre el último *Deploy to
   GitHub Pages* y dale *Re-run all jobs*.
7. **Entrar desde la app.** Cierra y abre Contame, ve a *Ajustes → Cuenta →
   Entrar*, escribe tu correo y el código que te llegue.
8. **Cerrar la puerta.** Ya con tu cuenta creada, en *Authentication → Sign
   In / Providers* apaga *Allow new users to sign up*. La app es pública en
   internet; así nadie más puede crearse una cuenta en tu proyecto.

## Límites del plan gratis que conviene saber

El correo que manda Supabase por defecto tiene un límite bajo de envíos por
hora. Para entrar una vez por dispositivo sobra, pero si pides varios códigos
seguidos puede decirte que esperes.

Un proyecto gratis se pausa si pasa una semana sin actividad en la base. Los
datos no se pierden; se reactiva desde el panel.
