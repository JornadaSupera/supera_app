// Única porta de entrada para dados do app — nenhuma página importa de
// src/mocks/ diretamente. Toda função aqui é `async` e simula latência de
// rede (`wait()`), pra já se comportar como uma chamada HTTP de verdade.
//
// Contrato de API: os nomes, parâmetros e formatos de retorno abaixo são a
// especificação de que o backend real vai precisar implementar. Quando ele
// existir, a ideia é substituir só o CORPO de cada função por uma chamada
// Supabase (mesma assinatura, mesmo formato de retorno) — as telas que
// consomem essas funções não precisam mudar.
//
// Nota de tipagem: os mocks importados abaixo vêm de `src/mocks/*.js`, sem
// anotação nenhuma. O TypeScript infere a forma de cada um a partir do
// literal (campo a campo), mas *larga* os campos que no domínio real são
// union literais (ex.: `categoria: string`, não `AppointmentCategory`) —
// widening padrão para propriedades de objeto sem `as const`. Como não é
// permitido tocar em `src/mocks/`, cada mock é importado com um nome "Raw" e
// reatribuído a uma constante com o tipo nominal de `src/types/` via `as`:
// isso é um assert, não um `any` — os 9 arquivos de tipos foram conferidos
// campo a campo contra os dados reais na Fase 2 (ver
// `.superpowers/sdd/2026-08-25-fundacao-design-system/fase2-tipos-report.md`).
// Só valores primitivos "largos" (string/number) viram literais mais
// estritos; nenhuma propriedade é inventada nem removida.
import patientRaw from '../mocks/patient';
import notificationsRaw from '../mocks/notifications';
import conversationsRaw, { equipeCuidado as equipeCuidadoRaw } from '../mocks/messages';
import orientationsRaw from '../mocks/orientations';
import caregiverStateRaw, { PERMISSOES_PODE, PERMISSOES_NAO_PODE } from '../mocks/caregiver';
// `nps.js` exporta um array vazio (`const respostasNps = [];`) nunca mutado
// dentro do próprio arquivo, então o TypeScript não consegue "evoluir" um
// tipo pra ele — um `import respostasNpsRaw from '../mocks/nps'` comum
// dispara TS7034/TS7005 (`implicitly has an 'any[]' type`) tanto na
// declaração do import quanto no uso, mesmo com `as NpsAnswer[]` logo
// depois (o erro é sobre a variável em si, não sobre a atribuição, então o
// cast não resolve). Import como namespace + acesso a `.default` evita o
// gatilho (confirmado empiricamente) sem precisar de `@ts-expect-error` nem
// tocar em `src/mocks/nps.js`.
import * as respostasNpsModule from '../mocks/nps';
import type { AuthError } from '@supabase/supabase-js';
import { requireSupabase, supabase } from './supabaseClient';
import { looksLikeEmail } from '../schemas/auth';
import { unmask } from '../utils/masks';
import {
  addDays,
  formatDayLabel,
  formatRelativeTime,
  formatDiaryDateLabel,
  daysFromToday,
  parseDateOnly,
  shiftDateOnly,
  todayInClinicTimeZone,
  daysFromDate,
  formatTimeOfDay,
  startOfDayOf,
  endOfDayOf,
  formatAgendaFutureLabel,
  formatFullDateWithWeekday,
  getWeekDays,
  getMonthGridDays,
  isSameDay,
} from '../utils/date';
import {
  ALERT_THRESHOLD,
  getEntrySeverity,
  getSymptomPresentation,
  hasAttentionSignal,
} from '../utils/symptoms';
import { resolveAppointmentVisual } from '../utils/appointments';
import { getTipoConteudoInfo } from '../utils/orientations';
import { getAssuntoInfo } from '../utils/chat';
import { getTipoNotificacaoInfo } from '../utils/notifications';
import type {
  Patient,
  ApiSuccessResult,
  VerifyIdentityInput,
  VerifyIdentityResult,
  CreatePasswordInput,
  SessionIdentity,
  SignInCredentials,
  PasswordResetRequestInput,
  ResetPasswordInput,
  PatientPreferenceKey,
  AppointmentSpecialty,
  AppointmentStatusCode,
  AppointmentTypeInfo,
  EnrichedAppointment,
  AgendaDay,
  NextAppointmentSummary,
  AvailableSymptom,
  DiaryActorKind,
  DiaryEntryStatus,
  EnrichedDiaryEntry,
  SymptomReport,
  SymptomIntensity,
  TodayEntrySummary,
  SaveDiaryEntryInput,
  SaveDiaryEntryResult,
  SymptomEvolutionPoint,
  DiaryFilters,
  SymptomEvolutionQueryOptions,
  CareTeamMember,
  Conversation,
  ConversationSummary,
  Message,
  EnrichedMessage,
  ConversationDetail,
  TeamSummary,
  UnreadConversationsSummary,
  SendMessageResult,
  StartConversationInput,
  StartConversationResult,
  ChatSubjectInfo,
  Notification,
  NotificationWithLabel,
  NotificationDetail,
  NotificationTypeInfo,
  NotificationsQueryOptions,
  Orientation,
  OrientationDetail,
  OrientationFilters,
  ToggleFavoriteResult,
  ContentTypeInfo,
  CaregiverState,
  CaregiverInfo,
  CaregiverHistoryItem,
  CaregiverHistoryItemDetail,
  InviteCaregiverInput,
  NpsAnswer,
  NpsAnswerInput,
} from '../types';

const patient = patientRaw as Patient;
const notifications = notificationsRaw as Notification[];
const conversations = conversationsRaw as Conversation[];
const equipeCuidado = equipeCuidadoRaw as CareTeamMember[];
const orientations = orientationsRaw as Orientation[];
const caregiverState = caregiverStateRaw as CaregiverState;
const respostasNps = respostasNpsModule.default as NpsAnswer[];

const DEFAULT_DELAY = 700;

function wait(ms: number = DEFAULT_DELAY): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Confere CPF + data de nascimento + celular contra o cadastro existente
 * no Centro (primeira etapa do fluxo de Cadastro).
 * `nascimento` no formato 'YYYY-MM-DD'.
 * @throws {Error} Se os dados não baterem com nenhum cadastro.
 */
export async function verificarIdentidade({
  cpf,
  nascimento,
  celular,
}: VerifyIdentityInput): Promise<VerifyIdentityResult> {
  await wait();

  const cpfConfere = unmask(cpf) === unmask(patient.cpf);
  const nascimentoConfere = nascimento === patient.dataNascimento;
  const celularConfere = unmask(celular) === unmask(patient.celular);

  if (cpfConfere && nascimentoConfere && celularConfere) {
    return {
      success: true,
      // `Patient.celular` é nullable desde que passou a refletir `accounts`
      // de verdade; o mock de cadastro sempre tem o campo preenchido.
      celular: patient.celular ?? '',
      nome: patient.nome,
    };
  }

  throw new Error(
    'Não encontramos esse cadastro em nossa base. Confira os dados e tente novamente, ou fale com a recepção do Centro.'
  );
}

export const OTP_MOCK_CODE = '123456';

/**
 * Dispara o envio (real, via backend) do código de confirmação por SMS.
 */
export async function enviarCodigoSms(_celular: string): Promise<ApiSuccessResult> {
  await wait();
  return { success: true };
}

/**
 * Confere o código de 6 dígitos enviado por SMS.
 * @throws {Error} Se o código estiver incorreto.
 */
export async function confirmarCodigoSms(codigo: string): Promise<ApiSuccessResult> {
  await wait();

  if (codigo === OTP_MOCK_CODE) {
    return { success: true };
  }

  throw new Error('Código incorreto. Verifique e tente novamente.');
}

/**
 * Define a senha final e conclui o fluxo de Cadastro.
 */
export async function concluirCadastro({ senha }: CreatePasswordInput): Promise<ApiSuccessResult> {
  await wait();
  // Atualiza a senha "salva" do paciente mockado para a sessão atual, para
  // que o login logo em seguida funcione com a senha recém-criada.
  patient.senha = senha;
  return { success: true };
}

