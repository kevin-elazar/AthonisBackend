/**
 * Configuração executada antes dos testes e2e.
 * Define variáveis de ambiente ANTES do carregamento dos módulos.
 */
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-key';
