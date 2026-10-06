import { parseWindowText, zonedTimeToUtc } from '@/shared/domain/timezone';

describe('zonedTimeToUtc', () => {
  it('converte hora de Brasília (UTC-3) para o instante UTC correto', () => {
    const resultado = zonedTimeToUtc('2026-09-15', '08:00', 'America/Sao_Paulo');

    // Brasil não observa horário de verão desde 2019: o deslocamento é fixo.
    expect(resultado.toISOString()).toBe('2026-09-15T11:00:00.000Z');
  });

  it('converte hora de Manaus (UTC-4)', () => {
    const resultado = zonedTimeToUtc('2026-09-15', '08:00', 'America/Manaus');

    expect(resultado.toISOString()).toBe('2026-09-15T12:00:00.000Z');
  });

  it('converte um fuso que observa horário de verão sem receber esse detalhe explicitamente', () => {
    // Nova York: UTC-4 em julho (verão), UTC-5 em janeiro. A técnica de
    // Intl.DateTimeFormat resolve isso sozinha a partir da data informada.
    const verao = zonedTimeToUtc('2026-07-15', '12:00', 'America/New_York');
    const inverno = zonedTimeToUtc('2026-01-15', '12:00', 'America/New_York');

    expect(verao.toISOString()).toBe('2026-07-15T16:00:00.000Z');
    expect(inverno.toISOString()).toBe('2026-01-15T17:00:00.000Z');
  });

  it('lida com virada de dia UTC sem alterar a data local pedida', () => {
    // 23h em Manaus (UTC-4) já é dia seguinte em UTC.
    const resultado = zonedTimeToUtc('2026-09-15', '23:00', 'America/Manaus');

    expect(resultado.toISOString()).toBe('2026-09-16T03:00:00.000Z');
  });
});

describe('parseWindowText', () => {
  it('extrai início e fim de "08:00 - 12:00"', () => {
    expect(parseWindowText('08:00 - 12:00')).toEqual({ inicio: '08:00', fim: '12:00' });
  });

  it('aceita travessão, hífen e a palavra "a" como separador', () => {
    expect(parseWindowText('08:00 – 12:00')).toEqual({ inicio: '08:00', fim: '12:00' });
    expect(parseWindowText('08:00 a 12:00')).toEqual({ inicio: '08:00', fim: '12:00' });
  });

  it('completa hora com um dígito', () => {
    expect(parseWindowText('8:00 - 9:30')).toEqual({ inicio: '08:00', fim: '09:30' });
  });

  it('devolve null para "dia todo" (texto vazio) em vez de tentar converter', () => {
    expect(parseWindowText('')).toBeNull();
    expect(parseWindowText(undefined)).toBeNull();
    expect(parseWindowText(null)).toBeNull();
  });

  it('devolve null para texto que não é uma janela', () => {
    expect(parseWindowText('qualquer horário')).toBeNull();
  });
});
