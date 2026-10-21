import { FunctionsFetchError, FunctionsHttpError, FunctionsRelayError } from '@supabase/supabase-js';
import { AppError, appError } from '../lib/appError';
import { assistantReplySchema, functionErrorBodySchema } from '../schemas/contentAssistant';
import { requireSupabase } from './supabaseClient';
import type {
  AssistantReply,
  ContentAssistantSettings,
  ContentRequest,
  RequestContentInput,
} from '../types';

// Assistente de orientações com IA e pedido de orientação (guia do banco §5.5,
// ADR-033 — o bônus de IA do contrato).
//
// - Perguntar é a Edge Function `ask-content-assistant`, com o JWT da sessão.
//   Quem conversa com a IA é ela: o app nunca vê a chave do provedor, e a
//   função só manda à IA as orientações que a RLS de quem pergunta deixa abrir.
// - Ligado/desligado e os limites são de `clinic_settings` (leitura direta).
// - Pedir e retirar são RPC; listar é `.from('content_requests')`, recortado
//   pela RLS (titular: os da ficha; acompanhante: os dele).

/** A chave desligada e os limites de fábrica: o que vale enquanto o banco não diz outra coisa. */
const DISABLED_SETTINGS: ContentAssistantSettings = {
  enabled: false,
  hourlyLimit: 20,
  questionMaxChars: 500,
  requestDailyLimit: 5,
};

/** Coluna que não existe: o banco ainda não recebeu a migration do assistente. */
const UNDEFINED_COLUMN = '42703';

/**
 * A chave do assistente e os limites da clínica.
 *
 * Sem a migration (coluna inexistente) ou sem linha, o assistente fica
 * escondido em vez de virar tela de erro: ele acende sozinho quando o banco o
 * tiver.
 */
export async function getContentAssistantSettings(signal?: AbortSignal): Promise<ContentAssistantSettings> {
  let query = requireSupabase()
    .from('clinic_settings')
    .select('ai_assistant_enabled, ai_assistant_hourly_limit, ai_assistant_question_max_chars, content_request_daily_limit');
  if (signal) query = query.abortSignal(signal);

  const { data, error } = await query.maybeSingle();

  if (error?.code === UNDEFINED_COLUMN) return DISABLED_SETTINGS;
  if (error) throw appError('Não foi possível carregar o assistente.', error);
  if (!data) return DISABLED_SETTINGS;

  return {
    enabled: data.ai_assistant_enabled,
    hourlyLimit: data.ai_assistant_hourly_limit,
    questionMaxChars: data.ai_assistant_question_max_chars,
    requestDailyLimit: data.content_request_daily_limit,
  };
}

/** Os códigos de `ask-content-assistant` que o app sabe explicar. */
const ASSISTANT_ERROR_MESSAGES: Record<string, string> = {
  unauthorized: 'Sua sessão expirou. Entre novamente.',
  invalid_question: 'Escreva a sua pergunta.',
  question_too_short: 'Escreva um pouco mais sobre o que você quer saber.',
  question_too_long: 'A pergunta passou do tamanho permitido. Encurte e tente de novo.',
  assistant_disabled: 'O assistente está desligado no momento.',
  forbidden: 'Sua conta não tem acesso ao assistente de orientações.',
  rate_limited: 'Você chegou ao limite de perguntas desta hora. Tente de novo mais tarde.',
  ai_not_configured: 'O assistente ainda está sendo configurado. Tente de novo mais tarde.',
  ai_unavailable: 'O assistente não respondeu agora. Tente de novo em instantes.',
};

const ASK_FALLBACK = 'Não foi possível perguntar agora. Tente de novo.';

/**
 * Traduz o erro do `functions.invoke`. O código vem no corpo (`{ error }`) e
 * vira o `code` do `AppError`, para a tela distinguir "limite da hora" de
 * "assistente desligado". Sem corpo legível, 404 é a função não publicada.
 */
async function toAssistantError(error: unknown): Promise<AppError> {
  if (error instanceof FunctionsFetchError) {
    return new AppError('Sem conexão. Confira a internet e tente de novo.', 'network', error);
  }

  if (error instanceof FunctionsRelayError) {
    return new AppError('O servidor não respondeu. Tente de novo em instantes.', '503', error);
  }

  if (error instanceof FunctionsHttpError) {
    const response = error.context as Response;
    const body = await response
      .clone()
      .json()
      .then((json: unknown) => functionErrorBodySchema.safeParse(json))
      .catch(() => null);
    const code = body?.success ? body.data.error : undefined;

    if (code && ASSISTANT_ERROR_MESSAGES[code]) {
      return new AppError(ASSISTANT_ERROR_MESSAGES[code], code, error);
    }
    if (response.status === 404) {
      return new AppError('O assistente ainda não está disponível.', 'unavailable', error);
    }
    return new AppError(ASK_FALLBACK, String(response.status), error);
  }

  return new AppError(ASK_FALLBACK, 'app', error);
}

