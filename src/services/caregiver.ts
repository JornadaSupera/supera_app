import { FunctionsFetchError, FunctionsHttpError, FunctionsRelayError } from '@supabase/supabase-js';
import { appError } from '../lib/appError';
import {
  CAREGIVER_ERROR_MESSAGES as MESSAGES,
  CaregiverError,
  SMS_PROVIDER_UNAVAILABLE_DETAIL,
  SMS_PROVIDER_UNAVAILABLE_MESSAGE,
  getCaregiverErrorCode,
  isCaregiverErrorCode,
} from '../lib/caregiverError';
import {
  caregiverAccessResponseSchema,
  caregiverErrorBodySchema,
  caregiverScopeRowsSchema,
  myCaregiverRowSchema,
  wardScopeRowsSchema,
} from '../schemas/caregiver';
import { ALL_CAREGIVER_SCOPES, CAREGIVER_SCOPES } from '../utils/caregiverScopes';
import { requireSupabase } from './supabaseClient';
import type {
  CaregiverAccess,
  CaregiverDelivery,
  CaregiverIssuance,
  CaregiverLink,
  CaregiverScope,
  CaregiverScopeSettings,
  CreateCaregiverInput,
  MyCaregiver,
  MyWardLink,
  ResetCaregiverPasswordInput,
  UpdateCaregiverInput,
  WardScopes,
} from '../types';

// Acompanhante criado pelo paciente (T23, ligado ao banco na T36).
//
// Toda escrita aqui é Edge Function ou RPC — criar o login de outra pessoa
// exige `service_role`, que o app nunca usa, e o banco só aceita quem for o
// titular. O contrato (nomes, entradas, respostas, códigos de erro) é o do guia
// do banco §5.2 e o das funções em `supabase/functions/`.
//
// Repartição das chamadas, e por quê:
// - `create-caregiver`, `reset-caregiver-password` e `complete-first-password`
//   são Edge Functions porque tocam o Auth (criar conta, trocar senha), e isso
//   exige `service_role`;
// - editar é `rpc('update_my_caregiver')`: nada do Auth muda (nome e telefone
//   moram em `accounts`), e a RPC já dá a transação e o titular como autor na
//   trilha;
// - revogar é `rpc('revoke_caregiver_link')`, que já existia;
// - ler é `rpc('get_my_caregiver')` mais as duas tabelas que o titular enxerga;
// - as áreas que o acompanhante vê são `get_caregiver_scopes`,
//   `set_caregiver_scope` e `get_my_ward_scopes` — o controle por área do
//   [BANCO 32]. Ver a seção "Áreas do acompanhante" no fim do arquivo.

/**
 * Traduz o erro do `functions.invoke` no erro do app.
 *
 * O corpo do erro é `{ error: '<código>' }`, com `link_id` e `expires_at` no
 * `sms_failed` da criação e `detail` quando o provedor de SMS está desligado.
 * Sem corpo legível, vale o status: 404 é a função que não foi publicada; 5xx é
 * falha do servidor; o resto vira mensagem genérica.
 */
async function toCaregiverError(error: unknown): Promise<CaregiverError> {
  if (error instanceof FunctionsFetchError) {
    return new CaregiverError(MESSAGES.network, 'network', { cause: error });
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
      const smsProviderUnavailable = parsed?.detail === SMS_PROVIDER_UNAVAILABLE_DETAIL;

      return new CaregiverError(
        smsProviderUnavailable ? SMS_PROVIDER_UNAVAILABLE_MESSAGE : MESSAGES[code],
        code,
        {
          linkId: parsed?.link_id ?? null,
          expiresAt: parsed?.expires_at ?? null,
          smsProviderUnavailable,
          cause: error,
        }
      );
    }

    return new CaregiverError('Não foi possível concluir agora. Tente de novo.', String(response.status), {
      cause: error,
    });
  }

  return new CaregiverError('Não foi possível concluir agora. Tente de novo.', 'app', { cause: error });
}

/**
 * Traduz o erro de uma RPC.
 *
 * O nome do erro de negócio vem no `message` (`RAISE EXCEPTION 'nome'`), não no
 * SQLSTATE: `forbidden` e `link_not_active` são os dois `42501` de
 * `revoke_caregiver_link`, e distingui-los pelo código faria o app acusar de
 * "não é o titular" quem só tentou revogar duas vezes.
 */
