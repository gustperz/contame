# Buzón

Recibe los avisos de compra del banco y los deja en la bandeja de Contame, esperando a que los confirmes. Vive fuera del teléfono para que la captura no dependa de que la app esté abierta.

## Cómo fluye un aviso

1. Gmail reenvía el correo del banco a un val de Val Town (disparador de correo).
2. El val lo convierte en texto (`src/email.ts`) y lo lee con las plantillas de cada banco (`src/parse.ts`).
3. Si es una compra, llama a `receive_notice` en Supabase con la **clave del buzón**. Si no lo es (la confirmación de Gmail, una plantilla que cambió), llama a `receive_unmatched` y además lo deja en los registros del val.
4. La app muestra la compra en "Movimientos nuevos" y, al confirmarla, la vuelve un gasto normal.

El val no inicia sesión. La clave del buzón la crea la app (Ajustes → Bandeja automática), la base guarda solo su huella SHA-256 y solo sirve para dejar avisos en tu bandeja, nunca para leer datos. En el val va como variable de entorno `CONTAME_CLAVE`.

## El código del val

`valtown/email.ts` es la entrada. `build/mailbox.ts` la empaqueta con esbuild en un solo archivo sin importaciones; la app lo ofrece con "Copiar código", con la URL y la clave pública del proyecto ya puestas arriba, para pegarlo en Val Town desde el teléfono. Nada secreto va en ese archivo.

## Cómo se cruzan los duplicados

La misma compra llega por varios lados: Lulo avisa por correo y por SMS. Se reconocen como una sola por tarjeta, monto y **hora de la compra** (`src/dedupe.ts`), que viene escrita dentro del mensaje y no es la hora en que llegó. Esa diferencia importa: un aviso puede entrar dos horas después de la compra, y usar la hora de llegada obligaría a inventar ventanas de tolerancia.

La unión la hace la base (`receive_notice`), así que dos avisos que llegan a la vez no se pisan. Compras distintas del mismo comercio no se unen, porque los montos difieren. Y un aviso que llega tarde sobre algo que ya guardaste o descartaste no lo revive: solo queda registrado que también llegó por ahí.

## Sobre el idioma y las pruebas

El código va en inglés, como el resto del repositorio. En español quedan solo las expresiones que reconocen los mensajes y los textos de prueba, porque eso es contenido de los bancos.

Los mensajes de las pruebas son las plantillas reales de cada banco con los valores cambiados. Ni los montos, ni los comercios, ni los últimos dígitos corresponden a compras de nadie.
