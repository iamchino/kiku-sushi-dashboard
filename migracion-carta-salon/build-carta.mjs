/**
 * Generador de la migración "Carta Salón" (tipo = 'carta').
 *
 * Fuente única de datos: el array CATALOGO de abajo, transcrito de
 * https://www.kikusushi.ar/carta/menu-principal-1767897736776
 *
 * Produce dos archivos hermanos:
 *   - productos.json   → catálogo parseado (lo usa subir-imagenes.mjs)
 *   - carta-salon.sql  → INSERT con reemplazo seguro (pegar en SQL Editor)
 *
 * Ejecutar:  node migracion-carta-salon/build-carta.mjs
 */
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))

const SUPABASE_URL = 'https://sepyieuxsmxhzobtmzxb.supabase.co'
const PREFIX = 'carta'
const C = 'https://res.cloudinary.com/dujkztmkx/image/upload' // base Cloudinary

// helper: arma URL Cloudinary a partir del path "vXXX/restaurant/products/hash.jpg"
const img = (p) => (p ? `${C}/${p}` : null)

// ─── Catálogo (categoria → items) ───────────────────────────────────────────
const CATALOGO = [
  {
    categoria: 'Especiales de Temporada', subtitulo: '',
    items: [
      { n: 'Kiku Otoñal', p: 30000, d: '2 pzas rebozadas (korokke, langostinos furai o harumaki) + 8 pzas de sushi omakase + bebida (cerveza, gaseosa o copa de vino). No se combinan variedades.', i: null },
    ],
  },
  {
    categoria: 'Combinados', subtitulo: 'Surtidos de 12 y 15 piezas',
    items: [
      { n: 'Kiku 12 pzas', p: 31900, d: 'Sin sashimi • Ebi Roll | Philadelphia Roll | Ahumado Roll | New York Roll', i: 'v1772108175/restaurant/products/hklqg7b1nqqrc6brdcuu.jpg' },
      { n: 'Kiku 15 pzas', p: 34600, d: 'Ebi Roll | Philadelphia Roll | Ahumado Roll | New York Roll | Sashimi', i: 'v1772108207/restaurant/products/kxywzwqr0wvhmzafcr2u.jpg' },
      { n: 'Fusión 12 pzas', p: 30200, d: 'Sin tiradito de Salmón • Sake Roll | Tartar Sake Roll | Guacamole Roll | Ebi Roll | Spicy Roll', i: 'v1772107888/restaurant/products/xiecb3t8k6dk848blnfi.jpg' },
      { n: 'Fusión 15 pzas', p: 31700, d: 'Tiradito de Salmón | Sake Roll | Tartar Sake Roll | Guacamole Roll | Ebi Roll | Spicy Roll', i: 'v1772107918/restaurant/products/c0ljsk4qh6xxszsktetg.jpg' },
      { n: 'Nikkei 12 pzas', p: 35000, d: 'Sin Tiradito de Pulpo • Sake Roll | Tempura Roll | Acevichado Roll | Ebi Roll | Nikkei Roll', i: 'v1772109309/restaurant/products/e8ntrzlusujmbyuclpp0.jpg' },
      { n: 'Nikkei 15 pzas', p: 38000, d: 'Tiradito de Pulpo | Sake Roll | Tempura Roll | Acevichado Roll | Ebi Roll | Nikkei Roll', i: 'v1772124991/restaurant/products/fknkh3aua1o5cihomjiu.jpg' },
      { n: 'Exotic 12 pzas', p: 27600, d: 'Phila Nipón Roll | Fancy Roll | Ebi Mango Roll | Niguiri Thai | Tiradito Nipón', i: 'v1772067476/restaurant/products/nkbboj0a6mrvcqqkgz3e.jpg' },
      { n: 'Exotic 15 pzas', p: 32000, d: 'Phila Nipón Roll | Fancy Roll | Ebi Mango Roll | Niguiri Thai | Tiradito Nipón', i: 'v1772067498/restaurant/products/dhiilxvnhvsephyguf9x.jpg' },
      { n: 'Veggie 15 pzas', p: 24300, d: 'Ponzu Roll | Maki Vegan Roll | Bajiru Roll | Arrolladitos Primavera Veggie. Ponzu Roll: relleno de hongos confitados, rúcula, zanahoria y tomates en juliana, envuelto en alga nori y arroz, cubierto de un colchón de paltas, bañado en salsa ponzu. Maki Vegan Roll: arroz relleno de guacamole y espinaca, cubierto de alga nori, con top de tartar vegano (mayonesa spicy y chauchas). Bajiru Roll: relleno de queso, mix de tomates confitados y albahaca fresca, envuelto en arroz y alga nori, con mayonesa de olivo trufada.', i: 'v1772133200/restaurant/products/uapvirdudaavbds9mdjy.jpg' },
    ],
  },
  {
    categoria: 'Gyozas', subtitulo: 'Empanadillas japonesas · 4 unidades',
    items: [
      { n: 'Gyozas de langostinos', p: 13900, d: '4 unidades de empanadillas de trigo japonesas, relleno de langostinos al curry. Selladas y al vapor. Acompañado de salsa china agridulce.', i: 'v1772121142/restaurant/products/pnndirfdmwxflylsiekw.jpg' },
      { n: 'Gyozas de ternera', p: 13500, d: '4 unidades de empanadillas de trigo japonesas, relleno de ternera. Selladas y al vapor. Acompañado de salsa de soja cítrica.', i: 'v1772121159/restaurant/products/uyzhqtuawy0mc0l4rs8o.jpg' },
      { n: 'Gyozas tako', p: 13900, d: '4 unidades de empanadillas de trigo japonesas, relleno de vegetales y pulpo. Selladas y al vapor. Acompañado de salsa china agridulce.', i: 'v1772121177/restaurant/products/koptjg9uqlhem2r2hdcg.jpg' },
      { n: 'Gyozas chiken teriyaki', p: 13900, d: '4 unidades de empanadillas de trigo japonesas, relleno de pollo y teriyaki. Selladas y al vapor. Acompañado de salsa teriyaki y negui.', i: 'v1772121105/restaurant/products/u0yqq6q4s5dil3qq0ga3.jpg' },
      { n: 'Gyozas veggie', p: 11000, d: '4 unidades de empanadillas de trigo japonesas, relleno de vegetales. Selladas y al vapor. Acompañado de salsa china agridulce.', i: 'v1772121194/restaurant/products/swtd1e89f9zdbayltcpr.jpg' },
      { n: 'Gyozas acevichadas', p: 13900, d: '4 unidades de empanadillas japonesas fritas, rellenas de pesca blanca, cebolla morada y cilantro. Fritas, acompañadas de salsa tonkatsu.', i: 'v1772120805/restaurant/products/zy1wvmho5p961hjawhdk.jpg' },
      { n: 'Gyozas de cerdo', p: 13000, d: '4 unidades de empanadillas de trigo japonesas, relleno de carne de cerdo. Selladas y al vapor. Acompañado de salsa china agridulce.', i: 'v1772121123/restaurant/products/edx45k5ssd7ioryfcqyj.jpg' },
    ],
  },
  {
    categoria: 'Harumakis', subtitulo: '',
    items: [
      { n: 'Harumakis de carne', p: 11500, d: '4 unidades de arrollados primavera de carne fritos. Acompañado de salsa china agridulce.', i: 'v1772121256/restaurant/products/nijvomh7vpx5q5dewsmo.jpg' },
    ],
  },
  {
    categoria: 'Rebozados', subtitulo: 'Apanados en panco y fritos',
    items: [
      { n: '2 Langostinos furai', p: 9000, d: '2 pzas de langostinos rebozados en panco y fritos. Acompañado de salsa agridulce de mostaza y miel.', i: 'v1772033153/restaurant/products/qzt0ciwnw5orglkpqmnd.jpg' },
      { n: '4 Langostinos furai', p: 14000, d: '4 pzas de langostinos rebozados en panco y fritos. Acompañado de salsa agridulce de mostaza y miel.', i: 'v1772028682/restaurant/products/qnbqz7q38ql3qatsw0vs.jpg' },
      { n: '6 Langostinos furai', p: 22000, d: '6 pzas de langostinos rebozados en panco y fritos. Acompañado de salsa agridulce de mostaza y miel.', i: 'v1772053230/restaurant/products/gywfojvnysfguwb63h8w.jpg' },
      { n: '2 Maki furai', p: 12300, d: '2 pzas de Maki de salmón, apanado y frito. Top de guacamole y vieiras rancheras.', i: 'v1772121507/restaurant/products/aqbxue3uopzbb6vspwwn.jpg' },
      { n: '4 Maki furai', p: 17000, d: '4 pzas de Maki de salmón, apanado y frito. Top de guacamole y vieiras rancheras.', i: 'v1772121523/restaurant/products/akygdyxiimbt7cnxal6p.jpg' },
      { n: 'Dupla furai', p: 18000, d: 'Dupla de un ceviche de vieiras y maíz chulpi. Un tartar de salmón sobre colchón de shari furai.', i: 'v1772053270/restaurant/products/cld3qmgnoomvev9iw1qa.jpg' },
      { n: 'Oniguiri furai', p: 16000, d: 'Dupla de triángulos de shari, envueltos en alga nori, rebozado en panco y frito, relleno de salmón cocido. Coronado de mayo japo y salsa brava.', i: 'v1772053004/restaurant/products/keiaz0laeyitzuuf00uk.jpg' },
      { n: 'Vieiras furai', p: 13000, d: 'Callos de vieiras apanadas en panco y fritas. Acompañadas de salsa brava.', i: 'v1772122840/restaurant/products/pzcbqttclh5wxvpup2q9.jpg' },
    ],
  },
  {
    categoria: 'Korokkes', subtitulo: '',
    items: [
      { n: 'Korokke de pulpo', p: 17000, d: '2 unidades de croquetas japonesas rellenas de puerro, salsa blanca y pulpo. Acompañado de salsa brava.', i: 'v1772054446/restaurant/products/gn6zyxvveln5oy16pzvw.jpg' },
      { n: 'Korokke de salmón', p: 16000, d: '2 unidades de croquetas japonesas rellenas de puerro, salsa blanca y salmón. Acompañado de salsa brava.', i: 'v1772054512/restaurant/products/lbbxp0taxte4tku5nz96.jpg' },
      { n: 'Korokke de shitake', p: 14000, d: '2 unidades de croquetas japonesas rellenas de puerro, salsa blanca y shitake. Acompañado de salsa brava.', i: 'v1772054536/restaurant/products/aygibrsksodmsdhvgbik.jpg' },
    ],
  },
  {
    categoria: 'Tempura', subtitulo: '2 personas',
    items: [
      { n: 'Tempura Pacifico (2 personas)', p: 22000, d: 'Trozos tamaño bocado fritos en una masa estilo japonesa de vegetales, salmón y langostinos. Acompañado de salsa spicy.', i: 'v1772122912/restaurant/products/uvht1jmegzile4ambnt5.jpg' },
      { n: 'Tempura Veggie', p: 17000, d: 'Trozos tamaño bocado fritos en una masa estilo japonesa de vegetales. Acompañado de salsa spicy.', i: 'v1772123369/restaurant/products/ebacx1kjgoivsho9twxr.jpg' },
    ],
  },
  {
    categoria: 'Tiraditos', subtitulo: '',
    items: [
      { n: 'Tiradito nipón', p: 21000, d: 'Láminas de salmón, acompañado de chimi nipón, espolvoreado de maíz chulpi.', i: 'v1772123966/restaurant/products/enzftipovv3ssehxnocq.jpg' },
      { n: 'Tiradito maracuyá', p: 20000, d: 'Láminas de salmón, acompañado de salsa maracuyá. Coronado de plátano frito.', i: 'v1772123920/restaurant/products/pnatl1gxraf5jzj0tql2.jpg' },
      { n: 'Tiradito confitados', p: 18000, d: 'Láminas de pesca del día. Acompañado de leche de tigre confitada. Topping acevichado y maíz chulpi.', i: 'v1772123700/restaurant/products/w5kidlyxgdy9jnwp3z0c.jpg' },
    ],
  },
  {
    categoria: 'Rollos de Sushi', subtitulo: '',
    items: [
      { n: '8 Tamago roll', p: 16000, d: 'Queso, palmitos y salmón. Envuelto en lámina de tamago. Coronado en salsa maracuyá. Top de hilos de boniato frito.', i: 'v1772054901/restaurant/products/agzpla0swyradu6objqh.jpg' },
      { n: '8 Tamago palta roll', p: 16000, d: 'Queso, palmito y palta. Envuelto en lámina de tamago. Salsa maracuyá, coronado de hilos de boniato frito.', i: 'v1772208973/restaurant/products/xtg6fdme1mefk5bjzyqu.jpg' },
      { n: '8 Tamago ebi furai roll', p: 16500, d: 'Queso cítrico y ebi furai. Envuelto en lámina de tamago. Coronado en salsa maracuyá. Top de hilos de boniato frito.', i: 'v1772056917/restaurant/products/orfguce7hiadumsrof7m.jpg' },
      { n: '9 Huanca Roll', p: 16000, d: 'Langostinos furai y palta. Semicubierto de salmón. Coronado en salsa huancaína y polvo de aceituna.', i: 'v1772054754/restaurant/products/x3bujivcpf7gkxn9zq27.jpg' },
    ],
  },
  {
    categoria: 'Niguiris', subtitulo: 'Moriawases',
    items: [
      { n: '6 Niguiri de salmón', p: 23000, d: 'Bocado de arroz, cubierto por una lonja de salmón rosado.', i: 'v1772211086/restaurant/products/hptanmys63avhdqggzrm.jpg' },
    ],
  },
  {
    categoria: 'Yakimeshis', subtitulo: 'Platos de cocina',
    items: [
      { n: 'Yakimeshi Cerdo', p: 18500, d: 'Arroz salteado con vegetales, huevo, trozos de cerdo y salsa de soja.', i: 'v1772207059/restaurant/products/ouer77mevodadtwssy9j.jpg' },
      { n: 'Yakimeshi de Langostinos', p: 21500, d: 'Arroz salteado con vegetales, huevo, langostinos y salsa de soja. Espolvoreado con katsuobushi.', i: 'v1772207082/restaurant/products/myb1yceyb7d59goj7jjq.jpg' },
      { n: 'Yakimeshi Veggie', p: 18000, d: 'Arroz salteado con vegetales, huevo y salsa de soja.', i: 'v1772053717/restaurant/products/o43pouihbtzedb2ga4vd.jpg' },
    ],
  },
  {
    categoria: 'Yakisobas', subtitulo: 'Platos de cocina',
    items: [
      { n: 'Yakisoba de Cerdo', p: 19500, d: 'Fideos salteados con vegetales, carne de cerdo y salsa yakisoba.', i: 'v1772206533/restaurant/products/hgm5shqbgnnp9hwgxhtp.jpg' },
      { n: 'Yakisoba de Langostinos', p: 21500, d: 'Fideos salteados con vegetales, langostinos y salsa yakisoba. Espolvoreado de katsuobushi.', i: 'v1772206717/restaurant/products/nshykqp8stkmcazlmewg.jpg' },
      { n: 'Yakisoba Veggie', p: 18000, d: 'Fideos salteados con vegetales y salsa yakisoba.', i: 'v1772206449/restaurant/products/cred1qykbimog3zknimt.jpg' },
    ],
  },
  {
    categoria: 'Salteados', subtitulo: 'Platos de cocina',
    items: [
      { n: 'Salteado de Lomo', p: 19000, d: 'Cebolla, zanahoria y morrones. Acompañado de arroz gohan y furikake. Salsa de soja y aceite de sésamo.', i: 'v1772126930/restaurant/products/y4nrqcpyhqztzxshsobv.jpg' },
      { n: 'Salteado de Pollo', p: 19000, d: 'Cebolla, zanahoria y morrones. Acompañado de arroz gohan y furikake. Miel, mostaza y aceite de sésamo.', i: 'v1772127012/restaurant/products/rsrqotp4zcufuovvpinl.jpg' },
      { n: 'Salteado Veggie', p: 16000, d: 'Cebolla, zanahoria y morrones. Acompañado de arroz gohan y furikake.', i: 'v1772126521/restaurant/products/l8v4tpncoza4igncmhwp.jpg' },
    ],
  },
  {
    categoria: 'Postres', subtitulo: '',
    items: [
      { n: 'Copa Dulce', p: 8500, d: '', i: 'v1772055104/restaurant/products/juzvfo3wlzekn1a9rlgx.jpg' },
      { n: 'Taiyaki', p: 6700, d: 'Buñuelo japonés.', i: null },
      { n: 'Taiyaki Cream', p: 7900, d: 'Buñuelo japonés con bocha de helado.', i: null },
      { n: 'Aisu', p: 9000, d: 'Helado en tempura frío.', i: 'v1772054943/restaurant/products/uuiaxm35z8axenmgrgjd.jpg' },
    ],
  },
  {
    categoria: 'Bebidas sin alcohol', subtitulo: '',
    items: [
      { n: 'Agua c/gas', p: 3800, d: '', i: null },
      { n: 'Agua s/gas', p: 3800, d: '', i: null },
      { n: 'Jarra de Limonada', p: 15000, d: '', i: null },
      { n: 'Coca cola lata', p: 4000, d: '', i: null },
      { n: 'Coca cola zero lata', p: 4000, d: '', i: null },
      { n: 'Sprite lata', p: 4000, d: '', i: null },
      { n: 'Vaso de limonada', p: 5000, d: '', i: null },
    ],
  },
  {
    categoria: 'Tragos', subtitulo: 'Con alcohol',
    items: [
      { n: 'Cynar Pomelo', p: 6500, d: 'Pomelo.', i: null },
      { n: 'Cynar Soda', p: 6500, d: '', i: null },
      { n: 'Aperol Spritz', p: 6900, d: '', i: null },
      { n: 'Soju Tonic', p: 8500, d: '', i: null },
      { n: 'Gin La Salvaje Tónica', p: 6800, d: '', i: null },
      { n: 'Gin Dry Yugen Tónica', p: 9500, d: '', i: null },
      { n: 'Somek', p: 30000, d: 'Dos cervezas a elección, una botella de soju.', i: null },
    ],
  },
  {
    categoria: 'Cervezas', subtitulo: '',
    items: [
      { n: 'Cerveza Heineken 330ml', p: 6000, d: 'Lager.', i: null },
      { n: 'Cerveza Corona 330ml', p: 5500, d: 'Mexican Lager.', i: null },
      { n: 'Cerveza Sapporo 330ml', p: 9500, d: 'Japón. Hokkaido, cerveza malteada.', i: null },
      { n: 'Cerveza Tsingtao 330ml', p: 8500, d: 'China.', i: null },
    ],
  },
  {
    categoria: 'Vinos · Viña Las Perdices', subtitulo: '',
    items: [
      { n: 'Las Perdices Torrontés Dulce Natural', p: 21000, d: '', i: 'v1775054739/restaurant/products/keoinr3hwpwbqtidh2l1.jpg' },
      { n: 'Chac Chac Malbec Rosé', p: 22000, d: '', i: 'v1775054810/restaurant/products/e5jkx9jf6e55uj8w8n7g.jpg' },
      { n: 'Las Perdices Reserva Malbec', p: 28000, d: '', i: 'v1775054663/restaurant/products/nl82e91mjr9stsfm2i2k.jpg' },
      { n: 'Las Perdices Reserva Sauvignon Blanc', p: 28000, d: '', i: 'v1775054715/restaurant/products/iq1ryfptvfqfkdj5oj9i.jpg' },
      { n: 'Las Perdices Reserva Pinot Noir', p: 28000, d: '', i: 'v1775054693/restaurant/products/ughdbanx1nn6l0pagqik.jpg' },
      { n: 'Riesling de Viña Las Perdices', p: 38000, d: '', i: 'v1775054772/restaurant/products/wyztrxo08qnuirgdwzfa.jpg' },
      { n: 'Albariño de Viña Las Perdices', p: 38000, d: '', i: 'v1775054478/restaurant/products/wcjl5ywl8zguywe5rqfx.jpg' },
      { n: 'Las Perdices Extra Brut Método Tradicional', p: 40000, d: 'Espumante.', i: 'v1775054630/restaurant/products/gmifk2esd5vj7qjybvek.png' },
    ],
  },
  {
    categoria: 'Vinos · Salentein', subtitulo: '',
    items: [
      { n: 'Salentein Reserva Chardonnay', p: 26000, d: '', i: null },
      { n: 'Salentein Reserva Sauvignon Blanc', p: 26500, d: '', i: null },
      { n: 'Salentein Reserva Malbec', p: 24000, d: '', i: null },
      { n: 'Salentein Brut Nature', p: 30000, d: 'Espumante.', i: null },
      { n: 'Salentein Brut Rosé', p: 30000, d: 'Espumante.', i: null },
      { n: 'Salentein Extra Brut', p: 30000, d: 'Espumante.', i: null },
      { n: 'Salentein Blanc de Blancs', p: 30000, d: 'Espumante.', i: null },
      { n: 'Salentein Doux', p: 30000, d: 'Espumante.', i: null },
    ],
  },
  {
    categoria: 'Vinos · Escorihuela Gascón', subtitulo: '',
    items: [
      { n: 'Escorihuela Gascón Sauvignon Blanc', p: 27000, d: '', i: null },
    ],
  },
  {
    categoria: 'Vinos · Luigi Bosca', subtitulo: '',
    items: [
      { n: 'Luigi Bosca Chardonnay', p: 36000, d: '', i: null },
      { n: 'Luigi Bosca Sauvignon Blanc', p: 36000, d: '', i: null },
      { n: 'Luigi Bosca Rosé', p: 36000, d: '', i: null },
    ],
  },
  {
    categoria: 'Vinos · Catena Zapata', subtitulo: '',
    items: [
      { n: 'DV Catena Chardonnay', p: 40000, d: '', i: null },
    ],
  },
  {
    categoria: 'Vinos · Rutini Wines', subtitulo: '',
    items: [
      { n: 'Rutini Wines Sauvignon Blanc', p: 45000, d: '', i: null },
      { n: 'Rutini Malbec', p: 45000, d: '', i: null },
    ],
  },
  {
    categoria: 'Vinos por Copa', subtitulo: '',
    items: [
      { n: 'Copa Vino Blanco', p: 7500, d: '', i: null },
      { n: 'Copa Vino Malbec', p: 7500, d: '', i: null },
    ],
  },
]

