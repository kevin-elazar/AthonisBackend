#!/usr/bin/env bash
# Instalação do Athonis numa VPS da Hostinger (Ubuntu 22.04 ou 24.04).
# Roda UMA vez, como root, na própria VPS. Pode rodar de novo sem estragar
# nada: o que já existe (senhas, .env, chaves) é mantido.
#
#   curl -fsSL https://raw.githubusercontent.com/kevin-elazar/AthonisBackend/infra/hostinger/infra/hostinger-setup.sh -o hostinger-setup.sh
#   sudo ACME_EMAIL=voce@exemplo.com bash hostinger-setup.sh
#
# Variáveis opcionais (todas têm padrão):
#   BASE_DOMAIN    domínio base (padrão: <ip-com-hifens>.sslip.io, sem comprar domínio)
#   ACME_EMAIL     e-mail para os avisos do Let's Encrypt
#   INFRA_BRANCH   branch do backend de onde vem a pasta infra/ (padrão: infra/hostinger)
#   REPO_URL       repositório do backend
#   API_IMAGE      imagem da API no GHCR
#   WEB_IMAGE      imagem do painel (front-end) no GHCR
#   API_TAG        tag da API em produção (padrão: staging, a única que o CI
#                  do backend publica hoje; troque para main quando houver)
#   DEPLOY_PUBKEY  chave pública já existente para o GitHub Actions; sem ela,
#                  uma chave nova é gerada em /root/athonis-deploy-key
#
# O que faz: instala Docker, git e firewall; cria swap; cria o usuário
# `deploy` (só pode rodar deploys, via infra/ssh-gate.sh); clona o backend em
# /opt/athonis; gera .env com senhas aleatórias; sobe Caddy, PostgreSQL e
# monitoramento; agenda o backup diário; e no fim imprime o que cadastrar no
# GitHub.
set -euo pipefail

[ "$(id -u)" -eq 0 ] || { echo "Rode como root (sudo bash $0)"; exit 1; }

REPO_URL="${REPO_URL:-https://github.com/kevin-elazar/AthonisBackend.git}"
export INFRA_BRANCH="${INFRA_BRANCH:-infra/hostinger}"
export API_IMAGE="${API_IMAGE:-ghcr.io/kevin-elazar/athonis-api}"
export WEB_IMAGE="${WEB_IMAGE:-ghcr.io/gustavojross/athonis-web}"
export API_TAG="${API_TAG:-staging}"
export ACME_EMAIL="${ACME_EMAIL:-}"
DESTINO=/opt/athonis
USUARIO=deploy

log() { echo; echo "==> $*"; }

# IP público: nas VPS da Hostinger ele fica na própria interface de rede.
IP="$(ip -4 route get 1.1.1.1 2>/dev/null | awk '{for(i=1;i<=NF;i++) if($i=="src"){print $(i+1); exit}}')"
[ -n "$IP" ] || { echo "Não consegui descobrir o IP público; informe BASE_DOMAIN."; exit 1; }
BASE_DOMAIN="${BASE_DOMAIN:-${IP//./-}.sslip.io}"

log "Pacotes do sistema"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq git curl openssl ufw ca-certificates unattended-upgrades >/dev/null

if ! command -v docker >/dev/null 2>&1 || ! docker compose version >/dev/null 2>&1; then
  log "Instalando Docker (script oficial get.docker.com)"
  curl -fsSL https://get.docker.com | sh
fi
systemctl enable --now docker

log "Memória de troca (swap)"
if ! swapon --show | grep -q .; then
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile >/dev/null && swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
  echo "swap de 2 GB criada"
else
  echo "swap já existe"
fi

log "Firewall (SSH, HTTP, HTTPS)"
PORTAS_SSH="$(sshd -T 2>/dev/null | awk '$1=="port"{print $2}' | sort -u)"
for p in ${PORTAS_SSH:-22}; do ufw allow "$p/tcp" >/dev/null; done
ufw allow 80/tcp >/dev/null
ufw allow 443/tcp >/dev/null
ufw allow 443/udp >/dev/null
ufw --force enable >/dev/null
ufw status | sed 's/^/   /'

log "Usuário $USUARIO"
id "$USUARIO" >/dev/null 2>&1 || useradd -m -s /bin/bash "$USUARIO"
usermod -aG docker "$USUARIO"

