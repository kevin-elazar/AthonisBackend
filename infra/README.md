# Infraestrutura do Athonis

Produção e staging rodam numa **VPS Linux na Hostinger** (KVM 2: 2 vCPU,
8 GB, Ubuntu 24.04, datacenter em Campinas), com **Docker Compose**. Nada de
Vercel, Netlify ou Render: a máquina, o banco, o proxy e o monitoramento são
nossos e estão descritos neste diretório.

A VPS já tem o **Coolify**, cujo proxy (Traefik) ocupa as portas 80/443. O
Athonis não é gerenciado pelo Coolify: ele só se registra no Traefik por
*labels* (`docker-compose.coolify.yml`), que emite os certificados Let's
Encrypt. Num servidor sem Coolify, o perfil `caddy` sobe o Caddy deste
repositório no lugar.

```text
Internet ──HTTPS──► Traefik do Coolify (ou Caddy)
                      ├─ api.<dominio>          → api           ┐
                      ├─ staging-api.<dominio>  → api-staging   ├─► PostgreSQL 17 (athonis / athonis_staging)
                      ├─ app.<dominio>          → web           │
                      ├─ staging-app.<dominio>  → web-staging   ┘
                      └─ grafana.<dominio>      → Grafana ◄── Prometheus ◄── /metrics (APIs) + node-exporter (servidor)
```

Domínio: `187-53-99-235.sslip.io` (o sslip.io resolve o próprio IP, sem
comprar domínio). Para usar um domínio próprio, troque `BASE_DOMAIN` no `.env`
do servidor e as variáveis `*_URL` do GitHub.

| Arquivo | Papel |
|---|---|
| `docker-compose.yml` | Todos os serviços de produção e staging |
| `docker-compose.coolify.yml` | Liga API, painel e Grafana ao Traefik do Coolify; cabeçalhos de segurança; bloqueia `/metrics` de fora |
| `Caddyfile` | Proxy alternativo (perfil `caddy`) para servidor sem Coolify |
| `prometheus/` e `grafana/` | Coleta de métricas e o painel "Athonis - API e VM", provisionado automaticamente |
| `deploy.sh` | Troca a imagem de um serviço, espera o healthcheck e faz rollback se falhar |
| `backup.sh` | `pg_dump` diário dos dois bancos (cron 03:00, 14 dias de retenção) |
| `vps-bootstrap.sh` | Instalação única no servidor: Docker, repositório, backup, proxy, segredos e runner do GitHub |
| `vm-configure.sh` | Chamado pelo bootstrap: gera `.env` com senhas aleatórias e sobe os serviços de base |

## Ambientes

| | Desenvolvimento | Staging | Produção |
|---|---|---|---|
| Onde | máquina do desenvolvedor | VPS, `staging-*.<dominio>` | VPS, `api.` e `app.<dominio>` |
| Banco | `docker-compose.dev.yml` | `athonis_staging` | `athonis` |
| Atualiza quando | — | CI verde na branch `desenvMobile` | Release publicada no GitHub (tag `v*`) |

## Fluxo de entrega (CI/CD)

1. Push ou PR → `ci.yml`: lint, typecheck, build, testes unitários + e2e em
   PostgreSQL com limite de cobertura, SonarCloud.
2. Push em `desenvMobile`/`master` → imagem publicada em
   `ghcr.io/kevin-elazar/athonis-api` (tags `sha-<commit>`, `staging`, `main`).
3. `deploy.yml` roda no **runner do GitHub Actions instalado na VPS**
   (*self-hosted runner*, rótulo `athonis-deploy`). O runner abre a conexão de
   saída com o GitHub e busca o job: **não há SSH nem porta aberta**, e nenhuma
   senha do servidor fica guardada no GitHub.
4. O runner roda num usuário próprio (`athonis-deploy`), fora do grupo
   `docker`, cuja única permissão de `sudo` é executar `deploy.sh`.
5. `deploy.sh` espera o `/health` ficar saudável; se não ficar, volta para a
   imagem anterior. Um segundo job, nas máquinas do GitHub, confere o
   `/health` por fora, via HTTPS.

Segurança do runner em repositório público: o deploy só roda em push, release
ou disparo manual (nunca em pull request), e os repositórios exigem aprovação
para rodar workflows de qualquer contribuidor externo.

A variável `DEPLOY_HABILITADO=true` liga o deploy. Sem ela (servidor ainda
não instalado), o job é pulado em vez de ficar esperando um runner.

**Rollback manual:** rode o workflow *Deploy* (Run workflow) escolhendo o
ambiente e a tag `sha-<commit>` da versão anterior.

## Primeira instalação

Pré-requisito: repositórios e imagens do GHCR públicos (o servidor clona o
backend e baixa as imagens sem credencial).

1. No seu computador, gere um token de registro do runner para cada
   repositório com deploy (vale 1 hora):
   ```bash
   gh api -X POST repos/kevin-elazar/AthonisBackend/actions/runners/registration-token --jq .token
   gh api -X POST repos/kevin-elazar/athonis-front-end/actions/runners/registration-token --jq .token
   ```
2. No hPanel da Hostinger, abra o **Terminal** da VPS (root) e rode:
   ```bash
   curl -fsSL https://raw.githubusercontent.com/kevin-elazar/AthonisBackend/desenvMobile/infra/vps-bootstrap.sh -o /root/vps-bootstrap.sh
   bash /root/vps-bootstrap.sh
   ```
   O script cola os tokens quando pedir e, no fim, mostra as URLs.
3. Ligue o deploy nos dois repositórios:
   ```bash
   gh variable set DEPLOY_HABILITADO -R kevin-elazar/AthonisBackend -b true
   gh variable set DEPLOY_HABILITADO -R kevin-elazar/athonis-front-end -b true
   ```
4. Em cada repositório, os *environments* `staging` e `production` já existem
   (Settings → Environments). Em `production`, ative "Required reviewers"
   para exigir aprovação antes do deploy.
5. (Opcional) Chave da conta de serviço do Google para a otimização real de
   rotas: no terminal da VPS, grave o JSON em
   `/opt/athonis/infra/secrets/google-service-account.json` (`chmod 600`) e
   rode `cd /opt/athonis/infra && docker compose up -d api api-staging`.

## Operação

No terminal da VPS (hPanel), como root:

```bash
cd /opt/athonis/infra
docker compose ps                    # estado dos serviços
docker compose logs --tail 100 api   # logs da API de produção
```

## Monitoramento

- **Grafana** (`https://grafana.<dominio>`): disponibilidade, requisições por
  minuto, taxa de erros 5xx, latência p95 por rota, memória da API e CPU,
  memória e disco do servidor.
- **Sentry**: erros não tratados da API, do painel e do aplicativo, com o
  ambiente (`production`/`staging`) e a versão (commit).
- **Healthcheck**: `GET /health` verifica o banco; o Docker reinicia o
  container que fica `unhealthy`.
- **Backup**: `pg_dump` diário em `/var/backups/athonis`, além do backup
  semanal da VPS feito pela própria Hostinger.
