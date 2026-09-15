// Tipos do domínio NPS — `nps_surveys` e `nps_responses` (README §5.10).

/** Nota de 0 a 10 (`nps_responses.score`, CHECK no banco). */
export type NpsScore = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

/**
 * Pesquisa aberta e ainda sem resposta. Quem abre é a rotina agendada
 * (`open_nps_survey`, só `service_role`); o app só lê e responde.
 */
export interface NpsSurvey {
  id: string;
  /** `treatment_phases.label` do marco que abriu a pesquisa (ex.: "Primeiro acesso ao app"). */
  milestoneLabel: string;
}

/** Entrada de `submitNpsResponse`. */
export interface NpsResponseInput {
  surveyId: string;
  score: NpsScore;
  /** Comentário livre. Vazio (ou só espaços) vira `null` antes do insert — o CHECK do banco recusa string vazia. */
  comment?: string;
}