log "Repositório em $DESTINO (branch $INFRA_BRANCH)"
if [ -d "$DESTINO/.git" ]; then
  git -C "$DESTINO" fetch --quiet origin "$INFRA_BRANCH"
  git -C "$DESTINO" checkout --quiet -B "$INFRA_BRANCH" "origin/$INFRA_BRANCH"
else
  git clone --quiet --branch "$INFRA_BRANCH" "$REPO_URL" "$DESTINO"
fi
chmod +x "$DESTINO"/infra/*.sh
# root também pode rodar deploy.sh à mão sem o git reclamar do dono da pasta.
git config --system --get-all safe.directory | grep -qx "$DESTINO" || git config --system --add safe.directory "$DESTINO"

log "Configuração e serviços de base"
bash "$DESTINO/infra/vm-configure.sh" "$BASE_DOMAIN"
chown -R "$USUARIO:$USUARIO" "$DESTINO"

log "Chave SSH do GitHub Actions"
CHAVE_PRIVADA=/root/athonis-deploy-key
if [ -z "${DEPLOY_PUBKEY:-}" ]; then
  [ -f "$CHAVE_PRIVADA" ] || ssh-keygen -q -t ed25519 -N "" -C "github-actions-athonis" -f "$CHAVE_PRIVADA"
  DEPLOY_PUBKEY="$(cat "$CHAVE_PRIVADA.pub")"
fi
install -d -m 700 -o "$USUARIO" -g "$USUARIO" "/home/$USUARIO/.ssh"
# A chave só consegue rodar o ssh-gate.sh (deploy/status): sem shell nem túnel.
echo "command=\"$DESTINO/infra/ssh-gate.sh\",no-port-forwarding,no-X11-forwarding,no-agent-forwarding,no-pty $DEPLOY_PUBKEY" \
  > "/home/$USUARIO/.ssh/authorized_keys"
chown "$USUARIO:$USUARIO" "/home/$USUARIO/.ssh/authorized_keys"
chmod 600 "/home/$USUARIO/.ssh/authorized_keys"

log "Backup diário (03:00)"
echo "0 3 * * * root $DESTINO/infra/backup.sh >> /var/log/athonis-backup.log 2>&1" > /etc/cron.d/athonis-backup

PORTA_SSH="$(echo "${PORTAS_SSH:-22}" | head -1)"
HOST_KNOWN="$IP"; [ "$PORTA_SSH" = 22 ] || HOST_KNOWN="[$IP]:$PORTA_SSH"

cat <<EOF

=====================================================================
 Athonis instalado. Endereços (o HTTPS pode levar 1-2 min na 1ª vez):
   Painel       https://app.$BASE_DOMAIN
   API          https://api.$BASE_DOMAIN/health
   Staging      https://staging-app.$BASE_DOMAIN  |  https://staging-api.$BASE_DOMAIN
   Grafana      https://grafana.$BASE_DOMAIN  (admin / senha em $DESTINO/infra/.env)

 Cadastre no GitHub, nos DOIS repositórios (backend e front-end):

   Settings > Secrets and variables > Actions > Variables
     DEPLOY_TARGET = hostinger
     BASE_DOMAIN   = $BASE_DOMAIN

   Settings > Secrets and variables > Actions > Secrets
     VPS_HOST        = $IP
     VPS_PORT        = $PORTA_SSH
     VPS_KNOWN_HOSTS = (as linhas abaixo)
EOF
for f in /etc/ssh/ssh_host_*_key.pub; do echo "$HOST_KNOWN $(cut -d' ' -f1,2 "$f")"; done | sed 's/^/       /'
if [ -f "$CHAVE_PRIVADA" ]; then
cat <<EOF
     VPS_SSH_KEY     = conteúdo de $CHAVE_PRIVADA
                       (veja com: cat $CHAVE_PRIVADA ; depois apague: rm $CHAVE_PRIVADA)
EOF
else
  echo "     VPS_SSH_KEY     = a chave privada que corresponde ao DEPLOY_PUBKEY informado"
fi
cat <<EOF

 As aplicações sobem no primeiro deploy do CI (push na desenvMobile ou
 "Run workflow"). Estado dos serviços: cd $DESTINO/infra && docker compose ps
=====================================================================
EOF
