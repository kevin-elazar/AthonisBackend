#!/usr/bin/env bash
# Atualiza um serviço do Athonis no servidor. Chamado pelo runner do GitHub
# Actions instalado na VPS (sudo restrito a este script) ou à mão, como root:
#
#   /opt/athonis/infra/deploy.sh <api|web> <staging|production> <tag-da-imagem> [commit-da-infra]
#   ex.: deploy.sh api staging sha-3f2a9c1... 3f2a9c1...
#
# Passos: põe a pasta infra/ na versão do git, grava a nova tag no .env, baixa
# a imagem, recria só aquele serviço e espera ficar saudável. Se não ficar em
# até 3 minutos, volta para a tag anterior e sai com erro.
#
# Versão da infra (compose, Caddyfile, Prometheus...):
#   - com o 4º argumento (SHA do commit que gerou a imagem), a pasta é posta
#     exatamente nesse commit (`git checkout --detach`). Assim a release de
#     produção roda com a infra da tag, e não com o que estiver na branch.
#   - sem ele (chamada antiga, como a do deploy do painel), segue a branch
#     INFRA_BRANCH do .env com fast-forward, como antes. Se a pasta estiver
#     fixada num commit por um deploy anterior, fica onde está.
set -euo pipefail

SERVICO_BASE="${1:?uso: deploy.sh <api|web> <staging|production> <tag> [commit]}"
AMBIENTE="${2:?informe staging ou production}"
TAG="${3:?informe a tag da imagem}"
INFRA_SHA="${4:-}"

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
if [ -n "$INFRA_SHA" ] && ! [[ "$INFRA_SHA" =~ ^[0-9a-f]{7,40}$ ]]; then
  echo "Commit inválido: $INFRA_SHA"; exit 2
fi

log() { echo "[deploy $(date -u +%FT%TZ)] $*"; }

# 0. Um deploy por vez. API e painel, staging e produção usam o mesmo .env e
# a mesma pasta do git; dois ao mesmo tempo podiam gravar uma tag por cima da
# outra ou trocar a infra no meio do outro. Espera até 15 minutos.
exec 9>"$DIR/.deploy.lock"
if ! flock -w 900 9; then
  log "outro deploy segura o lock há mais de 15 minutos; desisto"
  exit 1
fi

# 1. Infra na versão do git.
REPO="$DIR/.."
if [ -n "$INFRA_SHA" ]; then
  if ! git -C "$REPO" rev-parse >/dev/null 2>&1; then
    log "erro: $REPO não é um repositório git; não dá para fixar a infra em $INFRA_SHA"
    exit 1
  fi
  # Antes de mexer no .env: se a infra não puder ir para o commit pedido, nada muda.
  if ! git -C "$REPO" fetch --quiet --tags origin; then
    log "erro: git fetch falhou; a infra não foi atualizada e nada mudou"
    exit 1
  fi
  if ! git -C "$REPO" cat-file -e "${INFRA_SHA}^{commit}" 2>/dev/null; then
    # Commit fora das branches/tags conhecidas: o GitHub entrega pelo SHA completo.
    git -C "$REPO" fetch --quiet origin "$INFRA_SHA" 2>/dev/null || true
  fi
  if ! git -C "$REPO" checkout --quiet --detach "$INFRA_SHA"; then
    log "erro: não consegui pôr a infra no commit $INFRA_SHA (arquivo alterado à mão na VPS?); nada mudou"
    exit 1
  fi
  log "infra no commit $(git -C "$REPO" rev-parse --short HEAD)"
else
  BRANCH="$(grep -E '^INFRA_BRANCH=' .env | cut -d= -f2 || true)"
  if [ -n "${BRANCH:-}" ] && git -C "$REPO" rev-parse >/dev/null 2>&1; then
    if ! git -C "$REPO" symbolic-ref -q HEAD >/dev/null; then
      log "infra fixada no commit $(git -C "$REPO" rev-parse --short HEAD) por um deploy anterior; mantida"
    else
      git -C "$REPO" fetch --quiet origin "$BRANCH" && git -C "$REPO" merge --ff-only --quiet "origin/$BRANCH" || \
        log "aviso: não consegui atualizar a pasta infra pelo git; sigo com a versão local"
    fi
  fi
fi

# O Prometheus monta secrets/metrics_token. Servidor instalado antes do token
# não tem o arquivo: cria um marcador (a API sem METRICS_TOKEN ignora o
# cabeçalho). Se o Docker já criou uma pasta no lugar, troca pelo arquivo.
mkdir -p secrets
if [ -d secrets/metrics_token ]; then rmdir secrets/metrics_token 2>/dev/null || true; fi
if [ ! -e secrets/metrics_token ]; then
  printf 'desligado\n' > secrets/metrics_token
  chown 65534:65534 secrets/metrics_token 2>/dev/null || true
  chmod 600 secrets/metrics_token
fi

ANTERIOR="$(grep -E "^${VAR}=" .env | cut -d= -f2 || true)"
grava_tag() {
  if grep -qE "^${VAR}=" .env; then sed -i "s|^${VAR}=.*|${VAR}=$1|" .env; else echo "${VAR}=$1" >> .env; fi
}

log "$SERVICO: ${ANTERIOR:-<nenhuma>} -> $TAG"
grava_tag "$TAG"

# 2. Imagem. Numa release criada logo depois do push da tag, o CI ainda pode
# estar publicando a imagem: tenta por até ~5 minutos antes de desistir.
TENTATIVAS_PULL="${DEPLOY_PULL_TENTATIVAS:-10}"
INTERVALO_PULL="${DEPLOY_PULL_INTERVALO:-30}"
baixou=0
for tentativa in $(seq 1 "$TENTATIVAS_PULL"); do
  if docker compose pull "$SERVICO"; then
    baixou=1
    break
  fi
  if [ "$tentativa" -lt "$TENTATIVAS_PULL" ]; then
    log "imagem $TAG ainda indisponível (tentativa $tentativa/$TENTATIVAS_PULL); nova tentativa em ${INTERVALO_PULL}s"
    sleep "$INTERVALO_PULL"
  fi
done
if [ "$baixou" -ne 1 ]; then
  log "falha ao baixar a imagem após $TENTATIVAS_PULL tentativas; mantendo ${ANTERIOR}"
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