function toRpcCaregiverError(
  error: { code?: string; message?: string } | null,
  fallback: string
): CaregiverError {
  const code = error?.message?.trim() ?? '';

  // PGRST202: a função não existe. Não é falha de rede — repetir não adianta.
  if (error?.code === 'PGRST202') {
    return new CaregiverError(MESSAGES.unavailable, 'unavailable', { cause: error });
  }

  if (isCaregiverErrorCode(code)) {
    return new CaregiverError(MESSAGES[code], code, { cause: error });
  }

  return new CaregiverError(fallback, error?.code ?? 'app', { cause: error });
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
    linkId: parsed.data.link_id ?? null,
    login: parsed.data.login ?? null,
    // No SMS o app nunca guarda senha, ainda que a resposta traga uma.
    temporaryPassword: delivery === 'whatsapp' ? parsed.data.temporary_password : null,
    expiresAt: parsed.data.expires_at,
    delivery,
    phoneMasked: parsed.data.phone_masked ?? null,
  };
}

/** Cria o acompanhante. `delivery: 'whatsapp'` devolve a senha provisória, uma vez; `'sms'` não. */
export async function createCaregiver(input: CreateCaregiverInput): Promise<CaregiverAccess> {

  return toAccess(
    await invoke('create-caregiver', {
      full_name: input.fullName.trim(),
      email: input.email.trim().toLowerCase(),
      phone: input.phone,
      delivery: input.delivery,
      // Só quando o banco tem o controle por área: sem ele, o campo não existe
      // no contrato publicado e o escopo é o fixo. As áreas entram NA MESMA
      // transação do vínculo (`link_caregiver_account`), com o titular como
      // autor — é esse o registro da autorização.
      ...(input.scopes ? { scopes: input.scopes } : {}),
    }),
    input.delivery
  );
}

/** Gera outra senha provisória. O vínculo volta a `pending` até o acompanhante trocá-la. */
export async function resetCaregiverPassword({ delivery }: ResetCaregiverPasswordInput): Promise<CaregiverAccess> {

  return toAccess(await invoke('reset-caregiver-password', { delivery }), delivery);
}

/**
 * Corrige nome e telefone do acompanhante.
 *
 * RPC, e não Edge Function: nada do Auth muda — o login é o e-mail, e nome e
 * telefone moram em `accounts`. A RPC dá a transação e o titular como autor na
 * trilha de graça.
 */
export async function updateCaregiver(input: UpdateCaregiverInput): Promise<void> {

  const { error } = await requireSupabase().rpc('update_my_caregiver', {
    p_full_name: input.fullName.trim(),
    p_phone: input.phone,
  });

  if (error) throw toRpcCaregiverError(error, 'Não foi possível salvar as alterações.');
}

/**
 * O acompanhante escolhe a senha dele, no primeiro acesso.
 *
 * O campo é `new_password`: é o nome que a Edge Function lê. O token que a
 * sessão carrega ainda diz "troque a senha" depois da troca, e o banco também
 * ainda o usa para segurar os dados: por isso a sessão é renovada aqui, antes
 * de devolver o controle. Quem chama relê a identidade em seguida.
 */
export async function completeFirstPassword(password: string): Promise<void> {

  let swallowedNotFirstLogin: unknown = null;

  try {
    await invoke('complete-first-password', { new_password: password });
  } catch (error) {
    // `not_first_login` PODE ser a tentativa anterior — o servidor já trocou a
    // senha e só faltou renovar a sessão, porque a rede caiu no meio. Mas pode
    // ser outra coisa bem diferente: `check_first_password_window` é o PRIMEIRO
    // passo da função, antes de tocar no Auth, e ela levanta o mesmo
    // `not_first_login` quando NÃO HÁ VÍNCULO PENDENTE — o que inclui o vínculo
    // que o titular acabou de revogar e a conta que o gatilho desativou.
    //
    // Engolir os dois casos diria "Senha criada" a quem ficou sem acesso
    // nenhum, e a senha provisória seguiria sendo a única válida até vencer.
    // Por isso o erro é guardado e só perdoado abaixo, depois de a sessão
    // renovada provar que a marca caiu.
    if (getCaregiverErrorCode(error) !== 'not_first_login') throw error;
    swallowedNotFirstLogin = error;
  }

  const { data, error } = await requireSupabase().auth.refreshSession();
  if (error) {
    throw new CaregiverError(
      'A senha foi trocada, mas não conseguimos renovar sua sessão. Saia e entre de novo com a senha nova.',
      'app',
      { cause: error }
    );
  }

  // A marca é a prova. Só o servidor a escreve, e `complete-first-password` a
  // zera no passo seguinte à troca: se ela caiu, a senha foi trocada em alguma
  // tentativa; se continua de pé, não foi — e o erro guardado volta a valer.
  if (swallowedNotFirstLogin) {
    const flag = data.session?.user.app_metadata?.must_change_password;
    if (flag === true || flag === 'true') throw swallowedNotFirstLogin;
  }
}

/**
 * O acompanhante do titular, ou `null` quando não há.
 *
 * `get_my_caregiver()` devolve zero ou uma linha, só ao titular e só nos
 * estados `pending` e `active` — vínculo revogado fica no histórico.
 */
