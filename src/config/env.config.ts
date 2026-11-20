import { config as dotenvConfig } from 'dotenv';

dotenvConfig();

const isProduction = process.env.NODE_ENV === 'production';

/**
 * Lê uma variável obrigatória. Falha o boot se estiver ausente — nunca
 * retorna um valor padrão para segredo, para que um deploy incompleto
 * quebre de forma visível em vez de subir com credencial conhecida.
 */
function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === '') {
    throw new Error(
      `Variável de ambiente obrigatória ausente: ${name}. ` +
        `Defina-a no .env (veja .env.example) antes de iniciar a aplicação.`,
    );
  }
  return value;
}

function optionalEnv(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim() !== '' ? value : undefined;
}

/**
 * Valor do `trust proxy` do Express. Atrás do Traefik/Caddy, sem ele o req.ip
 * é o endereço do proxy e todos os usuários caem no mesmo balde do throttler.
 *
 * TRUST_PROXY aceita: número de saltos (`1`), `true`/`false` ou uma lista de
 * sub-redes/palavras do Express (`loopback`, `10.0.0.0/8`...). Sem a variável,
 * vale 1 em produção (um proxy na frente) e false fora dela.
 */
export function parseTrustProxy(
  raw: string | undefined,
  production: boolean,
): boolean | number | string {
  const value = raw?.trim();
  if (!value) return production ? 1 : false;
  const lower = value.toLowerCase();
  if (lower === 'false' || lower === 'off' || lower === 'no') return false;
  if (lower === 'true' || lower === 'on' || lower === 'yes') return true;
  if (/^\d+$/.test(value)) return Number(value);
  return value;
}

export const config = {
  isProduction,
  trustProxy: parseTrustProxy(process.env.TRUST_PROXY, isProduction),
  database: {
    type: process.env.DB_TYPE || 'postgres',
  },
  port: Number(process.env.PORT) || 8080,
  jwt: {
    secret: requireEnv('JWT_SECRET'),
    expiresIn: process.env.JWT_EXPIRATION || '1h',
    refreshDays: Number(process.env.JWT_REFRESH_DAYS) || 30,
  },
  cors: {
    origins: optionalEnv('CORS_ORIGIN')
      ?.split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
  },
  google: {
    geocodingApiKey: optionalEnv('GOOGLE_GEOCODING_API_KEY'),
    projectId: optionalEnv('GOOGLE_PROJECT_ID'),
  },
  sentry: {
    dsn: optionalEnv('SENTRY_DSN'),
    environment: process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || 'development',
  },
  uploads: {
    rootDir: process.env.UPLOADS_DIR || 'importacoes',
  },
};

/**
 * Validações que precisam rodar antes do Nest instanciar qualquer módulo.
 * Chamado no topo de main.ts.
 */
export function validateEnvironment(): void {
  // Acessar config.jwt.secret já dispara requireEnv.
  if (!config.jwt.secret) {
    throw new Error('JWT_SECRET inválido');
  }

  if (isProduction && config.database.type !== 'postgres') {
    throw new Error(
      'Em produção o banco precisa ser PostgreSQL (DB_TYPE=postgres). SQLite é aceito só nos testes.',
    );
  }

  if (isProduction && !config.cors.origins?.length) {
    throw new Error(
      'CORS_ORIGIN é obrigatório em produção. Liste as origens permitidas separadas por vírgula.',
    );
  }
}
