import { create } from 'zustand';

// Quais perguntas do assistente já viraram pedido de orientação, para a
// resposta "não achei" não oferecer o pedido de novo depois que a pessoa vai a
// "Meus pedidos" e volta.
//
// Em memória e só com o id da pergunta (o gerado no app ao perguntar): nada do
// texto nem do servidor mora aqui. Some ao recarregar e ao trocar de conta.

interface AssistantRequestState {
  requestedExchangeIds: string[];
  markRequested: (exchangeId: string) => void;
  clear: () => void;
}

export const useAssistantRequestStore = create<AssistantRequestState>((set) => ({
  requestedExchangeIds: [],
  markRequested: (exchangeId) =>
    set((state) => ({ requestedExchangeIds: [...state.requestedExchangeIds, exchangeId] })),
  clear: () => set({ requestedExchangeIds: [] }),
}));
