// ask-content-assistant — o paciente pergunta, e a IA responde SÓ com o que
// as orientações publicadas dizem, apontando quais ler. ADR-033 (o bônus de
// IA do contrato).
//
// Quem chama: o app, com o JWT do TITULAR ou do ACOMPANHANTE com a área
// `resources`. A equipe recebe `forbidden`.
//
// Corpo: { question }
//
// Respostas (200):
//   answered → { status: "answered", answer, references: [{ content_item_id, title }], disclaimer }
//              O app abre cada referência como abre a orientação da biblioteca.
//   no_match → { status: "no_match", message, can_request: true, suggested_context }
//              O app pergunta se a pessoa quer pedir uma orientação e, se sim,
//              mostra `suggested_context` para ela editar e chama
//              rpc('request_content', { p_context, p_original_question }).
//
// Erros ({ error }): unauthorized (401), invalid_question (422),
// question_too_short (422), question_too_long (422), assistant_disabled (403),
// forbidden (403), rate_limited (429), ai_not_configured (503),
// ai_unavailable (502).
//
// O QUE VAI AO PROVEDOR: a pergunta, sem CPF, telefone e e-mail (removidos
// aqui), e as orientações que quem pergunta pode abrir. Nenhum id, nome ou
// dado da ficha. O catálogo é lido COM O JWT de quem pergunta: a RLS da
// biblioteca já aplica o CID, o envio dirigido e as áreas do acompanhante, e
// a IA nunca cita uma orientação que a pessoa não abriria.
//
// O QUE FICA NO BANCO: o registro de uso (conta, instante, desfecho, tokens),
// nunca a pergunta nem a resposta.
//
// "SÓ COM BASE NAS ORIENTAÇÕES" É REGRA DESTA FUNÇÃO, não só do prompt: toda
// ref que o modelo devolver e não estiver na lista enviada é descartada, e uma
// resposta sem ref válida vira `no_match`.
//
// A sequência:
//   1. valida a pergunta e confere se há provedor configurado (sem gastar cota);
//   2. begin_content_assistant_query — chave ligada, público, tamanho, limite;
//   3. o catálogo, pela RLS de quem pergunta;
//   4. o provedor (ai/index.ts escolhe pelo secret AI_PROVIDER);
//   5. a validação das refs;
//   6. finish_content_assistant_query — o desfecho e os tokens.

import "@supabase/functions-js/edge-runtime.d.ts";
import { AiProviderError, type AssistantDocument, assistantModel } from "../_shared/ai/index.ts";
import { caller, fromDbError, json, preflight, readBody } from "../_shared/common.ts";

// Textos provisórios: a redação final é da clínica (D.12).
const DISCLAIMER = "Esta resposta resume as orientações da sua equipe e não substitui o atendimento. " +
  "Se você tiver sintomas ou dúvidas sobre o seu tratamento, fale com a equipe pelo chat.";
const NO_MATCH_MESSAGE =
  "Ainda não temos uma orientação sobre esse assunto. Você gostaria de pedir que a equipe escreva uma?";

// Teto do que vai ao modelo. Acima dele, a função escolhe as orientações que
// mais se parecem com a pergunta (rankByOverlap). Uma orientação longa entra
// cortada: o título e o começo bastam para indicá-la, e o custo da pergunta é
// quase todo o catálogo de entrada.
const MAX_BODY_CHARS = 3_000;
const MAX_CATALOG_CHARS = 300_000;
const MAX_REFERENCES = 5;
// Teto rígido da pergunta, antes de qualquer chamada ao banco. O limite de
// verdade é clinic_settings.ai_assistant_question_max_chars (até 2000).
const HARD_MAX_QUESTION_CHARS = 2_000;
const PROVIDER_TIMEOUT_MS = 25_000;

// O contrato do bônus: a IA não processa dado identificável. O nome não se
// remove por regex; o que tem forma, sim.
const PII_PATTERNS: RegExp[] = [
  /[^\s@]+@[^\s@]+\.[^\s@]+/g, // e-mail
  /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, // CPF
  /(?:\+?55\s?)?\(?\b\d{2}\)?\s?9?\d{4}-?\d{4}\b/g, // telefone
];

