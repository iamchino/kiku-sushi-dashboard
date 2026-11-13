#!/bin/bash
# prep-db.sh <db> <si|no|lista> [sin-datos]
#   Clona la plantilla `kk`, siembra la matriz de permisos y, según el 2º
#   argumento, aplica las migraciones opcionales (cuentas corrientes, cash
#   flow, stock + compras, IVA de ventas). Sin "sin-datos"
#   carga además seed-ui.sql (mesas, pedidos y turno para las pruebas de UI).
set -e
DB=$1; CON=$2
M="$(cd "$(dirname "$0")/../../supabase/migrations" && pwd)"
PG="psql -h /var/tmp/pgtest -p 5499 -U postgres"
$PG -d postgres -q -c "drop database if exists $DB" -c "create database $DB template kk" 2>&1 | grep -v NOTICE || true
for f in 20260803010000_permisos_seed 20260806000000_permisos_tablas 20260807000000_pagos_centralizados 20260808000000_caja_fuerte 20260811000000_dominios_y_negocio 20260812000000_cocina_sin_menu; do
  $PG -d $DB -q -f $M/$f.sql 2>&1 | grep -i "error" || true
done
# Volver a pasar pagos_centralizados (para sembrar permisos) recrea el
# registrar_pago() viejo, de 14 parámetros, al lado del actual con p_cuenta_id.
# En producción hay UNO solo (la migración de cuentas borra el anterior); con
# los dos, un alta sin cuenta falla por "function is not unique".
$PG -d $DB -q -c "do \$\$ begin
  if to_regprocedure('public.registrar_pago(text,text,numeric,text,text,date,uuid,uuid,text,text,date,text,text,text,uuid)') is not null then
    drop function if exists public.registrar_pago(text,text,numeric,text,text,date,uuid,uuid,text,text,date,text,text,text);
  end if;
end \$\$"
# Migraciones opcionales: "si" = todas, "no" = ninguna, o una lista separada
# por comas de palabras del nombre (p. ej. "cuentas_corrientes").
OPCIONALES="20261112000000_cuentas_corrientes 20261113000000_cashflow_mensual 20261114000000_stock_compras 20261115000000_iva_ventas"
for m in $OPCIONALES; do
  aplicar=no
  if [ "$CON" = "si" ]; then aplicar=si; fi
  for palabra in $(echo "$CON" | tr ',' ' '); do case "$m" in *"$palabra"*) aplicar=si ;; esac; done
  if [ "$CON" = "no" ]; then aplicar=no; fi
  if [ "$aplicar" = "si" ]; then $PG -d $DB -q -v ON_ERROR_STOP=1 -f $M/$m.sql 2>&1 | grep -iv "notice" | grep -v "^-\|^ \|^(\|^$" || true; fi
done
if [ "$3" != "sin-datos" ]; then
  $PG -d $DB -q -v ON_ERROR_STOP=1 -f $(dirname $0)/seed-ui.sql
  # En producción admin ve los totales del período y el Excel (caja_historico).
  $PG -d $DB -q -c "insert into rol_permisos (rol_id, recurso_id, ver, editar) values ('admin','caja_historico',true,true) on conflict do nothing"
fi
echo "db $DB lista (migraciones opcionales: $CON)"
