import { FunctionsFetchError, FunctionsHttpError, FunctionsRelayError } from '@supabase/supabase-js';
import { appError } from '../lib/appError';
import { CAREGIVER_DEMO_ENABLED } from '../lib/features';
import {
  CAREGIVER_ERROR_MESSAGES as MESSAGES,
  CaregiverError,
  getCaregiverErrorCode,
  isCaregiverErrorCode,
} from '../lib/caregiverError';
import {
  caregiverAccessResponseSchema,
  caregiverErrorBodySchema,
  myCaregiverRowSchema,
} from '../schemas/caregiver';
import { requireSupabase } from './supabaseClient';
import type {
  CaregiverAccess,
  CaregiverDelivery,
  CaregiverLink,
  CreateCaregiverInput,
  MyCaregiver,
  ResetCaregiverPasswordInput,
  UpdateCaregiverInput,
} from '../types';

// Acompanhante criado pelo paciente (T23).
//
// Toda escrita aqui é Edge Function ou RPC — criar o login de outra pessoa
// exige `service_role`, que o app nunca usa, e o banco só aceita quem for o
// titular. O contrato (nomes, entradas, respostas, códigos de erro) é o do
// item 30 do `PENDENCIAS_BANCO.md`. Enquanto o banco não entrega as funções, o
// módulo fica desligado no build (`CAREGIVER_MODULE_ENABLED`); se alguém o ligar
// antes, cada chamada volta com "ainda não disponível", não com falha muda.
//
// Com a demonstração ligada (`VITE_CAREGIVER_DEMO=true`, no dev ou num build de
// teste), `CAREGIVER_DEMO_ENABLED` troca o banco por dados de exemplo
// (`caregiverDemo.ts`). Sem ela, a constante é falsa e o `import()` abaixo sai
// do pacote junto com o `if`.

/** As sete funções desta camada, na versão de demonstração. */
const loadDemo = () => import('./caregiverDemo');

/**
 * Traduz o erro do `functions.invoke` no erro do app.
 *
 * O corpo do erro é `{ error: '<código>' }`. Sem corpo legível, vale o status:
 * 404 é a função que ainda não foi publicada; 5xx é falha do servidor
 * (repetível); o resto vira mensagem genérica.
 */
async function toCaregiverError(error: unknown): Promise<CaregiverError> {
  if (error instanceof FunctionsFetchError) {
    return new CaregiverError('Sem conexão com o servidor. Verifique a internet e tente de novo.', 'network', {
      cause: error,
    });
  }

  if (error instanceof FunctionsRelayError) {
    return new CaregiverError('O servidor não respondeu. Tente de novo em instantes.', '503', { cause: error });
  }

  if (error instanceof FunctionsHttpError) {
    const response = error.context as Response;
    const body = await response
      .clone()
      .json()
      .then((json: unknown) => caregiverErrorBodySchema.safeParse(json))
      .catch(() => null);
    const parsed = body?.success ? body.data : null;
    const code = parsed?.error ?? null;

    if (response.status === 404 && !code) {
      return new CaregiverError(MESSAGES.unavailable, 'unavailable', { cause: error });
    }

    if (code && isCaregiverErrorCode(code)) {
      return new CaregiverError(MESSAGES[code], code, {
        caregiverAccountId: parsed?.caregiver_account_id ?? null,
        expiresAt: parsed?.temporary_password_expires_at ?? null,
        cause: error,
      });
    }

    return new CaregiverError('Não foi possível concluir agora. Tente de novo.', String(response.status), {
      cause: error,
    });
  }

  return new CaregiverError('Não foi possível concluir agora. Tente de novo.', 'app', { cause: error });
}

async function invoke(name: string, body: Record<string, unknown>): Promise<unknown> {
  const { data, error } = await requireSupabase().functions.invoke(name, { body });
  if (error) throw await toCaregiverError(error);
  return parseBody(data);
}

/**
 * O `functions.invoke` só decodifica o JSON quando a resposta traz
 * `Content-Type: application/json`; sem isso (é o que um `new Response(...)` do
 * Deno manda por padrão) o corpo chega como texto. Sem esta volta, uma conta
 * criada com sucesso perderia a senha provisória, que só existe nesta resposta.
 */
function parseBody(data: unknown): unknown {
  if (typeof data !== 'string') return data;

  try {
    return JSON.parse(data) as unknown;
  } catch {
    return data;
  }
}

function toAccess(data: unknown, delivery: CaregiverDelivery): CaregiverAccess {
  const parsed = caregiverAccessResponseSchema.safeParse(data);

  // Resposta fora do combinado, ou WhatsApp sem a senha (que só existe nesta
  // resposta): o app não adivinha. A conta pode já ter sido criada, e por isso
  // a mensagem manda conferir em "Meu acompanhante" — melhor do que dizer
  // "enviado por SMS" quando nada saiu, ou mostrar uma tela sem a senha.
  if (!parsed.success || (delivery === 'whatsapp' && !parsed.data.temporary_password)) {
    throw new CaregiverError(MESSAGES.incomplete_response, 'incomplete_response', {
      cause: parsed.success ? undefined : parsed.error,
    });
  }

  return {
    caregiverAccountId: parsed.data.caregiver_account_id,
    // No SMS o app nunca guarda senha, ainda que a resposta traga uma.
    temporaryPassword: delivery === 'whatsapp' ? parsed.data.temporary_password : null,
    expiresAt: parsed.data.temporary_password_expires_at,
  };
}

