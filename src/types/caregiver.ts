// Tipos do domínio Cuidador — cobre `src/mocks/caregiver.js` e os formatos
// que mockApi.js monta em cima dele.

/** JSDoc de `convidarCuidador` (mockApi.js) documenta exatamente esta union. */
export type CaregiverContactMethod = 'sms' | 'email';

/**
 * As 3 chaves de `EVENTO_LABEL` em `CaregiverManage.jsx` — mesmo conjunto
 * produzido por `convidarCuidador`/`removerCuidador` em mockApi.js
 * (`evento: 'revogado' | 'convite_aceito' | 'vinculo_ativo'`).
 */
export type CaregiverHistoryEvent = 'vinculo_ativo' | 'convite_aceito' | 'revogado';

/**
 * Vínculo de cuidador ativo. O mock (`caregiver.js`) só tem `atual: null` —
 * esta forma vem inteiramente do corpo de `convidarCuidador`
 * (`caregiverState.atual = { nome, parentesco, meio, contato }`) e é
 * confirmada pelo consumo em `CaregiverManage.jsx`
 * (`cuidadorAtual.nome`/`.parentesco`/`.meio`/`.contato`).
 */
export interface Caregiver {
  nome: string;
  /** Texto livre, ex.: 'Filho' — sem lookup validando, não é enum. */
  parentesco: string;
  meio: CaregiverContactMethod;
  contato: string;
}

/** Item do histórico de vínculos, como armazenado em `src/mocks/caregiver.js`. */
export interface CaregiverHistoryItem {
  id: string;
  evento: CaregiverHistoryEvent;
  nome: string;
  parentesco: string;
  /** Mesmo mecanismo de `Appointment.diasAPartirDeHoje` (ver appointments.ts). */
  diasAPartirDeHoje: number;
  /** Formato 'HH:MM' (24h). */
  hora: string;
}

/** CaregiverHistoryItem depois de `enrichHistoricoCuidador` (mockApi.js). */
export interface CaregiverHistoryItemDetail extends CaregiverHistoryItem {
  dataLabel: string;
}

/** Forma do default export de `src/mocks/caregiver.js`. */
export interface CaregiverState {
  atual: Caregiver | null;
  historico: CaregiverHistoryItem[];
}

/** Retorno de `getCuidador`. */
export interface CaregiverInfo {
  atual: Caregiver | null;
  historico: CaregiverHistoryItemDetail[];
  /** = `PERMISSOES_PODE` (caregiver.js): frases fixas de UI, não union — são texto, não valores comparados em código. */
  permissoesPode: string[];
  /** = `PERMISSOES_NAO_PODE` (caregiver.js). */
  permissoesNaoPode: string[];
}

/** Entrada de `convidarCuidador`. */
export interface InviteCaregiverInput {
  nome: string;
  parentesco: string;
  meio: CaregiverContactMethod;
  contato: string;
}
