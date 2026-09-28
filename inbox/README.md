# Buzón

Lee los avisos de compra del banco y los deja en la bandeja de Contame, esperando a que los confirmes. Vive fuera del teléfono para que la captura no dependa de que la app esté abierta.

## Estado

Los correos ya no pasan por aquí: los lee cada mañana una rutina de Claude (ver `docs/revision-diaria.md`). Esta carpeta queda como lector de avisos por plantillas y como las puertas `receive_notice` y `receive_unmatched`, útiles para texto pegado a mano o un atajo del iPhone.

## Plantillas

| Tipo | Remitente | Notas |
|---|---|---|
| `lulo-email`, `lulo-sms` | Lulo | Compras con tarjeta. |
| `bogota-sms`, `bogota-pse` | Banco de Bogotá (SMS) | Compras con tarjeta y pagos PSE. |
| `pse-email` | serviciopse@achcolombia.com.co | Pago por PSE. El comercio es "Empresa" sin "S.A.", "SAS", "ESP"… Se ignoran las transacciones rechazadas. |
| `nequi-breb-email` | notificaciones@nequi.com.co | Plata enviada por Bre-B ("Bre-B a Nombre"). "¡Recibiste plata!" es un ingreso y se ignora. |
| `nequi-bill-email` | somos@nequi.com.co | Factura pagada con Nequi; el mes viene abreviado ("Sep", "Ago", "Aug"). |
| `bogota-transfer-email` | NotificacionesBDB@bancodebogota.net | Comprobante de transferencia (ver abajo). |
| `davivienda-email` | BANCO_DAVIVIENDA@davivienda.com | Solo compras aprobadas; las rechazadas se ignoran y otros movimientos (pagos a la tarjeta) quedan sin leer. |

**Hora de los avisos sin hora.** PSE y las facturas de Nequi solo traen la fecha. Como hora se usa la de llegada del correo (`internalDate` de Gmail) en el reloj de Bogotá, que es UTC−5 todo el año. El mismo correo siempre llega a la misma hora, así que la clave de cruce no cambia al leerlo otra vez. Si el texto se pega a mano, sin hora de llegada, queda a medianoche.

**Transferencias del Banco de Bogotá.** Solo cuentan como gasto las que van a un número (un celular o una cuenta de otra persona) y quedan como "Transferencia a 3001234567". Las que van a una llave como `@NEQUI…` o a "Cuenta de Ahorros No. 5678" suelen ser plata que la persona mueve entre sus propias cuentas: no se vuelven gasto, quedan en "Correos que no entendí" para que decida.

**Correos de terceros** que confirman la misma compra (el cine, la empresa de gas, la tienda en línea) no tienen plantilla: no dicen nada que el banco no diga.

## Cómo se cruzan los duplicados

La misma compra llega por varios lados: Lulo avisa por correo y por SMS. Se reconocen como una sola por tarjeta, monto y **hora de la compra** (`src/dedupe.ts`), que viene escrita dentro del mensaje y no es la hora en que llegó. Esa diferencia importa: un aviso puede entrar dos horas después de la compra, y usar la hora de llegada obligaría a inventar ventanas de tolerancia.

La unión la hace la base (`receive_notice`), así que dos avisos que llegan a la vez no se pisan. Compras distintas del mismo comercio no se unen, porque los montos difieren. Y un aviso que llega tarde sobre algo que ya guardaste o descartaste no lo revive: solo queda registrado que también llegó por ahí.

## Sobre el idioma y las pruebas

El código va en inglés, como el resto del repositorio. En español quedan solo las expresiones que reconocen los mensajes y los textos de prueba, porque eso es contenido de los bancos.

Los mensajes de las pruebas son las plantillas reales de cada banco con los valores cambiados. Ni los montos, ni los comercios, ni los últimos dígitos corresponden a compras de nadie.
