/**
 * Variáveis de ambiente da suíte de testes.
 *
 * Roda ANTES de qualquer import de módulo (jest `setupFiles`), e como o dotenv
 * não sobrescreve o que já existe em process.env, estes valores vencem o .env
 * da máquina. Sem isso, o resultado dos testes mudava conforme o .env de cada
 * desenvolvedor.
 */
process.env.NODE_ENV = process.env.NODE_ENV ?? 'test';
process.env.JWT_SECRET = 'jwt-secret-de-teste-nao-usar-em-producao';
process.env.JWT_EXPIRATION = '1h';
process.env.GOOGLE_GEOCODING_API_KEY = 'test-api-key';
process.env.GOOGLE_PROJECT_ID = '';
// Por padrão a suíte usa SQLite em memória (roda sem Docker). Com
// TEST_DB=postgres (CI e `npm run test:e2e:pg`) roda contra um PostgreSQL de
// verdade, com o esquema recriado pelas migrations a cada arquivo de teste.
if (process.env.TEST_DB === 'postgres') {
  process.env.DB_TYPE = 'postgres';
  process.env.DB_NAME = process.env.TEST_DB_NAME || 'athonis_test';
  process.env.DB_DROP_SCHEMA = 'true';
  process.env.DB_MIGRATIONS_RUN = 'true';
} else {
  process.env.DB_TYPE = 'sqlite';
  process.env.DB_NAME = ':memory:';
}
process.env.UPLOADS_DIR = 'importacoes-test';
