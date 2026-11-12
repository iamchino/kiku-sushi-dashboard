#!/bin/bash
# Batería completa del cash flow mensual (SQL 55): lógica pura, SQL contra
# Postgres real y el dashboard en un navegador. Uso, desde la raíz del repo:
#
#   scripts/e2e/correr-cashflow.sh
#
# Deja capturas en scripts/e2e/shots/ (cashflow-*.png sirven para mostrar).
set -e
AQUI="$(cd "$(dirname "$0")" && pwd)"; RAIZ="$(cd "$AQUI/../.." && pwd)"
cd "$AQUI"; mkdir -p shots
./crear-base.sh
./stop-rest.sh; ./stop-serve.sh

FALLAS=0
echo "── lógica pura"
if (cd "$RAIZ" && npm run -s verificar:cashflow) > cf-logica.out 2>&1; then echo "  ✓ verificar:cashflow"; else echo "  ✗ verificar:cashflow (ver cf-logica.out)"; FALLAS=1; fi

echo "── build de prueba"
(cd "$RAIZ" && VITE_SUPABASE_URL=http://127.0.0.1:54321 VITE_SUPABASE_ANON_KEY=eyJx.eyJ9.x \
  VITE_ARCA_API_URL=http://127.0.0.1:54321/functions/v1 npx vite build --outDir "$AQUI/dist" --emptyOutDir >/dev/null 2>&1)
(nohup node serve.mjs "$AQUI/dist" 4180 > serve.log 2>&1 &)

echo "── SQL (agregado por mes, zona horaria, RLS)"
./prep-db.sh kk55 si sin-datos >/dev/null
psql -h /var/tmp/pgtest -p 5499 -U postgres -d kk55 -f cf-sql.sql > cf-sql.out 2>&1 || true
ERR=$(grep -c "ERROR" cf-sql.out || true)
OK=si
# 8 errores son los rechazos esperados (monto negativo, concepto inválido, lista mal formada,
# categoría inventada, dos escrituras del mozo y dos accesos de anon).
[ "$ERR" = "8" ] || OK=no
for esperado in "m-1|ingresos|1000.00|0|1" "m+0|ingresos|2000.00|0|1" "m+0|servicios|0|80.00|1" "m+1|impuestos|0|120.00|1" \
                "sin-fecha|otros|0|33.00|1" "mozo cashflow|0" "mozo baja no borra|0" "siguen|2" "comisiones|45.00" "config2|-150000.00|t|0.00|1"; do
  grep -qxF "$esperado" cf-sql.out || { OK=no; echo "    falta: $esperado"; }
done
if grep -q "cuenta_corriente\|Fuera de rango" <(grep "^m[-+]" cf-sql.out); then OK=no; fi
if [ "$OK" = "si" ]; then echo "  ✓ cf-sql ($ERR rechazos esperados)"; else echo "  ✗ cf-sql ($ERR errores, ver cf-sql.out)"; FALLAS=1; fi

correr() {   # correr <db> <test…>
  ./stop-rest.sh; sleep 0.6
  (nohup node minirest.mjs 54321 "$1" > "rest-$1.log" 2>&1 &); sleep 1.2
  local db="$1"; shift
  for t in "$@"; do
    if DB="$db" node "$t.mjs" > "$t.out" 2>&1; then echo "  ✓ $t ($(grep -c '✓' "$t.out") chequeos)"
    else echo "  ✗ $t"; grep "✗\|Error" "$t.out" | head -5; FALLAS=1; fi
  done
}
echo "── navegador, con el SQL 55 aplicado y datos de ejemplo"
./prep-db.sh kkcf si >/dev/null
psql -h /var/tmp/pgtest -p 5499 -U postgres -d kkcf -q -v ON_ERROR_STOP=1 -f seed-cashflow.sql
correr kkcf cf-t1-cashflow
node cf-capturas.mjs shots >/dev/null 2>&1 && echo "  ✓ capturas (shots/cashflow-*.png)" || { echo "  ✗ capturas"; FALLAS=1; }
echo "── navegador, SIN el SQL 55"
./prep-db.sh kkpre55 cuentas_corrientes >/dev/null
correr kkpre55 cf-t2-pre

./stop-rest.sh; ./stop-serve.sh
[ "$FALLAS" = "0" ] && echo "✓ batería del cash flow OK" || echo "✗ hubo fallas"
exit $FALLAS