export async function getMyCaregiver(): Promise<MyCaregiver | null> {

  const { data, error } = await requireSupabase().rpc('get_my_caregiver');

  if (error) throw toRpcCaregiverError(error, 'Não foi possível carregar seu acompanhante.');

  const row = Array.isArray(data) ? data[0] : data;
  if (row === undefined || row === null) return null;

  const parsed = myCaregiverRowSchema.safeParse(row);
  if (!parsed.success) {
    throw new CaregiverError(MESSAGES.incomplete_response, 'incomplete_response', { cause: parsed.error });
  }

  // `revoked` não sai desta função; se um dia sair, é "sem acompanhante".
  if (parsed.data.status === 'revoked') return null;

  return {
    linkId: parsed.data.link_id,
    caregiverAccountId: parsed.data.caregiver_account_id,
    fullName: parsed.data.full_name ?? '',
    phone: parsed.data.phone ?? '',
    email: parsed.data.email,
    status: parsed.data.status,
    grantedAt: parsed.data.granted_at,
    activatedAt: parsed.data.activated_at,
    temporaryPasswordExpiresAt: parsed.data.temporary_password_expires_at,
  };
}

/**
 * Os vínculos do titular, do mais novo ao mais antigo. Leitura direta de
 * `patient_caregivers` (o titular a lê por `patient_caregivers_select_own`):
 * traz datas e situação, sem nome — o banco não deixa o titular ler a conta do
 * acompanhante, e isto basta para o histórico que o contrato pede.
 *
 * `activated_at` entra porque autorizar e passar a ter acesso deixaram de ser o
 * mesmo instante: o vínculo nasce `pending` e só vira `active` quando o
 * acompanhante troca a senha provisória.
 */
export async function getCaregiverLinks(): Promise<CaregiverLink[]> {

  const { data, error } = await requireSupabase()
    .from('patient_caregivers')
    .select('id, status, granted_at, activated_at, revoked_at')
    .order('granted_at', { ascending: false })
    .limit(50);

  if (error) throw appError('Não foi possível carregar o histórico de vínculos.', error);

  return data.map((row) => ({
    id: row.id,
    status: row.status,
    grantedAt: row.granted_at,
    activatedAt: row.activated_at,
    revokedAt: row.revoked_at,
  }));
}

/**
 * As senhas provisórias emitidas para os acompanhantes do titular.
 *
 * É o registro da autorização que o titular pode conferir: quando saiu cada
 * credencial, por qual canal, por qual motivo e até quando valia. A senha nunca
 * está aqui — o banco guarda a emissão, não o segredo
 * (`caregiver_credential_issuances`, política `..._select_own`).
 */
export async function getCaregiverIssuances(): Promise<CaregiverIssuance[]> {

  const { data, error } = await requireSupabase()
    .from('caregiver_credential_issuances')
    .select('id, link_id, reason, channel, issued_at, expires_at')
    .order('issued_at', { ascending: false })
    .limit(50);

  if (error) throw appError('Não foi possível carregar o registro de autorizações.', error);

  return data.map((row) => ({
    id: row.id,
    linkId: row.link_id,
    reason: row.reason,
    channel: row.channel,
    issuedAt: row.issued_at,
    expiresAt: row.expires_at,
  }));
}

/**
 * O vínculo do PRÓPRIO acompanhante, ou `null`.
 *
 * Só faz sentido numa sessão de acompanhante: `patient_caregivers` tem duas
 * políticas de leitura para `authenticated`, uma por `patient_id` (o titular) e
 * outra por `caregiver_id` (ele). Numa sessão de titular esta consulta
 * devolveria os vínculos DELE — por isso quem chama confere o papel antes
 * (`useMyWardLink`).
 *
 * O vínculo revogado é descartado aqui: quando ele cai, a sessão deixa de ter
 * tutelado e a guarda de rota já manda a pessoa para a tela de "sem vínculo".
 */