/**
 * Caminho para onde o link de redefinição de senha devolve o usuário. Precisa
 * bater com uma rota real do app e estar na lista de "Redirect URLs" do
 * projeto Supabase — se divergir, o GoTrue recusa o redirecionamento e a
 * pessoa cai numa página de erro do próprio Supabase, fora do app.
 */
const PASSWORD_RESET_REDIRECT_PATH = '/recuperar-senha/nova';

/**
 * Traduz o erro do GoTrue para uma frase que o paciente entenda.
 *
 * Nenhuma mensagem distingue "e-mail não existe" de "senha errada": revelar
 * isso transformaria a tela de login em um verificador de cadastro — que num
 * app de oncologia significa confirmar que alguém é paciente do Centro.
 */
function describeAuthError(error: AuthError): string {
  switch (error.code) {
    case 'invalid_credentials':
      return 'E-mail ou senha incorretos.';
    case 'email_not_confirmed':
      return 'Confirme seu e-mail antes de entrar. Verifique sua caixa de entrada.';
    case 'user_banned':
      return 'Seu acesso está bloqueado. Fale com a recepção do Centro.';
    case 'over_request_rate_limit':
    case 'over_email_send_rate_limit':
      return 'Muitas tentativas seguidas. Aguarde alguns minutos e tente novamente.';
    case 'weak_password':
      return 'Essa senha é fácil de adivinhar. Escolha uma combinação mais forte.';
    case 'same_password':
      return 'A nova senha precisa ser diferente da anterior.';
    case 'session_expired':
    case 'refresh_token_not_found':
      return 'Sua sessão expirou. Entre novamente.';
    default:
      // `status: 0` é a assinatura de falha de rede no auth-js — o navegador
      // nem chegou a receber resposta. Vale separar porque a ação do usuário
      // é outra: conferir a conexão, não conferir a senha.
      if (error.status === 0) {
        return 'Sem conexão com o servidor. Verifique sua internet e tente novamente.';
      }
      return 'Não foi possível concluir. Tente novamente em instantes.';
  }
}

/**
 * Monta a identidade da sessão a partir das duas linhas que a definem:
 * `accounts` (quem autenticou) e `patients` (se essa conta é um paciente).
 *
 * Devolve `null` quando não há sessão — é o estado "anônimo", não um erro.
 *
 * `patientId` vem `null` quando o cadastro ainda não foi vinculado à conta:
 * `my_own_patient_id()` exige `account_id` preenchido e as duas linhas ativas,
 * então a RLS simplesmente não devolve linha nenhuma. Isso é esperado hoje —
 * não existe RPC que faça o vínculo (ver seção 11 do guia do banco).
 */
/**
 * Traduz a falha de uma leitura de identidade, preservando o código do
 * PostgREST na mensagem.
 *
 * O código fica visível de propósito: sem ele, "não foi possível carregar"
 * cobre igualmente banco sem schema, sessão recusada e permissão faltando —
 * três causas com três correções diferentes, indistinguíveis para quem
 * precisa consertar.
 */
function describeIdentityError(error: { code?: string; message?: string }, alvo: string): string {
  switch (error.code) {
    case 'PGRST205':
    case '42P01':
      return `O banco de dados ainda não tem as tabelas do aplicativo (${error.code}). As migrations precisam ser aplicadas ao projeto.`;
    case '42501':
      return `O banco recusou a leitura d${alvo} por falta de permissão (42501). O papel "authenticated" precisa de SELECT nessa tabela.`;
    case 'PGRST301':
    case 'PGRST302':
      return `Sua sessão não foi aceita pelo servidor (${error.code}). Entre novamente.`;
    default:
      return error.code
        ? `Não foi possível carregar ${alvo} (${error.code}). Tente novamente.`
        : `Não foi possível carregar ${alvo}. Verifique sua conexão e tente novamente.`;
  }
}

export async function getSessionIdentity(): Promise<SessionIdentity | null> {
  const client = requireSupabase();

  const {
    data: { user },
    error: userError,
  } = await client.auth.getUser();

  if (userError || !user) return null;

  // Sequencial, não `Promise.all`: duas leituras concorrentes disparadas no
  // instante seguinte ao login (sessão recém-escrita) já se mostraram
  // suscetíveis a um PGRST303 ("JWT claims validation or parsing failed") em
  // uma das duas, com a outra passando normalmente no mesmo instante e com o
  // mesmo token — sintoma de corrida, não de token inválido. O custo de
  // serializar é mínimo (duas leituras de uma linha só) e remove a
  // concorrência como variável.
  //
  // O `.eq` abaixo não substitui a RLS (a política já limita à própria
  // linha) — serve para o `maybeSingle` continuar válido caso esta mesma
  // função algum dia rode sob um perfil que enxerga várias contas.
  const accountResult = await client
    .from('accounts')
    .select('id, full_name, email, phone, is_active')
    .eq('id', user.id)
    .maybeSingle();

  if (accountResult.error) {
    throw new Error(describeIdentityError(accountResult.error, 'sua conta'));
  }

  if (!accountResult.data) {
    // A conta nasce por trigger junto do usuário no Auth; não existir aqui
    // é inconsistência de dados, não falta de permissão (a política de
    // leitura da própria linha não olha `is_active`).
    throw new Error('Sua conta não foi encontrada. Fale com a recepção do Centro.');
  }

  const patientResult = await client.from('patients').select('id').limit(1).maybeSingle();

  if (patientResult.error) {
    throw new Error(describeIdentityError(patientResult.error, 'seu cadastro'));
  }

  return {
    accountId: accountResult.data.id,
    patientId: patientResult.data?.id ?? null,
    fullName: accountResult.data.full_name,
    email: accountResult.data.email,
    phone: accountResult.data.phone,
    isAccountActive: accountResult.data.is_active,
  };
}

/**
 * Autentica por e-mail + senha e devolve a identidade resultante.
 * @throws {Error} Credenciais inválidas, conta desativada ou falha de rede.
 */
export async function signIn({ email, password }: SignInCredentials): Promise<SessionIdentity> {
  const client = requireSupabase();

  const { error } = await client.auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password,
  });

  if (error) throw new Error(describeAuthError(error));

  const identity = await getSessionIdentity();

  if (!identity) {
    throw new Error('Não foi possível carregar seus dados. Tente entrar novamente.');
  }

  // Conta desativada é a revogação de acesso do projeto (`set_account_active`):
  // a RLS passa a negar tudo. Manter a sessão só produziria telas vazias sem
  // explicação, então encerra aqui e diz o que aconteceu.
  if (!identity.isAccountActive) {
    await client.auth.signOut();
    throw new Error('Seu acesso está desativado. Fale com a recepção do Centro para reativá-lo.');
  }

  return identity;
}

/**
 * Encerra a sessão. Erro do servidor é ignorado de propósito: o `signOut` do
 * auth-js limpa a sessão local de qualquer forma, e falhar aqui deixaria o
 * usuário preso numa sessão que ele pediu para encerrar.
 */
export async function signOut(): Promise<void> {
  const client = requireSupabase();
  await client.auth.signOut();
}

/**
 * Diz se há uma sessão guardada no cofre, sem contatar o servidor.
 *
 * É o que torna a biometria honesta: confirmar a digital não cria sessão
 * nenhuma — ela apenas destrava o acesso a uma sessão que já existe. Sem
 * sessão guardada, não há o que destravar, e o atalho não deve ser oferecido.
 *
 * Devolve `false` (em vez de falhar) quando o cliente não está configurado:
 * para quem chama, "não dá para entrar por aqui" é a resposta correta nos
 * dois casos.
 */
export async function hasStoredSession(): Promise<boolean> {
  if (!supabase) return false;

  const { data } = await supabase.auth.getSession();
  return Boolean(data.session);
}

/**
 * Envia o link de redefinição de senha.
 *
 * Nunca revela se o cadastro existe — o GoTrue responde sucesso mesmo para
 * endereço desconhecido, e nada aqui contradiz isso.
 *
 * @throws {Error} Se o identificador não for um e-mail, ou em falha de envio.
 */
