/**
 * Chegada prevista de cada pedido, lida do resultado gravado da otimização.
 *
 * A rota não guarda a previsão por parada: ela vive no JSON do histórico
 * (`optimized_route_history.optimization_result`). É a metade "planejada" da
 * comparação com o que o entregador fez em campo.
 */
export function plannedArrivalsByOrder(
  histories: Array<{ optimization_result?: string | null }>,
): Map<number, string> {
  const arrivals = new Map<number, string>();

  for (const history of histories) {
    try {
      const result = JSON.parse(history.optimization_result ?? '{}');
      for (const route of result?.routes ?? []) {
        for (const stop of route?.stops ?? []) {
          if (stop?.orderId && stop?.estimatedArrivalTime) {
            arrivals.set(Number(stop.orderId), String(stop.estimatedArrivalTime));
          }
        }
      }
    } catch {
      // Histórico ilegível não impede a rota de abrir: só fica sem previsão.
    }
  }

  return arrivals;
}
