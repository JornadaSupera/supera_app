import type { DataSubjectRequest, DataSubjectRequestType } from '../types';

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