export async function requestPasswordReset({
  identifier,
}: PasswordResetRequestInput): Promise<ApiSuccessResult> {
  const client = requireSupabase();
  const trimmed = identifier.trim();

  // A tela aceita e-mail ou celular (é o que o protótipo mostra), mas
  // recuperação por SMS não existe neste projeto — só TOTP está habilitado.
  // Avisar depende apenas do formato digitado, então não vaza existência de
  // cadastro; o contrário seria prometer um SMS que nunca chega.
  if (!looksLikeEmail(trimmed)) {
    throw new Error(
      'Hoje o link de redefinição é enviado apenas por e-mail. Informe o e-mail do seu cadastro.'
    );
  }

  const { error } = await client.auth.resetPasswordForEmail(trimmed.toLowerCase(), {
    redirectTo: `${window.location.origin}${PASSWORD_RESET_REDIRECT_PATH}`,
  });

  if (error) throw new Error(describeAuthError(error));

  return { success: true };
}

/**
 * Grava a nova senha. Exige a sessão de recuperação que o link do e-mail
 * estabelece (evento `PASSWORD_RECOVERY`) — ou uma sessão normal, no caso de
 * quem troca a senha já logado.
 */
export async function resetPassword({ password }: ResetPasswordInput): Promise<ApiSuccessResult> {
  const client = requireSupabase();

  const { error } = await client.auth.updateUser({ password });

  if (error) throw new Error(describeAuthError(error));

  return { success: true };
}

interface PatientDiagnosisRow {
  staging: string | null;
  cid10: { code: string; label: string } | null;
}

interface TreatmentPlanRow {
  protocol_name: string;
}

interface ClinicalHistoryRow {
  kind: 'allergy' | 'prior_reaction';
  description: string;
}

/**
 * Retorna o paciente autenticado por completo: cadastro (`patients`),
 * contato (`accounts`), diagnóstico principal (`patient_diagnoses`), plano de
 * tratamento vigente (`treatment_plans`) e histórico clínico (alergias e
 * reações prévias, em `patient_clinical_history`).
 *
 * As quatro consultas são independentes entre si (nenhuma depende do
 * resultado de outra) e disparadas bem depois do login se estabilizar —
 * diferente da leitura de identidade em `getSessionIdentity`, que roda no
 * instante seguinte ao login e por isso foi serializada ali. Aqui o paralelo
 * é seguro.
 *
 * Diagnóstico, plano e alergias vêm `null`/vazios quando ainda não foram
 * lançados — não é erro, é o estado normal de um cadastro recém-ativado.
 */
export async function getPatient(patientId: string): Promise<Patient> {
  const client = requireSupabase();

  const [patientResult, diagnosisResult, planResult, historyResult] = await Promise.all([
    client
      .from('patients')
      .select('full_name, cpf, birth_date, accounts(email, phone)')
      .eq('id', patientId)
      .single(),
    // Diagnóstico principal: o mais recente marcado `is_primary`, e na falta
    // de um marcado, o mais recente lançado.
    client
      .from('patient_diagnoses')
      .select('staging, cid10(code, label)')
      .eq('patient_id', patientId)
      .order('is_primary', { ascending: false })
      .order('diagnosed_on', { ascending: false })
      .limit(1)
      .maybeSingle(),
    // Plano vigente = a linha sem data de encerramento (README §5.3).
    client
      .from('treatment_plans')
      .select('protocol_name')
      .eq('patient_id', patientId)
      .is('ended_on', null)
      .order('started_on', { ascending: false })
      .limit(1)
      .maybeSingle(),
    client
      .from('patient_clinical_history')
      .select('kind, description')
      .eq('patient_id', patientId),
  ]);

  if (patientResult.error) {
    throw new Error('Não foi possível carregar seu cadastro.');
  }

  if (diagnosisResult.error || planResult.error || historyResult.error) {
    throw new Error('Não foi possível carregar seu quadro clínico.');
  }

  const registro = patientResult.data as unknown as {
    full_name: string;
    cpf: string;
    birth_date: string;
    accounts: { email: string; phone: string | null } | null;
  };

  const diagnosisRow = diagnosisResult.data as unknown as PatientDiagnosisRow | null;
  const planRow = planResult.data as unknown as TreatmentPlanRow | null;
  const historyRows = (historyResult.data ?? []) as unknown as ClinicalHistoryRow[];

  return {
    id: patientId,
    nome: registro.full_name,
    cpf: registro.cpf,
    dataNascimento: registro.birth_date,
    celular: registro.accounts?.phone ?? null,
    email: registro.accounts?.email ?? '',
    // Vestígio do mock — nenhum fluxo real lê a senha do paciente por aqui.
    senha: '',
    diagnostico: diagnosisRow?.cid10
      ? { cid: diagnosisRow.cid10.code, descricao: diagnosisRow.cid10.label }
      : null,
    protocolo: planRow?.protocol_name ?? null,
    estadiamento: diagnosisRow?.staging ?? null,
    alergias: historyRows.filter((row) => row.kind === 'allergy').map((row) => row.description),
    reacoesPrevias: historyRows
      .filter((row) => row.kind === 'prior_reaction')
      .map((row) => row.description),
    // Sem tabela própria ainda (ver o tipo `PatientPreferences`). `temaEscuro`
    // reflete o que já está de fato aplicado; o resto é um padrão razoável.
    preferencias: {
      biometria: false,
      lembretes24h: true,
      lembretes2h: true,
      novidadesBiblioteca: true,
      temaEscuro: localStorage.getItem('supera_tema') === 'dark',
    },
  };
}

/**
 * Dias consecutivos com registro, terminando hoje. Zero quando não há
 * registro de hoje — a sequência quebra no dia em que ela é olhada, não no
 * dia seguinte.
 */
function calculateStreak(dates: string[], today: string): number {
  const dias = new Set(dates);
  let streak = 0;
  let cursor = today;

  while (dias.has(cursor)) {
    streak += 1;
    cursor = shiftDateOnly(cursor, -1);
  }

  return streak;
}

/**
 * Registro de hoje (se houver) e a sequência de dias consecutivos, para o
 * card do Diário na Home.
 *
 * O banco permite mais de um registro por dia de propósito, então "o de
 * hoje" é o último finalizado.
 */
