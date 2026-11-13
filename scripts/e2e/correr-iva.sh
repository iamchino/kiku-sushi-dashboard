#!/bin/bash
# Batería completa del IVA de las ventas (SQL 57): lógica pura, SQL contra
# Postgres real y el dashboard en un navegador. Uso, desde la raíz del repo:
#
#   scripts/e2e/correr-iva.sh
#
# El mini PostgREST corre con MAX_ROWS=1000 (el tope de filas de la API de
# Supabase) y la base tiene un día con 1200 facturas: así se prueba que el
# Excel pagina, que Finanzas suma en la base y que Caja avisa.
# Deja capturas en scripts/e2e/shots/ (iva-*.png sirven para mostrar).
set -e
AQUI="$(cd "$(dirname "$0")" && pwd)"; RAIZ="$(cd "$AQUI/../.." && pwd)"
cd "$AQUI"; mkdir -p shots
./crear-base.sh
./stop-rest.sh; ./stop-serve.sh
PG="psql -h /var/tmp/pgtest -p 5499 -U postgres"
MIG="$RAIZ/supabase/migrations/20261115000000_iva_ventas.sql"

FALLAS=0
echo "── lógica pura"
if (cd "$RAIZ" && npm run -s verificar:iva) > iva-logica.out 2>&1; then echo "  ✓ verificar:iva"; else echo "  ✗ verificar:iva (ver iva-logica.out)"; FALLAS=1; fi

echo "── build de prueba"
(cd "$RAIZ" && VITE_SUPABASE_URL=http://127.0.0.1:54321 VITE_SUPABASE_ANON_KEY=eyJx.eyJ9.x \
  VITE_ARCA_API_URL=http://127.0.0.1:54321/functions/v1 npx vite build --outDir "$AQUI/dist" --emptyOutDir >/dev/null 2>&1)
(nohup node serve.mjs "$AQUI/dist" 4180 > serve.log 2>&1 &)

echo "── SQL (resumen por fecha de emisión, permisos)"
./prep-db.sh kk57 si sin-datos >/dev/null
if $PG -d kk57 -q -v ON_ERROR_STOP=1 -f "$MIG" >/dev/null 2>&1; then echo "  ✓ el SQL 57 es idempotente (segunda corrida)"; else echo "  ✗ el SQL 57 falla al correrlo de nuevo"; FALLAS=1; fi
if cmp -s "$MIG" "$RAIZ/SQL-CIERRES/57-iva-ventas.sql"; then echo "  ✓ SQL-CIERRES/57 = migración"; else echo "  ✗ SQL-CIERRES/57 difiere de la migración"; FALLAS=1; fi
$PG -d kk57 -f iva-sql.sql > iva-sql.out 2>&1 || true
ERR=$(grep -c "ERROR" iva-sql.out || true)
OK=si
# 1 error es el rechazo esperado: anon no puede ejecutar la función.
[ "$ERR" = "1" ] || OK=no
for esperado in \
  "i1 tabla|0" \
  "i1|A|factura|1|200000.00|42000.00|242000.00|0" \
  "i1|B|factura|4|160826.45|33773.55|194600.00|1" \
  "i1|B|nota_credito|2|52000.00|10920.00|62920.00|0" \
  "i1 neto|308826.45|iva 64853.55|total 373680.00" \
  "i2 ayer|B|factura|1|6300.00" "i2 dos dias|8|71153.55" "i2 sin fechas|0" "i2 rango al reves|0" \
  "i3 admin|3" "i3 cocina|0" "i3 empleado|0" \
  "i4|160904.98|33695.02|194600.00" \
  "i5|C|500.00|0.00|500.00|0"; do
  grep -qxF "$esperado" iva-sql.out || { OK=no; echo "    falta: $esperado"; }
done
if [ "$OK" = "si" ]; then echo "  ✓ iva-sql ($ERR rechazo esperado)"; else echo "  ✗ iva-sql ($ERR errores, ver iva-sql.out)"; FALLAS=1; fi
# El diagnóstico es de solo lectura y tiene que correr sin errores.
if $PG -d kk57 -q -v ON_ERROR_STOP=1 -f "$RAIZ/SQL-CIERRES/57a-diagnostico-iva.sql" >/dev/null 2>&1; then echo "  ✓ el 57a (diagnóstico) corre"; else echo "  ✗ el 57a falla"; FALLAS=1; fi

correr() {   # correr <db> <test…>
  ./stop-rest.sh; sleep 0.6
  (MAX_ROWS=1000 nohup node minirest.mjs 54321 "$1" > "rest-$1.log" 2>&1 &); sleep 1.2
  local db="$1"; shift
  for t in "$@"; do
    if DB="$db" node "$t.mjs" > "$t.out" 2>&1; then echo "  ✓ $t ($(grep -c '✓' "$t.out") chequeos)"
    else echo "  ✗ $t"; grep "✗\|Error" "$t.out" | head -5; FALLAS=1; fi
  done
}
preparar() {  # preparar <db> <opcionales>
  ./prep-db.sh "$1" "$2" >/dev/null
  # `hoy` = la fecha local del navegador de las pruebas.
  $PG -d "$1" -q -v ON_ERROR_STOP=1 -v hoy="$(date +%F)" -f seed-iva.sql
}
echo "── navegador, con el SQL 57 aplicado"
preparar kkiva si; correr kkiva iva-t1-caja iva-t2-finanzas
echo "── navegador, SIN el SQL 57"
preparar kkpre57 cuentas_corrientes,cashflow_mensual,stock_compras; correr kkpre57 iva-t3-pre

./stop-rest.sh; ./stop-serve.sh
[ "$FALLAS" = "0" ] && echo "✓ batería del IVA de ventas OK" || echo "✗ hubo fallas"
exit $FALLAS
