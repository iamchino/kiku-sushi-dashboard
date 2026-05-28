# Producción y Materia Prima — Cómo funciona el sistema de KikuSushi

> **Para quién es este documento:** Para cualquiera que use o entienda el negocio (dueña, encargado, cocina, contador) y también para quien escribe el código. Empieza con una explicación simple y al final hay recomendaciones técnicas.

---

## 1. La idea en una frase

El sistema tiene **dos depósitos** de stock que viven en la misma tabla:

1. **Materia prima** → lo que se compra a proveedores (salmón, arroz, salsa de soja, palta, etc.).
2. **Producción** → lo que la cocina prepara y guarda listo para usar (arroz cocido, salsa teriyaki, masa, etc.).

Cuando la cocina **fabrica algo**, se descuenta de la **materia prima** y se suma a la **producción**. Cuando se **vende un pedido**, se descuenta directamente del stock que usa la receta (puede ser materia prima o producción).

---

## 2. Las piezas que intervienen

### 2.1 Tabla `stock` (inventario)
Cada fila es un ítem. Tiene un campo `tipo_stock` que vale:

- `materia_prima` → ítems de almacén/proveedor. Tienen `precio_unitario`, `rendimiento` (cuánto sirve después de la merma), `proveedor` y `categoria` (almacén, verdulería, pescadería, etc.).
- `produccion` → ítems que la cocina produce. Tienen un `receta_id` que apunta a la receta que los genera.

Las dos cosas comparten:
- `stock_actual` → cantidad disponible hoy.
- `stock_minimo` → umbral para alertas (crítico/bajo/medio/ok).
- `unidad` (kg, g, l, unidades, etc.).

### 2.2 Tabla `recetas`
Cada receta tiene:
- `nombre`, `porciones` (cuántas unidades rinde una "tanda").
- Un menú asociado opcional (`menu_item_id`) para calcular margen de venta.
- `es_subreceta`: si es `true`, está pensada para usarse adentro de otras recetas.
- Una lista de **ingredientes** (`receta_ingredientes`), cada uno apuntando a:
  - un ítem de `stock` (por `stock_id`), **o**
  - otra receta (por `subreceta_id`) → permite **recetas anidadas**.

> Ejemplo: la receta "Roll Filadelfia" usa 80 g de "Arroz cocido" (subreceta), 30 g de salmón (stock materia prima) y 20 g de queso crema (stock materia prima). La subreceta "Arroz cocido" a su vez usa 200 g de arroz crudo + 30 ml de vinagre.

### 2.3 Tabla `produccion_listas` y `produccion_tareas`
- **Lista de producción**: una lista por día (`fecha`, `titulo`, `notas`). La dueña arma la lista de lo que hay que producir.
- **Tareas**: dentro de cada lista. Cada tarea es:
  - **Con receta** → tiene `receta_id`, `cantidad` objetivo, descuenta inventario cuando se completa.
  - **Libre** → solo una descripción (ej. "Limpiar pescado"), **no descuenta nada**.

Estados de una tarea: `pendiente → en_progreso → completada`. La completada se puede revertir (vuelve a `pendiente` y devuelve el stock).

---

## 3. La lógica de descuento explicada paso a paso

### 3.1 Producción (cuando la cocina completa una tarea)

Cuando se aprieta el botón verde **COMPLETAR** en una tarea con receta:

1. El frontend pide nombre del cocinero, cantidad real producida y notas.
2. El frontend recorre la receta y arma una **lista plana de materias primas** a descontar:
   - Multiplica las cantidades por el factor `cantidad_real / porciones_de_la_receta`.
   - Si un ingrediente es una **subreceta**, baja recursivamente hasta llegar a stock real.
   - Si dos ingredientes apuntan al mismo `stock_id`, los suma (función `mergeIngredientes`).
3. Manda todo a la base de datos en una sola llamada (`completar_tarea_produccion`) que hace **una transacción**:
   - Bloquea cada fila de stock (`for update`) para evitar carreras.
   - **Resta** la cantidad consumida y escribe un movimiento tipo `merma` en `stock_movimientos`.
   - Si la receta produce un ítem de stock tipo `produccion` (porque tiene un `stock` con `receta_id = receta.id`), **suma** ese ítem y escribe un movimiento `entrada`.
   - Marca la tarea como `completada`, guarda quién la hizo, cuánto produjo y el detalle del descuento (`descuento_detalle`).
4. Si algún ingrediente no alcanza, la base de datos hace `greatest(0, stock_actual - consumido)` → **trunca a cero silenciosamente** (la UI advierte, pero la operación no se cancela).

