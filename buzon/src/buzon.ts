import { leerAviso } from "./leer";
import { claveDe, cruzar } from "./cruzar";
import type { EstadoPendiente, Pendiente } from "./tipos";

/** Lo único que cada plataforma tiene que implementar. */
export interface Almacen {
  obtener(id: string): Promise<Pendiente | null>;
  guardar(p: Pendiente): Promise<void>;
  listar(estado: EstadoPendiente): Promise<Pendiente[]>;
}

export interface Opciones {
  almacen: Almacen;
  /** Clave que tiene que mandar quien escriba o lea. */
  clave: string;
  /** Origen autorizado a leer desde el navegador; "*" por defecto. */
  origen?: string;
  ahora?: () => Date;
}

/** Comparación que no se delata por el tiempo que tarda. */
function claveCorrecta(recibida: string, esperada: string): boolean {
  if (recibida.length !== esperada.length) return false;
  let diferencia = 0;
  for (let i = 0; i < recibida.length; i++) diferencia |= recibida.charCodeAt(i) ^ esperada.charCodeAt(i);
  return diferencia === 0;
}

export type Resultado =
  | { estado: "leido"; pendiente: Pendiente; nuevo: boolean }
  | { estado: "ignorado" };

export function crearBuzon({ almacen, clave, origen = "*", ahora = () => new Date() }: Opciones) {
  const cabeceras = {
    "Access-Control-Allow-Origin": origen,
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
  };
  const responder = (cuerpo: unknown, status = 200) =>
    new Response(JSON.stringify(cuerpo), { status, headers: { ...cabeceras, "Content-Type": "application/json" } });

  /**
   * Convierte un aviso en pendiente. Lo usa tanto la dirección web como el
   * receptor de correo de cada plataforma.
   */
  async function recibir(texto: string): Promise<Resultado> {
    const lectura = leerAviso(texto);
    if (!lectura) return { estado: "ignorado" };
    const momento = ahora().toISOString();
    const previo = await almacen.obtener(claveDe(lectura.movimiento));
    const pendiente = cruzar(previo, lectura.movimiento, { tipo: lectura.tipo, texto, recibidoEn: momento }, momento);
    await almacen.guardar(pendiente);
    return { estado: "leido", pendiente, nuevo: !previo };
  }

  async function atender(req: Request): Promise<Response> {
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cabeceras });

    const autorizacion = req.headers.get("Authorization") ?? "";
    const recibida = autorizacion.replace(/^Bearer\s+/i, "");
    if (!claveCorrecta(recibida, clave)) return responder({ error: "clave incorrecta" }, 401);

    const ruta = new URL(req.url).pathname.replace(/\/+$/, "");

    if (req.method === "POST" && ruta.endsWith("/aviso")) {
      const texto = await req.text();
      if (!texto.trim()) return responder({ error: "aviso vacío" }, 400);
      return responder(await recibir(texto));
    }

    if (req.method === "GET" && ruta.endsWith("/pendientes")) {
      return responder({ pendientes: await almacen.listar("pendiente") });
    }

    if (req.method === "POST" && ruta.endsWith("/estado")) {
      const cuerpo = (await req.json().catch(() => null)) as { id?: string; estado?: EstadoPendiente } | null;
      const nuevo = cuerpo?.estado;
      if (!cuerpo?.id || (nuevo !== "guardado" && nuevo !== "descartado")) {
        return responder({ error: "hace falta id y estado guardado o descartado" }, 400);
      }
      const pendiente = await almacen.obtener(cuerpo.id);
      if (!pendiente) return responder({ error: "no existe" }, 404);
      await almacen.guardar({ ...pendiente, estado: nuevo, actualizadoEn: ahora().toISOString() });
      return responder({ estado: nuevo });
    }

    return responder({ error: "ruta desconocida" }, 404);
  }

  return { atender, recibir };
}
