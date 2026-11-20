/**
 * Conversão de hora local (fuso da empresa) para o instante UTC correspondente,
 * sem depender de biblioteca externa.
 *
 * Necessário porque a janela de entrega é cadastrada em hora local
 * ("08:00 - 12:00" no fuso do Brasil), mas a Route Optimization API exige
 * timestamps absolutos (RFC3339 em UTC). Uma conversão ingênua — tratar
 * "08:00" como UTC — jogaria a janela 3h adiantada em relação ao que o
 * cliente combinou.
 */

/**
 * Devolve o instante UTC (epoch ms) que corresponde a `hora:minuto` do dia
 * `dataISO` no fuso `timeZone`.
 *
 * Técnica: interpretamos a hora desejada como se already fosse UTC, perguntamos
 * ao `Intl` que horas seriam essas no fuso alvo, e a diferença entre os dois
 * é exatamente o deslocamento do fuso naquele instante — incluindo horário de
 * verão, quando o fuso o observa.
 */
export function zonedTimeToUtc(
  dataISO: string,
  horaMinuto: string,
  timeZone: string,
): Date {
  const [ano, mes, dia] = dataISO.slice(0, 10).split('-').map(Number);
  const [hora, minuto] = horaMinuto.split(':').map(Number);

  const comoSeUtc = new Date(Date.UTC(ano, mes - 1, dia, hora, minuto, 0));

  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  const partes = Object.fromEntries(
    formatter.formatToParts(comoSeUtc).map((p) => [p.type, p.value]),
  );

  const lidoNoFuso = Date.UTC(
    Number(partes.year),
    Number(partes.month) - 1,
    Number(partes.day),
    Number(partes.hour),
    Number(partes.minute),
    Number(partes.second),
  );

  const deslocamento = lidoNoFuso - comoSeUtc.getTime();
  return new Date(comoSeUtc.getTime() - deslocamento);
}

/**
 * Extrai "08:00 - 12:00" em `{ inicio: "08:00", fim: "12:00" }`, ou null
 * quando o texto não tem esse formato (inclui vazio, que significa "dia
 * todo" e não uma janela a converter).
 */
export function parseWindowText(
  texto: string | null | undefined,
): { inicio: string; fim: string } | null {
  const valor = texto?.trim();
  if (!valor) return null;

  const partes = valor.match(/(\d{1,2}):(\d{2})\s*[-–—a]\s*(\d{1,2}):(\d{2})/);
  if (!partes) return null;

  const pad = (n: string) => n.padStart(2, '0');
  return {
    inicio: `${pad(partes[1])}:${partes[2]}`,
    fim: `${pad(partes[3])}:${partes[4]}`,
  };
}

/**
 * Dia de hoje (AAAA-MM-DD) no fuso informado.
 *
 * "Hoje" para a operação é o dia da empresa, não o do servidor: às 22h de
 * Brasília o servidor em UTC já virou o dia, e o entregador veria as rotas
 * de amanhã.
 */
export function todayInTimeZone(timeZone: string, agora: Date = new Date()): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(agora);
  } catch {
    return agora.toISOString().slice(0, 10);
  }
}
