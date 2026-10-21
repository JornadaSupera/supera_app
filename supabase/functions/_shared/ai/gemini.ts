// Adaptador do Gemini (Gemini API, generateContent) para o assistente de
// orientações. ADR-033.
//
// REST direto, sem SDK: uma chamada só, e o bundle da função não carrega uma
// biblioteca inteira para isso.
//
// Secrets (supabase secrets set …):
//   GEMINI_API_KEY   chave da conta da CONTRATANTE, plano PAGO — no gratuito
//                    o Google usa o conteúdo para treino (ADR-033 §3)
//   AI_MODEL         o modelo, ex.: gemini-2.5-flash. Obrigatório: um
//                    default escrito aqui envelheceria sem ninguém ver
//   GEMINI_API_URL   opcional; só para apontar a um provedor falso em teste
//   GEMINI_THINKING_BUDGET
//                    opcional. Ausente = 0, sem raciocínio: a tarefa é localizar
//                    e resumir, e o raciocínio é cobrado como saída. Um número
//                    = esse orçamento. `auto` = não mandar o campo e deixar o
//                    modelo decidir, para o modelo que recusa 0 (o 2.5 Pro
//                    exige pelo menos 128; um modelo novo pode nem aceitar o
//                    campo). Se o provedor responder 400 citando "thinking", é
//                    este o ajuste.

import { buildUserMessage, parseReply, REPLY_SCHEMA, SYSTEM_INSTRUCTION } from "./prompt.ts";
import { AiProviderError, type AssistantRequest, type ContentAssistantModel, type ModelResult } from "./types.ts";

// O Gemini fala um subconjunto do OpenAPI 3.0, com os tipos em maiúsculas.
// Converte o JSON Schema neutro de prompt.ts.
function toGeminiSchema(schema: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(schema)) {
    if (k === "type" && typeof v === "string") out.type = v.toUpperCase();
    else if (k === "properties" && v && typeof v === "object") {
      out.properties = Object.fromEntries(
        Object.entries(v as Record<string, Record<string, unknown>>).map(([name, s]) => [name, toGeminiSchema(s)]),
      );
    } else if (k === "items" && v && typeof v === "object") out.items = toGeminiSchema(v as Record<string, unknown>);
    else out[k] = v;
  }
  return out;
}

type GeminiResponse = {
  candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number };
};

// A resposta tem no máximo 120 palavras e 5 refs, num JSON pequeno: 512 tokens
// sobram. Com raciocínio ligado, ele sai do mesmo teto, e o teto cresce junto.
const ANSWER_TOKENS = 512;
const AUTO_THINKING_TOKENS = 1536;

// null = `auto` (não manda thinkingConfig).
export type ThinkingBudget = number | null;

export class GeminiModel implements ContentAssistantModel {
  readonly provider = "gemini";

  constructor(
    readonly model: string,
    private readonly apiKey: string,
    private readonly baseUrl = "https://generativelanguage.googleapis.com",
    private readonly thinkingBudget: ThinkingBudget = 0,
  ) {}

  async ask(request: AssistantRequest, signal: AbortSignal): Promise<ModelResult> {
    const url = `${this.baseUrl}/v1beta/models/${encodeURIComponent(this.model)}:generateContent`;
    const body = {
      systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
      contents: [{ role: "user", parts: [{ text: buildUserMessage(request) }] }],
      generationConfig: {
        // Baixa: a tarefa é localizar e resumir, não criar.
        temperature: 0.1,
        maxOutputTokens: ANSWER_TOKENS + (this.thinkingBudget ?? AUTO_THINKING_TOKENS),
        responseMimeType: "application/json",
        responseSchema: toGeminiSchema(REPLY_SCHEMA as unknown as Record<string, unknown>),
        ...(this.thinkingBudget === null ? {} : { thinkingConfig: { thinkingBudget: this.thinkingBudget } }),
      },
    };

    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": this.apiKey },
        body: JSON.stringify(body),
        signal,
      });
    } catch (e) {
      throw new AiProviderError(`rede: ${(e as Error).message}`);
    }

    const text = await res.text();
    if (!res.ok) throw new AiProviderError(`gemini ${res.status}: ${text.slice(0, 300)}`);

    let data: GeminiResponse;
    try {
      data = JSON.parse(text) as GeminiResponse;
    } catch {
      throw new AiProviderError("gemini: resposta nao e JSON");
    }

    if (data.promptFeedback?.blockReason) {
      throw new AiProviderError(`gemini bloqueou a pergunta: ${data.promptFeedback.blockReason}`);
    }
    const candidate = data.candidates?.[0];
    const out = candidate?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
    if (!out) throw new AiProviderError(`gemini sem resposta (finishReason=${candidate?.finishReason ?? "?"})`);

    let parsed: unknown;
    try {
      parsed = JSON.parse(out);
    } catch {
      throw new AiProviderError(`gemini: resposta fora do formato (finishReason=${candidate?.finishReason ?? "?"})`);
    }
    const reply = parseReply(parsed);
    if (!reply) throw new AiProviderError("gemini: JSON fora do schema");

    const u = data.usageMetadata;
    return {
      reply,
      inputTokens: u?.promptTokenCount ?? null,
      // Modelos com raciocínio cobram os tokens de pensamento como saída.
      outputTokens: u ? (u.candidatesTokenCount ?? 0) + (u.thoughtsTokenCount ?? 0) : null,
    };
  }
}
