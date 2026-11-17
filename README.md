# Athonis API

[![CI](https://github.com/kevin-elazar/AthonisBackend/actions/workflows/ci.yml/badge.svg?branch=desenvMobile)](https://github.com/kevin-elazar/AthonisBackend/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/kevin-elazar/AthonisBackend)](https://github.com/kevin-elazar/AthonisBackend/releases/latest)

API e infraestrutura do **Athonis**, sistema de roteirização e acompanhamento de entregas B2B. Atende o [painel web](https://github.com/kevin-elazar/athonis-front-end) e o [aplicativo do motorista](https://github.com/kevin-elazar/AthonisMobile), que é o repositório principal do TCC (Engenharia de Software, Católica SC, 2026). Documentação completa na [Wiki do projeto](https://github.com/kevin-elazar/AthonisMobile/wiki).

| Ambiente | Endereço |
|---|---|
| Produção | https://api.athonis.seletohub.cloud/health |
| Staging | https://staging-api.athonis.seletohub.cloud/health |

## O que a API faz

| Módulo | Rotas | Papel |
|---|---|---|
| `auth` | `/auth/*` | Login, *refresh token* rotativo, logout; papéis `admin`, `user` e `driver` |
| `company`, `clients`, `orders`, `drivers`, `vehicles` | `/company`, `/clients`, … | Cadastros, sempre isolados por empresa (`id_company` do token) |
| `order-imports` | `/order-imports/*` | Importação de pedidos por planilha CSV, com relatório das linhas rejeitadas |
| `optimization-routes` | `/optimization-routes/*` | Validação de pedidos e geração de rotas pela Google Route Optimization API (modo estimado sem a API) |
| `routes` | `/routes/*` | Ciclo de vida da rota: iniciar, concluir, cancelar, duplicar, baixa de parada |
| `driver-app` | `/driver/*` | Endpoints do aplicativo: rotas do dia do motorista, chegada, entrega, ocorrência, rastro de GPS em lotes, encerramento. Idempotentes por `client_event_id` |
| `analytics` | `/analytics/*` | Indicadores de execução, comparação planejado × executado por rota e rotas ao vivo |
| `observability` | `/health`, `/metrics` | Saúde (banco) e métricas Prometheus (só na rede interna) |
| `street-view` | `/street-view/*` | Imagem da fachada do endereço (cache) |

A comparação planejado × executado é calculada uma vez, no encerramento da rota (`src/modules/analytics/route-metrics.calculator.ts`), e gravada em `route_execution_metrics`: distância por haversine descartando leituras imprecisas, duração, paradas fora de ordem, atraso, tempo de atendimento e tempo ocioso.

## Stack

NestJS 11 · TypeORM · PostgreSQL 17 (migrations em `src/database/migrations`) · JWT · class-validator · Swagger · Jest + Supertest · Sentry · prom-client · Docker

## Como rodar

```bash
docker compose -f docker-compose.dev.yml up -d   # PostgreSQL local
cp .env.example .env                              # defina JWT_SECRET
npm ci
npm run start:dev                                 # http://localhost:8080 · Swagger em /api
node scripts/seed-driver-demo.js                  # empresa, motorista com acesso e uma rota para hoje
```

A chave da conta de serviço do Google (Route Optimization e Geocoding) é opcional no desenvolvimento: sem ela, as rotas são geradas em modo estimado. Variáveis: [`.env.example`](.env.example).

| Script | O quê |
|---|---|
| `npm test` | Testes unitários |
| `npm run test:e2e` / `test:e2e:pg` | Testes de integração (SQLite em memória / PostgreSQL) |
| `npm run test:cov` | Cobertura com limite mínimo (80% linhas, 70% branches) |
| `npm run seed:pilot` | Dados de demonstração pela API (clientes e pedidos em Jaraguá do Sul) |
| `node scripts/create-company.js` | Cria uma empresa e o primeiro admin (operação de administração) |

## Infraestrutura e entrega

A pasta [`infra/`](infra) tem tudo o que roda no servidor: Docker Compose de produção e staging, proxy HTTPS, Prometheus, Grafana, backup e o script de instalação da VPS. Todo push passa por lint, build, testes com cobertura (unitários + e2e em PostgreSQL) e SonarCloud; a imagem vai para o GHCR e um runner do GitHub Actions na própria VPS faz o deploy, sem SSH. Push em `desenvMobile` publica em staging; release publica em produção. Detalhes no [README da infraestrutura](infra/README.md).

## Autoria

O sistema web original (otimização de rotas, autenticação, cadastros e importação de pedidos) foi desenvolvido por Kevin Chedid El Azar no semestre anterior, com contribuições de [@GustavoJRoss](https://github.com/GustavoJRoss). Neste TCC entraram os módulos `driver-app` e `analytics`, o ciclo de vida da rota, a migração para PostgreSQL, a observabilidade, os testes e a infraestrutura. O histórico de commits registra cada parte.

Licença: [MIT](LICENSE).