export async function getTodayEntry(): Promise<TodayEntrySummary> {
  const client = requireSupabase();
  const today = todayInClinicTimeZone();

  const [entryResult, historyResult] = await Promise.all([
    client
      .from('diary_entries')
      .select(DIARY_ENTRY_SELECT)
      .eq('status', 'saved')
      .eq('entry_date', today)
      .order('submitted_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    client
      .from('diary_entries')
      .select('entry_date')
      .eq('status', 'saved')
      .gte('entry_date', shiftDateOnly(today, -STREAK_LOOKBACK_DAYS)),
  ]);

  if (entryResult.error || historyResult.error) {
    throw new Error('Não foi possível carregar seu registro de hoje.');
  }

  const dates = (historyResult.data as { entry_date: string }[]).map((row) => row.entry_date);

  return {
    entry: entryResult.data
      ? enrichDiaryEntry(entryResult.data as unknown as DiaryEntryRow)
      : null,
    streakDays: calculateStreak(dates, today),
  };
}

/**
 * Retorna as notificações mais recentes, com rótulo de horário relativo.
 * `limit` (opcional) limita a quantidade retornada.
 */
export async function getNotificacoes({ limit }: NotificationsQueryOptions = {}): Promise<
  NotificationWithLabel[]
> {
  await wait();

  const ordenadas = [...notifications].sort((a, b) => a.minutosAtras - b.minutosAtras);
  const lista = typeof limit === 'number' ? ordenadas.slice(0, limit) : ordenadas;

  return lista.map((notification) => ({
    ...notification,
    horaLabel: formatRelativeTime(notification.minutosAtras),
  }));
}

/**
 * Retorna a equipe de cuidado (multidisciplinar) do paciente.
 */
export async function getResumoEquipe(): Promise<TeamSummary> {
  await wait();
  return { equipe: equipeCuidado, total: equipeCuidado.length };
}

/**
 * Retorna a soma de mensagens não lidas em todas as conversas do Chat.
 */
export async function getConversasNaoLidas(): Promise<UnreadConversationsSummary> {
  await wait();
  const total = conversations.reduce((acc, conversation) => acc + conversation.naoLidas, 0);
  return { total };
}

/**
 * Colunas de um registro com seus sintomas e o catálogo de cada um.
 *
 * `sort_order` vem junto para a lista de sintomas do registro sair na mesma
 * ordem do catálogo — sem ele a ordem seria a de inserção, que varia conforme
 * o paciente mexeu nos controles.
 */
const DIARY_ENTRY_SELECT =
  'id, entry_date, free_text, status, acting_as, submitted_at, ' +
  'diary_symptom_reports(grade, symptom_id, symptoms(id, code, label, sort_order))';

/** Teto de linhas por consulta, no mesmo patamar que o servidor usa. */
const DIARY_PAGE_SIZE = 200;

/**
 * Janela para o cálculo da sequência de dias. Passar disso não muda o
 * resultado de uma sequência plausível e evita puxar o histórico inteiro só
 * para contar dias seguidos.
 */
const STREAK_LOOKBACK_DAYS = 120;

interface SymptomRow {
  id: string;
  code: string;
  label: string;
  sort_order: number;
  is_psychological: boolean;
}

interface DiarySymptomReportRow {
  grade: number;
  symptom_id: string;
  symptoms: { id: string; code: string; label: string; sort_order: number } | null;
}

interface DiaryEntryRow {
  id: string;
  entry_date: string;
  free_text: string | null;
  status: DiaryEntryStatus;
  acting_as: DiaryActorKind;
  submitted_at: string | null;
  diary_symptom_reports: DiarySymptomReportRow[];
}

/**
 * Estreita um número para o domínio 0–5.
 *
 * O `CHECK (grade BETWEEN 0 AND 5)` já garante isso no banco; aqui é só a
 * ponte para o tipo literal, sem `as` cego sobre um valor não verificado.
 */
function toIntensity(grade: number): SymptomIntensity {
  const value = Math.min(Math.max(Math.round(grade), 0), 5);
  return value as SymptomIntensity;
}

function toSymptomReport(row: DiarySymptomReportRow): SymptomReport {
  const code = row.symptoms?.code ?? '';
  const rawLabel = row.symptoms?.label ?? '';
  const presentation = getSymptomPresentation(code, rawLabel);

  return {
    symptomId: row.symptom_id,
    code,
    label: presentation.label,
    description: presentation.description,
    grade: toIntensity(row.grade),
  };
}

function enrichDiaryEntry(row: DiaryEntryRow): EnrichedDiaryEntry {
  const symptoms = [...(row.diary_symptom_reports ?? [])]
    .sort((a, b) => (a.symptoms?.sort_order ?? 0) - (b.symptoms?.sort_order ?? 0))
    .map(toSymptomReport);

  // A hora vem de `submitted_at` (quando o registro foi finalizado), não de
  // `entry_date`, que é só a data. Rascunho não tem hora de envio.
  const time = row.submitted_at
    ? new Date(row.submitted_at).toLocaleTimeString('pt-BR', {
        hour: '2-digit',
        minute: '2-digit',
      })
    : '';

  return {
    id: row.id,
    entryDate: row.entry_date,
    freeText: row.free_text ?? '',
    status: row.status,
    actingAs: row.acting_as,
    submittedAt: row.submitted_at,
    symptoms,
    date: parseDateOnly(row.entry_date),
    dateLabel: formatDiaryDateLabel(daysFromToday(row.entry_date), time),
    time,
    hasAlert: hasAttentionSignal(symptoms),
    severity: getEntrySeverity(symptoms),
  };
}

/**
 * Traduz a falha do PostgREST numa frase acionável.
 *
 * Vale lembrar que negativa de leitura por RLS **não** chega aqui: ela volta
 * como lista vazia, sem erro. O que chega são violações de escrita e falhas
 * de rede.
 */
function describeDiaryError(error: { code?: string; message?: string }, fallback: string): string {
  if (error.code === '42501') {
    return 'Você não tem permissão para essa ação.';
  }

  if (error.code === '23505') {
    return 'Esse sintoma já foi registrado neste registro.';
  }

  if (error.message?.includes('row-level security')) {
    return 'Não foi possível salvar: sua sessão não confere com o cadastro. Entre novamente.';
  }

  return fallback;
}

/**
 * Retorna os sintomas marcáveis no Diário, na ordem do catálogo.
 *
 * Filtra por `is_active` porque o vocabulário se aposenta em vez de ser
 * apagado — o sintoma desativado some do seletor, mas continua legível no
 * histórico de quem já o registrou.
 */
export async function getSymptoms(): Promise<AvailableSymptom[]> {
  const client = requireSupabase();

  const { data, error } = await client
    .from('symptoms')
    .select('id, code, label, sort_order, is_psychological')
    .eq('is_active', true)
    .order('sort_order');

  if (error) {
    throw new Error('Não foi possível carregar a lista de sintomas.');
  }

  return (data as SymptomRow[]).map((row) => {
    const presentation = getSymptomPresentation(row.code, row.label);

    return {
      id: row.id,
      code: row.code,
      label: presentation.label,
      rawLabel: row.label,
      description: presentation.description,
      sortOrder: row.sort_order,
      isPsychological: row.is_psychological,
    };
  });
}

/**
 * Ids dos registros que marcaram um sintoma.
 *
 * Por que uma consulta separada em vez de `!inner` com filtro no embed: o
 * filtro embutido restringe também os sintomas devolvidos, e o card ficaria
 * mostrando só o sintoma filtrado em vez do registro inteiro. A RLS de
 * `diary_symptom_reports` deriva do registro pai, então este ida-e-volta
 * continua enxergando apenas o que é do próprio paciente.
 */
async function findEntryIdsBySymptom(symptomId: string): Promise<string[]> {
  const client = requireSupabase();

  const { data, error } = await client
    .from('diary_symptom_reports')
    .select('diary_entry_id')
    .eq('symptom_id', symptomId);

  if (error) {
    throw new Error('Não foi possível filtrar por sintoma.');
  }

  return (data as { diary_entry_id: string }[]).map((row) => row.diary_entry_id);
}

/**
 * Histórico do Diário, do mais recente ao mais antigo.
 *
 * Só registros finalizados: rascunho é trabalho em andamento, não entra na
 * linha do tempo (é o mesmo recorte que a equipe enxerga).
 */
export async function getDiaryEntries({
  periodDays,
  symptomId,
}: DiaryFilters = {}): Promise<EnrichedDiaryEntry[]> {
  const client = requireSupabase();

  let query = client
    .from('diary_entries')
    .select(DIARY_ENTRY_SELECT)
    .eq('status', 'saved')
    .order('entry_date', { ascending: false })
    .order('submitted_at', { ascending: false })
    .limit(DIARY_PAGE_SIZE);

  if (typeof periodDays === 'number') {
    query = query.gte('entry_date', shiftDateOnly(todayInClinicTimeZone(), -periodDays));
  }

  if (symptomId) {
    const entryIds = await findEntryIdsBySymptom(symptomId);
    if (entryIds.length === 0) return [];
    query = query.in('id', entryIds);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error('Não foi possível carregar seus registros.');
  }

  return (data as unknown as DiaryEntryRow[]).map(enrichDiaryEntry);
}

/**
 * Um registro específico.
 * @throws {Error} Se o registro não existir ou não for visível.
 */
export async function getDiaryEntry(id: string): Promise<EnrichedDiaryEntry> {
  const client = requireSupabase();

  const { data, error } = await client
    .from('diary_entries')
    .select(DIARY_ENTRY_SELECT)
    .eq('id', id)
    .maybeSingle();

  if (error) {
    throw new Error('Não foi possível carregar o registro.');
  }

  if (!data) {
    // Registro de outro paciente e registro inexistente são a mesma resposta
    // por desenho: a RLS devolve vazio nos dois casos, e é assim que o
    // isolamento se mantém — o app não confirma nem nega a existência.
    throw new Error('Registro não encontrado.');
  }

  return enrichDiaryEntry(data as unknown as DiaryEntryRow);
}

/**
 * Grava um registro do Diário.
 *
 * São três passos porque o banco os exige nesta ordem: abre o rascunho,
 * marca os sintomas, finaliza. Só a transição para `saved` torna o registro
 * visível à equipe — o que garante que ninguém leia um registro pela metade.
 *
 * Cada gravação cria um registro NOVO, inclusive no mesmo dia. Não há
 * "editar o de hoje": registro finalizado é imutável, e o banco deixa de
 * propósito de limitar a um por dia, para que uma piora no fim do dia possa
 * ser registrada.
 *
 * ⚠️ Se a gravação falhar depois do passo 1, o rascunho fica órfão: `DELETE`
 * em `diary_entries` está revogado até para `service_role`. Ele é inofensivo
 * (não aparece na linha do tempo nem para a equipe), mas não há como limpá-lo
 * pelo app.
 */
export async function saveDiaryEntry({
  patientId,
  freeText,
  symptoms,
}: SaveDiaryEntryInput): Promise<SaveDiaryEntryResult> {
  const client = requireSupabase();

  const {
    data: { session },
  } = await client.auth.getSession();

  if (!session) {
    throw new Error('Sua sessão expirou. Entre novamente para salvar o registro.');
  }

  // O CHECK da coluna recusa string vazia — texto em branco é ausência de
  // texto, e vai como NULL.
  const texto = freeText?.trim();

  // 1. Rascunho. `acting_as` é sempre 'patient' porque este é o app do
  //    paciente; vira 'caregiver' quando o cuidador tiver login próprio.
  const { data: entry, error: entryError } = await client
    .from('diary_entries')
    .insert({
      patient_id: patientId,
      authored_by: session.user.id,
      acting_as: 'patient',
      free_text: texto ? texto : null,
    })
    .select('id')
    .single();

  if (entryError || !entry) {
    throw new Error(
      describeDiaryError(entryError ?? {}, 'Não foi possível iniciar o registro.')
    );
  }

  const entryId = (entry as { id: string }).id;

  // 2. Sintomas marcados. Grau zero não vira linha: "não senti" é ausência
  //    de sintoma, não um dado a registrar.
  const marcados = symptoms.filter((symptom) => symptom.grade > 0);

  if (marcados.length > 0) {
    const { error: reportsError } = await client.from('diary_symptom_reports').insert(
      marcados.map((symptom) => ({
        diary_entry_id: entryId,
        symptom_id: symptom.symptomId,
        grade: symptom.grade,
      }))
    );

    if (reportsError) {
      throw new Error(
        describeDiaryError(reportsError, 'Não foi possível salvar os sintomas do registro.')
      );
    }
  }

  // 3. Finaliza. Estado e horário andam juntos — mandar um sem o outro viola
  //    o CHECK da tabela.
  const { error: submitError } = await client
    .from('diary_entries')
    .update({ status: 'saved', submitted_at: new Date().toISOString() })
    .eq('id', entryId);

  if (submitError) {
    throw new Error(describeDiaryError(submitError, 'Não foi possível finalizar o registro.'));
  }

  return {
    success: true,
    id: entryId,
    hasAlert: marcados.some((symptom) => symptom.grade >= ALERT_THRESHOLD),
  };
}

/**
 * Série temporal da intensidade de um sintoma, do mais antigo ao mais
 * recente — é a "seleção de métrica" do gráfico do Diário.
 *
 * Aqui o `!inner` com filtro no embed é o que se quer: interessam só os
 * registros que marcaram este sintoma, e só a nota dele.
 */
export async function getSymptomEvolution({
  symptomId,
  limit = 7,
}: SymptomEvolutionQueryOptions): Promise<SymptomEvolutionPoint[]> {
  const client = requireSupabase();

  const { data, error } = await client
    .from('diary_entries')
    .select('entry_date, diary_symptom_reports!inner(grade, symptom_id)')
    .eq('status', 'saved')
    .eq('diary_symptom_reports.symptom_id', symptomId)
    .order('entry_date', { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error('Não foi possível carregar a evolução do sintoma.');
  }

  const rows = data as unknown as {
    entry_date: string;
    diary_symptom_reports: { grade: number }[];
  }[];

  // A consulta traz do mais recente para o mais antigo (é assim que o limite
  // pega os últimos N); o gráfico lê da esquerda para a direita no tempo.
  return [...rows].reverse().map((row) => ({
    dateLabel: parseDateOnly(row.entry_date).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
    }),
    value: toIntensity(row.diary_symptom_reports[0]?.grade ?? 0),
  }));
}

