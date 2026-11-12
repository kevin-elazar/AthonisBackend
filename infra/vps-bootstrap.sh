#!/usr/bin/env bash
# Prepara a VPS para o Athonis (Ubuntu 24.04, com ou sem Coolify). Roda UMA
# vez, como root, no terminal do navegador da Hostinger (hPanel > VPS >
# Terminal). Depois disso, todo deploy vem do GitHub Actions pelo runner que
# este script instala; ninguém precisa entrar no servidor.
#
#   curl -fsSL https://raw.githubusercontent.com/kevin-elazar/AthonisBackend/desenvMobile/infra/vps-bootstrap.sh -o /root/vps-bootstrap.sh
#   bash /root/vps-bootstrap.sh [BASE_DOMAIN]
#
# O que faz (idempotente: rodar de novo não duplica nem troca senhas):
#   1. instala Docker e git (se faltarem) e clona o repositório em /opt/athonis
#   2. agenda o backup diário do Postgres
#   3. detecta o proxy: com Coolify, liga os serviços ao Traefik dele;
#      sem Coolify, usa o Caddy do repositório nas portas 80/443
#   4. gera infra/.env e os .env das APIs com senhas aleatórias (vm-configure.sh)
#      e sobe Postgres, Prometheus, node-exporter e Grafana
#   5. instala o runner do GitHub Actions (um por repositório com deploy), num
#      usuário sem senha que só pode rodar infra/deploy.sh com sudo
#
# Para o passo 5 o script pede um token de registro por repositório. Gere no
# SEU computador (vale 1 hora) e cole quando pedir:
#   gh api -X POST repos/kevin-elazar/AthonisBackend/actions/runners/registration-token --jq .token
#   gh api -X POST repos/kevin-elazar/athonis-front-end/actions/runners/registration-token --jq .token
# (ou GitHub > repositório > Settings > Actions > Runners > New self-hosted runner)
set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/kevin-elazar/AthonisBackend.git}"
BRANCH="${BRANCH:-desenvMobile}"
DESTINO=/opt/athonis
INFRA="$DESTINO/infra"
GITHUB_OWNER="${GITHUB_OWNER:-kevin-elazar}"
RUNNER_REPOS="${RUNNER_REPOS:-AthonisBackend athonis-front-end}"
RUNNER_USER=athonis-deploy
RUNNER_LABEL=athonis-deploy

passo() { printf '\n==> %s\n' "$*"; }
falha() { printf '\nERRO: %s\n' "$*" >&2; exit 1; }

[ "$(id -u)" = 0 ] || falha "rode como root"
. /etc/os-release
[ "${ID:-}" = ubuntu ] || echo "aviso: testado em Ubuntu; este é ${PRETTY_NAME:-desconhecido}"

passo "1. Pacotes e repositório"
export DEBIAN_FRONTEND=noninteractive
command -v git >/dev/null || { apt-get update -q; apt-get install -yq git; }
command -v curl >/dev/null || { apt-get update -q; apt-get install -yq curl; }
if ! command -v docker >/dev/null; then
  apt-get update -q
  apt-get install -yq docker.io docker-compose-v2
  systemctl enable --now docker
fi
docker compose version >/dev/null || falha "falta o plugin docker compose v2"
if [ -d "$DESTINO/.git" ]; then
  git -C "$DESTINO" fetch --quiet origin "$BRANCH"
  git -C "$DESTINO" checkout --quiet "$BRANCH"
  git -C "$DESTINO" merge --ff-only --quiet "origin/$BRANCH"
else
  git clone --quiet --branch "$BRANCH" "$REPO_URL" "$DESTINO"
fi
chmod 755 "$INFRA"/*.sh
echo "repositório em $DESTINO ($(git -C "$DESTINO" rev-parse --short HEAD))"

passo "2. Backup diário (03:00, guarda 14 dias em /var/backups/athonis)"
echo "0 3 * * * root $INFRA/backup.sh >> /var/log/athonis-backup.log 2>&1" > /etc/cron.d/athonis-backup
if [ -z "$(swapon --show)" ] && [ "$(awk '/MemTotal/ {print $2}' /proc/meminfo)" -lt 6000000 ]; then
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile >/dev/null && swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
  echo "swap de 2 GB criado"
fi

passo "3. Proxy HTTPS"
PROXY_ENV=()
if docker network inspect coolify >/dev/null 2>&1 && docker inspect coolify-proxy >/dev/null 2>&1; then
  imagem_proxy="$(docker inspect -f '{{.Config.Image}}' coolify-proxy)"
  case "$imagem_proxy" in
    *traefik*) ;;
    *) falha "o proxy do Coolify é '$imagem_proxy', não Traefik. Em Coolify > Servers > Proxy, troque para Traefik e rode de novo." ;;
  esac
  # Lê entrypoints e resolver de certificado da configuração do Traefik do Coolify.
  cfg="$(docker inspect -f '{{range .Config.Cmd}}{{println .}}{{end}}{{range $k, $v := .Config.Labels}}{{println $k}}{{end}}' coolify-proxy)"
  ep_http="$(printf '%s\n' "$cfg" | sed -nE 's/^--entrypoints\.([A-Za-z0-9_-]+)\.address=:80$/\1/p' | head -1)"
  ep_https="$(printf '%s\n' "$cfg" | sed -nE 's/^--entrypoints\.([A-Za-z0-9_-]+)\.address=:443$/\1/p' | head -1)"
  resolver="$(printf '%s\n' "$cfg" | sed -nE 's/^--certificatesresolvers\.([A-Za-z0-9_-]+)\.acme\..*/\1/p' | head -1)"
  [ -n "$resolver" ] || falha "não achei o certresolver do Traefik do Coolify (docker inspect coolify-proxy)"
  echo "Coolify encontrado: Traefik ($imagem_proxy), entrypoints ${ep_http:-http}/${ep_https:-https}, resolver $resolver"
  PROXY_ENV=(
    "COMPOSE_FILE=docker-compose.yml:docker-compose.coolify.yml"
    "TRAEFIK_HTTP_ENTRYPOINT=${ep_http:-http}"
    "TRAEFIK_HTTPS_ENTRYPOINT=${ep_https:-https}"
    "TRAEFIK_CERTRESOLVER=$resolver"
  )
  PROXY_SEM=COMPOSE_PROFILES
