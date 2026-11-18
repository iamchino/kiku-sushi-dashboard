#!/bin/bash
# Batería del IVA de las compras (crédito fiscal, SQL 61, 18/11). Uso, desde
# la raíz:
#
#   scripts/e2e/correr-iva-compras.sh
#
# Deja capturas en scripts/e2e/shots/ (ic-*.png sirven para mostrar).
set -e
AQUI="$(cd "$(dirname "$0")" && pwd)"; RAIZ="$(cd "$AQUI/../.." && pwd)"
cd "$AQUI"; mkdir -p shots
./crear-base.sh
./stop-rest.sh; ./stop-serve.sh
PG="psql -h /var/tmp/pgtest -p 5499 -U postgres"

FALLAS=0
echo "── lógica pura"
if (cd "$RAIZ" && npm run -s verificar:ivacompras) > ic-logica.out 2>&1; then echo "  ✓ verificar:ivacompras"; else echo "  ✗ verificar:ivacompras (ver ic-logica.out)"; FALLAS=1; fi

echo "── SQL (validaciones, resumen por fecha de factura, permisos)"
./prep-db.sh kkicsql si sin-datos >/dev/null
$PG -d kkicsql -f ic-sql.sql > ic-sql.out 2>&1 || true
ERR=$(grep -c "ERROR" ic-sql.out || true)
OK=si
[ "$ERR" = "12" ] || OK=no
for esperado in "i1|2888.63|21|true" "i2|true|10.5" "i3|3|34388.63|248144.03|213755.40|2|10500.00" "i3 mes anterior|10500.00" \
                "i4|2888.63|21" "i5|16644.03|2888.63" "i5b|Tapas de copetín|2888.63|21|true" "i6|sin iva|sin alicuota|sin fecha" \
                "i7|1" "i8 lectura|34388.63" "i9|2|13388.63"; do
  grep -qxF "$esperado" ic-sql.out || { OK=no; echo "    falta: $esperado"; }
done
# Correrlo dos veces no rompe nada (idempotente) y la verificación da 3 | t | 2.
$PG -d kkicsql -q -At -v ON_ERROR_STOP=1 -f "$RAIZ/SQL-CIERRES/61-iva-de-las-compras.sql" > ic-dosveces.out 2>&1 || OK=no
grep -qx "3|t|2" ic-dosveces.out || { OK=no; echo "    la verificación no dio 3 | t | 2 (ver ic-dosveces.out)"; }
if [ "$OK" = "si" ]; then echo "  ✓ ic-sql ($ERR rechazos esperados)"; else echo "  ✗ ic-sql ($ERR errores, ver ic-sql.out)"; FALLAS=1; fi

echo "── build de prueba"
(cd "$RAIZ" && VITE_SUPABASE_URL=http://127.0.0.1:54321 VITE_SUPABASE_ANON_KEY=eyJx.eyJ9.x \
  VITE_ARCA_API_URL=http://127.0.0.1:54321/functions/v1 npx vite build --outDir "$AQUI/dist" --emptyOutDir >/dev/null 2>&1)
(nohup node serve.mjs "$AQUI/dist" 4180 > serve.log 2>&1 &)

correr() {   # correr <db> <test…>
  ./stop-rest.sh; sleep 0.6
  (nohup node minirest.mjs 54321 "$1" > "rest-$1.log" 2>&1 &); sleep 1.2
  local db="$1"; shift
  for t in "$@"; do
    if DB="$db" node "$t.mjs" > "$t.out" 2>&1; then echo "  ✓ $t ($(grep -c '✓' "$t.out") chequeos)"
    else echo "  ✗ $t"; grep "✗\|Error" "$t.out" | head -5; FALLAS=1; fi
  done
}
preparar() {  # preparar <db> <migraciones>
  ./prep-db.sh "$1" "$2" >/dev/null
  $PG -d "$1" -q -v ON_ERROR_STOP=1 -v hoy="$(date +%F)" -f seed-finanzas.sql
}
echo "── navegador, con el SQL 61 aplicado"
preparar kkic si; correr kkic ic-t1-iva-compras
echo "── navegador, SIN el SQL 61"
preparar kkpreic cuentas_corrientes,cashflow_mensual,stock_compras,iva_ventas,pedidos_sin_factura,canje_y_saldos_cuentas,gastos_fijos; correr kkpreic ic-t2-pre

./stop-rest.sh; ./stop-serve.sh
[ "$FALLAS" = "0" ] && echo "✓ batería del IVA de las compras OK" || echo "✗ hubo fallas"
exit $FALLAS
