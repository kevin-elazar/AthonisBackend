# Como contribuir

1. Abra uma issue (bug ou melhoria) descrevendo o problema.
2. Crie uma branch a partir de `desenvMobile`: `feat/<assunto>` ou `fix/<assunto>`.
3. Rode localmente antes de abrir o PR:
   ```bash
   docker compose -f docker-compose.dev.yml up -d   # PostgreSQL local
   npm run lint && npm run typecheck
   npm run test:cov                                 # unitários + e2e, com limite de cobertura
   ```
4. Abra o Pull Request para `desenvMobile` preenchendo o template. O CI precisa
   ficar verde e o PR precisa de uma revisão aprovada.
5. Mensagens de commit no formato `tipo(escopo): descrição`
   (ex.: `fix(driver-app): ...`, `feat(analytics): ...`).

Mudou o banco? Gere a migration (`npm run migration:generate -- src/database/migrations/Nome`)
e inclua no mesmo PR.
