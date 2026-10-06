/**
 * Os ciclos do plano vigente numa linha só, para o Perfil, embaixo do
 * protocolo: "Ciclo 3 de 6" com os dois números, "6 ciclos previstos" só com o
 * total, "Ciclo 3" só com o ciclo em andamento, e `null` sem nenhum dos dois —
 * aí a linha não aparece, em vez de dizer "não informado" de novo.
 *
 * Os dois vêm de `treatment_plans` (`cycles_planned`, `current_cycle_number`):
 * hoje lançados pelo painel; com a integração, pela Gemed.
 */
export function formatTreatmentCycles(currentCycle: number | null, cyclesPlanned: number | null): string | null {
  const current = currentCycle !== null && currentCycle > 0 ? currentCycle : null;
  const planned = cyclesPlanned !== null && cyclesPlanned > 0 ? cyclesPlanned : null;

  if (current !== null && planned !== null) return `Ciclo ${current} de ${planned}`;
  if (planned !== null) return planned === 1 ? '1 ciclo previsto' : `${planned} ciclos previstos`;
  if (current !== null) return `Ciclo ${current}`;
  return null;
}
