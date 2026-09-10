/**
 * Diz se as integrações do Google estão configuradas e funcionando.
 *
 * Sem isto, o único jeito de descobrir era gerar uma rota e ver se ela saía
 * marcada como simulada — o que não distingue "chave faltando" de "chave
 * errada", "API não ativada" ou "faturamento desligado".
 *
 * Nenhum valor de credencial é impresso: o script mostra só se está presente,
 * quantos caracteres tem e o que a API respondeu.
 *
 * Uso:
 *   node scripts/check-google.js
 */
require('dotenv').config();

const fs = require('fs');
const axios = require('axios');

const ENDERECO_TESTE = 'Avenida Paulista, 1000, Bela Vista, São Paulo, SP';

const ok = (texto) => console.log(`  \x1b[32m✓\x1b[0m ${texto}`);
const erro = (texto) => console.log(`  \x1b[31m✗\x1b[0m ${texto}`);
const aviso = (texto) => console.log(`  \x1b[33m!\x1b[0m ${texto}`);

/** Nunca imprime o valor — só o suficiente para saber se está lá. */
function presenca(nome) {
  const valor = (process.env[nome] ?? '').trim();
  if (!valor) return { definida: false, texto: 'não definida' };
  return { definida: true, valor, texto: `definida (${valor.length} caracteres)` };
}

async function verificarGeocoding() {
  console.log('\nGeocoding API');

  const chave = presenca('GOOGLE_GEOCODING_API_KEY');
  console.log(`  GOOGLE_GEOCODING_API_KEY: ${chave.texto}`);

  if (!chave.definida) {
    erro('Sem a chave, endereços recebem coordenadas simuladas.');
    return false;
  }

  try {
    const { data } = await axios.get('https://maps.googleapis.com/maps/api/geocode/json', {
      params: { address: ENDERECO_TESTE, key: chave.valor, region: 'br', language: 'pt-BR' },
      timeout: 10000,
    });

    if (data.status === 'OK') {
      const local = data.results[0].geometry.location;
      ok(`Respondeu: ${data.results[0].formatted_address}`);
      ok(`Coordenadas: ${local.lat}, ${local.lng}`);
      return true;
    }

    erro(`A API respondeu "${data.status}".`);
    if (data.error_message) console.log(`     ${data.error_message}`);

    // Os três motivos que respondem por quase toda falha aqui.
    if (data.status === 'REQUEST_DENIED') {
      aviso('Costuma ser: Geocoding API não ativada no projeto, chave restrita a');
      aviso('outra API, ou restrição de IP/referenciador bloqueando este servidor.');
    }
    if (data.status === 'OVER_QUERY_LIMIT') {
      aviso('Cota estourada ou faturamento não vinculado ao projeto.');
    }
    return false;
  } catch (e) {
    erro(`Não foi possível chamar a API: ${e.message}`);
    return false;
  }
}

async function verificarRouteOptimization() {
  console.log('\nRoute Optimization API');

  const projeto = presenca('GOOGLE_PROJECT_ID');
  const credencial = presenca('GOOGLE_APPLICATION_CREDENTIALS');

  console.log(`  GOOGLE_PROJECT_ID: ${projeto.texto}`);
  console.log(`  GOOGLE_APPLICATION_CREDENTIALS: ${credencial.texto}`);

  if (!projeto.definida) {
    erro('Sem o projeto, o cliente do Google nem chega a ser criado: a rota é simulada.');
    return false;
  }

  if (!credencial.definida) {
    erro('Esta API não usa chave de API — precisa da credencial de conta de serviço.');
    return false;
  }

  if (!fs.existsSync(credencial.valor)) {
    erro(`Arquivo de credencial não encontrado em ${credencial.valor}`);
    return false;
  }

  try {
    const conteudo = JSON.parse(fs.readFileSync(credencial.valor, 'utf8'));
    if (conteudo.type !== 'service_account') {
      erro(`O arquivo é do tipo "${conteudo.type}", não "service_account".`);
      return false;
    }
    ok(`Conta de serviço: ${conteudo.client_email}`);
    if (conteudo.project_id && conteudo.project_id !== projeto.valor) {
      aviso(`A credencial é do projeto "${conteudo.project_id}", diferente do configurado.`);
    }
  } catch (e) {
    erro(`Credencial ilegível: ${e.message}`);
    return false;
  }

  // Uma chamada mínima confirma autenticação e ativação da API. `validateOnly`
  // valida o modelo sem executar a otimização — não gera cobrança de rota.
  try {
    const { RouteOptimizationClient } = require('@googlemaps/routeoptimization');
    const client = new RouteOptimizationClient();

    await client.optimizeTours({
      parent: `projects/${projeto.valor}`,
      validateOnly: true,
      model: {
        shipments: [
          { deliveries: [{ arrivalLocation: { latitude: -23.5614, longitude: -46.6559 } }] },
        ],
        vehicles: [
          {
            startLocation: { latitude: -23.5505, longitude: -46.6333 },
            endLocation: { latitude: -23.5505, longitude: -46.6333 },
          },
        ],
      },
    });

    ok('Autenticou e a API respondeu.');
    return true;
  } catch (e) {
    erro(`Falhou: ${e.message}`);
    if (/PERMISSION_DENIED|has not been used|is disabled/i.test(e.message)) {
      aviso('Ative a Route Optimization API no projeto e confira o papel da conta');
      aviso('de serviço (Route Optimization Editor).');
    }
    return false;
  }
}

async function main() {
  console.log('Verificação das integrações do Google');
  console.log('(nenhum valor de credencial é exibido)');

  const geocoding = await verificarGeocoding();
  const otimizacao = await verificarRouteOptimization();

  console.log('\nResumo');
  console.log(`  Geocoding:          ${geocoding ? 'funcionando' : 'indisponível'}`);
  console.log(`  Route Optimization: ${otimizacao ? 'funcionando' : 'indisponível'}`);

  if (!geocoding) {
    console.log('\n  Enquanto o geocoding não funcionar, as rotas são SIMULADAS mesmo');
    console.log('  que a Route Optimization esteja ativa: sem coordenada real não há');
    console.log('  rota real, e o otimizador não é chamado.');
  } else if (!otimizacao) {
    console.log('\n  Coordenadas serão reais, mas a ordem das paradas e os tempos ainda');
    console.log('  saem da simulação local.');
  } else {
    console.log('\n  Tudo pronto: as rotas passam a usar a otimização do Google.');
  }

  process.exit(geocoding ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
