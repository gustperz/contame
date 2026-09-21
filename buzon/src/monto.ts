/**
 * Lee un monto escrito por un banco colombiano. Lulo y Banco de Bogotá usan la
 * coma como separador de miles ("90,940", "25,500.00"), al revés de como se
 * escribe normalmente en Colombia, así que hay que aceptar las dos formas.
 */
export function montoDe(texto: string): number {
  const limpio = texto.replace(/[\s$]/g, "");
  if (!/^\d[\d.,]*$/.test(limpio)) return NaN;
  const coma = limpio.lastIndexOf(",");
  const punto = limpio.lastIndexOf(".");

  // Con los dos separadores, el último es el de decimales.
  if (coma !== -1 && punto !== -1) {
    return punto > coma
      ? Number(limpio.replace(/,/g, ""))
      : Number(limpio.replace(/\./g, "").replace(",", "."));
  }

  const separador = coma !== -1 ? coma : punto;
  if (separador === -1) return Number(limpio);

  // Tres dígitos detrás del único separador: es de miles, no decimales.
  const detras = limpio.length - separador - 1;
  if (detras === 3) return Number(limpio.replace(/[.,]/g, ""));
  return Number(limpio.replace(",", "."));
}
