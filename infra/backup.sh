#!/usr/bin/env bash
# Backup diário dos bancos (cron da VM, 03:00). Guarda os últimos 14 dias em
# /var/backups/athonis. Restaurar:
#   gunzip -c athonis-AAAA-MM-DD.sql.gz | docker compose exec -T postgres psql -U athonis athonis
set -euo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
DESTINO=/var/backups/athonis
mkdir -p "$DESTINO"
cd "$DIR"

USUARIO="$(grep -E '^POSTGRES_USER=' .env | cut -d= -f2)"
USUARIO="${USUARIO:-athonis}"
DIA="$(date +%F)"

for banco in athonis athonis_staging; do
  docker compose exec -T postgres pg_dump -U "$USUARIO" --no-owner "$banco" | gzip > "$DESTINO/$banco-$DIA.sql.gz"
done

find "$DESTINO" -name '*.sql.gz' -mtime +14 -delete
echo "backup ok: $DESTINO ($DIA)"
