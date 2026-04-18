#!/usr/bin/env bash
#
# Aplica UNA migración específica contra el Postgres dockerizado que ya
# está corriendo — SIN borrar el volumen. Así añadir un archivo nuevo en
# supabase/migrations/ no cuesta perder todos los datos.
#
# Uso:
#   ./docker/db/apply-migration.sh 009_otp_audit.sql
#   ./docker/db/apply-migration.sh supabase/migrations/009_otp_audit.sql
#
# El script es idempotente siempre que la migración use `if not exists` /
# `create or replace` (todas las nuestras lo hacen). Si aplicas dos veces la
# misma no pasa nada.

set -euo pipefail

if [ $# -lt 1 ]; then
  echo "Uso: $0 <archivo_migracion.sql>"
  echo "Ej:   $0 009_otp_audit.sql"
  exit 1
fi

INPUT="$1"

# Si sólo pasaron el nombre, lo buscamos en supabase/migrations/
if [ ! -f "$INPUT" ]; then
  CANDIDATE="supabase/migrations/$INPUT"
  if [ -f "$CANDIDATE" ]; then
    INPUT="$CANDIDATE"
  else
    echo "ERROR: no existe $INPUT ni $CANDIDATE"
    exit 1
  fi
fi

SERVICE="${COMPOSE_DB_SERVICE:-db}"
USER="${POSTGRES_USER:-pokescan}"
DB="${POSTGRES_DB:-pokemoncardpokedex}"

echo "[apply-migration] Aplicando $INPUT contra servicio '$SERVICE' (db=$DB, user=$USER)…"

# Volcamos el SQL vía stdin para evitar tener que copiar el archivo al
# contenedor primero.
docker compose exec -T "$SERVICE" psql \
  -v ON_ERROR_STOP=1 \
  --username "$USER" \
  --dbname   "$DB" \
  < "$INPUT"

echo "[apply-migration] Listo ✅"
