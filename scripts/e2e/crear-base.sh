#!/bin/bash
# Levanta (si hace falta) el Postgres local de pruebas y arma la base plantilla
# `kk`: stubs de Supabase + provision/esquema_base.sql + las migraciones
# posteriores al dump. Las bases de cada prueba se clonan de esta (prep-db.sh).
#
#   scripts/e2e/crear-base.sh          # no hace nada si `kk` ya existe
#   scripts/e2e/crear-base.sh --forzar # la rearma desde cero
#
# El data dir va en /var/tmp (NO en /tmp/claude-*: ahí se resetean los permisos
# y Postgres se cae con "pg_control: Permission denied") y corre como `nobody`.
set -e
AQUI="$(cd "$(dirname "$0")" && pwd)"; RAIZ="$(cd "$AQUI/../.." && pwd)"
DIR=/var/tmp/pgtest; PORT=5499; BIN=/usr/lib/postgresql/16/bin
PG="psql -h $DIR -p $PORT -U postgres"

if [ ! -d "$DIR/data" ]; then
  mkdir -p "$DIR" && chown nobody "$DIR"
  su nobody -s /bin/bash -c "$BIN/initdb -D $DIR/data -U postgres -A trust >/dev/null"
fi
if ! su nobody -s /bin/bash -c "$BIN/pg_ctl -D $DIR/data status" >/dev/null 2>&1; then
  su nobody -s /bin/bash -c "$BIN/pg_ctl -D $DIR/data -o '-k $DIR -p $PORT -c listen_addresses=' -l $DIR/log start" >/dev/null
  sleep 2
fi
if [ "$1" != "--forzar" ] && [ "$($PG -d postgres -Atc "select 1 from pg_database where datname = 'kk'")" = "1" ]; then
  echo "base kk ya existe (usar --forzar para rearmarla)"; exit 0
fi
$PG -d postgres -q -c "drop database if exists kk" -c "create database kk"
$PG -d kk -q -v ON_ERROR_STOP=1 -f "$AQUI/stubs-supabase.sql"
# Errores esperables e ignorables: rol supabase_admin, transaction_timeout,
# pg_net, supabase_realtime y dos FKs de permisos que el dump trae fuera de orden.
$PG -d kk -q -f "$RAIZ/provision/esquema_base.sql" 2>&1 | grep -c ERROR | sed 's/^/esquema_base: errores ignorables = /'
for f in "$RAIZ"/supabase/migrations/2026082[0-9]*.sql "$RAIZ"/supabase/migrations/2026083*.sql "$RAIZ"/supabase/migrations/202609*.sql "$RAIZ"/supabase/migrations/20261[01]*.sql; do
  [ -f "$f" ] || continue
  # Las migraciones "opcionales" las aplica prep-db.sh según la prueba (así se
  # puede probar el dashboard nuevo contra una base que todavía no las tiene).
  case "$f" in *cuentas_corrientes*|*cashflow_mensual*) continue ;; esac
  $PG -d kk -q -f "$f" 2>&1 | grep ERROR | grep -v "supabase_admin\|transaction_timeout\|pg_net\|supabase_realtime\|recurso_tablas_recurso_id_fkey\|rol_permisos_recurso_id_fkey" | sed "s|^|$(basename "$f"): |" || true
done
echo "base kk lista"