/** Cria o acompanhante. `delivery: 'whatsapp'` devolve a senha provisória, uma vez; `'sms'` não. */
export async function createCaregiver(input: CreateCaregiverInput): Promise<CaregiverAccess> {
  if (CAREGIVER_DEMO_ENABLED) return (await loadDemo()).createCaregiver(input);

  return toAccess(
    await invoke('create-caregiver', {
      full_name: input.fullName.trim(),
      email: input.email.trim().toLowerCase(),
      phone: input.phone,
      delivery: input.delivery,
    }),
    input.delivery
  );
}

/** Gera outra senha provisória (só enquanto o acompanhante ainda não trocou a primeira). */
export async function resetCaregiverPassword({ delivery }: ResetCaregiverPasswordInput): Promise<CaregiverAccess> {
  if (CAREGIVER_DEMO_ENABLED) return (await loadDemo()).resetCaregiverPassword({ delivery });

  return toAccess(await invoke('reset-caregiver-password', { delivery }), delivery);
}

/** Corrige nome e telefone do acompanhante ativo. */
export async function updateCaregiver(input: UpdateCaregiverInput): Promise<void> {
  if (CAREGIVER_DEMO_ENABLED) return (await loadDemo()).updateCaregiver(input);

  await invoke('update-caregiver', { full_name: input.fullName.trim(), phone: input.phone });
}

/**
 * O acompanhante escolhe a senha dele, no primeiro acesso.
 *
 * O token que a sessão carrega ainda diz "troque a senha" depois da troca, e o
 * banco também ainda o usa para segurar os dados: por isso a sessão é renovada
 * aqui, antes de devolver o controle. Quem chama relê a identidade em seguida.
 */
export async function completeFirstPassword(password: string): Promise<void> {
  if (CAREGIVER_DEMO_ENABLED) return (await loadDemo()).completeFirstPassword(password);

  try {
    await invoke('complete-first-password', { password });
  } catch (error) {
    // `not_first_login` aqui é a tentativa anterior: o servidor já trocou a
    // senha e só faltou renovar a sessão (a rede caiu no meio). Reenviar o
    // formulário só precisa renovar, não trocar de novo — senão a pessoa ficaria
    // presa numa tela que o servidor já considera concluída.
    if (getCaregiverErrorCode(error) !== 'not_first_login') throw error;
  }

  const { error } = await requireSupabase().auth.refreshSession();
  if (error) {
    throw new CaregiverError(
      'A senha foi trocada, mas não conseguimos renovar sua sessão. Saia e entre de novo com a senha nova.',
      'app',
      { cause: error }
    );
  }
}

// `get_my_caregiver` ainda não está no tipo do banco (`types/database.ts` é
// gerado a cada migration): quando o backend entregar a função, regerar o
// arquivo e trocar isto por `client.rpc('get_my_caregiver')` tipado.
interface UntypedRpcClient {
  rpc: (
    name: string,
    args?: Record<string, unknown>
  ) => PromiseLike<{ data: unknown; error: { code?: string; message?: string } | null }>;
}

/**
 * O acompanhante ativo do titular, ou `null` quando não há. `get_my_caregiver()`
 * devolve zero ou uma linha, só ao titular e só do vínculo ativo.
 */
export async function getMyCaregiver(): Promise<MyCaregiver | null> {
  if (CAREGIVER_DEMO_ENABLED) return (await loadDemo()).getMyCaregiver();

  const client = requireSupabase() as unknown as UntypedRpcClient;
  const { data, error } = await client.rpc('get_my_caregiver');

  if (error) {
    // PGRST202: a função não existe (ainda). Não é falha de rede: repetir não adianta.
    if (error.code === 'PGRST202') throw new CaregiverError(MESSAGES.unavailable, 'unavailable', { cause: error });
    throw appError('Não foi possível carregar seu acompanhante.', error);
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (row === undefined || row === null) return null;

  const parsed = myCaregiverRowSchema.safeParse(row);
  if (!parsed.success) {
    throw new CaregiverError(MESSAGES.unavailable, 'unavailable', { cause: parsed.error });
  }

  return {
    caregiverAccountId: parsed.data.caregiver_account_id,
    fullName: parsed.data.full_name ?? '',
    phone: parsed.data.phone ?? '',
    email: parsed.data.email,
    linkedAt: parsed.data.linked_at,
    passwordIsTemporary: parsed.data.password_is_temporary,
    temporaryPasswordExpiresAt: parsed.data.temporary_password_expires_at ?? null,
  };
}

/**
 * Os vínculos do titular, do mais novo ao mais antigo. Leitura direta de
 * `patient_caregivers` (o titular a lê por `patient_caregivers_select_own`):
 * traz datas e situação, sem nome — o banco não deixa o titular ler a conta do
 * acompanhante, e isto basta para o histórico que o contrato pede.
 */
export async function getCaregiverLinks(): Promise<CaregiverLink[]> {
  if (CAREGIVER_DEMO_ENABLED) return (await loadDemo()).getCaregiverLinks();

  const { data, error } = await requireSupabase()
    .from('patient_caregivers')
    .select('id, status, granted_at, revoked_at')
    .order('granted_at', { ascending: false })
    .limit(50);

  if (error) throw appError('Não foi possível carregar o histórico de vínculos.', error);

  return data.map((row) => ({
    id: row.id,
    status: row.status,
    grantedAt: row.granted_at,
    revokedAt: row.revoked_at,
  }));
}

/** Revoga o vínculo. Vale na hora (a RPC já existe); a conta some do escopo do titular. */
export async function revokeCaregiverLink(linkId: string): Promise<void> {
  if (CAREGIVER_DEMO_ENABLED) return (await loadDemo()).revokeCaregiverLink(linkId);

  const { error } = await requireSupabase().rpc('revoke_caregiver_link', { p_link_id: linkId });

  if (error) {
    throw appError(
      error.code === '42501' ? 'Só o titular da conta pode revogar o acesso.' : 'Não foi possível revogar o acesso.',
      error
    );
  }
}
