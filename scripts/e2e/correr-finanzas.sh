#!/bin/bash
# Batería de las consultas de administración del 17/11 (SQL 59): pagar una
# factura con canje (no cuenta como plata), "Disponible hoy" con el saldo de
# los bancos cargado a mano, margen de recetas sin IVA y la boleta con
# productos (el precio va sin IVA). Uso, desde la raíz:
#
#   scripts/e2e/correr-finanzas.sh
#
# Deja capturas en scripts/e2e/shots/ (fz-*.png sirven para mostrar).
set -e
AQUI="$(cd "$(dirname "$0")" && pwd)"; RAIZ="$(cd "$AQUI/../.." && pwd)"
cd "$AQUI"; mkdir -p shots
./crear-base.sh
./stop-rest.sh; ./stop-serve.sh
PG="psql -h /var/tmp/pgtest -p 5499 -U postgres"
MIG="$RAIZ/supabase/migrations/20261117000000_canje_y_saldos_cuentas.sql"

FALLAS=0
echo "── lógica pura"
if (cd "$RAIZ" && npm run -s verificar:finanzas) > fz-logica.out 2>&1; then echo "  ✓ verificar:finanzas"; else echo "  ✗ verificar:finanzas (ver fz-logica.out)"; FALLAS=1; fi

echo "── build de prueba"
(cd "$RAIZ" && VITE_SUPABASE_URL=http://127.0.0.1:54321 VITE_SUPABASE_ANON_KEY=eyJx.eyJ9.x \
  VITE_ARCA_API_URL=http://127.0.0.1:54321/functions/v1 npx vite build --outDir "$AQUI/dist" --emptyOutDir >/dev/null 2>&1)
(nohup node serve.mjs "$AQUI/dist" 4180 > serve.log 2>&1 &)

echo "── SQL (canje sin caja ni cuenta, cash flow, saldos de cuentas, permisos)"
./prep-db.sh kk59 si sin-datos >/dev/null
if $PG -d kk59 -q -v ON_ERROR_STOP=1 -f "$MIG" >/dev/null 2>&1; then echo "  ✓ el SQL 59 es idempotente (segunda corrida)"; else echo "  ✗ el SQL 59 falla al correrlo de nuevo"; FALLAS=1; fi
if cmp -s "$MIG" "$RAIZ/SQL-CIERRES/59-canje-y-saldos-de-cuentas.sql"; then echo "  ✓ SQL-CIERRES/59 = migración"; else echo "  ✗ SQL-CIERRES/59 difiere de la migración"; FALLAS=1; fi
$PG -d kk59 -f fz-sql.sql > fz-sql.out 2>&1 || true
ERR=$(grep -c "ERROR" fz-sql.out || true)
OK=si
# 19 errores son los rechazos esperados. Canje (6): pendiente con canje al
# crear y al corregir (3), canje con origen (2), mozo sin permiso (1).
# Saldos (13): validaciones (5), solo lectura (1), mozo (1), escritura directa
# en la tabla (3) y anon (3).
[ "$ERR" = "19" ] || OK=no
for esperado in \
  "z1|pagado|canje|sin origen|sin turno|310000.00" "z1 respuesta|null|false" "z1 cajas|0|0" \
  "z2 filas|1" "z3|pagado|sin origen|sin turno" "z3 cajas|0" \
  "z4|pagado|canje|sin vencimiento|sin origen" "z4 historial|1|Noe la canjeó por una cata" \
  "z5 antes|caja|mov 1" "z5 despues|canje|sin origen|sin turno|mov 0" \
  "z6|pendiente|transferencia" "z7|pagado|sin origen" \
  "z8 cash flow mercaderia|120000.50|2|pend 15000.00" "z8 en la tabla|plata 120000.50|canje 750000.00" \
  "z9|canje|pagado|vino 12.00|10000.00" "z10|0|vino 6.00" "z11 canjes|3|750000.00" \
  "b1|500000.00|true|yamile|sin nota" "b1 vigentes|Mercado Pago KIKU SUSHI|sin saldo|0|0" "b2 filas|1" \
  "b3 vigente|520000.00|entró una acreditación" "b3 filas|3" "b3 negativo|-35000.50" \
  "b4|Kiku SAS — Galicia|520000.00|80000.00|1" "b4|Mercado Pago KIKU SUSHI|-35000.50|12000.00|1" \
  "b5|Banco Macro|true|sin saldo" "b6 ve|3|484999.50" "b6 historial|4" \
  "b7 vigentes|0" "b7 tabla|0" "b8 filas|4|1384999.50" "b10|Noelia Pérez" "b11 filas|4"; do
  grep -qxF "$esperado" fz-sql.out || { OK=no; echo "    falta: $esperado"; }
done
if [ "$OK" = "si" ]; then echo "  ✓ fz-sql ($ERR rechazos esperados)"; else echo "  ✗ fz-sql ($ERR errores, ver fz-sql.out)"; FALLAS=1; fi

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
echo "── navegador, con el SQL 59 aplicado"
preparar kkfz si; correr kkfz fz-t1-canje
preparar kkfz si; correr kkfz fz-t2-disponible
preparar kkfz si; correr kkfz fz-t3-margen
echo "── navegador, SIN el SQL 59"
preparar kkprefz cuentas_corrientes,cashflow_mensual,stock_compras,iva_ventas,pedidos_sin_factura; correr kkprefz fz-t4-pre

./stop-rest.sh; ./stop-serve.sh
[ "$FALLAS" = "0" ] && echo "✓ batería de finanzas OK" || echo "✗ hubo fallas"
exit $FALLAS