/**
 * Colunas de um compromisso com os catálogos resolvidos.
 *
 * `origin_specialty` é a área para onde o compromisso foi roteado. O embed de
 * `professionals` existe só como segunda fonte para o mesmo rótulo: a RPC de
 * agendamento deixa `origin_specialty_id` em NULL por padrão, então sem esse
 * caminho a maioria dos compromissos não exibiria área nenhuma.
 *
 * Não se pede nome de profissional aqui porque não existe: `professionals`
 * não tem coluna de nome, e `accounts.full_name` é legível só pelo próprio
 * dono. A tela mostra a área que atende, não a pessoa.
 */
const APPOINTMENT_SELECT =
  'id, title, starts_at, ends_at, location_label, location_address, location_phone, ' +
  'patient_notes, confirmed_at, ' +
  'appointment_types(code, label, color), ' +
  'appointment_statuses(code, label, is_terminal), ' +
  'origin_specialty:specialties(code, label), ' +
  'professionals(professional_specialties(specialties(code, label)))';

/** Teto por consulta, no mesmo patamar que o servidor usa nas funções read_*. */
const APPOINTMENT_PAGE_SIZE = 200;

interface SpecialtyRow {
  code: string;
  label: string;
}

interface AppointmentRow {
  id: string;
  title: string;
  starts_at: string;
  ends_at: string;
  location_label: string;
  location_address: string | null;
  location_phone: string | null;
  patient_notes: string | null;
  confirmed_at: string | null;
  appointment_types: { code: string; label: string; color: string | null } | null;
  appointment_statuses: { code: string; label: string; is_terminal: boolean } | null;
  origin_specialty: SpecialtyRow | null;
  professionals: {
    professional_specialties: { specialties: SpecialtyRow | null }[] | null;
  } | null;
}

/**
 * Área que atende: a do compromisso quando roteado, senão a do profissional
 * designado. `null` quando nenhuma das duas existe — caso legítimo, e a tela
 * simplesmente omite a linha.
 */
function resolveSpecialty(row: AppointmentRow): AppointmentSpecialty | null {
  if (row.origin_specialty) return row.origin_specialty;

  const doProfissional = row.professionals?.professional_specialties?.find(
    (vinculo) => vinculo.specialties
  )?.specialties;

  return doProfissional ?? null;
}