Visualmente, antes de confirmar, el modal muestra:
- En verde: cuánto se va a **sumar** a la producción.
- En rojo: cuánto se va a **restar** de cada materia prima.
- En naranja: si alguna materia prima no alcanza.

### 3.2 Revertir una tarea completada

Solo el admin puede. El sistema lee `descuento_detalle` (que guardó el snapshot exacto del descuento) y hace el camino inverso:
- Devuelve la materia prima descontada (movimiento `entrada` con nota "Revertido produccion: …").
- Le quita la producción que se había sumado (movimiento `merma`).
- La tarea vuelve a `pendiente`.

### 3.3 Pedidos (cuando se entrega una venta)

Existe **una segunda vía de descuento** en `usePedidos.descontarStockPedido`. Cuando un pedido pasa a `entregado`:

1. Para cada ítem del pedido, busca la receta asociada al producto del menú.
2. Calcula las porciones reales (cantidad pedida × piezas por variante).
3. Calcula las materias primas crudas con la misma lógica recursiva (`calcularIngredientesCrudos` + `mergeIngredientes`).
4. Llama a un RPC `descontar_stock_produccion` por cada stock_id.
5. Guarda en el pedido `stock_descontado=true` y un `descuento_detalle` para poder revertir.

Si el pedido se cancela, hay una contraparte `revertir_stock_produccion` que devuelve el stock.

> **⚠️ Fallo importante:** Los RPCs `descontar_stock_produccion` y `revertir_stock_produccion` se llaman desde el frontend pero **no existen en ninguna migración SQL del proyecto**. La función para el descuento de pedidos está rota o depende de algo no versionado. Detalle en la sección 5.

---

## 4. Diagrama mental rápido

```
   [ Materia prima ]          [ Producción ]
        (compras)                (cocina)
            │                       │
            │  ←─ tarea completada ─┤   (resta MP, suma PR)
            │                       │
            └───────── venta ───────┴──→  pedido entregado
                                          (resta de uno u otro
                                           según la receta del item)
```

Hay **dos puntos donde el inventario baja**:
- Cuando la cocina **produce** algo (de materia prima a producción).
- Cuando se **vende y entrega** un pedido (descuenta lo que use la receta del producto).

---

## 5. Fallos detectados y riesgos

Listados de mayor a menor gravedad. Cada uno incluye qué pasa hoy y la sugerencia.

### 5.1 🔴 Crítico: RPCs faltantes
- **Qué pasa:** `usePedidos.js` llama a `descontar_stock_produccion` y `revertir_stock_produccion` en Supabase, pero esas funciones no están definidas en `supabase/migrations/*.sql`. Si nunca se crearon a mano en la base, el descuento por venta está fallando silenciosamente (devuelve error y el pedido no descuenta).
- **Recomendación:** crear esos RPCs (o reusar `registrar_movimiento_stock` que ya existe y maneja bien las transacciones) y consolidarlo en una migración versionada.

### 5.2 🔴 Crítico: Stock que se trunca en 0 silenciosamente
- **Qué pasa:** Si una receta pide 200 g de salmón pero solo hay 150 g, la función SQL hace `greatest(0, 150 - 200) = 0`. Queda como si se hubiera consumido todo, pero **se perdió la deuda de 50 g**. La UI advierte antes pero no bloquea.
- **Recomendación:** dos opciones, decidir según política del negocio:
  - **Opción A (estricta):** abortar la operación con error claro si algún ingrediente no alcanza.
  - **Opción B (flexible):** permitir stock negativo y registrar el faltante como un movimiento especial (`tipo = 'faltante'`) para auditar después.

### 5.3 🟠 Alto: Doble vía de descuento sin control de superposición
- **Qué pasa:** Hay dos lugares que descuentan inventario (producción y venta entregada). Si una receta de venta usa una **subreceta** en lugar de un ítem de stock tipo `produccion`, la venta descuenta materia prima cruda. Pero esa misma materia prima ya pudo haberse descontado al producir el batch previo. Resultado: **doble descuento**.
- **Recomendación:** definir una regla clara y respetarla en todas las recetas:
  - Si la receta del menú usa un `stock` tipo `produccion` → la venta solo descuenta ese stock (el batch).
  - Si usa subrecetas o materia prima directa → la venta descuenta crudo y **no** debería haber paso de producción intermedio.
  - Idealmente, marcar la receta como "modo batch" o "modo directo" para forzar la coherencia.

