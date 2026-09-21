/** De qué aviso salió un movimiento. Cada banco tiene su plantilla. */
export type FuenteTipo = "correo-lulo" | "sms-lulo" | "sms-bogota" | "pse-bogota";

export interface Aviso {
  tipo: FuenteTipo;
  /** El mensaje tal como llegó, para que puedas verificar lo que se interpretó. */
  texto: string;
  recibidoEn: string;
}

/**
 * Una compra leída de un aviso. La fecha y la hora se guardan tal como las
 * reporta el banco, en hora local, sin convertir a zonas horarias: son la hora
 * de la compra, no la de llegada del mensaje, y con eso se cruzan los duplicados.
 */
export interface Movimiento {
  monto: number;
  comercio: string;
  /** Últimos cuatro dígitos de la tarjeta; null cuando el aviso no los trae. */
  last4: string | null;
  /** AAAA-MM-DD */
  fecha: string;
  /** HH:MM en 24 horas */
  hora: string;
  /** El aviso dice explícitamente que fue con tarjeta de crédito. */
  credito: boolean;
}

export type EstadoPendiente = "pendiente" | "guardado" | "descartado";

/** Un movimiento en el buzón, con todos los avisos que hablaron de él. */
export interface Pendiente extends Movimiento {
  id: string;
  avisos: Aviso[];
  estado: EstadoPendiente;
  creadoEn: string;
  actualizadoEn: string;
}
