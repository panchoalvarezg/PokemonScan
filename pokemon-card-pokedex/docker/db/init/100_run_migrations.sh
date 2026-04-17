#!/usr/bin/env bash
#
# Aplica en orden alfabético todos los *.sql que el compose monta en
# /migrations (viene de ./supabase/migrations). Se ejecuta automáticamente en
# el primer arranque del contenedor postgres gracias a
# /docker-entrypoint-initdb.d/. Si añades un archivo 006_*.sql en supabase/
# migrations, basta con `docker compose down -v && docker compose up` para
# que se aplique al recrear el volumen.
#
# Usamos ON_ERROR_STOP=1 para abortar al primer fallo en vez de dejar una
# base a medio poblar, que es peor que no tener nada.

set -euo pipefail

MIG_DIR="/migrations"

if [ ! -d "$MIG_DIR" ]; then
  echo "[migrations] $MIG_DIR no existe, saltando."
  exit 0
fi

shopt -s nullglob
files=("$MIG_DIR"/*.sql)
shopt -u nullglob

if [ ${#files[@]} -eq 0 ]; then
  echo "[migrations] No se encontraron .sql en $MIG_DIR"
  exit 0
fi

IFS=$'\n' sorted=($(printf "%s\n" "${files[@]}" | sort))
unset IFS

echo "[migrations] Aplicando ${#sorted[@]} archivos desde $MIG_DIR"
for f in "${sorted[@]}"; do
  echo "[migrations] >> $f"
  psql -v ON_ERROR_STOP=1 \
    --username "$POSTGRES_USER" \
    --dbname   "$POSTGRES_DB" \
    -f "$f"
done
echo "[migrations] Listo."
