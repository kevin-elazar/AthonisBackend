#!/usr/bin/env bash
# Roda DENTRO do servidor (chamado pelo vps-bootstrap.sh).
# Gera infra/.env e os arquivos de ambiente das APIs com senhas aleatórias,
# sem sobrescrever o que já existe, e sobe os serviços de base.
#
#   vm-configure.sh <BASE_DOMAIN>
set -euo pipefail

BASE_DOMAIN="${1:?informe o domínio base}"
INFRA=/opt/athonis/infra
cd "$INFRA"

aleatorio() { openssl rand -base64 "$1" | tr -d '/+=\n' | cut -c1-"$2"; }

if [ ! -f .env ]; then
  sed -e "s|^BASE_DOMAIN=.*|BASE_DOMAIN=${BASE_DOMAIN}|" \
      -e "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=$(aleatorio 36 40)|" \
      -e "s|^GRAFANA_ADMIN_PASSWORD=.*|GRAFANA_ADMIN_PASSWORD=$(aleatorio 24 24)|" \
      .env.example > .env
  chmod 600 .env
  echo ".env criado"
else
  sed -i "s|^BASE_DOMAIN=.*|BASE_DOMAIN=${BASE_DOMAIN}|" .env
  echo ".env já existia; só o domínio foi atualizado"
fi

# Token do /metrics, igual nas duas APIs e no Prometheus. Só é gerado numa
# instalação nova (sem o arquivo); num servidor que já existe, nada muda.
mkdir -p secrets
if [ -d secrets/metrics_token ]; then rmdir secrets/metrics_token; fi
if [ ! -f secrets/metrics_token ]; then
  METRICS_TOKEN="$(aleatorio 48 48)"
  printf '%s\n' "$METRICS_TOKEN" > secrets/metrics_token
  echo "secrets/metrics_token criado"
else
  METRICS_TOKEN=""
fi
# O Prometheus roda como nobody (65534) e precisa ler o arquivo.
chown 65534:65534 secrets/metrics_token
chmod 600 secrets/metrics_token

for ambiente in production staging; do
  arquivo="env/api.${ambiente}.env"
  prefixo=""; [ "$ambiente" = staging ] && prefixo="staging-"
  if [ ! -f "$arquivo" ]; then
    sed -e "s|^JWT_SECRET=.*|JWT_SECRET=$(aleatorio 64 64)|" \
        -e "s|^CORS_ORIGIN=.*|CORS_ORIGIN=https://${prefixo}app.${BASE_DOMAIN}|" \
        -e "s|^METRICS_TOKEN=.*|METRICS_TOKEN=${METRICS_TOKEN}|" \
        "env/api.${ambiente}.env.example" > "$arquivo"
    chmod 600 "$arquivo"
    echo "$arquivo criado"
  fi
done

# Sem a chave do Google a API sobe normalmente (rotas simuladas); o arquivo
# precisa existir porque é montado no container.
[ -f secrets/google-service-account.json ] || { echo '{}' > secrets/google-service-account.json; chmod 600 secrets/google-service-account.json; }

# SUBIR=0: quem chamou (vps-bootstrap.sh) ainda ajusta o proxy e sobe depois.
[ "${SUBIR:-1}" = 0 ] && exit 0
docker compose up -d postgres prometheus node-exporter grafana
grep -qE '^COMPOSE_PROFILES=.*caddy' .env && docker compose up -d caddy
# APIs e painel sobem quando o CI tiver publicado as imagens (deploy.sh).
docker compose up -d api api-staging web web-staging 2>/dev/null || echo "imagens das aplicações ainda não publicadas; o primeiro deploy sobe os serviços"
docker compose ps
