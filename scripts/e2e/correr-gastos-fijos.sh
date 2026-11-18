#!/bin/bash
# Batería de los gastos fijos (SQL 60): se cargan una vez y el pendiente de
# cada mes se crea solo. Uso, desde la raíz:
#
#   scripts/e2e/correr-gastos-fijos.sh
#
# Deja capturas en scripts/e2e/shots/ (gf-*.png sirven para mostrar).
set -e
AQUI="$(cd "$(dirname "$0")" && pwd)"; RAIZ="$(cd "$AQUI/../.." && pwd)"
cd "$AQUI"; mkdir -p shots
./crear-base.sh
./stop-rest.sh; ./stop-serve.sh
PG="psql -h /var/tmp/pgtest -p 5499 -U postgres"
MIG="$RAIZ/supabase/migrations/20261118000000_gastos_fijos.sql"

FALLAS=0
echo "── lógica pura"
if (cd "$RAIZ" && npm run -s verificar:gastosfijos) > gf-logica.out 2>&1; then echo "  ✓ verificar:gastosfijos"; else echo "  ✗ verificar:gastosfijos (ver gf-logica.out)"; FALLAS=1; fi

echo "── build de prueba"
(cd "$RAIZ" && VITE_SUPABASE_URL=http://127.0.0.1:54321 VITE_SUPABASE_ANON_KEY=eyJx.eyJ9.x \
  VITE_ARCA_API_URL=http://127.0.0.1:54321/functions/v1 npx vite build --outDir "$AQUI/dist" --emptyOutDir >/dev/null 2>&1)
(nohup node serve.mjs "$AQUI/dist" 4180 > serve.log 2>&1 &)

echo "── SQL (generación por mes, idempotencia, monto, permisos)"
./prep-db.sh kk60 si sin-datos >/dev/null
if $PG -d kk60 -q -v ON_ERROR_STOP=1 -f "$MIG" >/dev/null 2>&1; then echo "  ✓ el SQL 60 es idempotente (segunda corrida)"; else echo "  ✗ el SQL 60 falla al correrlo de nuevo"; FALLAS=1; fi
if cmp -s "$MIG" "$RAIZ/SQL-CIERRES/60-gastos-fijos.sql"; then echo "  ✓ SQL-CIERRES/60 = migración"; else echo "  ✗ SQL-CIERRES/60 difiere de la migración"; FALLAS=1; fi
$PG -d kk60 -f gf-sql.sql > gf-sql.out 2>&1 || true
ERR=$(grep -c "ERROR" gf-sql.out || true)
OK=si
# 18 errores son los rechazos esperados: validaciones (7), mozo (1), solo
# lectura (1), anon (3), pago ya atado (1), primer mes para atrás (1),
# borrar dos veces (1) y escritura directa en las tablas (3).
[ "$ERR" = "18" ] || OK=no
for esperado in \
  "f1|2027-02-28|2028-02-29|2026-11-30|2026-12-05|septiembre 2026" \
  "g1 gasto|Alquiler|800000.00|10|true|true|yamile" "g1 creados|1" \
  "g1 pago|true|pendiente|800000.00|transferencia|true|true|true|true|Contrato hasta 2028|true" "g1 mes|1|automatico" \
  "g2|0" "g2 pagos|1" "g3|1|true" "g4|0" "g4 pagos|0" \
  "g5|16" "g5 luz|4|true|true|3|1" "g5 comision|12|true" \
  "g6|0" "g7 gastos|5" "g8 mozo ve|0" "g8 mozo genera|0|false" "g8 lectura ve|5" "g8 alquiler sigue activo|true" \
  "g9 genera|0" "g9 gasto|F931|9|true|122000.00|impuestos|F931" "g9 pago|true|true|true|F931 NV NOVIEMBRE26" "g9 mes|pago|true" \
  "g9 historial|editado|Se guardó como gasto fijo" "g10 genera|0" "g10|Internet|true|true|tarjeta_debito" "g10 pagos|1" \
  "g11 luz actual|55000.00" "g11 luz viejo|55000.00" "g11 canje|120000.00" "g11 por el formulario|9500.00" \
  "g12 pausa|false" "g12 pausado genera|0" "g12 reanuda|true" "g12 genera|1" \
  "g13|880000.00|12|Alquiler del local" "g14|1|0" "g15|0|0|1" "final|7|21|20"; do
  grep -qxF "$esperado" gf-sql.out || { OK=no; echo "    falta: $esperado"; }
done
if [ "$OK" = "si" ]; then echo "  ✓ gf-sql ($ERR rechazos esperados)"; else echo "  ✗ gf-sql ($ERR errores, ver gf-sql.out)"; FALLAS=1; fi

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
  # `hoy` = la fecha local del navegador de las pruebas.
  $PG -d "$1" -q -v ON_ERROR_STOP=1 -v hoy="$(date +%F)" -f seed-finanzas.sql
}
echo "── navegador, con el SQL 60 aplicado"
preparar kkgf si; correr kkgf gf-t1-gastos-fijos
echo "── navegador, SIN el SQL 60"
preparar kkpregf cuentas_corrientes,cashflow_mensual,stock_compras,iva_ventas,pedidos_sin_factura,canje_y_saldos_cuentas; correr kkpregf gf-t2-pre

./stop-rest.sh; ./stop-serve.sh
[ "$FALLAS" = "0" ] && echo "✓ batería de gastos fijos OK" || echo "✗ hubo fallas"
exit $FALLAS
