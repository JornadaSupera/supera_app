// Escolhe o provedor de IA do assistente de orientações pelo secret
// AI_PROVIDER. ADR-033.
//
// Para trocar de provedor: escreva `<provedor>.ts` implementando
// ContentAssistantModel (types.ts), acrescente o `case` abaixo, cadastre os
// secrets dele e mude AI_PROVIDER. O prompt e o schema (prompt.ts) são os
// mesmos para todos.

import { GeminiModel, type ThinkingBudget } from "./gemini.ts";
import type { ContentAssistantModel } from "./types.ts";

export { AiProviderError } from "./types.ts";
export type { AssistantDocument, ContentAssistantModel } from "./types.ts";

// null = provedor não configurado. A função responde `ai_not_configured`
// ANTES de consumir a cota de quem pergunta.
export function assistantModel(): ContentAssistantModel | null {
  const provider = Deno.env.get("AI_PROVIDER");
  const model = Deno.env.get("AI_MODEL");
  if (!provider || !model) return null;

  switch (provider) {
    case "gemini": {
      const key = Deno.env.get("GEMINI_API_KEY");
      if (!key) return null;
      const url = Deno.env.get("GEMINI_API_URL") || undefined;
      const thinking = thinkingBudget(Deno.env.get("GEMINI_THINKING_BUDGET"));
      if (thinking === undefined) return null;
      return new GeminiModel(model, key, url, thinking);
    }
    default:
      console.error("AI_PROVIDER desconhecido:", provider);
      return null;
  }
}

// GEMINI_THINKING_BUDGET: ausente -> 0; `auto` -> null; inteiro >= 0 -> ele.
// Valor inválido -> undefined, e a função responde `ai_not_configured`: o erro
// de configuração aparece no primeiro teste, não na fatura.
function thinkingBudget(raw: string | undefined): ThinkingBudget | undefined {
  const v = raw?.trim() ?? "";
  if (v === "") return 0;
  if (v === "auto") return null;
  const n = Number(v);
  if (Number.isInteger(n) && n >= 0) return n;
  console.error("GEMINI_THINKING_BUDGET invalido:", raw);
  return undefined;
}
