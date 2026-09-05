import type { Category, CategoryId } from "./types";

export const CATEGORIES: Category[] = [
  {
    id: "comida",
    name: "Comida",
    emoji: "🍔",
    keywords: [
      "comida", "almuerzo", "almorce", "almorzar", "desayuno", "desayune", "cena", "cene",
      "restaurante", "resto", "hamburguesa", "pizza", "sushi", "pollo", "arepa", "arepas", "empanada",
      "empanadas", "cafe", "tinto", "capuchino", "jugo", "gaseosa", "helado", "postre", "snack",
      "mecato", "onces", "sandwich", "perro", "taco", "tacos", "burrito", "ramen", "wok",
      "domicilio", "rappi", "ifood", "didi food", "uber eats", "pedido", "corrientazo",
      "menu", "panaderia", "pan", "pastel", "torta", "dona", "galletas", "chocolate", "dulces",
      "agua", "bebida", "brunch", "cafeteria", "starbucks", "juan valdez", "mcdonalds", "kfc",
      "subway", "frisby", "crepes", "comi", "comer",
    ],
  },
  {
    id: "mercado",
    name: "Mercado",
    emoji: "🛒",
    keywords: [
      "mercado", "supermercado", "super", "exito", "carulla", "d1", "ara", "jumbo", "olimpica",
      "makro", "pricesmart", "alkosto", "tienda", "fruver", "frutas", "verduras", "carne",
      "huevos", "leche", "arroz", "despensa", "viveres", "abarrotes", "walmart", "soriana",
      "oxxo", "mercadona", "carrefour", "lider", "wong", "tottus", "plaza", "aseo", "jabon",
      "papel higienico", "shampoo", "detergente",
    ],
  },
  {
    id: "transporte",
    name: "Transporte",
    emoji: "🚕",
    keywords: [
      "transporte", "taxi", "uber", "didi", "cabify", "indriver", "indrive", "beat", "bus",
      "buseta", "colectivo", "transmilenio", "sitp", "metro", "mio", "metroplus", "pasaje",
      "pasajes", "gasolina", "combustible", "tanquear", "tanqueada", "nafta", "bencina",
      "parqueadero", "parqueo", "estacionamiento", "peaje", "peajes", "moto", "carro", "auto",
      "lavada", "lavadero", "llanta", "llantas", "aceite", "mecanico", "taller", "vuelo",
      "avion", "tiquete", "tiquetes", "boleto", "pasaje aereo", "flota", "intermunicipal",
      "bicicleta", "bici", "patineta", "scooter", "tren", "flete", "grua",
    ],
  },
  {
    id: "casa",
    name: "Casa",
    emoji: "🏠",
    keywords: [
      "casa", "arriendo", "renta", "alquiler", "hipoteca", "administracion", "admon", "servicios",
      "luz", "energia", "electricidad", "agua servicio", "acueducto", "gas", "internet", "wifi",
      "telefono", "celular plan", "plan celular", "recarga", "claro", "movistar", "tigo", "etb",
      "wom", "cable", "tv", "muebles", "cocina", "reparacion", "plomero", "electricista",
      "cerrajero", "ferreteria", "pintura", "bombillo", "aseo casa", "lavanderia", "empleada",
      "seguro hogar", "predial",
    ],
  },
  {
    id: "salud",
    name: "Salud",
    emoji: "💊",
    keywords: [
      "salud", "farmacia", "drogueria", "droga", "medicina", "medicinas", "medicamento",
      "medicamentos", "pastillas", "pastas", "acetaminofen", "ibuprofeno", "medico", "doctor",
      "doctora", "consulta", "cita", "eps", "prepagada", "odontologo", "dentista", "ortodoncia",
      "optica", "gafas", "lentes", "examen", "examenes", "laboratorio", "hospital", "clinica",
      "terapia", "psicologo", "psicologa", "fisioterapia", "vitaminas", "vacuna", "gimnasio",
      "gym", "crossfit", "yoga", "pilates", "natacion", "cruz verde", "farmatodo", "la rebaja",
    ],
  },
  {
    id: "entretenimiento",
    name: "Entretenimiento",
    emoji: "🎉",
    keywords: [
      "entretenimiento", "cine", "pelicula", "teatro", "concierto", "boleta", "boletas", "entrada",
      "entradas", "bar", "cerveza", "cervezas", "pola", "polas", "trago", "tragos", "licor",
      "aguardiente", "guaro", "ron", "whisky", "vino", "cocteles", "coctel", "fiesta", "rumba",
      "discoteca", "salida", "paseo", "viaje", "hotel", "airbnb", "hostal", "museo", "parque",
      "bolos", "billar", "videojuego", "videojuegos", "juego", "juegos", "steam", "playstation",
      "xbox", "nintendo", "karaoke", "futbol", "partido", "estadio", "libro", "libros",
      "comic", "manga", "lego",
    ],
  },
  {
    id: "ropa",
    name: "Ropa",
    emoji: "👕",
    keywords: [
      "ropa", "camisa", "camiseta", "pantalon", "pantalones", "jean", "jeans", "zapatos",
      "tenis", "zapatillas", "botas", "sandalias", "chaqueta", "saco", "sudadera", "buzo",
      "vestido", "falda", "blusa", "medias", "calcetines", "ropa interior",
      "gorra", "sombrero", "bufanda", "guantes", "cinturon", "correa", "bolso", "cartera",
      "mochila", "maleta", "reloj", "accesorios", "aretes", "collar", "anillo", "zara",
      "h&m", "bershka", "pull&bear", "nike", "adidas", "arturo calle", "koaj", "studio f",
      "peluqueria", "barberia", "corte", "manicure", "pedicure", "unas", "maquillaje",
      "perfume", "crema", "skincare", "cosmeticos",
    ],
  },
  {
    id: "educacion",
    name: "Educación",
    emoji: "📚",
    keywords: [
      "educacion", "curso", "cursos", "clase", "clases", "universidad", "colegio",
      "matricula", "semestre", "pension", "diplomado", "certificacion", "certificado",
      "udemy", "platzi", "coursera", "domestika", "libro de", "cuaderno", "utiles",
      "papeleria", "fotocopias", "impresion", "impresiones", "taller de", "seminario",
      "ingles", "idiomas", "tutoria", "profesor",
    ],
  },
  {
    id: "regalos",
    name: "Regalos",
    emoji: "🎁",
    keywords: [
      "regalo", "regalos", "detalle", "cumpleanos", "cumple", "aniversario", "navidad",
      "amigo secreto", "flores", "ramo", "donacion", "donativo", "limosna", "propina",
      "colecta", "vaca", "rifa", "boda", "matrimonio", "baby shower", "grado",
    ],
  },
  {
    id: "mascotas",
    name: "Mascotas",
    emoji: "🐶",
    keywords: [
      "mascota", "mascotas", "perro", "perra", "gato", "gata", "veterinario", "veterinaria",
      "vete", "concentrado", "purina", "dog chow", "cat chow", "arena gato", "guarderia canina",
      "peluqueria canina", "juguete perro", "correa perro", "vacuna perro", "vacuna gato",
      "desparasitante", "antipulgas",
    ],
  },
  {
    id: "suscripciones",
    name: "Suscripciones",
    emoji: "📱",
    keywords: [
      "suscripcion", "suscripciones", "netflix", "spotify", "disney", "hbo", "max", "prime",
      "amazon prime", "youtube premium", "youtube", "apple music", "icloud", "google one",
      "dropbox", "chatgpt", "claude", "notion", "canva", "adobe", "office", "microsoft 365",
      "crunchyroll", "paramount", "star+", "deezer", "tidal", "twitch", "patreon", "onlyfans",
      "membresia", "mensualidad",
    ],
  },
  {
    id: "otros",
    name: "Otros",
    emoji: "📦",
    keywords: [],
  },
];

export const CATEGORY_BY_ID: Record<CategoryId, Category> = Object.fromEntries(
  CATEGORIES.map((c) => [c.id, c]),
) as Record<CategoryId, Category>;

export function categoryOf(id: CategoryId): Category {
  return CATEGORY_BY_ID[id] ?? CATEGORY_BY_ID.otros;
}