function scrub(text: string): string {
  return PII_PATTERNS.reduce((t, re) => t.replace(re, "[removido]"), text);
}

function normalize(text: string): string[] {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .split(/[^a-z0-9]+/).filter((w) => w.length >= 3);
}

// Só entra em ação quando o catálogo passa do teto. Sobreposição de palavras,
// com o título valendo mais. Grosseiro de propósito: o modelo é quem decide a
// relevância; isto só escolhe o que cabe.
function rankByOverlap(question: string, docs: AssistantDocument[]): AssistantDocument[] {
  const q = new Set(normalize(question));
  const score = (d: AssistantDocument) => {
    let s = 0;
    for (const w of normalize(d.title)) if (q.has(w)) s += 3;
    for (const w of normalize(d.body)) if (q.has(w)) s += 1;
    return s;
  };
  return docs.map((d) => ({ d, s: score(d) })).sort((a, b) => b.s - a.s).map((x) => x.d);
}

// Acima do teto, escolhe pelo ranking mas devolve na ORDEM DO CATÁLOGO: o
// começo do prompt continua o mesmo de uma pergunta para outra (ver
// orderForCache).
function fitCatalog(question: string, docs: AssistantDocument[]): AssistantDocument[] {
  const size = (d: AssistantDocument) => d.title.length + d.body.length + (d.category?.length ?? 0) + 60;
  const total = docs.reduce((n, d) => n + size(d), 0);
  if (total <= MAX_CATALOG_CHARS) return docs;

  const chosen = new Set<AssistantDocument>();
  let used = 0;
  for (const d of rankByOverlap(question, docs)) {
    if (used + size(d) > MAX_CATALOG_CHARS) continue;
    chosen.add(d);
    used += size(d);
  }
  return docs.filter((d) => chosen.has(d));
}

// Espaço e quebra de linha repetidos custam token e não dizem nada ao modelo.
// Mantém UMA quebra entre parágrafos, para listas e passos continuarem legíveis.
function compact(text: string): string {
  return text.replace(/[ \t]*\n\s*/g, "\n").replace(/[ \t]{2,}/g, " ").trim();
}

// O provedor cobra menos pelo começo de prompt que se repete (o cache
// implícito do Gemini, por exemplo). Por isso a ordem é estável e começa
// pelo que é igual para todo paciente: as orientações UNIVERSAIS (sem CID),
// depois as marcadas por CID, cada grupo por id. A pergunta fica no fim
// (prompt.ts). Sem isso, a ordem viria da consulta, e um prompt idêntico
// mudaria de cara entre duas perguntas.
function orderForCache(rows: CatalogRow[]): CatalogRow[] {
  const marked = (r: CatalogRow) => (r.content_items?.content_cid10?.length ?? 0) > 0 ? 1 : 0;
  return [...rows].sort((a, b) =>
    marked(a) - marked(b) ||
    (a.content_item_id < b.content_item_id ? -1 : a.content_item_id > b.content_item_id ? 1 : 0)
  );
}

type CatalogRow = {
  content_item_id: string;
  title: string;
  body: string;
  content_items: {
    content_categories: { label: string } | null;
    content_cid10: { cid10_id: string }[] | null;
  } | null;
};

