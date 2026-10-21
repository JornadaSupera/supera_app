// O contrato entre o assistente de orientações e qualquer provedor de IA.
// ADR-033.
//
// A Edge Function só conhece estes tipos. Trocar de provedor é escrever outra
// implementação de `ContentAssistantModel` (ao lado de gemini.ts) e mudar o
// secret AI_PROVIDER — nada no banco, no app ou na função muda.

// Uma orientação como o modelo a vê. `ref` é opaco ("o1", "o2"…): o UUID não
// vai ao provedor, e uma ref inventada é fácil de reconhecer e descartar.
export type AssistantDocument = {
  ref: string;
  title: string;
  category: string | null;
  body: string;
};

export type AssistantRequest = {
  question: string;
  documents: AssistantDocument[];
};

// O que o modelo devolve, já validado na forma (não no conteúdo: quem confere
// se as refs existem é a função, que sabe quais enviou).
export type AssistantReply = {
  status: "answered" | "no_match";
  answer: string;
  refs: string[];
  suggestedContext: string;
};

export type ModelResult = {
  reply: AssistantReply;
  inputTokens: number | null;
  outputTokens: number | null;
};

export interface ContentAssistantModel {
  // Gravados no registro de uso (private.content_assistant_usage).
  readonly provider: string;
  readonly model: string;
  ask(request: AssistantRequest, signal: AbortSignal): Promise<ModelResult>;
}

// Falha do provedor (rede, HTTP, bloqueio, resposta fora do formato). A
// função responde `ai_unavailable` e fecha o uso como `failed`.
export class AiProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiProviderError";
  }
}
