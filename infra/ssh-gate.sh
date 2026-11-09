#!/usr/bin/env bash
# Porteiro da chave SSH de deploy (VM da Hostinger).
#
# A chave que o GitHub Actions usa fica presa a este script no
# authorized_keys do usuário `deploy` (opção command="..."). Assim, mesmo que
# a chave vaze, ela só consegue pedir um deploy ou ver o estado dos serviços;
# não abre shell, não faz túnel e não roda outro comando.
#
#   ssh deploy@vm "deploy api staging sha-<commit>"
#   ssh deploy@vm "status"
set -euo pipefail
set -f  # sem expansão de curingas no comando recebido

DIR="$(cd "$(dirname "$0")" && pwd)"
read -r -a ARGS <<< "${SSH_ORIGINAL_COMMAND:-}"

case "${ARGS[0]:-}" in
  deploy)
    [ "${#ARGS[@]}" -eq 4 ] || { echo "uso: deploy <api|web> <staging|production> <tag>"; exit 2; }
    # deploy.sh valida serviço, ambiente e o formato da tag.
    exec "$DIR/deploy.sh" "${ARGS[1]}" "${ARGS[2]}" "${ARGS[3]}"
    ;;
  status)
    cd "$DIR"
    exec docker compose ps
    ;;
  *)
    echo "comando não permitido: ${ARGS[0]:-<vazio>} (use: deploy | status)"
    exit 2
    ;;
esac
