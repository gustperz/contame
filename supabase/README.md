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
- **Esquema:** aplicado como la migración `init`, versión `20260925234152`,
  la misma que el archivo de `migrations/`.
- **La app** lee la dirección y la clave pública de `.env.production`. Las dos
  son públicas por diseño; lo que protege los datos son las reglas por fila.
  **Nunca pongas ahí la *secret key* ni la *service_role*.**

Para cambiar de proyecto basta con editar ese archivo y volver a desplegar.

## Lo que se hace a mano en el panel

Los nombres de los menús de Supabase cambian de vez en cuando; si alguno no
coincide exacto, busca el más parecido.

1. **Código en vez de enlace**, antes de entrar por primera vez. En
   *Authentication → Emails → Templates*, edita *Magic Link* y *Confirm
   signup* para que muestren `{{ .Token }}` en lugar del enlace
   `{{ .ConfirmationURL }}`. Por ejemplo:

   ```html
   <h2>Tu código para entrar a Contame</h2>
   <p style="font-size: 28px; letter-spacing: 4px"><strong>{{ .Token }}</strong></p>
   <p>Escríbelo en la app. Vence en una hora.</p>
   ```

   Se usa código y no enlace porque en una app instalada en el iPhone el enlace
   se abre en Safari, que guarda sus datos aparte, y la sesión quedaría allá y
   no en Contame.
2. **Cerrar la puerta**, después de crear tu cuenta. En *Authentication → Sign
   In / Providers* apaga *Allow new users to sign up*. La app es pública en
   internet; así nadie más puede crearse una cuenta en tu proyecto.

Si aplicas una migración nueva desde el *SQL Editor* en vez de con la línea de
comandos, guarda también el archivo en `migrations/` con la versión que quede
registrada, para que el repositorio y la base no se separen.

## Límites del plan gratis que conviene saber

El correo que manda Supabase por defecto tiene un límite bajo de envíos por
hora. Para entrar una vez por dispositivo sobra, pero si pides varios códigos
seguidos puede decirte que esperes.

Un proyecto gratis se pausa si pasa una semana sin actividad en la base. Los
datos no se pierden; se reactiva desde el panel.
