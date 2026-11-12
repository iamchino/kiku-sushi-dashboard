#!/bin/bash
# prep-db.sh <db> <con54: si|no> [sin-datos]
#   Clona la plantilla `kk`, siembra la matriz de permisos y, según el 2º
#   argumento, aplica la migración de cuentas corrientes. Sin "sin-datos"
#   carga además seed-ui.sql (mesas, pedidos y turno para las pruebas de UI).
set -e
DB=$1; CON=$2
M="$(cd "$(dirname "$0")/../../supabase/migrations" && pwd)"
PG="psql -h /var/tmp/pgtest -p 5499 -U postgres"
$PG -d postgres -q -c "drop database if exists $DB" -c "create database $DB template kk" 2>&1 | grep -v NOTICE || true
for f in 20260803010000_permisos_seed 20260806000000_permisos_tablas 20260807000000_pagos_centralizados 20260808000000_caja_fuerte 20260811000000_dominios_y_negocio 20260812000000_cocina_sin_menu; do
  $PG -d $DB -q -f $M/$f.sql 2>&1 | grep -i "error" || true
done
if [ "$CON" = "si" ]; then $PG -d $DB -q -v ON_ERROR_STOP=1 -f $M/20261112000000_cuentas_corrientes.sql 2>&1 | grep -iv "notice" || true; fi
if [ "$3" != "sin-datos" ]; then
  $PG -d $DB -q -v ON_ERROR_STOP=1 -f $(dirname $0)/seed-ui.sql
  # En producción admin ve los totales del período y el Excel (caja_historico).
  $PG -d $DB -q -c "insert into rol_permisos (rol_id, recurso_id, ver, editar) values ('admin','caja_historico',true,true) on conflict do nothing"
fi
echo "db $DB lista (SQL 54: $CON)"
