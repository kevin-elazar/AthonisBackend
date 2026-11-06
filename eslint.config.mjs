// ESLint (flat config) do backend: regras recomendadas de JS e TypeScript,
// com Prettier cuidando da formatação. Roda no CI (`npm run lint`).
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: ['dist/**', 'coverage/**', 'node_modules/**', 'src/database/migrations/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    languageOptions: {
      globals: { ...globals.node, ...globals.jest },
    },
    rules: {
      // O código legado usa `any` em respostas da API do Google; vale como aviso.
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-require-imports': 'off',
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      eqeqeq: ['error', 'smart'],
    },
  },
  {
    // Scripts de linha de comando escrevem no console de propósito.
    files: ['scripts/**/*.js'],
    languageOptions: { sourceType: 'commonjs' },
    rules: { 'no-console': 'off' },
  },
);
