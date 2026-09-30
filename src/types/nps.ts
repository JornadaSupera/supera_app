// Tipos do domínio NPS — `nps_surveys` e `nps_responses` (README §5.10).

/** Nota de 0 a 10 (`nps_responses.score`, CHECK no banco). */
export type NpsScore = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

/**
 * Pesquisa aberta e ainda sem resposta. Quem abre é o banco
 * (`open_nps_survey`, só `service_role`); o app só lê e responde.
 *
 * Desde 25/09/2026 a do primeiro acesso abre por gatilho, quando a ficha ganha
 * conta. Os outros dois marcos dependem do ciclo do tratamento, que só o Gemed
 * preenche.
 */
export interface NpsSurvey {
  id: string;
  /**
   * `treatment_phases.label` do marco que abriu a pesquisa (ex.: "Primeiro
   * acesso ao app"). O marco é uma linha de `treatment_phases` com
   * `axis = 'nps'`, ligada por `fk_nps_surveys_milestone`.
   */
  milestoneLabel: string;
}

/** Entrada de `submitNpsResponse`. */
export interface NpsResponseInput {
  surveyId: string;
  score: NpsScore;
  /** Comentário livre. Vazio (ou só espaços) vira `null` antes do insert — o CHECK do banco recusa string vazia. */
  comment?: string;
}
