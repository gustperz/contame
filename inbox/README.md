# Buzón

Lee los avisos de compra del banco y los deja en la bandeja de Contame, esperando a que los confirmes. Vive fuera del teléfono para que la captura no dependa de que la app esté abierta.

## Cómo fluye un aviso

1. Un Google Apps Script en tu propia cuenta de Google (`apps-script/Code.js`) busca cada 5 minutos en Gmail los correos de compra de los últimos 3 días.
2. Lee cada correo nuevo con la API de Gmail, lo convierte en texto (`src/gmail.ts`, `src/email.ts`) y lo compara con las plantillas de cada banco (`src/parse.ts`).
3. Si es una compra, llama a `receive_notice` en Supabase con la **clave del buzón**. Si parecía una compra pero no encaja en ninguna plantilla, llama a `receive_unmatched`, para que se vea en la app que algo cambió.
4. La app muestra la compra en "Movimientos nuevos" y, al confirmarla, la vuelve un gasto normal.

El script no inicia sesión en Contame. La clave del buzón la crea la app (Ajustes → Bandeja automática), la base guarda solo su huella SHA-256 y solo sirve para dejar avisos en tu bandeja, nunca para leer datos.

## Permisos del script

`apps-script/appsscript.json` pide solo lo necesario: **leer** Gmail (`gmail.readonly`, con el servicio avanzado de Gmail en vez de `GmailApp`, que exigiría poder enviar y borrar correo), conectarse a Supabase, guardar la lista de correos ya enviados y programarse cada 5 minutos.

## El código del script

`build/mailbox.ts` empaqueta con esbuild el código compartido (`apps-script/lib.ts`) en una sola variable global, `ContameMailbox`, porque Apps Script no tiene módulos. `apps-script/assemble.ts` arma el Código.gs: una nota, la URL y la clave pública del proyecto, la clave del buzón, `Code.js` y el código compartido al final. La app lo ofrece con "Copiar Código.gs" junto con "Copiar appsscript.json", para pegarlos desde el teléfono.

## Cómo se cruzan los duplicados

La misma compra llega por varios lados: Lulo avisa por correo y por SMS. Se reconocen como una sola por tarjeta, monto y **hora de la compra** (`src/dedupe.ts`), que viene escrita dentro del mensaje y no es la hora en que llegó. Esa diferencia importa: un aviso puede entrar dos horas después de la compra, y usar la hora de llegada obligaría a inventar ventanas de tolerancia.

La unión la hace la base (`receive_notice`), así que dos avisos que llegan a la vez no se pisan. Compras distintas del mismo comercio no se unen, porque los montos difieren. Y un aviso que llega tarde sobre algo que ya guardaste o descartaste no lo revive: solo queda registrado que también llegó por ahí.

## Sobre el idioma y las pruebas

El código va en inglés, como el resto del repositorio. En español quedan solo las expresiones que reconocen los mensajes y los textos de prueba, porque eso es contenido de los bancos.

Los mensajes de las pruebas son las plantillas reales de cada banco con los valores cambiados. Ni los montos, ni los comercios, ni los últimos dígitos corresponden a compras de nadie.
