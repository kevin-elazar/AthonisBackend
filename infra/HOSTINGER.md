# Deploy na VPS da Hostinger

A mesma infraestrutura do Azure (veja `README.md`): Docker Compose com
Caddy (HTTPS automático), PostgreSQL, API, painel, Prometheus e Grafana.
Só muda o jeito de chegar na máquina: na Hostinger o GitHub Actions entra
por **SSH** com um usuário `deploy`, cuja chave só consegue rodar o deploy
(`infra/ssh-gate.sh`), sem abrir shell.

```text
GitHub Actions ──SSH (usuário deploy)──► ssh-gate.sh ──► deploy.sh <api|web> <ambiente> <tag>
                                                         ├─ docker compose pull/up do serviço
                                                         ├─ espera o /health
                                                         └─ rollback se não ficar saudável
```

| Arquivo | Papel |
|---|---|
| `hostinger-setup.sh` | Instala tudo na VPS (roda uma vez, como root) |
| `ssh-gate.sh` | Único comando que a chave do GitHub pode rodar |
| `.github/workflows/deploy-hostinger.yml` | Deploy da API por SSH |
| front-end: `.github/workflows/ci.yml` | Build, imagem e deploy do painel por SSH |

## 1. A VPS

- Plano **KVM 2 (8 GB)** é o confortável para produção + staging +
  monitoramento. No **KVM 1 (4 GB)** funciona, com a swap de 2 GB que o
  script cria.
- Sistema: **Ubuntu 24.04** (ou 22.04), template limpo ou "Ubuntu com Docker".
- No hPanel, em *Firewall* da VPS, se houver regras ativas, libere as portas
  22, 80 e 443.

## 2. Imagens públicas no GitHub

A VPS baixa as imagens do GitHub Container Registry **sem credencial**:

1. Rode o CI uma vez em cada repositório (push na `desenvMobile`, ou
   *Actions → CI → Run workflow*). Isso cria os pacotes `athonis-api` e
   `athonis-web`. (O deploy dessa primeira execução falha até a VPS ser
   configurada; tudo bem.)
2. Em cada pacote (*perfil/organização → Packages → athonis-… → Package
   settings*), mude a visibilidade para **Public**.

## 3. Instalar na VPS

Entre como root (terminal do hPanel ou `ssh root@IP`) e rode:

```bash
curl -fsSL https://raw.githubusercontent.com/kevin-elazar/AthonisBackend/infra/hostinger/infra/hostinger-setup.sh -o hostinger-setup.sh
ACME_EMAIL=seu-email@exemplo.com bash hostinger-setup.sh
```

Opções (variáveis antes do `bash`):

| Variável | Padrão |
|---|---|
| `BASE_DOMAIN` | `<ip-com-hifens>.sslip.io`: funciona sem comprar domínio |
| `INFRA_BRANCH` | `infra/hostinger` (troque para `desenvMobile` depois do merge) |
| `WEB_IMAGE` | `ghcr.io/gustavojross/athonis-web` |
| `API_IMAGE` | `ghcr.io/kevin-elazar/athonis-api` |
| `DEPLOY_PUBKEY` | gera uma chave nova em `/root/athonis-deploy-key` |

**Domínio próprio:** crie no DNS (pode ser o da própria Hostinger) registros
`A` de `api`, `app`, `staging-api`, `staging-app` e `grafana` apontando para
o IP da VPS, e rode o script com `BASE_DOMAIN=seudominio.com.br`.

No fim, o script imprime exatamente o que cadastrar no GitHub.

## 4. Configurar o GitHub (nos dois repositórios)

*Settings → Secrets and variables → Actions*:

| Tipo | Nome | Valor |
|---|---|---|
| Variable | `DEPLOY_TARGET` | `hostinger` |
| Variable | `BASE_DOMAIN` | o domínio impresso pelo script |
| Secret | `VPS_HOST` | IP da VPS |
| Secret | `VPS_PORT` | porta SSH (normalmente `22`) |
| Secret | `VPS_KNOWN_HOSTS` | as linhas impressas pelo script |
| Secret | `VPS_SSH_KEY` | conteúdo de `/root/athonis-deploy-key` |

Depois de copiar a chave privada para os dois repositórios, apague-a da
VPS: `rm /root/athonis-deploy-key`.

Crie também os *environments* `staging` e `production` (*Settings →
Environments*); em `production`, ative "Required reviewers" se quiser
aprovação antes de publicar.

## 5. Publicar

| Quando | O que acontece |
|---|---|
| Push na `desenvMobile` | CI → imagem → deploy em **staging** (`staging-app.` / `staging-api.`) |
| Release publicada (tag `v*`) | deploy em **produção** (`app.` / `api.`) |
| *Actions → Run workflow* | escolha ambiente (e a imagem, na API) |

Para colocar produção no ar pela primeira vez sem criar release:
- **API:** *Actions → Deploy (Hostinger) → Run workflow*, ambiente
  `production`, imagem `staging` (ou `sha-<commit>`).
- **Painel:** *Actions → CI → Run workflow*, ambiente `production`. O
  painel é construído de novo para cada ambiente, porque o endereço da API
  (`NEXT_PUBLIC_API_URL`) entra no build.

## Operação

```bash
# Na VPS, como root
cd /opt/athonis/infra
docker compose ps
docker compose logs --tail 100 api
./deploy.sh api production sha-<commit>   # rollback manual para uma versão anterior

# De fora, com a chave de deploy (só deploy/status)
ssh -i athonis-deploy-key deploy@IP status
```

Chave do Google (otimização real de rotas), opcional: copie o JSON para
`/opt/athonis/infra/secrets/google-service-account.json` e rode
`docker compose up -d api api-staging`.

Backup: `backup.sh` roda todo dia às 03:00 e guarda 14 dias em
`/var/backups/athonis`.