/**
 * O `functions.invoke` só decodifica JSON quando a resposta traz
 * `Content-Type: application/json`; sem isso o corpo chega como texto.
 */
function parseFunctionBody(data: unknown): unknown {
  if (typeof data !== 'string') return data;

  try {
    return JSON.parse(data) as unknown;
  } catch {
    return data;
  }
}

/**
 * Pergunta ao assistente. Cada pergunta é independente: a função não recebe
 * o histórico, e nada da pergunta fica no banco.
 */
export async function askContentAssistant(question: string): Promise<AssistantReply> {
  const { data, error } = await requireSupabase().functions.invoke('ask-content-assistant', {
    body: { question },
  });
  if (error) throw await toAssistantError(error);

  const parsed = assistantReplySchema.safeParse(parseFunctionBody(data));
  if (!parsed.success) throw appError(ASK_FALLBACK, parsed.error);

  const reply = parsed.data;
  if (reply.status === 'answered') {
    return {
      status: 'answered',
      answer: reply.answer,
      references: reply.references.map((reference) => ({
        resourceId: reference.content_item_id,
        title: reference.title,
      })),
      disclaimer: reply.disclaimer,
    };
  }

  return {
    status: 'no_match',
    message: reply.message,
    canRequest: reply.can_request,
    suggestedContext: reply.suggested_context,
  };
}

/** Os erros de negócio das RPCs de pedido, pelo nome (`RAISE EXCEPTION 'nome'`). */
const REQUEST_ERROR_MESSAGES: Record<string, string> = {
  rate_limited: 'Você já fez o máximo de pedidos de hoje. Amanhã você pode pedir de novo.',
  invalid_context: 'Conte em 10 a 1000 caracteres sobre o que você quer a orientação.',
  invalid_question: 'A pergunta original passou do tamanho permitido.',
  forbidden: 'Sua conta não pode pedir orientações.',
  content_request_not_found: 'Este pedido não está mais disponível.',
  content_request_not_open: 'Este pedido já foi respondido ou retirado.',
};

function toRequestError(error: { code?: string; message?: string }, fallback: string): AppError {
  const name = error.message?.trim() ?? '';

  // PGRST202: a função ainda não existe no banco.
  if (error.code === 'PGRST202') {
    return new AppError('O pedido de orientação ainda não está disponível.', 'unavailable', error);
  }
  if (REQUEST_ERROR_MESSAGES[name]) {
    return new AppError(REQUEST_ERROR_MESSAGES[name], name, error);
  }
  return appError(fallback, error);
}

/** Os pedidos que a sessão enxerga, do mais recente ao mais antigo. */
export async function getContentRequests(signal?: AbortSignal): Promise<ContentRequest[]> {
  let query = requireSupabase()
    .from('content_requests')
    .select('id, status, context, requested_by, fulfilled_content_item_id, decline_reason, created_at, resolved_at')
    .order('created_at', { ascending: false });
  if (signal) query = query.abortSignal(signal);

  const { data, error } = await query;

  if (error) throw appError('Não foi possível carregar os seus pedidos.', error);

  return (data ?? []).map((row) => ({
    id: row.id,
    status: row.status,
    context: row.context,
    requestedBy: row.requested_by,
    fulfilledResourceId: row.fulfilled_content_item_id,
    declineReason: row.decline_reason,
    createdAt: row.created_at,
    resolvedAt: row.resolved_at,
  }));
}

/** Pede uma orientação. Devolve o id do pedido. */
export async function requestContent({ context, originalQuestion }: RequestContentInput): Promise<string> {
  const { data, error } = await requireSupabase().rpc('request_content', {
    p_context: context,
    ...(originalQuestion ? { p_original_question: originalQuestion } : {}),
  });

  if (error) throw toRequestError(error, 'Não foi possível enviar o pedido. Tente de novo.');

  return data;
}

/** Retira um pedido ainda aberto. Só quem pediu consegue. */
export async function cancelContentRequest(requestId: string): Promise<void> {
  const { error } = await requireSupabase().rpc('cancel_content_request', { p_request_id: requestId });

  if (error) throw toRequestError(error, 'Não foi possível retirar o pedido. Tente de novo.');
}
