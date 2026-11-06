#!/usr/bin/env bash
# Cria toda a infraestrutura do Athonis no Azure (assinatura Azure for Students).
# Pré-requisito: `az login` feito por você nesta máquina.
#
#   bash infra/azure-provision.sh
#
# O que cria (idempotente: rodar de novo não duplica):
#   - resource group athonis-rg
#   - VM Ubuntu 24.04 B2s com IP público estático, só portas 80/443 abertas
#     (sem porta 22: ninguém entra por SSH; o deploy usa `az vm run-command`)
#   - identidade gerenciada "athonis-github" com federated credentials para os
#     ambientes staging/production dos repositórios no GitHub (login OIDC no
#     Actions, sem senha guardada), com permissão só sobre esta VM
#   - .env e arquivos de ambiente da API gerados DENTRO da VM, com senhas
#     aleatórias que nunca passam por esta máquina
#   - alerta de orçamento (se a assinatura permitir)
set -euo pipefail

RG="${RG:-athonis-rg}"
LOCATION="${LOCATION:-brazilsouth}"
VM="${VM:-athonis-vm}"
SIZE="${SIZE:-Standard_B2s}"
IDENTITY="${IDENTITY:-athonis-github}"
GITHUB_OWNER="${GITHUB_OWNER:-kevin-elazar}"
REPOS="${REPOS:-AthonisBackend athonis-front-end}"
BUDGET="${BUDGET:-80}"
DIR="$(cd "$(dirname "$0")" && pwd)"

passo() { printf '\n==> %s\n' "$*"; }

SUB_ID="$(az account show --query id -o tsv)"
TENANT_ID="$(az account show --query tenantId -o tsv)"
passo "Assinatura $(az account show --query name -o tsv) ($SUB_ID)"

passo "Resource group $RG em $LOCATION"
az group create -n "$RG" -l "$LOCATION" -o none

if ! az vm show -g "$RG" -n "$VM" -o none 2>/dev/null; then
  passo "Criando a VM $VM ($SIZE)"
  az vm create -g "$RG" -n "$VM" \
    --image Ubuntu2404 --size "$SIZE" \
    --admin-username athonis --generate-ssh-keys \
    --public-ip-sku Standard --public-ip-address-allocation static \
    --nsg-rule NONE \
    --os-disk-size-gb 32 \
    --custom-data "$DIR/cloud-init.yaml" -o none
else
  passo "VM $VM já existe"
fi

NSG="$(az network nic show --ids "$(az vm show -g "$RG" -n "$VM" --query 'networkProfile.networkInterfaces[0].id' -o tsv)" --query 'networkSecurityGroup.id' -o tsv | xargs basename)"
passo "Liberando 80/443 no NSG $NSG"
az network nsg rule create -g "$RG" --nsg-name "$NSG" -n web --priority 100 \
  --access Allow --protocol '*' --direction Inbound --destination-port-ranges 80 443 -o none

IP="$(az vm show -d -g "$RG" -n "$VM" --query publicIps -o tsv)"
BASE_DOMAIN="${BASE_DOMAIN:-${IP//./-}.sslip.io}"
passo "IP $IP  ->  domínio base $BASE_DOMAIN"

passo "Identidade gerenciada $IDENTITY para o GitHub Actions"
az identity create -g "$RG" -n "$IDENTITY" -o none
CLIENT_ID="$(az identity show -g "$RG" -n "$IDENTITY" --query clientId -o tsv)"
PRINCIPAL_ID="$(az identity show -g "$RG" -n "$IDENTITY" --query principalId -o tsv)"
for repo in $REPOS; do
  for env in staging production; do
    nome="gh-${repo}-${env}"
    az identity federated-credential show -g "$RG" --identity-name "$IDENTITY" -n "$nome" -o none 2>/dev/null || \
      az identity federated-credential create -g "$RG" --identity-name "$IDENTITY" -n "$nome" \
        --issuer https://token.actions.githubusercontent.com \
        --subject "repo:${GITHUB_OWNER}/${repo}:environment:${env}" \
        --audiences api://AzureADTokenExchange -o none
  done
done
VM_ID="$(az vm show -g "$RG" -n "$VM" --query id -o tsv)"
# Pode levar alguns segundos até a identidade aparecer no diretório.
for _ in 1 2 3 4 5 6; do
  az role assignment create --assignee-object-id "$PRINCIPAL_ID" --assignee-principal-type ServicePrincipal \
    --role "Virtual Machine Contributor" --scope "$VM_ID" -o none 2>/dev/null && break
  sleep 10
done

passo "Aguardando o cloud-init terminar na VM (Docker + repositório)"
az vm run-command invoke -g "$RG" -n "$VM" --command-id RunShellScript \
  --scripts "cloud-init status --wait >/dev/null; docker --version; ls /opt/athonis/infra" \
  --query 'value[0].message' -o tsv

passo "Gerando a configuração com segredos dentro da VM"
az vm run-command invoke -g "$RG" -n "$VM" --command-id RunShellScript \
  --scripts "@$DIR/vm-configure.sh" --parameters "$BASE_DOMAIN" \
  --query 'value[0].message' -o tsv

passo "Alerta de orçamento de US\$ $BUDGET"
az consumption budget create --budget-name athonis-budget --amount "$BUDGET" --category cost \
  --time-grain monthly --start-date "$(date +%Y-%m-01)" --end-date "$(date -d '+1 year' +%Y-%m-01 2>/dev/null || echo 2027-12-01)" \
  -o none 2>/dev/null || echo "   (assinatura não permite criar orçamento pela CLI; crie em Cost Management no portal)"

cat <<EOF

Pronto. Anote (não são segredos):

  AZURE_CLIENT_ID=$CLIENT_ID
  AZURE_TENANT_ID=$TENANT_ID
  AZURE_SUBSCRIPTION_ID=$SUB_ID
  AZURE_RESOURCE_GROUP=$RG
  AZURE_VM_NAME=$VM
  BASE_DOMAIN=$BASE_DOMAIN

URLs:
  API produção   https://api.$BASE_DOMAIN/health
  API staging    https://staging-api.$BASE_DOMAIN/health
  Painel         https://app.$BASE_DOMAIN
  Grafana        https://grafana.$BASE_DOMAIN   (senha: sudo cat /opt/athonis/infra/.env na VM)

Variáveis do GitHub (para cada repositório com deploy):
  for r in $REPOS; do
    gh variable set AZURE_CLIENT_ID -R $GITHUB_OWNER/\$r -b $CLIENT_ID
    gh variable set AZURE_TENANT_ID -R $GITHUB_OWNER/\$r -b $TENANT_ID
    gh variable set AZURE_SUBSCRIPTION_ID -R $GITHUB_OWNER/\$r -b $SUB_ID
    gh variable set AZURE_RESOURCE_GROUP -R $GITHUB_OWNER/\$r -b $RG
    gh variable set AZURE_VM_NAME -R $GITHUB_OWNER/\$r -b $VM
    gh variable set STAGING_API_URL -R $GITHUB_OWNER/\$r -b https://staging-api.$BASE_DOMAIN
    gh variable set PRODUCTION_API_URL -R $GITHUB_OWNER/\$r -b https://api.$BASE_DOMAIN
  done
EOF
