import type { Aviso, Movimiento, Pendiente } from "./tipos";

/**
 * La clave con la que se reconoce que dos avisos hablan de la misma compra:
 * misma tarjeta, mismo monto y misma hora de la compra. Como la hora viene
 * dentro del mensaje y no es la de llegada, el cruce es exacto y no necesita
 * ventanas de tolerancia. Dos compras distintas del mismo monto en el mismo
 * minuto y con la misma tarjeta se verían como una sola, que es un caso mucho
 * menos probable que el de perder una compra por cruzar de más.
 */
export function claveDe(m: Movimiento): string {
  return [m.last4 ?? "sin-tarjeta", Math.round(m.monto), m.fecha, m.hora].join("|");
}

/** Se queda con el nombre de comercio que más informa. */
function mejorComercio(a: string, b: string): string {
  if (!a) return b;
  if (!b) return a;
  return b.length > a.length ? b : a;
}

/**
 * Suma un aviso al buzón. Si ya existe un pendiente con la misma clave, lo
 * enriquece en vez de duplicarlo, y nunca revive uno que ya guardaste o
 * descartaste: solo deja constancia de que también llegó por ahí.
 */
export function cruzar(
  existente: Pendiente | null,
  movimiento: Movimiento,
  aviso: Aviso,
  ahora: string,
): Pendiente {
  const id = claveDe(movimiento);
  if (!existente) {
    return { id, ...movimiento, avisos: [aviso], estado: "pendiente", creadoEn: ahora, actualizadoEn: ahora };
  }
  const repetido = existente.avisos.some((a) => a.tipo === aviso.tipo && a.texto === aviso.texto);
  if (repetido) return existente;
  return {
    ...existente,
    comercio: mejorComercio(existente.comercio, movimiento.comercio),
    credito: existente.credito || movimiento.credito,
    avisos: [...existente.avisos, aviso],
    actualizadoEn: ahora,
  };
}