function enrichAppointment(row: AppointmentRow): EnrichedAppointment {
  const date = new Date(row.starts_at);
  const endsAt = new Date(row.ends_at);
  const time = formatTimeOfDay(date);
  const dias = daysFromDate(date);

  const statusCode = (row.appointment_statuses?.code ?? 'scheduled') as AppointmentStatusCode;
  const specialty = resolveSpecialty(row);
  const typeCode = row.appointment_types?.code ?? '';
  const typeColor = row.appointment_types?.color ?? null;

  const visual = resolveAppointmentVisual(typeCode, specialty?.code ?? null, typeColor);

  // "Passado" é medido pelo FIM: uma infusão de quatro horas que começou há
  // uma hora ainda está acontecendo, e some da lista se o corte for o início.
  const isPast = endsAt.getTime() < Date.now();

  return {
    id: row.id,
    title: row.title,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    locationLabel: row.location_label,
    locationAddress: row.location_address,
    locationPhone: row.location_phone,
    patientNotes: row.patient_notes,
    typeCode,
    typeLabel: row.appointment_types?.label ?? '',
    typeColor,
    statusCode,
    statusLabel: row.appointment_statuses?.label ?? '',
    isTerminal: row.appointment_statuses?.is_terminal ?? false,
    confirmedAt: row.confirmed_at,
    specialty,
    date,
    time,
    durationMin: Math.max(0, Math.round((endsAt.getTime() - date.getTime()) / 60000)),
    dateLabel:
      dias >= 0 ? formatAgendaFutureLabel(dias, time) : formatDiaryDateLabel(dias, time),
    fullDateLabel: formatFullDateWithWeekday(date),
    icon: visual.icon,
    colorVar: visual.colorVar,
    isPast,
    // As mesmas condições que a RPC impõe do lado do banco: só antes do
    // início e só enquanto agendado. Repetir aqui não substitui a checagem
    // do servidor — serve para não oferecer um botão que vai falhar.
    canConfirm: statusCode === 'scheduled' && date.getTime() > Date.now(),
  };
}

/** Traduz a recusa da RPC de confirmação numa frase que o paciente entenda. */
function describeAppointmentError(
  error: { code?: string; message?: string },
  fallback: string
): string {
  const mensagem = error.message ?? '';

  if (mensagem.includes('ja comecou') || mensagem.includes('não está agendado')) {
    return 'Este compromisso já começou ou não está mais agendado.';
  }

  if (error.code === '42501' || mensagem.includes('apenas o titular')) {
    return 'Só você ou quem acompanha você pode confirmar presença.';
  }

  return fallback;
}

/**
 * Converte o resultado bruto do PostgREST na forma que as telas consomem.
 *
 * Recusa por RLS não passa por aqui: ela volta como lista vazia, sem erro. O
 * que chega é falha de rede ou consulta malformada.
 */
function mapAppointments(data: unknown, error: unknown): EnrichedAppointment[] {
  if (error) {
    throw new Error('Não foi possível carregar sua agenda.');
  }

  return (data as AppointmentRow[]).map(enrichAppointment);
}

/**
 * Compromissos que ainda não terminaram, do mais próximo ao mais distante.
 */
export async function getUpcomingAppointments(): Promise<EnrichedAppointment[]> {
  const agora = new Date().toISOString();

  const { data, error } = await requireSupabase()
    .from('appointments')
    .select(APPOINTMENT_SELECT)
    .gte('ends_at', agora)
    .order('starts_at', { ascending: true })
    .limit(APPOINTMENT_PAGE_SIZE);

  return mapAppointments(data, error);
}

/** Compromissos já encerrados, do mais recente ao mais antigo. */
export async function getPastAppointments(): Promise<EnrichedAppointment[]> {
  const agora = new Date().toISOString();

  const { data, error } = await requireSupabase()
    .from('appointments')
    .select(APPOINTMENT_SELECT)
    .lt('ends_at', agora)
    .order('starts_at', { ascending: false })
    .limit(APPOINTMENT_PAGE_SIZE);

  return mapAppointments(data, error);
}

/**
 * Um compromisso específico.
 * @throws {Error} Se não existir ou não for visível para esta sessão.
 */
export async function getAppointment(id: string): Promise<EnrichedAppointment> {
  const client = requireSupabase();

  const { data, error } = await client
    .from('appointments')
    .select(APPOINTMENT_SELECT)
    .eq('id', id)
    .maybeSingle();

  if (error) {
    throw new Error('Não foi possível carregar o compromisso.');
  }

  if (!data) {
    // Compromisso de outro paciente e compromisso inexistente devolvem a
    // mesma coisa por desenho: a RLS não confirma nem nega a existência.
    throw new Error('Compromisso não encontrado.');
  }

  return enrichAppointment(data as unknown as AppointmentRow);
}

/** Compromissos que se sobrepõem a um intervalo, do mais cedo ao mais tarde. */
async function getAppointmentsInRange(from: Date, to: Date): Promise<EnrichedAppointment[]> {
  const { data, error } = await requireSupabase()
    .from('appointments')
    .select(APPOINTMENT_SELECT)
    .gte('starts_at', from.toISOString())
    .lte('starts_at', to.toISOString())
    .order('starts_at', { ascending: true })
    .limit(APPOINTMENT_PAGE_SIZE);

  return mapAppointments(data, error);
}

/**
 * Os 7 dias da semana de `referencia`, cada um com seus compromissos.
 *
 * Uma única consulta cobrindo a semana inteira, distribuída no cliente: sete
 * consultas separadas custariam sete idas ao servidor para montar uma tela só.
 */
export async function getAgendaWeek(referencia: Date): Promise<AgendaDay[]> {
  const dias = getWeekDays(referencia);
  const eventos = await getAppointmentsInRange(
    startOfDayOf(dias[0]),
    endOfDayOf(dias[dias.length - 1])
  );

  return dias.map((dia) => ({
    date: dia,
    events: eventos.filter((evento) => isSameDay(evento.date, dia)),
  }));
}

/**
 * A grade do mês de `referencia`. `null` nas células de preenchimento antes
 * do dia 1, como a visão mensal espera.
 */
export async function getAgendaMonth(referencia: Date): Promise<(AgendaDay | null)[]> {
  const celulas = getMonthGridDays(referencia);
  const dias = celulas.filter((celula): celula is Date => celula !== null);

  if (dias.length === 0) return celulas.map(() => null);

  const eventos = await getAppointmentsInRange(
    startOfDayOf(dias[0]),
    endOfDayOf(dias[dias.length - 1])
  );

  return celulas.map((dia) =>
    dia ? { date: dia, events: eventos.filter((evento) => isSameDay(evento.date, dia)) } : null
  );
}

/** O próximo compromisso, para o card da Home. `null` quando não há nenhum. */
export async function getNextAppointment(): Promise<NextAppointmentSummary | null> {
  const agora = new Date().toISOString();

  const { data, error } = await requireSupabase()
    .from('appointments')
    .select(APPOINTMENT_SELECT)
    .gte('ends_at', agora)
    .order('starts_at', { ascending: true })
    .limit(1);

  const proximos = mapAppointments(data, error);

  const proximo = proximos[0];
  if (!proximo) return null;

  return {
    id: proximo.id,
    title: proximo.title,
    date: proximo.date,
    dayLabel: formatDayLabel(proximo.date),
    time: proximo.time,
    locationLabel: proximo.locationLabel,
    specialtyLabel: proximo.specialty?.label ?? null,
    icon: proximo.icon,
    colorVar: proximo.colorVar,
    tip: proximo.patientNotes,
  };
}

/** Catálogo de tipos de compromisso — alimenta a legenda da visão mensal. */
export async function getAppointmentTypes(): Promise<AppointmentTypeInfo[]> {
  const client = requireSupabase();

  const { data, error } = await client
    .from('appointment_types')
    .select('id, code, label, color, sort_order')
    .eq('is_active', true)
    .order('sort_order');

  if (error) {
    throw new Error('Não foi possível carregar os tipos de compromisso.');
  }

  return (
    data as { id: string; code: string; label: string; color: string | null; sort_order: number }[]
  ).map((row) => ({
    id: row.id,
    code: row.code,
    label: row.label,
    color: row.color,
    sortOrder: row.sort_order,
  }));
}

/**
 * Confirma presença. Só o titular ou quem o acompanha, e só antes do início.
 */
export async function confirmAppointment(id: string): Promise<void> {
  const client = requireSupabase();
  const { error } = await client.rpc('confirm_appointment', { p_appointment_id: id });

  if (error) {
    throw new Error(describeAppointmentError(error, 'Não foi possível confirmar sua presença.'));
  }
}

/**
 * Desfaz a confirmação.
 *
 * A RPC não reclama quando já passou do horário — ela simplesmente não altera
 * nada. Por isso quem chama precisa reler o compromisso em vez de presumir
 * que o estado mudou; é o que o hook faz, invalidando as consultas.
 */