### 5.4 🟠 Alto: La merma (`rendimiento`) no se aplica al descontar
- **Qué pasa:** El campo `rendimiento` (ej. 0.7 = se aprovecha 70% del salmón) **solo se usa para calcular el costo**, no para ajustar la cantidad descontada. Si la receta dice "100 g salmón", se descuentan 100 g de stock, aunque físicamente hayan tenido que sacar ~143 g del depósito.
- **Recomendación:** dos caminos:
  - Aplicar `rendimiento` en `calcularIngredientesCrudos` (ej. `cantidad / rendimiento`).
  - O dejar claro en la UI de recetas que **el ingrediente se carga en cantidad bruta** (incluyendo merma), y poner una ayuda visual.

### 5.5 🟠 Alto: Falta de transacción en el descuento de pedidos
- **Qué pasa:** El frontend recorre los ingredientes y hace un RPC por cada uno. Si el segundo falla, el primero **ya quedó descontado**. No hay rollback.
- **Recomendación:** crear un único RPC tipo `descontar_pedido(p_pedido_id, p_consumos jsonb)` que haga todo dentro de una transacción, igual que se hace en `completar_tarea_produccion`.

### 5.6 🟡 Medio: Sin foto histórica del costo
- **Qué pasa:** Cuando se consume un ingrediente, no se guarda el precio al que se compró. Si mañana sube el precio del salmón, no se puede reconstruir cuánto costó esa producción de ayer.
- **Recomendación:** agregar `precio_unitario_en_consumo` en `stock_movimientos` y poblarlo desde el RPC. Permite reportes de costos estables.

### 5.7 🟡 Medio: Sin lotes ni fechas de vencimiento
- **Qué pasa:** Stock se trata como un único pozo. Para un sushi (pescado crudo) la trazabilidad por lote y FEFO (first-expire-first-out) es importante para sanidad y para minimizar mermas.
- **Recomendación:** agregar una tabla `stock_lotes` (lote, fecha_ingreso, fecha_vencimiento, cantidad) y consumir siempre del lote que vence primero. Es un cambio grande, planificarlo aparte.

### 5.8 🟡 Medio: Permisos demasiado amplios
- **Qué pasa:** El rol `cocina` puede llamar `registrar_movimiento_stock` y editar precios (`updatePrecio` va directo a `update stock`). Esto le permite a cualquier cocinero cambiar precios.
- **Recomendación:**
  - Mover `updatePrecio` a un RPC con check `is_admin()`.
  - Documentar qué tipos de movimientos puede hacer cocina (probablemente solo `merma` y `entrada` por recepción de mercadería, no `ajuste`).

### 5.9 🟡 Medio: Validación de unidades inexistente
- **Qué pasa:** Si una receta pide "0.5" pero el stock está en kg y el cocinero pensó en gramos, el sistema descuenta 0.5 kg sin avisar. No hay control.
- **Recomendación:** mostrar la unidad del stock al lado del campo de cantidad en el modal de recetas (ya se hace en algunos lugares — extender a todos) y agregar advertencia si las unidades del subreceta y del receta padre difieren mucho en magnitud.

### 5.10 🟢 Bajo: Las tareas libres no dejan rastro contable
- **Qué pasa:** Si la cocina marca todo como "tarea libre", no se descuenta nada. Es útil para tareas reales sin consumo (lavar, limpiar), pero también puede usarse para "saltear" el descuento.
- **Recomendación:** que solo el admin pueda crear tareas libres, o que las libres queden visibles en un reporte de "tareas sin descuento" para auditar.

### 5.11 🟢 Bajo: Recursión silenciosa de recetas
- **Qué pasa:** Si una receta se autoreferencía (A → B → A), `calcularIngredientesCrudos` corta con `visited` y devuelve vacío. No avisa. Resultado: descuento incompleto.
- **Recomendación:** registrar un warning, y mejor aún, validar al guardar una receta que no haya ciclos.

### 5.12 🟢 Bajo: Suscripciones en tiempo real demasiado abiertas
- **Qué pasa:** `useProduccion` y `useStock` escuchan todos los cambios de `stock` y `produccion_tareas`. Con varios usuarios concurrentes pueden gatillarse muchos refetch.
- **Recomendación:** filtrar las suscripciones por `lista_id` o por `fecha` para reducir tráfico.

### 5.13 🟢 Bajo: Diferencia entre objetivo y real sin auditoría visible
- **Qué pasa:** `cantidad` (objetivo) y `cantidad_real` se guardan, pero no hay reporte que muestre "esta semana se produjo X% menos/más de lo planificado".
- **Recomendación:** sumar un mini reporte semanal en Analíticas (planificado vs producido).

