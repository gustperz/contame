import { montoDe } from "./monto";
import type { FuenteTipo, Movimiento } from "./tipos";

const MESES: Record<string, number> = {
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6,
  julio: 7, agosto: 8, septiembre: 9, octubre: 10, noviembre: 11, diciembre: 12,
};

const dos = (n: number) => String(n).padStart(2, "0");

/** "20 de septiembre de 2026" -> "2026-09-20" */
function fechaEnLetras(texto: string): string | null {
  const m = /^(\d{1,2}) de ([a-záéíóú]+) de (\d{4})$/i.exec(texto.trim());
  if (!m) return null;
  const mes = MESES[m[2].toLowerCase()];
  if (!mes) return null;
  return `${m[3]}-${dos(mes)}-${dos(Number(m[1]))}`;
}

/** "6:01 p.m." -> "18:01" */
function hora12(texto: string): string | null {
  const m = /^(\d{1,2}):(\d{2})\s*([ap])\.?\s*m\.?$/i.exec(texto.trim());
  if (!m) return null;
  let h = Number(m[1]);
  const tarde = m[3].toLowerCase() === "p";
  if (tarde && h !== 12) h += 12;
  if (!tarde && h === 12) h = 0;
  return `${dos(h)}:${m[2]}`;
}

/** Quita la ciudad y las mayúsculas sostenidas: "AMERICANINO VALLEDUPAR" -> "Americanino Valledupar" */
function presentable(comercio: string): string {
  return comercio
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase()
    .replace(/(^|\s)(\p{Ll})/gu, (_, sep: string, letra: string) => sep + letra.toUpperCase());
}

interface Regla {
  tipo: FuenteTipo;
  patron: RegExp;
  arma: (g: Record<string, string>) => Movimiento | null;
}

const REGLAS: Regla[] = [
  {
    tipo: "correo-lulo",
    patron: new RegExp(
      "Realizaste una compra en (?<comercio>.+?) por \\$?(?<monto>[\\d.,]+)" +
        "[\\s\\S]*?Origen (?<origen>[^\\n•]*)•\\s*(?<last4>\\d{4})" +
        "[\\s\\S]*?Fecha (?<fecha>\\d{1,2} de [a-záéíóú]+ de \\d{4})" +
        "[\\s\\S]*?Hora (?<hora>\\d{1,2}:\\d{2}\\s*[ap]\\.?\\s*m\\.?)",
      "i",
    ),
    arma: (g) => base(g, /cr[eé]dito/i.test(g.origen ?? "")),
  },
  {
    tipo: "sms-lulo",
    patron: new RegExp(
      "Compra realizada por \\$?(?<monto>[\\d.,]+) en (?<comercio>.+?) " +
        "con tu tarjeta terminada en\\s+\\*?(?<last4>\\d{4})\\.\\s*" +
        "Fecha (?<fecha>\\d{1,2} de [a-záéíóú]+ de \\d{4})\\.\\s*" +
        "Hora (?<hora>\\d{1,2}:\\d{2}\\s*[ap]\\.?\\s*m\\.?)",
      "i",
    ),
    arma: (g) => base(g, false),
  },
  {
    tipo: "sms-bogota",
    patron: new RegExp(
      "Tu compra por \\$?(?<monto>[\\d.,]+) fue aprobada con Tarjeta (?<clase>[^\\s\\d]+) (?<last4>\\d{4}) " +
        "el (?<d>\\d{2})/(?<m>\\d{2})/(?<a>\\d{2,4}) (?<hms>\\d{2}:\\d{2}(?::\\d{2})?) en (?<comercio>.+?)(?:\\s*¿|\\s*\\.\\.\\.|$)",
      "i",
    ),
    arma: (g) => {
      const a = Number(g.a);
      return conFecha(g, `${a < 100 ? 2000 + a : a}-${g.m}-${g.d}`, g.hms.slice(0, 5), /cr[eé]dito/i.test(g.clase ?? ""));
    },
  },
  {
    tipo: "pse-bogota",
    patron: new RegExp(
      "Tu pago por PSE fue aprobado el (?<a>\\d{4})/(?<m>\\d{2})/(?<d>\\d{2}) (?<hms>\\d{2}:\\d{2}(?::\\d{2})?) " +
        "por valor de \\$?(?<monto>[\\d.,]+)",
      "i",
    ),
    arma: (g) => conFecha({ ...g, comercio: "Pago PSE", last4: "" }, `${g.a}-${g.m}-${g.d}`, g.hms.slice(0, 5), false),
  },
];

function base(g: Record<string, string>, credito: boolean): Movimiento | null {
  const fecha = fechaEnLetras(g.fecha ?? "");
  const hora = hora12(g.hora ?? "");
  if (!fecha || !hora) return null;
  return conFecha(g, fecha, hora, credito);
}

function conFecha(g: Record<string, string>, fecha: string, hora: string, credito: boolean): Movimiento | null {
  const monto = montoDe(g.monto ?? "");
  if (!Number.isFinite(monto) || monto <= 0) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || !/^\d{2}:\d{2}$/.test(hora)) return null;
  return {
    monto,
    comercio: presentable(g.comercio ?? ""),
    last4: g.last4 ? g.last4 : null,
    fecha,
    hora,
    credito,
  };
}

export interface Lectura {
  tipo: FuenteTipo;
  movimiento: Movimiento;
}

/**
 * Reconoce un aviso de compra y lo convierte en movimiento. Devuelve null para
 * todo lo demás, que es como se descartan las claves de seguridad, los avisos de
 * Apple Pay y la publicidad: no encajan en ninguna plantilla.
 */
export function leerAviso(texto: string): Lectura | null {
  for (const regla of REGLAS) {
    const m = regla.patron.exec(texto);
    if (!m || !m.groups) continue;
    const movimiento = regla.arma(m.groups);
    if (movimiento) return { tipo: regla.tipo, movimiento };
  }
  return null;
}
