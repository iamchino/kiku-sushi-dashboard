#!/bin/bash
# Batería completa de stock + compras (SQL 56): lógica pura, SQL contra
# Postgres real y el dashboard en un navegador. Uso, desde la raíz del repo:
#
#   scripts/e2e/correr-stock-compras.sh
#
# Deja capturas en scripts/e2e/shots/ (stock-*.png sirven para mostrar).
set -e
AQUI="$(cd "$(dirname "$0")" && pwd)"; RAIZ="$(cd "$AQUI/../.." && pwd)"
cd "$AQUI"; mkdir -p shots
./crear-base.sh
./stop-rest.sh; ./stop-serve.sh
PG="psql -h /var/tmp/pgtest -p 5499 -U postgres"

FALLAS=0
echo "── lógica pura"
if (cd "$RAIZ" && npm run -s verificar:compras) > st-logica.out 2>&1; then echo "  ✓ verificar:compras"; else echo "  ✗ verificar:compras (ver st-logica.out)"; FALLAS=1; fi

echo "── build de prueba"
(cd "$RAIZ" && VITE_SUPABASE_URL=http://127.0.0.1:54321 VITE_SUPABASE_ANON_KEY=eyJx.eyJ9.x \
  VITE_ARCA_API_URL=http://127.0.0.1:54321/functions/v1 npx vite build --outDir "$AQUI/dist" --emptyOutDir >/dev/null 2>&1)
(nohup node serve.mjs "$AQUI/dist" 4180 > serve.log 2>&1 &)

echo "── SQL (boleta, stock, precios, permisos, faltantes)"
./prep-db.sh kk56 si sin-datos >/dev/null
# El SQL 56 tiene que poder correrse dos veces.
if $PG -d kk56 -q -v ON_ERROR_STOP=1 -f "$RAIZ/supabase/migrations/20261114000000_stock_compras.sql" >/dev/null 2>&1; then echo "  ✓ el SQL 56 es idempotente (segunda corrida)"; else echo "  ✗ el SQL 56 falla al correrlo de nuevo"; FALLAS=1; fi
if cmp -s "$RAIZ/supabase/migrations/20261114000000_stock_compras.sql" "$RAIZ/SQL-CIERRES/56-stock-compras.sql"; then echo "  ✓ SQL-CIERRES/56 = migración"; else echo "  ✗ SQL-CIERRES/56 difiere de la migración"; FALLAS=1; fi
$PG -d kk56 -f st-sql.sql > st-sql.out 2>&1 || true
ERR=$(grep -c "ERROR" st-sql.out || true)
OK=si
# 15 errores son los rechazos esperados: total que no cierra (2), validaciones (5),
# mozo sin permiso (2), escritura directa en compra_items (3) y anon (3).
[ "$ERR" = "15" ] || OK=no
for esperado in \
  "s1 stock|Salmón|15.00|12000.00" \
  "s1 mov|Salmón|entrada|10.00|5.00>15.00|compra|true|fin|12000.00|Compra: Pescadería Mar · comp. A-0001" \
  "s2 egresos de mas|0" "s2 arroz|20.00" \
  "s3 diferencia|1000.00|arroz 22.00|2500.00" \
  "s4 stock|Palta|4.00|3000.00" "s4 stock|Salmón|13.00|12000.00" "s4 movs nuevos|3" \
  "s5 movs nuevos|0" "s6 salmon sigue|13.00" \
  "s7 mozo lista|4" "s7 empleado lista|0" "s7 empleado faltantes|0" "s7 empleado items|0" \
  "s8 P1|Salmón|true|1|12000.00|8.00|12000.00" "s8 P2|Wasabi|true|0" "s8 sin proveedor|0|4" \
  "s9 fin lee|2" "s10 precio salmon|12000.00|stock 14.00" \
  "s11 mov|merma|14.00>13.00|Ana Encargada|true|12000.00|manual" \
  "s11 mov|ajuste|13.00>11.50|Ana Encargada|true|12000.00|manual" \
  "s12|Salmón|ini 5.00|compra 9.00|venta 3.00|merma 1.00|conteos 1|falta 1.50|sobra 0|\$falta 18000.00|\$merma 12000.00|fin 8.50|det 2" \
  "s12 quien|Ana Encargada|ajuste|-1.50" "s12 ayer|Arroz|falta 29.00" \
  "s13 items|0" "s13 stock|Salmón|0.50|9000.00" "s13 precio final salmon|10000.00" \
  "s14 caja tras rechazo|0" "s14 arqueo|true|caja 1" "s14 palta|6.00|3500.00" \
  "s15|pendiente|15|arroz 32.00" "s16|Palta|true|7000.00" "s17|6000.00|arroz 35.00" \
  "s18|editado|se contó mal" "s18|anulado|boleta duplicada" \
  "s19 misma hora|1" "s19|ini 6.00|merma 1.00|falta 0.80|\$falta 4400.00|fin 4.20"; do
  grep -qxF "$esperado" st-sql.out || { OK=no; echo "    falta: $esperado"; }
done
if [ "$OK" = "si" ]; then echo "  ✓ st-sql ($ERR rechazos esperados)"; else echo "  ✗ st-sql ($ERR errores, ver st-sql.out)"; FALLAS=1; fi

correr() {   # correr <db> <test…>
  ./stop-rest.sh; sleep 0.6
  (nohup node minirest.mjs 54321 "$1" > "rest-$1.log" 2>&1 &); sleep 1.2
  local db="$1"; shift
  for t in "$@"; do
    if DB="$db" node "$t.mjs" > "$t.out" 2>&1; then echo "  ✓ $t ($(grep -c '✓' "$t.out") chequeos)"
    else echo "  ✗ $t"; grep "✗\|Error" "$t.out" | head -5; FALLAS=1; fi
  done
}
preparar() {  # preparar <db> <opcionales>
  ./prep-db.sh "$1" "$2" >/dev/null
  $PG -d "$1" -q -v ON_ERROR_STOP=1 -f seed-stock.sql
}
echo "── navegador, con el SQL 56 aplicado"
preparar kkst si;  correr kkst st-t1-boleta
preparar kkst si;  correr kkst st-t2-inventario
preparar kkst si;  correr kkst st-t3-roles
preparar kkst si
./stop-rest.sh; sleep 0.6; (nohup node minirest.mjs 54321 kkst > rest-kkst.log 2>&1 &); sleep 1.2
DB=kkst node st-capturas.mjs shots >/dev/null 2>&1 && echo "  ✓ capturas (shots/stock-*.png)" || { echo "  ✗ capturas"; FALLAS=1; }
echo "── navegador, SIN el SQL 56"
preparar kkpre56 cuentas_corrientes,cashflow_mensual; correr kkpre56 st-t4-pre

./stop-rest.sh; ./stop-serve.sh
[ "$FALLAS" = "0" ] && echo "✓ batería de stock + compras OK" || echo "✗ hubo fallas"
exit $FALLAS
