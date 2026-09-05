# Contame

Registra tus gastos diarios como si se los contaras a alguien. Es un chat contigo mismo: cada mensaje que escribes se convierte en la tarjeta del gasto (monto, categoría, descripción y fecha). Si un mensaje no se puede interpretar, queda tal como lo escribiste.

```
15 mil en almuerzo                      →  🍔 Almuerzo · Comida · $ 15.000
ayer 20k de taxi al aeropuerto y 8 mil de bus
                                        →  🚕 Taxi al aeropuerto · Transporte · Ayer · $ 20.000
                                           🚕 Bus · Transporte · Ayer · $ 8.000
cuánto llevo esta semana                →  Esta semana llevas $ 143.000 en 9 gastos.
                                           🍔 Comida: $ 63.000 (44%) ...
```

## Qué entiende

- **Montos**: `15 mil`, `15mil`, `15k`, `$15.000`, `15.000`, `1.5 millones`, `2M`, `quince mil`, `veinte lucas`, `medio millón`, `3,50`.
- **Fechas**: `hoy`, `ayer`, `antier`, `anoche`, `hace 3 días`, `el lunes`, `el viernes pasado`, `el 2 de marzo`, `2/3`, `el 15`. Sin fecha, el gasto es de hoy.
- **Categorías**: se deducen por palabras clave (Comida, Mercado, Transporte, Casa, Salud, Entretenimiento, Ropa, Educación, Regalos, Mascotas, Suscripciones, Otros). Puedes fijarla con `#comida`, `#casa`, etc.
- **Varios gastos en un mensaje**: `café 5 mil, bus 3 mil y cine 30k` crea tres gastos. Una fecha al inicio aplica a todos.
- **Consultas**: `cuánto llevo hoy`, `cuánto gasté en comida este mes`, `resumen de la semana`, `resumen`.
- **Comandos**: `deshacer` (borra el último gasto), `ayuda`.

Toca cualquier tarjeta para editar monto, descripción, categoría o fecha, o para eliminarla. El botón de gráfica abre el resumen por periodo con desglose por categoría y exportación a CSV.

## Cómo funciona

- Aplicación web instalable (PWA) hecha con React + TypeScript + Vite. Funciona sin conexión una vez cargada.
- El parser es de reglas, en español, sin servidores ni claves de API. Está en `src/domain/parser/` con sus pruebas.
- Los datos viven solo en tu navegador (`localStorage`). Desde Ajustes puedes descargar y restaurar un respaldo en JSON. Haz respaldos si cambias de dispositivo.
- Moneda configurable en Ajustes (por defecto COP).

## Desarrollo

```bash
npm install
npm run dev        # servidor de desarrollo
npm test           # pruebas del parser
npm run build      # compila a dist/
npm run preview    # sirve dist/
```

## Publicar en GitHub Pages

El workflow `.github/workflows/deploy.yml` publica automáticamente en cada push a `main`. Antes de la primera publicación hay que activar Pages una vez en el repositorio (Settings → Pages → Build and deployment → Source: **GitHub Actions**); el token del workflow no tiene permiso para hacerlo solo. La app quedará en `https://<usuario>.github.io/contame/` y desde el celular se puede "Agregar a la pantalla de inicio".

Para servirla desde otra ruta, ajusta la variable `BASE_PATH` al compilar (por defecto `/`).
