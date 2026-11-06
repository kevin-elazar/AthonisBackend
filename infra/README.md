# Infraestrutura do Athonis

Produção e staging rodam numa VM Linux no **Azure** (assinatura Azure for
Students), com **Docker Compose**. Nada de Vercel, Netlify ou Render.

```text
Internet ──HTTPS──► Caddy (Let's Encrypt)
                      ├─ api.<dominio>          → api           ┐
                      ├─ staging-api.<dominio>  → api-staging   ├─► PostgreSQL 17 (athonis / athonis_staging)
                      ├─ app.<dominio>          → web           │
                      ├─ staging-app.<dominio>  → web-staging   ┘
                      └─ grafana.<dominio>      → Grafana ◄── Prometheus ◄── /metrics (APIs) + node-exporter (VM)
```

| Arquivo | Papel |
|---|---|
| `docker-compose.yml` | Todos os serviços de produção e staging |
| `Caddyfile` | Proxy reverso, HTTPS automático, cabeçalhos de segurança; bloqueia `/metrics` de fora |
| `prometheus/` e `grafana/` | Coleta de métricas e o painel "Athonis - API e VM", provisionado automaticamente |
| `deploy.sh` | Troca a imagem de um serviço, espera o healthcheck e faz rollback se falhar |
| `backup.sh` | `pg_dump` diário dos dois bancos (cron 03:00, 14 dias de retenção) |
| `azure-provision.sh` | Cria VM, IP, firewall, identidade do GitHub (OIDC) e orçamento |
| `vm-configure.sh` | Roda dentro da VM: gera `.env` com senhas aleatórias e sobe os serviços |
| `cloud-init.yaml` | Primeira inicialização da VM: Docker, git, swap e cron de backup |

## Ambientes

| | Desenvolvimento | Staging | Produção |
|---|---|---|---|
| Onde | máquina do desenvolvedor | VM, `staging-*.<dominio>` | VM, `api.` e `app.<dominio>` |
| Banco | `docker-compose.dev.yml` | `athonis_staging` | `athonis` |
| Atualiza quando | — | CI verde na branch `desenvMobile` | Release publicada no GitHub (tag `v*`) |

## Fluxo de entrega (CI/CD)

1. Push ou PR → `ci.yml`: lint, typecheck, build, testes unitários + e2e em
   PostgreSQL com limite de cobertura, SonarCloud.
2. Push em `desenvMobile`/`master` → imagem publicada em
   `ghcr.io/kevin-elazar/athonis-api` (tags `sha-<commit>`, `staging`, `main`).
3. `deploy.yml` entra no Azure por **OIDC** (sem senha guardada) e roda
   `deploy.sh` na VM por `az vm run-command`. **Não há SSH**: a porta 22 nem
   está aberta.
4. `deploy.sh` espera o `/health` ficar saudável; se não ficar, volta para a
   imagem anterior. O job confere o `/health` também por fora, via HTTPS.

**Rollback manual:** rode o workflow *Deploy* (Run workflow) escolhendo o
ambiente e a tag `sha-<commit>` da versão anterior.

## Primeira instalação

Pré-requisitos: `az login` feito e os repositórios públicos (a VM clona o
backend e baixa as imagens do GHCR sem credencial).

```bash
bash infra/azure-provision.sh
```

O script imprime as variáveis do GitHub (`AZURE_CLIENT_ID`, URLs...) e os
comandos `gh variable set` para cadastrá-las. Depois:

1. Em cada repositório, crie os *environments* `staging` e `production`
   (Settings → Environments). Em `production`, ative "Required reviewers"
   para exigir aprovação antes do deploy.
2. No GitHub, em *Packages*, deixe as imagens `athonis-api` e `athonis-web`
   com visibilidade **pública**.
3. (Opcional) Envie a chave da conta de serviço do Google para a VM, para a
   otimização real de rotas:
   ```bash
   az vm run-command invoke -g athonis-rg -n athonis-vm --command-id RunShellScript \
     --scripts "cat > /opt/athonis/infra/secrets/google-service-account.json <<'EOF'
   $(cat athonis-<id>.json)
   EOF
   chmod 600 /opt/athonis/infra/secrets/google-service-account.json"
   ```

## Operação

```bash
# Ver o estado dos serviços (sem SSH)
az vm run-command invoke -g athonis-rg -n athonis-vm --command-id RunShellScript \
  --scripts "cd /opt/athonis/infra && docker compose ps" --query 'value[0].message' -o tsv

# Logs da API de produção
az vm run-command invoke -g athonis-rg -n athonis-vm --command-id RunShellScript \
  --scripts "cd /opt/athonis/infra && docker compose logs --tail 100 api" --query 'value[0].message' -o tsv
```

## Monitoramento

- **Grafana** (`https://grafana.<dominio>`): disponibilidade, requisições por
  minuto, taxa de erros 5xx, latência p95 por rota, memória da API e CPU,
  memória e disco da VM.
- **Sentry**: erros não tratados da API, do painel e do aplicativo, com o
  ambiente (`production`/`staging`) e a versão (commit).
- **Healthcheck**: `GET /health` verifica o banco; o Docker reinicia o
  container que fica `unhealthy`.