export async function unconfirmAppointment(id: string): Promise<void> {
  const client = requireSupabase();
  const { error } = await client.rpc('unconfirm_appointment', { p_appointment_id: id });

  if (error) {
    throw new Error(describeAppointmentError(error, 'Não foi possível desfazer a confirmação.'));
  }
}

function enrichOrientation(orientation: Orientation): OrientationDetail {
  const tipoInfo = getTipoConteudoInfo(orientation.tipo) as ContentTypeInfo;
  const [ano, mes, dia] = orientation.publicadoEm.split('-').map(Number);
  const dataPublicacao = new Date(ano, mes - 1, dia);

  return {
    ...orientation,
    tipoLabel: tipoInfo.label,
    icon: tipoInfo.icon,
    colorVar: tipoInfo.colorVar,
    duracaoLabel: orientation.tipo === 'video' ? `${orientation.tempoLeituraMin}:00` : null,
    publicadoLabel: `Publicado em ${dataPublicacao.toLocaleDateString('pt-BR', {
      day: 'numeric',
      month: 'long',
    })}`,
  };
}

function orientacoesDoDiagnostico(): Orientation[] {
  const cid = patient.diagnostico?.cid;
  if (!cid) return orientations;
  return orientations.filter((orientation) => orientation.cids.includes(cid));
}

/**
 * Retorna as orientações já restritas ao CID do paciente autenticado,
 * opcionalmente filtradas.
 */
export async function getOrientacoes({
  categoria,
  tipo,
  favoritas,
  naoLidas,
}: OrientationFilters = {}): Promise<OrientationDetail[]> {
  await wait();

  let lista = orientacoesDoDiagnostico();

  if (categoria) lista = lista.filter((orientation) => orientation.categoria === categoria);
  if (tipo) lista = lista.filter((orientation) => orientation.tipo === tipo);
  if (favoritas) lista = lista.filter((orientation) => orientation.favorito);
  if (naoLidas) lista = lista.filter((orientation) => !orientation.lida);

  return lista.map(enrichOrientation);
}

/**
 * Retorna as categorias distintas presentes nas orientações do paciente
 * (para os filtros da tela de Orientações).
 */
export async function getCategoriasOrientacoes(): Promise<string[]> {
  await wait();

  const categorias: string[] = [];
  orientacoesDoDiagnostico().forEach((orientation) => {
    if (!categorias.includes(orientation.categoria)) categorias.push(orientation.categoria);
  });

  return categorias;
}

/**
 * Retorna uma orientação específica.
 * @throws {Error} Se a orientação não existir.
 */
export async function getOrientacaoPorId(id: string): Promise<OrientationDetail> {
  await wait();

  const orientation = orientations.find((item) => item.id === id);
  if (!orientation) {
    throw new Error('Orientação não encontrada.');
  }

  return enrichOrientation(orientation);
}

/**
 * Marca uma orientação como lida.
 */
export async function marcarOrientacaoComoLida(id: string): Promise<ApiSuccessResult> {
  await wait(150);

  const orientation = orientations.find((item) => item.id === id);
  if (orientation) orientation.lida = true;

  return { success: true };
}

/**
 * Alterna o estado de favorito de uma orientação. `favorito` no retorno já
 * reflete o novo estado.
 * @throws {Error} Se a orientação não existir.
 */
export async function alternarFavoritoOrientacao(id: string): Promise<ToggleFavoriteResult> {
  await wait(150);

  const orientation = orientations.find((item) => item.id === id);
  if (!orientation) {
    throw new Error('Orientação não encontrada.');
  }

  orientation.favorito = !orientation.favorito;
  return { success: true, favorito: orientation.favorito };
}

function ultimaMensagemDe(conversa: Conversation): Message {
  return conversa.mensagens[conversa.mensagens.length - 1];
}

function resumoMensagem(mensagem: Message): string {
  if (mensagem.tipo === 'imagem') return '📷 Imagem';
  return mensagem.texto;
}

function tituloConversa(conversa: Conversation): string {
  if (conversa.titulo) return conversa.titulo;
  const assuntoInfo = conversa.assunto ? (getAssuntoInfo(conversa.assunto) as ChatSubjectInfo | null) : null;
  return assuntoInfo ? assuntoInfo.label : 'Conversa com a equipe';
}

function enrichConversaResumo(conversa: Conversation): ConversationSummary {
  const ultima = ultimaMensagemDe(conversa);

  return {
    id: conversa.id,
    titulo: tituloConversa(conversa),
    profissional: conversa.profissional,
    assunto: conversa.assunto,
    assuntoInfo: conversa.assunto ? (getAssuntoInfo(conversa.assunto) as ChatSubjectInfo | null) : null,
    ultimaMensagem: resumoMensagem(ultima),
    horaLabel: formatRelativeTime(ultima.minutosAtras),
    minutosAtras: ultima.minutosAtras,
    naoLidas: conversa.naoLidas,
  };
}

function enrichMensagem(mensagem: Message): EnrichedMessage {
  const data = new Date(Date.now() - mensagem.minutosAtras * 60000);

  return {
    ...mensagem,
    data,
    horaLabel: data.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
  };
}

/**
 * Retorna a lista de conversas do Chat, resumidas (sem as mensagens) e
 * ordenadas pela mais recente atividade.
 */
export async function getConversas(): Promise<ConversationSummary[]> {
  await wait();

  return [...conversations]
    .sort((a, b) => ultimaMensagemDe(a).minutosAtras - ultimaMensagemDe(b).minutosAtras)
    .map(enrichConversaResumo);
}

/**
 * Retorna uma conversa completa, com todas as mensagens.
 * @throws {Error} Se a conversa não existir.
 */
export async function getConversaPorId(id: string): Promise<ConversationDetail> {
  await wait();

  const conversa = conversations.find((item) => item.id === id);
  if (!conversa) {
    throw new Error('Conversa não encontrada.');
  }

  return {
    id: conversa.id,
    titulo: tituloConversa(conversa),
    profissional: conversa.profissional,
    assunto: conversa.assunto,
    assuntoInfo: conversa.assunto ? (getAssuntoInfo(conversa.assunto) as ChatSubjectInfo | null) : null,
    naoLidas: conversa.naoLidas,
    mensagens: conversa.mensagens.map(enrichMensagem),
  };
}

/**
 * Zera o contador de mensagens não lidas de uma conversa.
 */
export async function marcarConversaComoLida(id: string): Promise<ApiSuccessResult> {
  await wait(150);

  const conversa = conversations.find((item) => item.id === id);
  if (conversa) conversa.naoLidas = 0;

  return { success: true };
}

let proximoIdMensagem = 1000;

/**
 * Envia uma mensagem de texto numa conversa existente.
 * @throws {Error} Se a conversa não existir.
 */
export async function enviarMensagem(conversaId: string, texto: string): Promise<SendMessageResult> {
  await wait(400);

  const conversa = conversations.find((item) => item.id === conversaId);
  if (!conversa) {
    throw new Error('Conversa não encontrada.');
  }

  const novaMensagem: Message = {
    id: `m-novo-${proximoIdMensagem++}`,
    autor: 'paciente',
    tipo: 'texto',
    texto,
    minutosAtras: 0,
    statusEnvio: 'enviada',
  };
  conversa.mensagens.push(novaMensagem);

  return { success: true, mensagem: enrichMensagem(novaMensagem) };
}

function mensagemAutomatica(assuntoInfo: ChatSubjectInfo | null): string {
  const sufixo = assuntoInfo ? ` sobre ${assuntoInfo.label.toLowerCase()}` : '';
  return `Recebemos sua mensagem${sufixo}! 🙌 A equipe responde em horário comercial (seg–sex, 08h–18h) — em cerca de 45 minutos.`;
}

let proximoIdConversa = 1000;

/**
 * Cria uma nova conversa (organizada por assunto — Medicação/Agendamento/
 * Sintomas/Outros) com a mensagem inicial do paciente e uma resposta
 * automática mockada. No backend real, isso deve direcionar a conversa ao
 * profissional correto pelo assunto (ver mapa_requisito.md, Chat/MÉDIO).
 */
