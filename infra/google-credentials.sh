#!/usr/bin/env bash
# Liga a roteirização real do Google (Route Optimization + Geocoding) nas
# APIs de produção e de staging. Rodar como root na VPS, no console web:
#
#   bash /opt/athonis/infra/google-credentials.sh
#
# Pede, sem mostrar na tela:
#   1. o JSON da conta de serviço (colar e terminar com Ctrl+D numa linha vazia);
#   2. a chave de API do Geocoding (Enter vazio mantém a atual).
#
# O que faz:
#   - grava secrets/google-service-account.json legível só pelo usuário da API
#     (node, uid 1000);
#   - põe GOOGLE_PROJECT_ID (tirado do JSON) e GOOGLE_GEOCODING_API_KEY em
#     env/api.production.env e env/api.staging.env;
#   - recria api e api-staging e espera ficarem saudáveis.
# Nenhum segredo é impresso nem vai para o git (secrets/ e env/*.env são ignorados).
set -euo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"
API_UID=1000

[ "$(id -u)" -eq 0 ] || { echo "Rode como root."; exit 1; }

echo "Cole o JSON da conta de serviço e tecle Ctrl+D numa linha vazia:"
JSON="$(cat)"
PROJECT_ID="$(printf '%s' "$JSON" | python3 -c 'import json,sys; d=json.load(sys.stdin); assert d.get("type")=="service_account", "não é uma conta de serviço"; print(d["project_id"])')" || {
  echo "JSON inválido: copie o arquivo inteiro baixado em Contas de serviço → Chaves."; exit 1;
}

echo
printf 'Chave de API do Geocoding (Enter mantém a atual): '
read -rs API_KEY
echo

# 1. Credencial da conta de serviço.
mkdir -p secrets
if [ -d secrets/google-service-account.json ]; then rmdir secrets/google-service-account.json; fi
umask 077
printf '%s\n' "$JSON" > secrets/google-service-account.json
chown "$API_UID:$API_UID" secrets/google-service-account.json
chmod 600 secrets/google-service-account.json
unset JSON

# 2. Variáveis das duas APIs.
grava() { # arquivo variável valor
  local arquivo="$1" nome="$2" valor="$3"
  if grep -qE "^${nome}=" "$arquivo"; then
    VALOR="$valor" python3 - "$arquivo" "$nome" <<'PY'
import os, re, sys
arquivo, nome = sys.argv[1], sys.argv[2]
texto = open(arquivo, encoding="utf-8").read()
texto = re.sub(rf"^{re.escape(nome)}=.*$", lambda _: f"{nome}={os.environ['VALOR']}", texto, flags=re.M)
open(arquivo, "w", encoding="utf-8").write(texto)
PY
  else
    printf '%s=%s\n' "$nome" "$valor" >> "$arquivo"
  fi
}
for arquivo in env/api.production.env env/api.staging.env; do
  grava "$arquivo" GOOGLE_PROJECT_ID "$PROJECT_ID"
  if [ -n "$API_KEY" ]; then grava "$arquivo" GOOGLE_GEOCODING_API_KEY "$API_KEY"; fi
done
unset API_KEY
echo "Projeto Google: $PROJECT_ID"

# 3. Recria só as APIs (mesma imagem e mesmos labels do proxy).
docker compose up -d --no-deps api api-staging
for servico in api api-staging; do
  for _ in $(seq 1 36); do
    status="$(docker inspect -f '{{.State.Health.Status}}' "$(docker compose ps -q "$servico")" 2>/dev/null || echo ?)"
    [ "$status" = healthy ] && break
    sleep 5
  done
  echo "$servico: $status"
done

# 4. Confere se a API enxergou a configuração (sem mostrar valores).
docker compose exec -T api sh -c 'test -r "$GOOGLE_APPLICATION_CREDENTIALS" && echo "credencial legível pela API" || echo "ERRO: a API não consegue ler a credencial"'
docker compose logs --since 2m api 2>&1 | grep -E "GoogleMapsRouteOptimization inicializado|GOOGLE_GEOCODING_API_KEY não configurada" | tail -2 || true
echo "Pronto. Gere uma rota no painel: o aviso de modo simulado não deve aparecer."
