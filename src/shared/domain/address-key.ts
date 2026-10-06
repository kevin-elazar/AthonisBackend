/**
 * Chave de endereço usada para reaproveitar coordenadas.
 *
 * A chave é o endereço normalizado — e não o cliente ou o pedido — porque o
 * que custa dinheiro é geocodificar o mesmo *lugar* duas vezes. Dois clientes
 * no mesmo prédio, uma entrega avulsa no endereço de um cliente e o mesmo
 * cliente cadastrado de novo caem todos na mesma chave.
 *
 * Na dúvida a chave erra para o lado de não bater: um "erro" aqui custa uma
 * consulta a mais, enquanto uma chave que colide entrega no endereço errado.
 */

export type AddressParts = {
  street?: string | null;
  number?: string | null;
  district?: string | null;
  city?: string | null;
  state?: string | null;
  zipCode?: string | null;
};

/** Abreviações que aparecem o tempo todo e significam a mesma coisa. */
const LOGRADOUROS: Record<string, string> = {
  r: 'rua',
  av: 'avenida',
  avn: 'avenida',
  al: 'alameda',
  pc: 'praca',
  pca: 'praca',
  tv: 'travessa',
  rod: 'rodovia',
  estr: 'estrada',
};

function semAcento(valor: string): string {
  // NFD separa a letra do acento; a propriedade Unicode remove só o acento.
  return valor.normalize('NFD').replace(/\p{Diacritic}/gu, '');
}

function normalizarTexto(valor: string | null | undefined): string {
  if (!valor) return '';

  const limpo = semAcento(String(valor))
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Só a primeira palavra é expandida: "r" no meio do nome da rua é parte do
  // nome, não abreviação de "rua".
  const partes = limpo.split(' ');
  if (partes.length > 1 && LOGRADOUROS[partes[0]]) {
    partes[0] = LOGRADOUROS[partes[0]];
  }
  return partes.join(' ');
}

function apenasDigitos(valor: string | null | undefined): string {
  return String(valor ?? '').replace(/\D/g, '');
}

/**
 * Devolve a chave, ou null quando o endereço é incompleto demais para
 * identificar um ponto — geocodificar "São Paulo, SP" devolveria o centro da
 * cidade e a coordenada entraria no cache como se fosse a entrega.
 */
export function buildAddressKey(parts: AddressParts): string | null {
  const rua = normalizarTexto(parts.street);
  const cidade = normalizarTexto(parts.city);
  const uf = normalizarTexto(parts.state);

  if (!rua || !cidade || !uf) return null;

  return [
    apenasDigitos(parts.zipCode),
    rua,
    normalizarTexto(parts.number),
    normalizarTexto(parts.district),
    cidade,
    uf,
  ].join('|');
}

/** Endereço em uma linha, para mandar ao geocoding e para exibir. */
export function formatAddressLine(parts: AddressParts): string {
  return [
    [parts.street, parts.number].filter(Boolean).join(', '),
    parts.district,
    parts.city,
    parts.state,
    parts.zipCode,
  ]
    .filter((pedaco) => pedaco && String(pedaco).trim() !== '')
    .join(', ');
}
