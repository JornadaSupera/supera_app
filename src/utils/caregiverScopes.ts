import type { CaregiverScope } from '../types';

// As áreas que o acompanhante pode ver e o que ele nunca vê.
//
// Um catálogo só, lido pela tela de adicionar, pela gestão do acompanhante,
// pelo painel de escopo e pela guarda das telas do acompanhante: se as quatro
// tivessem a própria lista, bastaria uma esquecer uma área para o titular
// autorizar uma coisa e o acompanhante ver outra.

export interface CaregiverScopeInfo {
  scope: CaregiverScope;
  /** Nome da área, como o titular a reconhece. */
  label: string;
  /** O que liberar esta área deixa o acompanhante fazer. */
  description: string;
}

/**
 * As cinco áreas, na ordem em que aparecem. A ordem acompanha a do app: agenda
 * e diário primeiro, porque são o dia a dia do tratamento.
 *
 * A ficha clínica está aqui porque o acompanhante DE FATO a lê hoje —
 * diagnóstico, plano de tratamento e histórico (`patient_diagnoses_select_caregiver`,
 * `treatment_plans_select_caregiver`, `patient_clinical_history_select_caregiver`).
 * A lista anterior não a citava, e o titular autorizava sem saber que o
 * diagnóstico ia junto.
 */
export const CAREGIVER_SCOPES: readonly CaregiverScopeInfo[] = [
  { scope: 'schedule', label: 'Agenda', description: 'Compromissos e lembretes' },
  { scope: 'diary', label: 'Diário de sintomas', description: 'Ver e ajudar a registrar' },
  { scope: 'chat', label: 'Conversas com a equipe', description: 'Ler e enviar mensagens' },
  { scope: 'resources', label: 'Orientações', description: 'Conteúdos enviados pela equipe' },
  { scope: 'clinical_record', label: 'Ficha clínica', description: 'Diagnóstico, tratamento e alergias' },
];

/** Todas as áreas — o padrão de um acompanhante novo. */
export const ALL_CAREGIVER_SCOPES: readonly CaregiverScope[] = CAREGIVER_SCOPES.map((item) => item.scope);

/**
 * O que o acompanhante nunca vê, com ou sem área liberada. Não é escolha do
 * titular: é regra do banco, e nenhum interruptor a muda.
 *
 * - conteúdo sigiloso: as políticas do acompanhante só leem `visibility = 'team'`;
 * - CPF, contato e nascimento: `get_my_ward()` não os projeta;
 * - LGPD, senha e o próprio vínculo: as RPCs exigem o titular.
 *
 * Em minúscula de propósito, menos as siglas: os itens entram numa frase
 * ("Nunca vê: …") e, nas listas, a primeira letra sobe por CSS
 * (`first-letter:uppercase`). Um `toLowerCase()` na hora de montar a frase
 * estragaria "CPF" e "LGPD".
 */
export const NEVER_SHARED: readonly string[] = [
  'conteúdo sigiloso, como o da psicologia',
  'CPF, contatos e data de nascimento',
  'LGPD, exportação ou exclusão da conta',
  'a sua senha e o próprio vínculo',
];

const SCOPE_CODES = new Set<string>(ALL_CAREGIVER_SCOPES);

/** Este texto é uma área que o app conhece? */
export function isCaregiverScope(value: unknown): value is CaregiverScope {
  return typeof value === 'string' && SCOPE_CODES.has(value);
}

/**
 * A área de cada tela do acompanhante. É o que a guarda consulta para trocar a
 * tela por "não compartilhado" quando o titular retirou a área.
 */
export const SCOPE_BY_TAB_PATH: Readonly<Record<string, CaregiverScope>> = {
  '/agenda': 'schedule',
  '/diario': 'diary',
  '/chat': 'chat',
  '/orientacoes': 'resources',
};

/** O nome da área, para o texto da tela "não compartilhado". */
export function describeScope(scope: CaregiverScope): string {
  return CAREGIVER_SCOPES.find((item) => item.scope === scope)?.label ?? 'Esta área';
}
