#!/usr/bin/env bash
# Roda DENTRO da VM, como root: no Azure via `az vm run-command` (chamado pelo
# azure-provision.sh); na Hostinger, chamado pelo hostinger-setup.sh.
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

# Valores opcionais vindos do ambiente (o hostinger-setup.sh usa isto para
# apontar a branch da infra, o e-mail do Let's Encrypt e as imagens).
for var in ACME_EMAIL INFRA_BRANCH API_IMAGE WEB_IMAGE API_TAG API_STAGING_TAG; do
  valor="${!var:-}"
  [ -n "$valor" ] || continue
  if grep -qE "^${var}=" .env; then sed -i "s|^${var}=.*|${var}=${valor}|" .env; else echo "${var}=${valor}" >> .env; fi
done

for ambiente in production staging; do
  arquivo="env/api.${ambiente}.env"
  prefixo=""; [ "$ambiente" = staging ] && prefixo="staging-"
  if [ ! -f "$arquivo" ]; then
    sed -e "s|^JWT_SECRET=.*|JWT_SECRET=$(aleatorio 64 64)|" \
        -e "s|^CORS_ORIGIN=.*|CORS_ORIGIN=https://${prefixo}app.${BASE_DOMAIN}|" \
        "env/api.${ambiente}.env.example" > "$arquivo"
    chmod 600 "$arquivo"
    echo "$arquivo criado"
  fi
done

# Sem a chave do Google a API sobe normalmente (rotas simuladas); o arquivo
# precisa existir porque é montado no container.
[ -f secrets/google-service-account.json ] || { echo '{}' > secrets/google-service-account.json; chmod 600 secrets/google-service-account.json; }

docker compose up -d caddy postgres prometheus node-exporter grafana
# APIs e painel sobem quando o CI tiver publicado as imagens (deploy.sh).
# Um por vez: uma imagem que ainda não existe não impede as outras de subir.
for servico in api api-staging web web-staging; do
  docker compose up -d "$servico" 2>/dev/null || echo "$servico: imagem ainda não publicada; o primeiro deploy sobe o serviço"
done
docker compose ps