// ─── Helpers ─────────────────────────────────────────────────────────────────
function slugify(str) {
  return str
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // sacar acentos
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

// ─── Build productos.json ─────────────────────────────────────────────────────
const productos = []
const slugsVistos = new Set()
let orden = 0
for (const grupo of CATALOGO) {
  for (const it of grupo.items) {
    let slug = slugify(it.n)
    // garantizar unicidad
    let base = slug, k = 2
    while (slugsVistos.has(slug)) { slug = `${base}-${k++}` }
    slugsVistos.add(slug)
    productos.push({
      categoria: grupo.categoria,
      subtitulo: grupo.subtitulo || '',
      nombre: it.n,
      precio: it.p,
      descripcion: it.d || '',
      imagen_origen: img(it.i),
      slug,
      orden: orden++,
    })
  }
}

writeFileSync(join(__dirname, 'productos.json'), JSON.stringify(productos, null, 2) + '\n', 'utf8')

// ─── Build carta-salon.sql ─────────────────────────────────────────────────────
const esc = (s) => (s == null ? null : `'${String(s).replace(/'/g, "''")}'`)
const imgUrl = (slug) => `${SUPABASE_URL}/storage/v1/object/public/menu-images/${PREFIX}/${slug}.jpg`

const conImagen = productos.filter(p => p.imagen_origen).length
const lines = []
lines.push('-- ============================================================')
lines.push('-- Importacion de CARTA SALON - Kiku Sushi')
lines.push(`-- Productos: ${productos.length}  (con imagen: ${conImagen})`)
lines.push('-- Ejecutar en: Supabase -> SQL Editor -> New query -> Run')
lines.push('-- imagen_url -> bucket menu-images/carta/<slug>.jpg')
lines.push('-- ============================================================')
lines.push('')
lines.push('begin;')
lines.push('')
lines.push('-- ------------------------------------------------------------')
lines.push('-- REEMPLAZO SEGURO de la carta salon anterior.')
lines.push('-- (Si solo queres AGREGAR sin tocar lo existente, borra estas dos sentencias.)')
lines.push('-- No se pueden borrar items con pedidos (FK pedido_items):')
lines.push('--   1) ocultamos los referenciados (preserva historial)')
lines.push('--   2) borramos solo los no referenciados')
lines.push('-- ------------------------------------------------------------')
lines.push('update public.menu_items')
lines.push("   set activo = false")
lines.push(" where tipo = 'carta'")
lines.push('   and id in (select menu_item_id from public.pedido_items where menu_item_id is not null);')
lines.push('')
lines.push('delete from public.menu_items')
lines.push(" where tipo = 'carta'")
lines.push('   and id not in (select menu_item_id from public.pedido_items where menu_item_id is not null);')
lines.push('')
lines.push('insert into public.menu_items')
lines.push('  (tipo, categoria, subtitulo, nombre, descripcion, precio, etiqueta, activo, orden, imagen_url)')
lines.push('values')
const values = productos.map(p => {
  const sub = p.subtitulo ? esc(p.subtitulo) : 'NULL'
  const desc = p.descripcion ? esc(p.descripcion) : esc('')
  const imagen = p.imagen_origen ? esc(imgUrl(p.slug)) : 'NULL'
  return `  ('carta', ${esc(p.categoria)}, ${sub}, ${esc(p.nombre)}, ${desc}, ${p.precio}, NULL, true, ${p.orden}, ${imagen})`
})
lines.push(values.join(',\n') + ';')
lines.push('')
lines.push('commit;')

writeFileSync(join(__dirname, 'carta-salon.sql'), lines.join('\n') + '\n', 'utf8')

console.log(`OK  productos=${productos.length}  conImagen=${conImagen}  categorias=${CATALOGO.length}`)
