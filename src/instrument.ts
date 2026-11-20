import * as Sentry from '@sentry/nestjs';
import { config as dotenvConfig } from 'dotenv';

dotenvConfig();

/**
 * Inicializa o Sentry antes de qualquer outro import (exigência do SDK).
 * Sem SENTRY_DSN o SDK não é iniciado e as chamadas viram no-op, então o
 * desenvolvimento local e os testes não dependem de conta no Sentry.
 */
if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || 'development',
    release: process.env.APP_VERSION,
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0.1),
  });
}
