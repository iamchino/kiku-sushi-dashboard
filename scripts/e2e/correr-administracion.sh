#!/bin/bash
# Batería de los pedidos de administración del 16/11 (SQL 58): marca "no se
# factura", N° de comprobante en Pagos, facturas y pagos por proveedor, avisos
# del cierre de caja y freno al guardar en la caja fuerte. Uso, desde la raíz:
#
#   scripts/e2e/correr-administracion.sh
#
# Deja capturas en scripts/e2e/shots/ (adm-*.png sirven para mostrar).
set -e
AQUI="$(cd "$(dirname "$0")" && pwd)"; RAIZ="$(cd "$AQUI/../.." && pwd)"
cd "$AQUI"; mkdir -p shots
./crear-base.sh
./stop-rest.sh; ./stop-serve.sh
PG="psql -h /var/tmp/pgtest -p 5499 -U postgres"
MIG="$RAIZ/supabase/migrations/20261116000000_pedidos_sin_factura.sql"

FALLAS=0
echo "── lógica pura"
if (cd "$RAIZ" && npm run -s verificar:sinfactura) > adm-logica.out 2>&1; then echo "  ✓ verificar:sinfactura"; else echo "  ✗ verificar:sinfactura (ver adm-logica.out)"; FALLAS=1; fi

echo "── build de prueba"
(cd "$RAIZ" && VITE_SUPABASE_URL=http://127.0.0.1:54321 VITE_SUPABASE_ANON_KEY=eyJx.eyJ9.x \
  VITE_ARCA_API_URL=http://127.0.0.1:54321/functions/v1 npx vite build --outDir "$AQUI/dist" --emptyOutDir >/dev/null 2>&1)
(nohup node serve.mjs "$AQUI/dist" 4180 > serve.log 2>&1 &)

echo "── SQL (marca con motivo, permisos, tabla de solo lectura)"
./prep-db.sh kk58 si sin-datos >/dev/null
if $PG -d kk58 -q -v ON_ERROR_STOP=1 -f "$MIG" >/dev/null 2>&1; then echo "  ✓ el SQL 58 es idempotente (segunda corrida)"; else echo "  ✗ el SQL 58 falla al correrlo de nuevo"; FALLAS=1; fi
if cmp -s "$MIG" "$RAIZ/SQL-CIERRES/58-pedidos-sin-factura.sql"; then echo "  ✓ SQL-CIERRES/58 = migración"; else echo "  ✗ SQL-CIERRES/58 difiere de la migración"; FALLAS=1; fi
$PG -d kk58 -f sf-sql.sql > sf-sql.out 2>&1 || true
ERR=$(grep -c "ERROR" sf-sql.out || true)
OK=si
# 14 errores son los rechazos esperados: validaciones (4), factura vigente (1),
# escritura directa en la tabla (3), mozo y cocina (3) y anon (3).
[ "$ERR" = "14" ] || OK=no
for esperado in \
  "f1|Canje / cuenta corriente|Noelia Pérez|true" "f1 filas|1" "f1 el pedido no cambia|10000.00|entregado" \
  "f2|Invitación de la casa" "f2 filas|1" "f3 filas|1" \
  "f4 anulada|Se anuló y no se refactura" "f4 rechazada|Pedido de prueba" "f4 filas|3" \
  "f5 filas|3|Invitación de la casa / Pedido de prueba / Se anuló y no se refactura" \
  "f6 mozo ve|0" "f6 cocina ve|0" \
  "f7 ve|3" "f7|Consumo interno|yamileangel" "f7 filas|3" "f9 filas|2"; do
  grep -qxF "$esperado" sf-sql.out || { OK=no; echo "    falta: $esperado"; }
done
if [ "$OK" = "si" ]; then echo "  ✓ sf-sql ($ERR rechazos esperados)"; else echo "  ✗ sf-sql ($ERR errores, ver sf-sql.out)"; FALLAS=1; fi

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
  $PG -d "$1" -q -v ON_ERROR_STOP=1 -v hoy="$(date +%F)" -f seed-adm.sql
}
echo "── navegador, con el SQL 58 aplicado"
preparar kkadm si; correr kkadm adm-t1-sin-factura
preparar kkadm si; correr kkadm adm-t2-pagos-proveedores
preparar kkadm si; correr kkadm adm-t3-cierre
echo "── navegador, SIN el SQL 58"
preparar kkpre58 cuentas_corrientes,cashflow_mensual,stock_compras,iva_ventas; correr kkpre58 adm-t4-pre

./stop-rest.sh; ./stop-serve.sh
[ "$FALLAS" = "0" ] && echo "✓ batería de administración OK" || echo "✗ hubo fallas"
exit $FALLAS
