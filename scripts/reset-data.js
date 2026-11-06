/**
 * Zera os dados operacionais, preservando uma empresa e um usuário.
 *
 * Serve para começar um teste manual do zero sem recriar o banco à mão. Apaga
 * clientes, motoristas, veículos, pedidos, rotas (com eventos, rastro de GPS e
 * métricas), histórico de otimização e cache de imagens; mantém a empresa e o
 * usuário informados e remove os demais.
 *
 * Não há volta: em produção, faça antes um backup com
 *   docker compose exec postgres pg_dump -U athonis athonis > backup.sql
 *
 * Uso:
 *   node scripts/reset-data.js --confirmar
 *   node scripts/reset-data.js --confirmar --empresa=1 --usuario=admin@athonis.com
 *
 * Sem --confirmar o script apenas mostra o que seria apagado.
 */
const { openDb } = require('./lib/db');

const args = process.argv.slice(2);
const flag = (nome, padrao) => {
  const encontrado = args.find((a) => a.startsWith(`--${nome}=`));
  return encontrado ? encontrado.split('=').slice(1).join('=') : padrao;
};

const CONFIRMAR = args.includes('--confirmar');
const EMPRESA = Number(flag('empresa', process.env.RESET_COMPANY ?? '1'));
const USUARIO = flag('usuario', process.env.RESET_USER ?? 'admin@athonis.com');

/**
 * Tabelas esvaziadas por completo.
 *
 * `geocode_cache` fica de fora de propósito: são coordenadas de endereços,
 * não dados da operação. Apagar faria pagar de novo pelos mesmos endereços.
 */
const TABELAS_OPERACIONAIS = [
  'route_event',
  'route_location_ping',
  'route_execution_metrics',
  'route_returned_stop',
  'order',
  'route',
  'optimized_route_history',
  'street_view_cache',
  'client',
  'driver',
  'vehicle',
];

async function main() {
  const db = await openDb();
  try {
    const empresas = await db.all('SELECT id_company, trade_name, corporate_name FROM company');
    const usuarios = await db.all('SELECT id, email, id_company FROM "user"');

    const empresaMantida = empresas.find((e) => Number(e.id_company) === EMPRESA);
    const usuarioMantido = usuarios.find((u) => u.email === USUARIO);

    if (!empresaMantida) {
      throw new Error(
        `Empresa ${EMPRESA} não existe. Nada foi alterado. Empresas: ` +
          empresas.map((e) => `${e.id_company} (${e.trade_name})`).join(', '),
      );
    }
    if (!usuarioMantido) {
      throw new Error(
        `Usuário ${USUARIO} não existe. Nada foi alterado. Usuários: ` + usuarios.map((u) => u.email).join(', '),
      );
    }
    if (Number(usuarioMantido.id_company) !== EMPRESA) {
      throw new Error(
        `Usuário ${USUARIO} pertence à empresa ${usuarioMantido.id_company}, não à ${EMPRESA}. ` +
          'Manter os dois deixaria o login sem empresa. Nada foi alterado.',
      );
    }

    console.log(`Manter:   empresa ${EMPRESA} (${empresaMantida.trade_name}) e usuário ${USUARIO}`);
    for (const tabela of TABELAS_OPERACIONAIS) {
      const { n } = await db.get(`SELECT COUNT(*) AS n FROM "${tabela}"`);
      console.log(`Apagar:   ${n} de ${tabela}`);
    }
    const outrasEmpresas = empresas.filter((e) => Number(e.id_company) !== EMPRESA);
    const outrosUsuarios = usuarios.filter((u) => u.email !== USUARIO);
    console.log(`Apagar:   ${outrasEmpresas.length} empresa(s), ${outrosUsuarios.length} usuário(s)`);

    if (!CONFIRMAR) {
      console.log('\nSimulação: rode de novo com --confirmar para aplicar.');
      return;
    }

    await db.transaction(async () => {
      // RESTART IDENTITY: os ids voltam a contar do 1. Num banco de teste,
      // pedido #1 e pedido #57 contam histórias diferentes.
      await db.run(
        `TRUNCATE ${TABELAS_OPERACIONAIS.map((t) => `"${t}"`).join(', ')} RESTART IDENTITY CASCADE`,
      );
      await db.run('DELETE FROM refresh_token WHERE user_id IN (SELECT id FROM "user" WHERE email <> ?)', [USUARIO]);
      await db.run('DELETE FROM "user" WHERE email <> ?', [USUARIO]);
      await db.run('DELETE FROM company WHERE id_company <> ?', [EMPRESA]);
    });

    const restantes = await db.all('SELECT id_company, trade_name FROM company');
    const login = await db.all('SELECT email, role, id_company FROM "user"');
    console.log('\nEmpresa:  ' + restantes.map((e) => `${e.id_company} (${e.trade_name})`).join(', '));
    console.log('Usuário:  ' + login.map((u) => `${u.email} [${u.role}] empresa ${u.id_company}`).join(', '));
    console.log('Pronto.');
  } finally {
    await db.close();
  }
}

main().catch((erro) => {
  console.error(erro.message);
  process.exitCode = 1;
});
