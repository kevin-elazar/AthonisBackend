# Scripts legados (SQLite)

Estes scripts corrigiam dados do banco SQLite usado antes da migração para o
PostgreSQL. Ficam guardados como histórico e só funcionam apontando para um
arquivo SQLite antigo:

```bash
DB_TYPE=sqlite DB_NAME=./src/database/database.sqlite node scripts/legacy/normalize-legacy-data.js
```

O banco da aplicação é PostgreSQL; para ele use os scripts de `scripts/`.
