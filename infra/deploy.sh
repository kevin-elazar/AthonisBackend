#!/usr/bin/env bash
# Atualiza um serviço do Athonis no servidor. Chamado pelo runner do GitHub
# Actions instalado na VPS (sudo restrito a este script) ou à mão, como root:
#
#   /opt/athonis/infra/deploy.sh <api|web> <staging|production> <tag-da-imagem>
#   ex.: deploy.sh api staging sha-3f2a9c1...
#
# Passos: atualiza a pasta infra/ do git, grava a nova tag no .env, baixa a
# imagem, recria só aquele serviço e espera ficar saudável. Se não ficar em
# até 3 minutos, volta para a tag anterior e sai com erro.
set -euo pipefail

SERVICO_BASE="${1:?uso: deploy.sh <api|web> <staging|production> <tag>}"
AMBIENTE="${2:?informe staging ou production}"
TAG="${3:?informe a tag da imagem}"

DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"

case "$SERVICO_BASE:$AMBIENTE" in
  api:production) SERVICO=api;         VAR=API_TAG ;;
  api:staging)    SERVICO=api-staging; VAR=API_STAGING_TAG ;;
  web:production) SERVICO=web;         VAR=WEB_TAG ;;
  web:staging)    SERVICO=web-staging; VAR=WEB_STAGING_TAG ;;
  *) echo "Serviço/ambiente inválido: $SERVICO_BASE $AMBIENTE"; exit 2 ;;
esac

if ! [[ "$TAG" =~ ^[A-Za-z0-9._-]{1,128}$ ]]; then
  echo "Tag inválida: $TAG"; exit 2
fi

log() { echo "[deploy $(date -u +%FT%TZ)] $*"; }

# 1. Infra sempre na versão do git (compose, Caddyfile, Prometheus...).
BRANCH="$(grep -E '^INFRA_BRANCH=' .env | cut -d= -f2 || true)"
if [ -n "${BRANCH:-}" ] && git -C "$DIR/.." rev-parse >/dev/null 2>&1; then
  git -C "$DIR/.." fetch --quiet origin "$BRANCH" && git -C "$DIR/.." merge --ff-only --quiet "origin/$BRANCH" || \
    log "aviso: não consegui atualizar a pasta infra pelo git; sigo com a versão local"
fi

ANTERIOR="$(grep -E "^${VAR}=" .env | cut -d= -f2 || true)"
grava_tag() {
  if grep -qE "^${VAR}=" .env; then sed -i "s|^${VAR}=.*|${VAR}=$1|" .env; else echo "${VAR}=$1" >> .env; fi
}

log "$SERVICO: ${ANTERIOR:-<nenhuma>} -> $TAG"
grava_tag "$TAG"

if ! docker compose pull "$SERVICO"; then
  log "falha ao baixar a imagem; mantendo ${ANTERIOR}"
  grava_tag "${ANTERIOR}"
  exit 1
fi
docker compose up -d --no-deps "$SERVICO"
# Caddy relê o Caddyfile se ele mudou no git.
docker compose exec -T caddy caddy reload --config /etc/caddy/Caddyfile >/dev/null 2>&1 || true

espera_saudavel() {
  local id status
  for _ in $(seq 1 36); do
    id="$(docker compose ps -q "$SERVICO")"
    status="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$id" 2>/dev/null || echo desconhecido)"
    case "$status" in
      healthy|running) [ "$status" = healthy ] || [ "$SERVICO_BASE" = web ] && return 0 ;;
      unhealthy|exited|dead) return 1 ;;
    esac
    sleep 5
  done
  return 1
}

if espera_saudavel; then
  docker image prune -f >/dev/null 2>&1 || true
  log "DEPLOY_OK $SERVICO $TAG"
else
  log "$SERVICO não ficou saudável; voltando para ${ANTERIOR}"
  docker compose logs --tail 50 "$SERVICO" || true
  if [ -n "${ANTERIOR}" ]; then
    grava_tag "${ANTERIOR}"
    docker compose up -d --no-deps "$SERVICO"
  fi
  exit 1
fi
