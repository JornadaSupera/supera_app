import type { DataSubjectRequest, DataSubjectRequestType, RectificationField } from '../types';

// Regras puras dos pedidos do titular — sem acesso ao banco, por isso aqui e
// não em `services/` (as telas precisam delas e não importam de `services/`).

/**
 * Janela do download depois do deferimento, em dias.
 *
 * É a mesma do banco (`private.register_subject_export` recusa com
 * `export_window_closed` fora dela). Repetida aqui só para a tela poder dizer
 * "você pode baixar até …" e esconder um botão que só daria erro — quem
 * decide continua sendo o servidor.
 */
export const EXPORT_WINDOW_DAYS = 15;

const WINDOW_MS = EXPORT_WINDOW_DAYS * 24 * 60 * 60 * 1000;

/** Os dois tipos cujo cumprimento é o próprio titular baixar o pacote. */
const DOWNLOADABLE_TYPES: DataSubjectRequestType[] = ['access', 'portability'];

/**
 * Dá para baixar o pacote deste pedido agora?
 *
 * Só `access` e `portability`, já deferidos, dentro da janela contada a partir
 * do deferimento. `executed` continua valendo: baixar de novo dentro da janela
 * é permitido, e cada download fica na trilha.
 */
export function canDownloadExport(request: DataSubjectRequest, now: number = Date.now()): boolean {
  if (!DOWNLOADABLE_TYPES.includes(request.type)) return false;
  if (request.status !== 'granted' && request.status !== 'executed') return false;
  if (!request.decidedAt) return false;

  return now < new Date(request.decidedAt).getTime() + WINDOW_MS;
}

/** Até quando este pedido pode ser baixado, ou `null` quando não se aplica. */
export function exportDeadline(request: DataSubjectRequest): Date | null {
  if (!request.decidedAt) return null;
  return new Date(new Date(request.decidedAt).getTime() + WINDOW_MS);
}

/**
 * O prazo de download deste pedido já acabou? Vale para o pacote deferido,
 * baixado ou não. Sem isto, o pedido vencido ficava "Deferido", sem botão e
 * sem dizer por quê — e a pessoa não sabia que precisava pedir de novo.
 */
export function isExportWindowClosed(request: DataSubjectRequest, now: number = Date.now()): boolean {
  if (!DOWNLOADABLE_TYPES.includes(request.type)) return false;
  if (request.status !== 'granted' && request.status !== 'executed') return false;
  if (!request.decidedAt) return false;

  return now >= new Date(request.decidedAt).getTime() + WINDOW_MS;
}

/** Os dados do pedido de correção, na ordem do formulário e do texto que vai ao painel. */
export const RECTIFICATION_FIELDS = [
  'full_name',
  'cpf',
  'birth_date',
  'phone',
  'email',
  'other',
] as const satisfies readonly RectificationField[];

export const RECTIFICATION_FIELD_LABELS: Record<RectificationField, string> = {
  full_name: 'Nome',
  cpf: 'CPF',
  birth_date: 'Data de nascimento',
  phone: 'Celular',
  email: 'E-mail',
  other: 'Outro',
};

/**
 * Teto do que a pessoa escreve. O banco aceita até 1000 caracteres no pedido
 * (`requester_note`), e a linha dos dados marcados ocupa no máximo 74: o
 * texto inteiro cabe sempre, sem o banco recusar no envio.
 */
export const RECTIFICATION_DESCRIPTION_MAX_LENGTH = 800;

/**
 * O texto que chega ao painel: os dados marcados numa linha só, na ordem do
 * formulário — quem analisa bate o olho e sabe o que abrir na ficha —, e
 * depois o que a pessoa escreveu.
 */
export function buildRectificationNote(fields: readonly RectificationField[], description: string): string {
  const labels = RECTIFICATION_FIELDS.filter((field) => fields.includes(field)).map(
    (field) => RECTIFICATION_FIELD_LABELS[field]
  );

  return `Dados a corrigir: ${labels.join(', ')}.\n\n${description.trim()}`;
}
