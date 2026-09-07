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

export const config = {
  isProduction,
  database: {
    type: process.env.DB_TYPE || 'sqlite',
    database: process.env.DB_NAME || './src/database/database.sqlite',
  },
  port: Number(process.env.PORT) || 8080,
  jwt: {
    secret: requireEnv('JWT_SECRET'),
    expiresIn: process.env.JWT_EXPIRATION || '1h',
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

  if (isProduction && !config.cors.origins?.length) {
    throw new Error(
      'CORS_ORIGIN é obrigatório em produção. Liste as origens permitidas separadas por vírgula.',
    );
  }
}
