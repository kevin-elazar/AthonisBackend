/**
 * Cobertura oficial do backend: testes unitários + e2e numa medição só.
 *
 *   npm run test:cov                      (e2e em SQLite em memória)
 *   TEST_DB=postgres npm run test:cov     (e2e em PostgreSQL, como no CI)
 *
 * Os limites abaixo barram o CI se a cobertura cair. A meta do Portfólio
 * (regra de Web Apps, que vale para backend próprio) é 75% no backend.
 */
const unit = require('./jest.config');
const e2e = require('./jest-e2e.json');

module.exports = {
  rootDir: '.',
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/main.ts',
    '!src/instrument.ts',
    '!src/database/migrations/**',
    '!src/database/data-source.ts',
    '!src/**/*.module.ts',
    '!src/**/dto/**',
  ],
  coverageDirectory: './coverage',
  coverageReporters: ['text-summary', 'lcov', 'json-summary'],
  coverageThreshold: {
    global: { lines: 80, statements: 80, branches: 70, functions: 70 },
  },
  projects: [
    { ...unit, displayName: 'unit' },
    { ...e2e, displayName: 'e2e' },
  ],
};
