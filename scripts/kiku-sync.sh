#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# kiku-sync — mantiene los dos repos de Kiku al día entre la PC y la Mac.
#
#   scripts/kiku-sync.sh            → estado de cada repo (sin tocar nada)
#   scripts/kiku-sync.sh pull       → trae lo último de GitHub (git pull --rebase)
#   scripts/kiku-sync.sh push "msg" → commitea lo que haya cambiado y sube
#   scripts/kiku-sync.sh am archivo.patch [--keep-cr] → aplica un parche de
#                                     Claude en el repo que corresponda y sube
#
# Busca los repos en la carpeta PADRE de este repo (ej. ~/kiku o Desktop\kiku):
#   kiku-sushi-dashboard/  y  kiku-sushi-web/
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

AQUI="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BASE="${KIKU_DIR:-$(dirname "$AQUI")}"
REPOS=(kiku-sushi-dashboard kiku-sushi-web)
ROJO=$'\e[31m'; VERDE=$'\e[32m'; AMAR=$'\e[33m'; GRIS=$'\e[90m'; FIN=$'\e[0m'

falta_repo() { echo "${ROJO}✗ No encuentro $BASE/$1 — cloná: git clone https://github.com/iamchino/$1.git${FIN}"; }

estado() {
  local r="$1"; local d="$BASE/$r"
  [ -d "$d/.git" ] || { falta_repo "$r"; return; }
  git -C "$d" fetch -q origin
  local sucios ahead behind parches
  sucios=$(git -C "$d" status --porcelain | wc -l | tr -d ' ')
  ahead=$(git -C "$d" rev-list --count origin/master..master)
  behind=$(git -C "$d" rev-list --count master..origin/master)
  parches=$(find "$d" -maxdepth 1 -name '*.patch' | wc -l | tr -d ' ')
  printf "%-22s " "$r"
  [ "$sucios" = 0 ] && printf "${VERDE}limpio${FIN}  " || printf "${AMAR}%s sin commitear${FIN}  " "$sucios"
  [ "$ahead"  = 0 ] && printf "${VERDE}nada por subir${FIN}  " || printf "${ROJO}%s commit(s) SIN SUBIR${FIN}  " "$ahead"
  [ "$behind" = 0 ] && printf "${VERDE}al día${FIN}" || printf "${AMAR}%s commit(s) nuevos en GitHub → pull${FIN}" "$behind"
  [ "$parches" = 0 ] || printf "  ${AMAR}(%s .patch sin aplicar o sin borrar)${FIN}" "$parches"
  echo
}

pull() {
  local r="$1"; local d="$BASE/$r"
  [ -d "$d/.git" ] || { falta_repo "$r"; return; }
  if [ -n "$(git -C "$d" status --porcelain)" ]; then
    echo "${ROJO}✗ $r tiene cambios sin commitear: hacé 'kiku-sync.sh push \"mensaje\"' primero (o git stash).${FIN}"
    git -C "$d" status --short | head -20
    return 1
  fi
  git -C "$d" pull --rebase -q origin master && echo "${VERDE}✓ $r al día ($(git -C "$d" log --oneline -1))${FIN}"
}

push() {
  local r="$1" msg="$2"; local d="$BASE/$r"
  [ -d "$d/.git" ] || { falta_repo "$r"; return; }
  if [ -n "$(git -C "$d" status --porcelain)" ]; then
    git -C "$d" add -A
    git -C "$d" commit -q -m "$msg" && echo "${GRIS}  $r: commit '$msg'${FIN}"
  fi
  if [ "$(git -C "$d" rev-list --count origin/master..master 2>/dev/null || echo 0)" != 0 ] || [ -n "$(git -C "$d" status --porcelain)" ]; then
    git -C "$d" pull --rebase -q origin master
    git -C "$d" push -q origin master && echo "${VERDE}✓ $r subido ($(git -C "$d" log --oneline -1))${FIN}"
  else
    echo "${GRIS}  $r: nada que subir${FIN}"
  fi
}

am() {
  local archivo="$1"; shift || true
  [ -f "$archivo" ] || { echo "${ROJO}✗ no existe $archivo${FIN}"; exit 1; }
  local r
  case "$archivo" in
    *web*) r=kiku-sushi-web ;;
    *)     r=kiku-sushi-dashboard ;;
  esac
  # Si el parche está dentro de un repo, ese es el repo.
  case "$(cd "$(dirname "$archivo")" && pwd)" in
    *kiku-sushi-web*) r=kiku-sushi-web ;;
    *kiku-sushi-dashboard*) r=kiku-sushi-dashboard ;;
  esac
  local d="$BASE/$r"
  echo "${GRIS}Aplicando $(basename "$archivo") en $r…${FIN}"
  git -C "$d" pull --rebase -q origin master
  git -C "$d" am "$@" "$(cd "$(dirname "$archivo")" && pwd)/$(basename "$archivo")"
  git -C "$d" push -q origin master
  rm -f "$archivo"
  echo "${VERDE}✓ $r: $(git -C "$d" log --oneline -1) — subido, parche borrado.${FIN}"
}

cmd="${1:-status}"
fallo=0
case "$cmd" in
  status) echo "${GRIS}Repos en $BASE${FIN}"; for r in "${REPOS[@]}"; do estado "$r" || fallo=1; done ;;
  pull)   for r in "${REPOS[@]}"; do pull "$r" || fallo=1; done ;;
  push)   msg="${2:-Actualizacion desde $(hostname -s) $(date +%Y-%m-%d)}"; for r in "${REPOS[@]}"; do push "$r" "$msg" || fallo=1; done ;;
  am)     shift; am "$@" ;;
  *) echo "uso: $0 [status|pull|push \"mensaje\"|am archivo.patch [--keep-cr]]"; exit 1 ;;
esac
exit $fallo