Deno.serve(async (req) => {
  const early = preflight(req);
  if (early) return early;

  const me = await caller(req);
  if (!me) return json(401, { error: "unauthorized" });

  // 1. A pergunta, e o provedor.
  const body = await readBody(req);
  const raw = typeof body?.question === "string" ? body.question.trim() : "";
  if (!raw || raw.length > HARD_MAX_QUESTION_CHARS) return json(422, { error: "invalid_question" });

  const model = assistantModel();
  if (!model) {
    console.error("assistente sem provedor: confira AI_PROVIDER, AI_MODEL e a chave do provedor");
    return json(503, { error: "ai_not_configured" });
  }

  // 2. Pode perguntar? O banco recebe o tamanho, nunca o texto.
  const begin = await me.client.rpc("begin_content_assistant_query", { p_question_chars: raw.length });
  if (begin.error) return fromDbError(begin.error);
  const usageId = begin.data as number;

  const finish = async (
    outcome: "answered" | "no_match" | "failed",
    extra: { inputTokens?: number | null; outputTokens?: number | null; latencyMs?: number } = {},
  ) => {
    const { error } = await me.client.rpc("finish_content_assistant_query", {
      p_usage_id: usageId,
      p_outcome: outcome,
      p_provider: model.provider,
      p_model: model.model,
      p_input_tokens: extra.inputTokens ?? null,
      p_output_tokens: extra.outputTokens ?? null,
      p_latency_ms: extra.latencyMs ?? null,
    });
    // O registro de uso nao derruba a resposta: a vaga ja foi contada no begin.
    if (error) console.error("finish_content_assistant_query falhou:", error.message);
  };

  const question = scrub(raw);
  const noMatch = (suggested: string) => {
    const s = scrub(suggested).slice(0, 1000);
    return json(200, {
      status: "no_match",
      message: NO_MATCH_MESSAGE,
      can_request: true,
      // request_content exige 10 a 1000 caracteres.
      suggested_context: s.length >= 10 ? s : question.slice(0, 1000),
    });
  };

  // 3. O catálogo que ESTA pessoa pode abrir.
  const { data: rows, error: catErr } = await me.client
    .from("content_versions")
    .select("content_item_id, title, body, content_items(content_categories(label), content_cid10(cid10_id))")
    .eq("status", "published")
    .order("content_item_id")
    .limit(1000);
  if (catErr) {
    console.error("catalogo do assistente:", catErr.message);
    await finish("failed");
    return json(500, { error: "internal_error" });
  }

  const byRef = new Map<string, { id: string; title: string }>();
  // Sem tipos gerados, o supabase-js tipa todo embed como array; o de FK
  // muitos-para-um chega como objeto.
  const documents: AssistantDocument[] = orderForCache((rows ?? []) as unknown as CatalogRow[]).map((r, i) => {
    const ref = `o${i + 1}`;
    byRef.set(ref, { id: r.content_item_id, title: r.title });
    const text = compact(r.body);
    return {
      ref,
      title: r.title.trim(),
      category: r.content_items?.content_categories?.label ?? null,
      body: text.length > MAX_BODY_CHARS ? `${text.slice(0, MAX_BODY_CHARS)}…` : text,
    };
  });

  // Biblioteca vazia para esta pessoa: nao ha o que perguntar ao modelo.
  if (documents.length === 0) {
    await finish("no_match");
    return noMatch(question);
  }

  // 4. O provedor.
  const started = Date.now();
  const timeout = AbortSignal.timeout(PROVIDER_TIMEOUT_MS);
  let result;
  try {
    result = await model.ask({ question, documents: fitCatalog(question, documents) }, timeout);
  } catch (e) {
    const msg = e instanceof AiProviderError ? e.message : `inesperado: ${(e as Error).message}`;
    console.error("assistente de orientacoes:", msg);
    await finish("failed", { latencyMs: Date.now() - started });
    return json(502, { error: "ai_unavailable" });
  }
  const latencyMs = Date.now() - started;
  const usage = { inputTokens: result.inputTokens, outputTokens: result.outputTokens, latencyMs };

  // 5. Só vale ref que a função enviou. Sem ref válida, nao ha resposta.
  const seen = new Set<string>();
  const references = result.reply.refs
    .filter((ref) => byRef.has(ref) && !seen.has(ref) && seen.add(ref))
    .slice(0, MAX_REFERENCES)
    .map((ref) => ({ content_item_id: byRef.get(ref)!.id, title: byRef.get(ref)!.title }));

  if (result.reply.status === "answered" && references.length > 0 && result.reply.answer) {
    await finish("answered", usage);
    return json(200, { status: "answered", answer: result.reply.answer, references, disclaimer: DISCLAIMER });
  }

  if (result.reply.status === "answered") {
    console.warn("assistente respondeu sem referencia valida: tratado como no_match");
  }
  await finish("no_match", usage);
  return noMatch(result.reply.suggestedContext || question);
});