### 5.14 🟢 Bajo: Edición de receta destruye ingredientes anteriores
- **Qué pasa:** `updateReceta` hace `delete from receta_ingredientes where receta_id = …` y reinsert. No queda historial de la versión vieja. Si una tarea ya pasada se quiere revertir, el cálculo será con la receta nueva.
- **Recomendación:** versionar las recetas, o al menos guardar el snapshot de la receta dentro de la tarea cuando se crea (no solo cuando se completa).

---

## 6. Recomendaciones de cómo debería ser idealmente

Ordenadas por valor/esfuerzo.

### 6.1 Quick wins (1–3 días de trabajo)
1. **Definir y migrar los RPCs faltantes** (`descontar_stock_produccion`, `revertir_stock_produccion`). Idealmente uno solo que tome un array JSONB y haga todo transaccional. Esto desbloquea el descuento por venta.
2. **Decidir y aplicar la política de "stock insuficiente"** (abortar vs registrar faltante). Hoy es la fuente principal de errores de inventario.
3. **Mover edición de precios a admin** (RPC con `is_admin()`).
4. **Mostrar en el modal de completar la disponibilidad real** del producto a producir antes de confirmar (ej. "esta tarea creará 20 unidades de arroz cocido; ya hay 8 en stock").

### 6.2 Mediano plazo (1–2 semanas)
5. **Snapshot de costo** en cada movimiento de stock. Habilita reportes de costos confiables.
6. **Validador de recetas**: no permitir ciclos, advertir unidades inconsistentes entre subreceta y receta padre.
7. **Definir el "modo" de la receta** (`batch` vs `directo`) para evitar doble descuento entre producción y venta. Hacer el sistema lo suficientemente listo para no permitir configuraciones inconsistentes.
8. **Reporte "planificado vs real" diario y semanal** dentro de Analíticas.

### 6.3 Largo plazo (más invasivo)
9. **Lotes con vencimiento** (`stock_lotes`) y consumo FEFO. Crítico para sushi.
10. **Versionado de recetas**: cada vez que se edita, queda una versión nueva con `version_id`. Las tareas y pedidos referencian la versión que usaron.
11. **Movimientos negativos auditables**: agregar `tipo = 'faltante'` para reflejar deudas en stock cuando no alcanza, en vez de truncar a 0.
12. **Una única función de "consumo de receta"** en Postgres que sea llamada tanto por producción como por ventas. Evita que la lógica viva duplicada en JS y SQL.
13. **Pruebas automáticas** del flujo completo: alta de receta → producir → vender → revertir. Hoy esto se prueba a mano.

---

## 7. Glosario para no técnicos

| Palabra | Significa |
|---|---|
| **Stock** | Inventario disponible. |
| **Movimiento de stock** | Cada vez que algo entra (compra), sale (venta o uso) o se ajusta (recuento físico). Queda un renglón en `stock_movimientos`. |
| **Receta** | "Mapa" de qué ingredientes y cantidades necesita un producto. |
| **Subreceta** | Una receta que se usa dentro de otra (ej. arroz cocido dentro de un roll). |
| **Materia prima** | Lo que se compra (insumos). |
| **Producción** | Lo que la cocina prepara como semielaborado y guarda en stock listo para usar. |
| **Tarea de producción** | Una unidad de trabajo del día (ej. "Cocinar 5 kg de arroz"). |
| **Merma** | Pérdida natural al usar un insumo (descartes, recortes). Se modela con el campo `rendimiento`. |
| **Rendimiento** | Porcentaje aprovechable de un insumo (1 = se aprovecha todo, 0.7 = se aprovecha 70%). |
| **Revertir** | Deshacer una operación: devuelve el stock al estado anterior. |
| **RPC** | Función que vive en la base de datos y se llama desde la app. Hace varias cosas en una sola operación segura. |
| **Transacción** | Bloque de operaciones que pasan todas juntas o ninguna. Sirve para no quedar a medio camino si algo falla. |

---

## 8. TL;DR (resumen ejecutivo)

- El sistema descuenta inventario en **dos momentos**: cuando se **completa una tarea de producción** y cuando se **entrega un pedido**.
- El descuento de producción está bien hecho (transaccional, con reversa). El de ventas **tiene funciones SQL faltantes** y no es transaccional.
- Cuando el stock no alcanza, hoy **trunca a cero sin avisar**, lo que genera diferencias de inventario.
- El `rendimiento` (merma) se usa solo para costos, **no** para descontar de más. Es una trampa silenciosa.
- Lo más urgente: (1) crear las RPCs faltantes, (2) definir política de stock insuficiente, (3) mover edición de precios a admin.
- Lo más valioso a mediano plazo: lotes con vencimiento, versionado de recetas y snapshots de costo.
