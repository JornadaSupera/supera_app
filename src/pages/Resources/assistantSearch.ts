import type { AssistantTab } from '../../types';

// O estado da tela do assistente mora no endereço, e não só na memória da
// tela: ao abrir uma orientação citada e voltar, a pessoa reencontra a mesma
// aba e a mesma pergunta. Só vão ao endereço a aba e o id gerado no app —
// nunca o texto da pergunta.

const TAB_PARAM = 'aba';
const HISTORY_TAB = 'historico';
const EXCHANGE_PARAM = 'pergunta';

export interface AssistantView {
  tab: AssistantTab;
  /** A pergunta aberta: o resultado em "Perguntar", o detalhe em "Histórico". */
  exchangeId: string | null;
}

export function readAssistantView(params: URLSearchParams): AssistantView {
  return {
    tab: params.get(TAB_PARAM) === HISTORY_TAB ? 'history' : 'ask',
    exchangeId: params.get(EXCHANGE_PARAM),
  };
}

export function assistantSearchParams({ tab, exchangeId }: AssistantView): URLSearchParams {
  const params = new URLSearchParams();
  if (tab === 'history') params.set(TAB_PARAM, HISTORY_TAB);
  if (exchangeId) params.set(EXCHANGE_PARAM, exchangeId);
  return params;
}

/**
 * Marca da entrada aberta a partir da lista do histórico: o "Todas as
 * perguntas" do detalhe volta uma entrada (a lista, com a rolagem dela) em vez
 * de empilhar outra.
 */
export interface AssistantHistoryLinkState {
  fromHistoryList: true;
}

export function isHistoryLinkState(state: unknown): state is AssistantHistoryLinkState {
  return (
    typeof state === 'object' &&
    state !== null &&
    'fromHistoryList' in state &&
    (state as Record<string, unknown>).fromHistoryList === true
  );
}