export async function getMyWardLink(): Promise<MyWardLink | null> {
  const client = requireSupabase();

  const [linkResult, accountResult] = await Promise.all([
    client
      .from('patient_caregivers')
      .select('id, status, granted_at, activated_at')
      .in('status', ['pending', 'active'])
      .order('granted_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    client.from('accounts').select('full_name, email, phone').maybeSingle(),
  ]);

  if (linkResult.error) throw appError('Não foi possível carregar seu vínculo.', linkResult.error);
  if (accountResult.error) throw appError('Não foi possível carregar seus dados.', accountResult.error);
  if (!linkResult.data) return null;

  return {
    linkId: linkResult.data.id,
    status: linkResult.data.status,
    grantedAt: linkResult.data.granted_at,
    activatedAt: linkResult.data.activated_at,
    account: {
      fullName: accountResult.data?.full_name ?? '',
      email: accountResult.data?.email ?? '',
      phone: accountResult.data?.phone ?? null,
    },
  };
}

/**
 * Revoga o vínculo. Vale na hora, e alcança também o vínculo `pending` — é o
 * que destrava quem criou um acompanhante e precisa recomeçar antes de ele ter
 * entrado (o banco só aceita um vínculo corrente por paciente).
 */
export async function revokeCaregiverLink(linkId: string): Promise<void> {

  const { error } = await requireSupabase().rpc('revoke_caregiver_link', { p_link_id: linkId });

  if (error) throw toRpcCaregiverError(error, 'Não foi possível revogar o acesso.');
}

// ------------------------------------------------------------------
// Áreas do acompanhante (guia 5.2, desde 29/09)
// ------------------------------------------------------------------
//
// O titular liga e desliga, uma a uma, as áreas que o acompanhante vê. QUEM
// CUMPRE é o banco: as políticas e funções do acompanhante recortam pela área
// (`private.my_ward_patient_ids_for(área)`), inclusive as notificações. A tela
// só mostra e pede a mudança.
//
// Onde a migration ainda não entrou (o PostgREST responde PGRST202), o app se
// comporta como antes: o escopo é o fixo do contrato, inteiro, e a tela mostra
// a lista fixa em vez de interruptores. Mostrar interruptores sem o banco
// cumprir seria um controle de segurança de mentira.

/** PGRST202: o PostgREST não conhece a função — o banco ainda não tem o controle por área. */
function isMissingFunction(error: { code?: string } | null): boolean {
  return error?.code === 'PGRST202';
}

/**
 * As áreas do acompanhante do titular, uma por item do catálogo.
 *
 * `get_caregiver_scopes()` devolve uma linha por área do vínculo corrente, e
 * vazio quando não há acompanhante — nesse caso vale o padrão de um vínculo
 * novo, tudo liberado, que é o que a tela de adicionar mostra.
 */
export async function getCaregiverScopes(): Promise<CaregiverScopeSettings> {
  const { data, error } = await requireSupabase().rpc('get_caregiver_scopes');

  if (error) {
    if (isMissingFunction(error)) return { supported: false, scopes: [] };
    throw toRpcCaregiverError(error, 'Não foi possível carregar as áreas do acompanhante.');
  }

  const parsed = caregiverScopeRowsSchema.safeParse(data ?? []);
  if (!parsed.success) {
    throw new CaregiverError(MESSAGES.incomplete_response, 'incomplete_response', { cause: parsed.error });
  }

  // Na ordem do catálogo, e com toda área presente: uma área que o banco não
  // devolveu conta como liberada só quando não há linha nenhuma (acompanhante
  // ainda por criar). Com linhas, a ausência é "desligada" — na dúvida, o lado
  // que mostra menos.
  const byScope = new Map(parsed.data.map((row) => [row.scope, row]));
  const noRows = parsed.data.length === 0;

  return {
    supported: true,
    scopes: CAREGIVER_SCOPES.map(({ scope }) => {
      const row = byScope.get(scope);
      return {
        scope,
        enabled: row ? row.enabled : noRows,
        updatedAt: row?.updated_at ?? null,
      };
    }),
  };
}

/**
 * Liga ou desliga uma área. Vale na hora, em toda consulta do acompanhante, e
 * fica na trilha de auditoria em nome do titular.
 */
export async function setCaregiverScope(scope: CaregiverScope, enabled: boolean): Promise<void> {
  const { error } = await requireSupabase().rpc('set_caregiver_scope', { p_scope: scope, p_enabled: enabled });

  if (error) throw toRpcCaregiverError(error, 'Não foi possível alterar esta área.');
}

/**
 * As áreas que o acompanhante LOGADO pode ver.
 *
 * Sem o controle por área no banco, tudo vale — é o escopo fixo que o banco já
 * impõe hoje. Com ele, só as áreas do vínculo ativo; vazio com o vínculo
 * pendente ou revogado, quando o banco também não entrega nada.
 */
export async function getMyWardScopes(): Promise<WardScopes> {
  const { data, error } = await requireSupabase().rpc('get_my_ward_scopes');

  if (error) {
    if (isMissingFunction(error)) return { supported: false, allowed: [...ALL_CAREGIVER_SCOPES] };
    throw appError('Não foi possível conferir o que foi compartilhado com você.', error);
  }

  const parsed = wardScopeRowsSchema.safeParse(data ?? []);
  if (!parsed.success) {
    throw appError('O servidor respondeu de um jeito inesperado.', parsed.error);
  }

  return { supported: true, allowed: parsed.data };
}
