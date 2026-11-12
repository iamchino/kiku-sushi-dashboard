#!/bin/bash
# Corre TODA la batería de cuentas corrientes: SQL contra Postgres real y el
# dashboard en un navegador de verdad (Playwright) hablando con ese Postgres a
# través de minirest.mjs. Uso, desde la raíz del repo:
#
#   scripts/e2e/correr-cuentas-corrientes.sh
#
# Sale con código ≠ 0 si algo falla. Deja capturas en scripts/e2e/shots/.
set -e
AQUI="$(cd "$(dirname "$0")" && pwd)"; RAIZ="$(cd "$AQUI/../.." && pwd)"
cd "$AQUI"; mkdir -p shots
./crear-base.sh
./stop-rest.sh; ./stop-serve.sh 2>/dev/null || true

echo "── build de prueba"
(cd "$RAIZ" && VITE_SUPABASE_URL=http://127.0.0.1:54321 VITE_SUPABASE_ANON_KEY=eyJx.eyJ9.x \
  VITE_ARCA_API_URL=http://127.0.0.1:54321/functions/v1 npx vite build --outDir "$AQUI/dist" --emptyOutDir >/dev/null 2>&1)
(nohup node serve.mjs "$AQUI/dist" 4180 > serve.log 2>&1 &)

FALLAS=0
echo "── SQL (triggers, RLS, saldo)"
./prep-db.sh kk54 si sin-datos >/dev/null
psql -h /var/tmp/pgtest -p 5499 -U postgres -d kk54 -f cc-sql.sql > cc-sql.out 2>&1 || true
ERR=$(grep -c "ERROR" cc-sql.out || true); FIN=$(grep "^final|" cc-sql.out || true)
# 12 errores son los rechazos que la prueba espera (duplicado, CUIT, RLS, saldo, inactiva, anon…).
if [ "$ERR" = "12" ] && [ "$FIN" = "final|157000.00|343000.00|3" ]; then echo "  ✓ cc-sql ($ERR rechazos esperados, $FIN)"; else echo "  ✗ cc-sql: $ERR errores, $FIN (ver cc-sql.out)"; FALLAS=1; fi

correr() {   # correr <db> <test…>
  ./stop-rest.sh; sleep 0.6
  (nohup node minirest.mjs 54321 "$1" > "rest-$1.log" 2>&1 &); sleep 1.2
  shift
  for t in "$@"; do
    if node "$t.mjs" > "$t.out" 2>&1; then echo "  ✓ $t ($(grep -c '✓' "$t.out") chequeos)"
    else echo "  ✗ $t"; grep "✗\|Error" "$t.out" | head -5; FALLAS=1; fi
  done
}
echo "── navegador, con el SQL 54 aplicado"
./prep-db.sh kkui si >/dev/null
correr kkui cc-t1-seccion cc-t2-mesa7 cc-t3-pedido cc-t4-mesa3 cc-t5-caja cc-t6-cierre cc-t7-roles cc-t9-tarjeta
echo "── navegador, SIN el SQL 54 (dashboard nuevo sobre base vieja)"
./prep-db.sh kkpre no >/dev/null
correr kkpre cc-t8-pre

./stop-rest.sh; ./stop-serve.sh
[ "$FALLAS" = "0" ] && echo "✓ batería completa OK" || echo "✗ hubo fallas"
exit $FALLAS