else
  if ss -ltnH '( sport = :80 or sport = :443 )' | grep -q .; then
    falha "as portas 80/443 já estão em uso por outro programa e não há Coolify; libere-as ou ajuste o proxy"
  fi
  echo "sem Coolify: o Caddy do repositório vai atender 80/443"
  PROXY_ENV=("COMPOSE_PROFILES=caddy")
  PROXY_SEM=COMPOSE_FILE
fi

passo "4. Configuração com segredos (gerados aqui, nunca saem do servidor)"
IP="$(ip -4 route get 1.1.1.1 | sed -nE 's/.* src ([0-9.]+).*/\1/p')"
BASE_DOMAIN="${1:-${IP//./-}.sslip.io}"
echo "domínio base: $BASE_DOMAIN"
SUBIR=0 "$INFRA/vm-configure.sh" "$BASE_DOMAIN"
cd "$INFRA"
sed -i "/^${PROXY_SEM}=/d" .env
for linha in "${PROXY_ENV[@]}"; do
  chave="${linha%%=*}"
  if grep -qE "^${chave}=" .env; then sed -i "s|^${chave}=.*|${linha}|" .env; else echo "$linha" >> .env; fi
done
docker compose config --quiet || falha "docker compose config falhou; confira $INFRA/.env"
base="postgres prometheus node-exporter grafana"
grep -qE '^COMPOSE_PROFILES=.*caddy' .env && base="caddy $base"
# shellcheck disable=SC2086
docker compose up -d $base
docker compose up -d api api-staging web web-staging 2>/dev/null || \
  echo "imagens das aplicações ainda não publicadas; o primeiro deploy sobe os serviços"
docker compose ps

passo "5. Runner do GitHub Actions"
id "$RUNNER_USER" >/dev/null 2>&1 || useradd --create-home --shell /bin/bash "$RUNNER_USER"
# O runner NÃO entra no grupo docker (seria root na prática): só pode rodar o deploy.sh.
echo "$RUNNER_USER ALL=(root) NOPASSWD: $INFRA/deploy.sh" > /etc/sudoers.d/athonis-deploy
chmod 440 /etc/sudoers.d/athonis-deploy
visudo -cf /etc/sudoers.d/athonis-deploy >/dev/null || falha "regra de sudo inválida"

versao="$(curl -fsSL https://api.github.com/repos/actions/runner/releases/latest | sed -nE 's/.*"tag_name": *"v([^"]+)".*/\1/p')"
[ -n "$versao" ] || falha "não consegui descobrir a versão do runner"
case "$(uname -m)" in x86_64) arq=x64 ;; aarch64) arq=arm64 ;; *) falha "arquitetura $(uname -m) sem runner" ;; esac
pacote="/tmp/actions-runner-$versao.tar.gz"
[ -f "$pacote" ] || curl -fsSL -o "$pacote" "https://github.com/actions/runner/releases/download/v$versao/actions-runner-linux-$arq-$versao.tar.gz"

for repo in $RUNNER_REPOS; do
  pasta="/home/$RUNNER_USER/runner-$repo"
  if [ -f "$pasta/.runner" ]; then
    echo "runner de $repo já registrado ($pasta)"
    continue
  fi
  printf '\nToken de registro do runner para %s/%s (Enter vazio pula): ' "$GITHUB_OWNER" "$repo"
  read -rs token </dev/tty || token=""
  echo
  [ -n "$token" ] || { echo "pulado: $repo"; continue; }
  mkdir -p "$pasta"
  tar xzf "$pacote" -C "$pasta"
  chown -R "$RUNNER_USER:$RUNNER_USER" "$pasta"
  "$pasta/bin/installdependencies.sh" >/dev/null
  sudo -u "$RUNNER_USER" -H bash -c "cd '$pasta' && ./config.sh --unattended --replace \
    --url 'https://github.com/$GITHUB_OWNER/$repo' --token '$token' \
    --name 'vps-hostinger-$repo' --labels '$RUNNER_LABEL' --work _work"
  (cd "$pasta" && ./svc.sh install "$RUNNER_USER" >/dev/null && ./svc.sh start >/dev/null)
  echo "runner de $repo instalado e rodando"
done

cat <<EOF

Pronto.
  API produção   https://api.$BASE_DOMAIN/health
  API staging    https://staging-api.$BASE_DOMAIN/health
  Painel         https://app.$BASE_DOMAIN
  Grafana        https://grafana.$BASE_DOMAIN  (usuário admin; senha em $INFRA/.env)

As APIs e o painel sobem no primeiro deploy do GitHub Actions. Avise o Claude
para ligar o deploy (variável DEPLOY_HABILITADO=true nos repositórios).
EOF