export async function iniciarConversa({
  assunto,
  texto,
}: StartConversationInput): Promise<StartConversationResult> {
  await wait(500);

  const assuntoInfo = assunto ? (getAssuntoInfo(assunto) as ChatSubjectInfo | null) : null;

  const novaConversa: Conversation = {
    id: `c-novo-${proximoIdConversa++}`,
    titulo: null,
    profissional: null,
    assunto: assunto || null,
    naoLidas: 0,
    mensagens: [
      {
        id: `m-novo-${proximoIdMensagem++}`,
        autor: 'sistema',
        tipo: 'sistema',
        texto: assuntoInfo ? `Conversa iniciada sobre ${assuntoInfo.label}` : 'Conversa iniciada',
        minutosAtras: 0,
      },
      {
        id: `m-novo-${proximoIdMensagem++}`,
        autor: 'paciente',
        tipo: 'texto',
        texto,
        minutosAtras: 0,
        statusEnvio: 'enviada',
      },
      {
        id: `m-novo-${proximoIdMensagem++}`,
        autor: 'automatica',
        tipo: 'texto',
        texto: mensagemAutomatica(assuntoInfo),
        minutosAtras: 0,
      },
    ],
  };

  conversations.unshift(novaConversa);
  return { success: true, id: novaConversa.id };
}

function enrichNotificacaoCompleta(notification: Notification): NotificationDetail {
  return {
    ...notification,
    horaLabel: formatRelativeTime(notification.minutosAtras),
    tipoInfo: getTipoNotificacaoInfo(notification.tipo) as NotificationTypeInfo,
  };
}

/**
 * Retorna todas as notificações (lidas e não lidas), enriquecidas, para a
 * Central de Notificações.
 */
export async function getTodasNotificacoes(): Promise<NotificationDetail[]> {
  await wait();

  return [...notifications]
    .sort((a, b) => a.minutosAtras - b.minutosAtras)
    .map(enrichNotificacaoCompleta);
}

/**
 * Marca uma notificação como lida.
 */
export async function marcarNotificacaoComoLida(id: string): Promise<ApiSuccessResult> {
  await wait(150);

  const notification = notifications.find((item) => item.id === id);
  if (notification) notification.lida = true;

  return { success: true };
}

/**
 * Marca todas as notificações como lidas de uma vez.
 */
export async function marcarTodasNotificacoesComoLidas(): Promise<ApiSuccessResult> {
  await wait(300);

  notifications.forEach((notification) => {
    notification.lida = true;
  });

  return { success: true };
}

/**
 * Atualiza uma preferência do paciente (Perfil > Preferências).
 *
 * Ainda não persiste: `PatientPreferences` não tem tabela própria no banco
 * (ver o tipo). A UI já faz atualização otimista sobre o cache do
 * TanStack Query — o que muda de verdade é só `temaEscuro`, aplicado via
 * `localStorage` por quem chama esta função (`ProfileHub`). As demais voltam
 * ao padrão no próximo carregamento; é honesto com o que o backend oferece
 * hoje, não um bug.
 */
export async function atualizarPreferencia(
  _chave: PatientPreferenceKey,
  _valor: boolean
): Promise<ApiSuccessResult> {
  await wait(150);
  return { success: true };
}

/**
 * Solicita a exportação dos dados do paciente (LGPD).
 */
export async function solicitarExportacaoDados(): Promise<ApiSuccessResult> {
  const client = requireSupabase();

  // 'portability' — cópia dos dados num formato utilizável — é o direito que
  // corresponde ao botão ("receba uma cópia completa"), diferente de
  // 'access' (só consultar o que existe, sem levar cópia).
  const { error } = await client.rpc('request_data_subject_action', {
    p_request_type: 'portability',
  });

  if (error) {
    throw new Error('Não foi possível registrar sua solicitação. Tente novamente.');
  }

  return { success: true };
}

/**
 * Solicita a exclusão da conta do paciente (LGPD).
 *
 * Não apaga nada na hora: abre um pedido em `data_subject_requests` que a
 * controladora decide depois (`decide_data_subject_request`), com o mesmo
 * peso de qualquer ato irreversível sobre dado de saúde. `success: true`
 * aqui significa "pedido registrado", nunca "conta apagada".
 */
export async function solicitarExclusaoConta(): Promise<ApiSuccessResult> {
  const client = requireSupabase();

  const { error } = await client.rpc('request_data_subject_action', {
    p_request_type: 'deletion',
  });

  if (error) {
    throw new Error('Não foi possível registrar sua solicitação. Tente novamente.');
  }

  return { success: true };
}

function horaAtual(): string {
  return new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function enrichHistoricoCuidador(item: CaregiverHistoryItem): CaregiverHistoryItemDetail {
  const data = addDays(new Date(), item.diasAPartirDeHoje);
  return {
    ...item,
    dataLabel: `${data.toLocaleDateString('pt-BR')} · ${item.hora}`,
  };
}

/**
 * Retorna o vínculo de cuidador atual (se houver), o histórico de vínculos
 * e as listas fixas de permissões (o que o cuidador pode/não pode acessar).
 */
export async function getCuidador(): Promise<CaregiverInfo> {
  await wait();

  return {
    atual: caregiverState.atual,
    historico: [...caregiverState.historico]
      .sort((a, b) => b.diasAPartirDeHoje - a.diasAPartirDeHoje)
      .map(enrichHistoricoCuidador),
    permissoesPode: PERMISSOES_PODE,
    permissoesNaoPode: PERMISSOES_NAO_PODE,
  };
}

let proximoIdHistoricoCuidador = 100;

/**
 * Convida um cuidador (por SMS ou e-mail). Se já houver um vínculo ativo,
 * ele é revogado antes — só existe um vínculo por vez (ver mapa_requisito.md,
 * Cuidador: "Vínculo único").
 */
export async function convidarCuidador({
  nome,
  parentesco,
  meio,
  contato,
}: InviteCaregiverInput): Promise<ApiSuccessResult> {
  await wait(700);

  if (caregiverState.atual) {
    caregiverState.historico.unshift({
      id: `h-novo-${proximoIdHistoricoCuidador++}`,
      evento: 'revogado',
      nome: caregiverState.atual.nome,
      parentesco: caregiverState.atual.parentesco,
      diasAPartirDeHoje: 0,
      hora: horaAtual(),
    });
  }

  caregiverState.atual = { nome, parentesco, meio, contato };

  caregiverState.historico.unshift(
    {
      id: `h-novo-${proximoIdHistoricoCuidador++}`,
      evento: 'convite_aceito',
      nome,
      parentesco,
      diasAPartirDeHoje: 0,
      hora: horaAtual(),
    },
    {
      id: `h-novo-${proximoIdHistoricoCuidador++}`,
      evento: 'vinculo_ativo',
      nome,
      parentesco,
      diasAPartirDeHoje: 0,
      hora: horaAtual(),
    }
  );

  return { success: true };
}

/**
 * Revoga o vínculo de cuidador atual.
 */
export async function removerCuidador(): Promise<ApiSuccessResult> {
  await wait(500);

  if (caregiverState.atual) {
    caregiverState.historico.unshift({
      id: `h-novo-${proximoIdHistoricoCuidador++}`,
      evento: 'revogado',
      nome: caregiverState.atual.nome,
      parentesco: caregiverState.atual.parentesco,
      diasAPartirDeHoje: 0,
      hora: horaAtual(),
    });
  }

  caregiverState.atual = null;
  return { success: true };
}

let proximoIdNps = 1;

/**
 * Registra a resposta de NPS do paciente. `nota` de 0 a 10.
 */
export async function enviarRespostaNps({ nota, comentario }: NpsAnswerInput): Promise<ApiSuccessResult> {
  await wait(600);

  respostasNps.push({
    id: `nps-${proximoIdNps++}`,
    nota,
    comentario: comentario || '',
    respondidoEm: new Date().toISOString(),
  });

  return { success: true };
}
