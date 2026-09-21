# Buzón

Recibe los avisos de compra del banco, los convierte en movimientos y los deja
esperando a que los confirmes en Contame. Vive fuera del teléfono para que la
captura no dependa de que la app esté abierta.

El código de esta carpeta no depende de ninguna plataforma: son funciones puras
más un manejador que recibe una `Request` y devuelve una `Response`. La
plataforma solo pone el almacenamiento y la entrada de correo.

## Cómo entra y sale la información

| Ruta | Quién la usa | Qué hace |
|---|---|---|
| `POST /aviso` | El atajo del iPhone y el receptor de correo | Lee el mensaje y lo vuelve pendiente |
| `GET /pendientes` | Contame | Devuelve lo que falta por confirmar |
| `POST /estado` | Contame | Marca uno como guardado o descartado |

Todas piden `Authorization: Bearer <clave>` y responden las cabeceras de origen
cruzado, incluida la consulta previa `OPTIONS`. Eso último no es opcional: sin
ella el navegador rechaza la petición cuando lleva la clave en la cabecera.

El cuerpo de `POST /aviso` es el mensaje tal cual, en texto plano. Lo que no
encaje en ninguna plantilla se ignora, que es como se descartan las claves de
seguridad y la publicidad.

## Qué tiene que poner la plataforma

```ts
import { crearBuzon } from "./src/buzon";

const buzon = crearBuzon({
  almacen,                               // obtener, guardar, listar
  clave: SECRETO,                        // la misma que pones en Ajustes
  origen: "https://gustperz.github.io",  // quién puede leer desde el navegador
});

// Dirección web
export default { fetch: (req: Request) => buzon.atender(req) };

// Correo entrante: el mismo camino, sin pasar por la red
await buzon.recibir(textoDelCorreo);
```

`Almacen` son tres métodos sobre cualquier base de datos con llave y valor. En
Cloudflare serían KV o D1; en Val Town, su SQLite. El identificador de cada
pendiente ya es la clave de cruce, así que guardar dos veces el mismo aviso no
duplica nada.

## Cómo se cruzan los duplicados

La misma compra llega por varios lados: Lulo avisa por correo y por SMS.
Se reconocen como una sola por tarjeta, monto y **hora de la compra**, que viene
escrita dentro del mensaje y no es la hora en que llegó. Esa diferencia importa:
un aviso puede entrar dos horas después de la compra, y usar la hora de llegada
obligaría a inventar ventanas de tolerancia.

Compras distintas del mismo comercio no se unen, porque los montos difieren. Y
un aviso que llega tarde sobre algo que ya guardaste no lo revive: solo queda
registrado que también llegó por ahí.

## Sobre las pruebas

Los mensajes de las pruebas son las plantillas reales de cada banco con los
valores cambiados. Ni los montos, ni los comercios, ni los últimos dígitos
corresponden a compras de nadie.
