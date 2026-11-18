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

Domínio: `athonis.seletohub.cloud`, subdomínio do domínio de quem cede a VPS,
com um registro DNS `A *.athonis → 187.53.99.235` na Hostinger. O sslip.io
(IP no nome) funcionava, mas filtros corporativos (FortiGuard) bloqueiam
domínios de DNS dinâmico. Para trocar de domínio: novo registro DNS, troque
`BASE_DOMAIN` no `.env` do servidor e nos `env/api.*.env`, rode
`docker compose up -d`, atualize as variáveis `*_URL` do GitHub e gere de novo
o painel (a URL da API entra no build) e o APK (`eas.json`).

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

Detalhes do `deploy.sh`:

- **Infra fixada no commit do deploy.** O `deploy.yml` passa `github.sha`
  como 4º argumento (`deploy.sh api production v1.2.0 <sha>`); na release é o
  commit da tag. O script faz `git fetch` e `git checkout --detach <sha>` na
  pasta do repositório, então o compose, o Caddyfile e o Prometheus que sobem
  são os daquela versão, não o que estiver na branch. O SHA é validado
  (`^[0-9a-f]{7,40}$`); se o checkout falhar (por exemplo, arquivo alterado à
  mão na VPS), o deploy para antes de mexer no `.env`.
  Sem o 4º argumento (como no deploy do painel, `athonis-front-end`, que
  chama o script com 3), vale o comportamento antigo: fast-forward da branch
  `INFRA_BRANCH`. Se um deploy anterior deixou a pasta fixada num commit, ela
  fica onde está. Staging e produção dividem a mesma pasta: o último deploy
  com SHA define a infra dos dois.
- **Um deploy por vez.** O script segura `infra/.deploy.lock` (`flock`)
  durante todo o processo; um segundo deploy espera até 15 minutos.
- **Espera a imagem.** Uma release criada logo depois do push da tag pode
  chegar antes de o CI publicar a imagem: o `docker compose pull` tenta 10
  vezes, a cada 30 s, antes de desistir e manter a imagem anterior.

Segurança do runner em repositório público: o deploy só roda em push, release
ou disparo manual (nunca em pull request). Como o runner é *self-hosted* e o
repositório é público, um PR de fork não pode ter workflow rodando sem
aprovação: em cada repositório, **Settings → Actions → General → "Fork pull
request workflows from outside collaborators" → "Require approval for all
outside collaborators"**. É a mitigação para alguém abrir um PR que mude um
workflow para `runs-on: self-hosted` e execute código na VPS. Conferir essa
opção sempre que um repositório novo ganhar runner.

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

## Rotas reais do Google (sair do modo simulado)

Sem credenciais, a API gera rotas **simuladas**: as paradas seguem a ordem dos
pedidos, a coordenada é estimada em torno do centro da cidade e a distância é
5 km por parada. Para a otimização real são preciso duas coisas do Google
Cloud, no mesmo projeto:

1. **Projeto e faturamento:** em console.cloud.google.com, crie um projeto
   (ex.: `athonis-rotas`) e vincule uma conta de faturamento. O uso de
   demonstração fica dentro da cota gratuita mensal.
2. **APIs:** em *APIs e serviços → Biblioteca*, ative **Route Optimization
   API** e **Geocoding API**.
3. **Chave do Geocoding:** em *Credenciais → Criar credenciais → Chave de API*.
   Restrinja a chave à Geocoding API e ao IP da VPS (187.53.99.235).
4. **Conta de serviço da otimização:** em *IAM → Contas de serviço*, crie
   `athonis-rotas` com o papel **Route Optimization Editor**; em *Chaves →
   Adicionar chave → JSON*, baixe o arquivo.
5. **Na VPS** (console web do hPanel, como root):
   `bash /opt/athonis/infra/google-credentials.sh`. O script pede o JSON
   (colar e Ctrl+D) e a chave (digitação oculta), grava
   `secrets/google-service-account.json` legível pelo usuário da API, preenche
   `GOOGLE_PROJECT_ID` e `GOOGLE_GEOCODING_API_KEY` nas duas APIs e as recria.

Depois disso, uma rota gerada no painel não mostra mais o aviso de modo
simulado. Pedidos já roteirizados no modo simulado não guardam a coordenada
estimada como definitiva: ao voltar para a fila, são geocodificados de novo.

## Operação

No terminal da VPS (hPanel), como root:

```bash
cd /opt/athonis/infra
docker compose ps                    # estado dos serviços
docker compose logs --tail 100 api   # logs da API de produção
```

## Monitoramento

**Labels do Traefik: nunca mude o valor de um middleware publicado.** Todos
os containers (APIs, painéis e Grafana, de staging e de produção) repetem os
mesmos labels de middleware (`x-traefik` em `docker-compose.coolify.yml`). Se
um container recriado define um middleware com valor diferente dos que já
estão rodando, o Traefik registra *"middleware defined multiple times with
different configurations"*, desliga o middleware e derruba todas as rotas que
o usam, inclusive as de produção. Foi o que tirou as duas APIs do ar em
18/11/2026: só o painel de staging ganhou a regex nova de `athonis-sem-metrics`.
Para mudar um middleware, crie outro com nome novo e acrescente-o aos routers;
o antigo sai só depois que todos os containers forem recriados. Diagnóstico:
`docker logs coolify-proxy --since 30m | grep ERR`.

O `/metrics` das APIs não sai para a internet: o Traefik (`docker-compose.coolify.yml`)
e o Caddy bloqueiam o caminho sem diferenciar maiúsculas (`(?i)^/metrics`, middleware `athonis-sem-metrics-ci`),
porque o Express atende `/METRICS` igual a `/metrics`. Como segunda barreira,
`METRICS_TOKEN` (em `env/api.*.env`) faz a API exigir
`Authorization: Bearer <token>`; o Prometheus manda o token lido de
`infra/secrets/metrics_token` (`authorization.credentials_file` em
`prometheus/prometheus.yml`). Numa instalação nova o `vm-configure.sh` gera os
dois. É opcional: num servidor instalado antes, o `deploy.sh` cria o arquivo
com um marcador e a API, sem `METRICS_TOKEN`, ignora o cabeçalho. Para ligar
depois, grave o mesmo valor no arquivo (dono `65534`, `chmod 600`) e em
`METRICS_TOKEN` dos dois `env/api.*.env`, e rode
`docker compose up -d prometheus api api-staging`.

Atrás do proxy a API lê o IP do cliente de `X-Forwarded-For`
(`TRUST_PROXY`, padrão `1` em produção): é o que dá a cada usuário o seu
próprio limite de requisições, em vez de todos dividirem o do proxy.

- **Grafana** (`https://grafana.<dominio>`): disponibilidade, requisições por
  minuto, taxa de erros 5xx, latência p95 por rota, memória da API e CPU,
  memória e disco do servidor.
- **Sentry**: erros não tratados da API, do painel e do aplicativo, com o
  ambiente (`production`/`staging`) e a versão (commit).
- **Healthcheck**: `GET /health` verifica o banco; o Docker reinicia o
  container que fica `unhealthy`.
- **Backup**: `pg_dump` diário em `/var/backups/athonis`, além do backup
  semanal da VPS feito pela própria Hostinger.
