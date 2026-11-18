#!/bin/bash
# Batería de los gastos con tarjeta de crédito (18/11): sección aparte en
# Proyección de pagos y "Pagar el resumen". No necesita SQL nuevo. Uso, desde
# la raíz:
#
#   scripts/e2e/correr-tarjeta.sh
#
# Deja capturas en scripts/e2e/shots/ (tc-*.png sirven para mostrar).
set -e
AQUI="$(cd "$(dirname "$0")" && pwd)"; RAIZ="$(cd "$AQUI/../.." && pwd)"
cd "$AQUI"; mkdir -p shots
./crear-base.sh
./stop-rest.sh; ./stop-serve.sh
PG="psql -h /var/tmp/pgtest -p 5499 -U postgres"

FALLAS=0
echo "── lógica pura"
if (cd "$RAIZ" && npm run -s verificar:tarjeta) > tc-logica.out 2>&1; then echo "  ✓ verificar:tarjeta"; else echo "  ✗ verificar:tarjeta (ver tc-logica.out)"; FALLAS=1; fi

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
echo "── navegador (base con todas las migraciones)"
./prep-db.sh kktc si >/dev/null
$PG -d kktc -q -v ON_ERROR_STOP=1 -v hoy="$(date +%F)" -f seed-finanzas.sql
correr kktc tc-t1-tarjeta

./stop-rest.sh; ./stop-serve.sh
[ "$FALLAS" = "0" ] && echo "✓ batería de tarjeta de crédito OK" || echo "✗ hubo fallas"
exit $FALLAS
