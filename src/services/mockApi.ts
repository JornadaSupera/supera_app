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
import { equipeCuidado as equipeCuidadoRaw } from '../mocks/messages';
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
  ConversationSummary,
  MessageAuthor,
  EnrichedMessage,
  ConversationDetail,
  ChatSubjectOption,
  TeamSummary,
  UnreadConversationsSummary,
  SendMessageResult,
  StartConversationInput,
  StartConversationResult,
  Notification,
  NotificationWithLabel,
  NotificationDetail,
  NotificationTypeInfo,
  NotificationsQueryOptions,
  ContentType,
  OrientationCategory,
  OrientationDetail,
  OrientationFilters,
  OrientationStateInput,
  ToggleFavoriteResult,
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
const equipeCuidado = equipeCuidadoRaw as CareTeamMember[];
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

/**
 * Traduz a falha de uma escrita em `patient_content_states`.
 *
 * Favorito e lido são os únicos dados de paciente deste módulo, e a política
 * exige `patient_id = my_own_patient_id()` — daí a mensagem específica de
 * sessão que não confere.
 */
function describeOrientationError(
  error: { code?: string; message?: string },
  fallback: string
): string {
  if (error.code === '42501') {
    return 'Você não tem permissão para essa ação.';
  }

  if (error.message?.includes('row-level security')) {
    return 'Não foi possível salvar: sua sessão não confere com o cadastro. Entre novamente.';
  }

  return fallback;
}

/**
 * Colunas de uma orientação visível ao paciente.
 *
 * Os dois `!inner` não são otimização: `content_versions` só devolve a versão
 * PUBLICADA (a RLS recusa rascunho, revisão e arquivada), então o join
 * interno é o que garante que um item sem versão visível não chegue à tela
 * como card vazio. `patient_content_states` fica de fora do `!inner` de
 * propósito — quem nunca favoritou nem leu não tem linha, e um join interno
 * ali esconderia justamente as orientações novas.
 */
const ORIENTATION_SELECT =
  'id, ' +
  'content_categories!inner(code, label, sort_order), ' +
  'content_versions!inner(title, body, media_kind, video_url, estimated_reading_minutes, updated_at), ' +
  'patient_content_states(is_favorite, read_at)';

/** Linha de `content_items` com os embeds de `ORIENTATION_SELECT`. */
interface OrientationRow {
  id: string;
  content_categories: { code: string; label: string; sort_order: number };
  content_versions: {
    title: string;
    body: string;
    media_kind: string;
    video_url: string | null;
    estimated_reading_minutes: number | null;
    updated_at: string;
  }[];
  patient_content_states: { is_favorite: boolean; read_at: string | null }[];
}

/** `content_media_kind` (banco) → `ContentType` (UI). */
const MEDIA_KIND_TO_TYPE: Record<string, ContentType> = {
  text: 'texto',
  video: 'video',
  pdf: 'pdf',
};

/** `ContentType` (UI) → `content_media_kind` (banco), para o filtro. */
const TYPE_TO_MEDIA_KIND: Record<ContentType, string> = {
  texto: 'text',
  video: 'video',
  pdf: 'pdf',
};

/**
 * Quebra o corpo em parágrafos.
 *
 * `body` é uma coluna de texto única; a tela renderiza um `<p>` por
 * parágrafo. Divide em qualquer sequência de quebras de linha, o que cobre
 * tanto o texto separado por linha em branco quanto o separado por uma só.
 * O CHECK da coluna garante conteúdo não-vazio, então sempre sobra ao menos
 * um parágrafo.
 */
function splitParagraphs(body: string): string[] {
  return body
    .split(/\r?\n+/)
    .map((paragrafo) => paragrafo.trim())
    .filter((paragrafo) => paragrafo.length > 0);
}

function enrichOrientation(row: OrientationRow): OrientationDetail {
  // O índice parcial `uq_content_versions_published` garante no máximo uma
  // versão publicada por item, e a RLS não deixa o paciente ver as demais —
  // então este [0] é a versão publicada, não "a primeira de várias".
  const version = row.content_versions[0];
  const state = row.patient_content_states[0];

  const tipo = MEDIA_KIND_TO_TYPE[version.media_kind] ?? 'texto';
  const tipoInfo = getTipoConteudoInfo(tipo);
  const paragrafos = splitParagraphs(version.body);
  const tempoLeituraMin = version.estimated_reading_minutes;

  return {
    id: row.id,
    categoria: row.content_categories.label,
    categoriaCode: row.content_categories.code,
    titulo: version.title,
    resumo: paragrafos[0] ?? '',
    tipo,
    tempoLeituraMin,
    videoUrl: version.video_url,
    publicadoEm: version.updated_at,
    conteudo: paragrafos,
    favorito: state?.is_favorite ?? false,
    lida: Boolean(state?.read_at),
    tipoLabel: tipoInfo.label,
    icon: tipoInfo.icon,
    colorVar: tipoInfo.colorVar,
    duracaoLabel: tipo === 'video' && tempoLeituraMin ? `${tempoLeituraMin}:00` : null,
    publicadoLabel: `Publicado em ${new Date(version.updated_at).toLocaleDateString('pt-BR', {
      day: 'numeric',
      month: 'long',
    })}`,
  };
}

/**
 * Ordena por categoria (a ordem do catálogo) e, dentro dela, do mais recente
 * ao mais antigo.
 *
 * Em memória porque a chave primária da ordenação mora no embed
 * (`content_categories.sort_order`), e ordenação por coluna de tabela
 * referenciada no PostgREST ordena as linhas EMBUTIDAS, não as do pai.
 */
function compareOrientationRows(a: OrientationRow, b: OrientationRow): number {
  const ordemCategoria = a.content_categories.sort_order - b.content_categories.sort_order;
  if (ordemCategoria !== 0) return ordemCategoria;

  return (b.content_versions[0]?.updated_at ?? '').localeCompare(
    a.content_versions[0]?.updated_at ?? ''
  );
}

/**
 * Biblioteca de orientações do paciente.
 *
 * ⚠️ Não existe filtro por CID aqui, e isso é deliberado: a elegibilidade
 * (versão publicada E — sem marcação de CID OU marcação que cruza com o
 * diagnóstico) é imposta por `private.is_content_visible_to_me` dentro da
 * política de `content_items`. Refiltrar no cliente seria substituir a RLS
 * por uma segunda verdade, que é exatamente o que não se pode fazer.
 *
 * `categoria` e `tipo` vão para o servidor. `favoritas` e `naoLidas` são
 * aplicados em memória por necessidade: "não lida" é "sem linha em
 * `patient_content_states` OU com `read_at` nulo" — um LEFT JOIN com teste de
 * nulo, que o PostgREST não expressa (filtro em embed sem `!inner` recorta o
 * embed, não o pai; com `!inner` sumiriam justamente os itens sem linha, que
 * são os não lidos). São marcadores do próprio paciente, não fronteira de
 * isolamento, então filtrá-los no cliente não contorna RLS nenhuma.
 */
export async function getOrientacoes({
  categoria,
  tipo,
  favoritas,
  naoLidas,
}: OrientationFilters = {}): Promise<OrientationDetail[]> {
  const client = requireSupabase();

  let query = client.from('content_items').select(ORIENTATION_SELECT);

  if (categoria) {
    query = query.eq('content_categories.code', categoria);
  }

  if (tipo) {
    query = query.eq('content_versions.media_kind', TYPE_TO_MEDIA_KIND[tipo]);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error('Não foi possível carregar as orientações.');
  }

  let lista = (data as unknown as OrientationRow[])
    .filter((row) => row.content_versions.length > 0)
    .sort(compareOrientationRows)
    .map(enrichOrientation);

  if (favoritas) lista = lista.filter((orientation) => orientation.favorito);
  if (naoLidas) lista = lista.filter((orientation) => !orientation.lida);

  return lista;
}

/**
 * Categorias que têm ao menos uma orientação visível a este paciente.
 *
 * Lê a partir de `content_items` (e não do catálogo `content_categories`
 * inteiro) porque o chip só deve existir se levar a algum conteúdo: o
 * catálogo tem categoria de toda especialidade, e a biblioteca de um paciente
 * costuma cobrir poucas.
 */
export async function getCategoriasOrientacoes(): Promise<OrientationCategory[]> {
  const client = requireSupabase();

  const { data, error } = await client
    .from('content_items')
    .select('content_categories!inner(code, label, sort_order)');

  if (error) {
    throw new Error('Não foi possível carregar as categorias.');
  }

  const rows = data as unknown as Pick<OrientationRow, 'content_categories'>[];
  const porCodigo = new Map<string, OrientationRow['content_categories']>();

  rows.forEach(({ content_categories: categoria }) => {
    if (!porCodigo.has(categoria.code)) porCodigo.set(categoria.code, categoria);
  });

  return [...porCodigo.values()]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map(({ code, label }) => ({ code, label }));
}

/**
 * Uma orientação específica.
 * @throws {Error} Se não existir ou não for elegível para este paciente.
 */
export async function getOrientacaoPorId(id: string): Promise<OrientationDetail> {
  const client = requireSupabase();

  const { data, error } = await client
    .from('content_items')
    .select(ORIENTATION_SELECT)
    .eq('id', id)
    .maybeSingle();

  if (error) {
    throw new Error('Não foi possível carregar a orientação.');
  }

  const row = data as unknown as OrientationRow | null;

  if (!row || row.content_versions.length === 0) {
    // Conteúdo inelegível e conteúdo inexistente são a mesma resposta: a RLS
    // devolve vazio nos dois casos, e o app não confirma nem nega existência.
    throw new Error('Orientação não encontrada.');
  }

  return enrichOrientation(row);
}

/**
 * Marca uma orientação como lida.
 *
 * O `upsert` manda só `read_at`: as colunas ausentes do payload não entram no
 * `DO UPDATE SET`, então favoritar continua intacto.
 *
 * ⚠️ Quem chama só deve chamar quando a orientação AINDA não foi lida — o
 * `read_at` registra a primeira leitura e não deve andar para frente a cada
 * reabertura (é o que a coluna guarda de propósito, em vez de um booleano).
 */
export async function marcarOrientacaoComoLida({
  patientId,
  orientationId,
}: OrientationStateInput): Promise<ApiSuccessResult> {
  const client = requireSupabase();

  const { error } = await client.from('patient_content_states').upsert(
    {
      patient_id: patientId,
      content_item_id: orientationId,
      read_at: new Date().toISOString(),
    },
    { onConflict: 'patient_id,content_item_id' }
  );

  if (error) {
    throw new Error(describeOrientationError(error, 'Não foi possível marcar como lida.'));
  }

  return { success: true };
}

/**
 * Alterna o favorito de uma orientação.
 *
 * Lê antes de escrever porque o novo estado é a negação do atual e não há
 * "toggle" no PostgREST. A ausência de linha conta como não favoritada.
 */
export async function alternarFavoritoOrientacao({
  patientId,
  orientationId,
}: OrientationStateInput): Promise<ToggleFavoriteResult> {
  const client = requireSupabase();

  const { data: atual, error: leituraError } = await client
    .from('patient_content_states')
    .select('is_favorite')
    .eq('patient_id', patientId)
    .eq('content_item_id', orientationId)
    .maybeSingle();

  if (leituraError) {
    throw new Error(
      describeOrientationError(leituraError, 'Não foi possível atualizar o favorito.')
    );
  }

  const favorito = !((atual as { is_favorite: boolean } | null)?.is_favorite ?? false);

  const { error } = await client.from('patient_content_states').upsert(
    {
      patient_id: patientId,
      content_item_id: orientationId,
      is_favorite: favorito,
    },
    { onConflict: 'patient_id,content_item_id' }
  );

  if (error) {
    throw new Error(describeOrientationError(error, 'Não foi possível atualizar o favorito.'));
  }

  return { success: true, favorito };
}

/**
 * Traduz a falha de uma escrita do chat.
 *
 * A recusa mais provável não é falta de permissão genérica: é conversa
 * `resolved`. A política de INSERT exige `status = 'open'`, então tentar
 * responder numa conversa encerrada volta como violação de RLS — e o texto
 * precisa dizer o que aconteceu, senão o paciente reescreve a mensagem
 * achando que foi falha de rede.
 */
function describeChatError(error: { code?: string; message?: string }, fallback: string): string {
  if (error.code === '42501') {
    return 'Você não tem permissão para essa ação.';
  }

  if (error.code === '23503') {
    return 'Esse assunto não está mais disponível. Escolha outro para iniciar a conversa.';
  }

  if (error.message?.includes('row-level security')) {
    return 'Esta conversa foi encerrada pela equipe. Inicie uma nova conversa para continuar.';
  }

  return fallback;
}

/**
 * Colunas de uma conversa do paciente, com tudo que a tela precisa.
 *
 * As mensagens vêm embutidas porque `conversations` **não guarda prévia nem
 * contador de não lidas** — é decisão declarada do banco (prévia numa tabela
 * de metadado seria conteúdo clínico fora do pedágio de auditoria). Os dois
 * são derivados aqui, a partir das mensagens e da marca d'água de leitura.
 *
 * `conversation_read_marks` é embed sem `!inner`: quem nunca abriu a conversa
 * não tem marca, e é justamente esse caso que conta tudo como não lido.
 */
const CONVERSATION_SELECT =
  'id, status, last_message_at, team_last_read_at, ' +
  'conversation_subjects(code, label), ' +
  'specialties(label), ' +
  'conversation_read_marks(last_read_at), ' +
  'messages(id, body, author_kind, author_account_id, created_at)';

interface ConversationMessageRow {
  id: string;
  body: string;
  author_kind: string;
  author_account_id: string | null;
  created_at: string;
}

interface ConversationRow {
  id: string;
  status: string;
  last_message_at: string;
  team_last_read_at: string | null;
  conversation_subjects: { code: string; label: string };
  /** `null` enquanto a conversa não é roteada — que é o estado de toda conversa nova. */
  specialties: { label: string } | null;
  conversation_read_marks: { last_read_at: string }[];
  messages: ConversationMessageRow[];
}

/** `message_author_kind` (banco) → `MessageAuthor` (UI). */
const AUTHOR_KIND_TO_AUTHOR: Record<string, MessageAuthor> = {
  patient: 'paciente',
  caregiver: 'cuidador',
  professional: 'profissional',
  system: 'sistema',
};

function enrichMensagem(
  row: ConversationMessageRow,
  teamLastReadAt: string | null
): EnrichedMessage {
  const autor = AUTHOR_KIND_TO_AUTHOR[row.author_kind] ?? 'sistema';
  const data = new Date(row.created_at);

  // Só faz sentido dizer "lida" do que saiu deste lado da conversa. E "lida"
  // aqui é a equipe inteira, nunca uma pessoa: `team_last_read_at` é agregado
  // de propósito — o paciente vê QUE leram, jamais QUEM leu.
  const desteLado = autor === 'paciente' || autor === 'cuidador';
  const lida =
    teamLastReadAt !== null && new Date(teamLastReadAt).getTime() >= data.getTime();

  return {
    id: row.id,
    autor,
    texto: row.body,
    criadoEm: row.created_at,
    data,
    horaLabel: data.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
    statusEnvio: desteLado ? (lida ? 'lida' : 'enviada') : null,
  };
}

/**
 * Conta as mensagens que chegaram depois da marca d'água desta conta.
 *
 * Compara por conta, e não por tipo de autor: numa conversa em que o cuidador
 * também escreve, a mensagem dele é "de outra pessoa" para o paciente — e
 * vice-versa. Sem marca nenhuma, tudo que não é meu está por ler.
 */
function contarNaoLidas(row: ConversationRow, meuAccountId: string | null): number {
  const marca = row.conversation_read_marks[0]?.last_read_at;
  const limite = marca ? new Date(marca).getTime() : 0;

  return row.messages.filter(
    (mensagem) =>
      mensagem.author_account_id !== meuAccountId &&
      new Date(mensagem.created_at).getTime() > limite
  ).length;
}

/**
 * Minutos decorridos desde um instante ISO.
 *
 * `formatRelativeTime` foi escrita para o mock, que guardava "minutos atrás"
 * como número. O banco guarda o instante — esta conversão é a ponte, e evita
 * duplicar a formatação de tempo relativo só por causa do formato de entrada.
 */
function minutosDesde(iso: string): number {
  return (Date.now() - new Date(iso).getTime()) / 60000;
}

/** Corpo da última mensagem — a prévia que a lista mostra. */
function previaDe(row: ConversationRow): string {
  return row.messages[row.messages.length - 1]?.body ?? '';
}

function enrichConversaResumo(row: ConversationRow, meuAccountId: string | null): ConversationSummary {
  const assunto = row.conversation_subjects;

  return {
    id: row.id,
    // Não há coluna de título: a conversa é identificada pelo assunto.
    titulo: assunto.label,
    especialidade: row.specialties?.label ?? null,
    subjectCode: assunto.code,
    assuntoInfo: getAssuntoInfo(assunto.code),
    ultimaMensagem: previaDe(row),
    horaLabel: formatRelativeTime(minutosDesde(row.last_message_at)),
    ultimaAtividadeEm: row.last_message_at,
    naoLidas: contarNaoLidas(row, meuAccountId),
    aberta: row.status === 'open',
  };
}

/** Id da conta na sessão, ou `null` fora de sessão. */
async function getMyAccountId(): Promise<string | null> {
  const client = requireSupabase();
  const {
    data: { session },
  } = await client.auth.getSession();

  return session?.user.id ?? null;
}

/**
 * Assuntos disponíveis para abrir uma conversa.
 *
 * Vem do catálogo (`conversation_subjects`) e não de uma constante do front
 * porque `start_conversation` recebe o **UUID** do assunto — o código sozinho
 * não abre conversa. `is_active` já é filtrado pela própria política.
 */
export async function getConversationSubjects(): Promise<ChatSubjectOption[]> {
  const client = requireSupabase();

  const { data, error } = await client
    .from('conversation_subjects')
    .select('id, code, label, sort_order')
    .order('sort_order');

  if (error) {
    throw new Error('Não foi possível carregar os assuntos.');
  }

  return (data as { id: string; code: string; label: string }[]).map((row) => ({
    id: row.id,
    code: row.code,
    label: row.label,
    info: getAssuntoInfo(row.code),
  }));
}

/**
 * Conversas do paciente, da mais recente à mais antiga.
 *
 * Sem filtro por paciente na query: a política de `conversations` já limita à
 * própria linha, e repetir o filtro aqui só criaria uma segunda verdade.
 */
export async function getConversas(): Promise<ConversationSummary[]> {
  const client = requireSupabase();
  const meuAccountId = await getMyAccountId();

  const { data, error } = await client
    .from('conversations')
    .select(CONVERSATION_SELECT)
    .order('last_message_at', { ascending: false })
    .order('created_at', { referencedTable: 'messages', ascending: true });

  if (error) {
    throw new Error('Não foi possível carregar suas conversas.');
  }

  return (data as unknown as ConversationRow[]).map((row) =>
    enrichConversaResumo(row, meuAccountId)
  );
}

/**
 * Uma conversa com todas as suas mensagens.
 * @throws {Error} Se não existir ou não for do paciente da sessão.
 */
export async function getConversaPorId(id: string): Promise<ConversationDetail> {
  const client = requireSupabase();
  const meuAccountId = await getMyAccountId();

  const { data, error } = await client
    .from('conversations')
    .select(CONVERSATION_SELECT)
    .eq('id', id)
    .order('created_at', { referencedTable: 'messages', ascending: true })
    .maybeSingle();

  if (error) {
    throw new Error('Não foi possível carregar a conversa.');
  }

  const row = data as unknown as ConversationRow | null;

  if (!row) {
    // Conversa de outro paciente e conversa inexistente são a mesma resposta:
    // a RLS devolve vazio nos dois casos.
    throw new Error('Conversa não encontrada.');
  }

  const assunto = row.conversation_subjects;

  return {
    id: row.id,
    titulo: assunto.label,
    especialidade: row.specialties?.label ?? null,
    subjectCode: assunto.code,
    assuntoInfo: getAssuntoInfo(assunto.code),
    naoLidas: contarNaoLidas(row, meuAccountId),
    aberta: row.status === 'open',
    mensagens: row.messages.map((mensagem) => enrichMensagem(mensagem, row.team_last_read_at)),
  };
}

/**
 * Soma das mensagens não lidas de todas as conversas (indicador da Home).
 *
 * Consulta própria, mais magra que `getConversas`: sem corpo de mensagem, sem
 * assunto e sem especialidade — só o que a contagem precisa.
 */
export async function getConversasNaoLidas(): Promise<UnreadConversationsSummary> {
  const client = requireSupabase();
  const meuAccountId = await getMyAccountId();

  const { data, error } = await client
    .from('conversations')
    .select('id, conversation_read_marks(last_read_at), messages(author_account_id, created_at)');

  if (error) {
    throw new Error('Não foi possível verificar suas mensagens.');
  }

  const rows = data as unknown as Pick<
    ConversationRow,
    'conversation_read_marks' | 'messages'
  >[];

  const total = rows.reduce(
    (acc, row) => acc + contarNaoLidas(row as ConversationRow, meuAccountId),
    0
  );

  return { total };
}

/**
 * Marca a conversa como lida.
 *
 * É RPC e não escrita direta porque a função também precisa checar
 * visibilidade: ela é `SECURITY DEFINER`, e sem essa checagem qualquer conta
 * marcaria a conversa de qualquer paciente — o que vazaria a EXISTÊNCIA da
 * conversa por tentativa e erro.
 */
export async function marcarConversaComoLida(id: string): Promise<ApiSuccessResult> {
  const client = requireSupabase();

  const { error } = await client.rpc('mark_conversation_read', { p_conversation_id: id });

  if (error) {
    throw new Error(describeChatError(error, 'Não foi possível marcar a conversa como lida.'));
  }

  return { success: true };
}

/**
 * Envia uma mensagem numa conversa aberta.
 *
 * `.insert()` direto, e não RPC: o chat é caminho quente demais para uma
 * função por mensagem, e a autoria da linha imutável já é a trilha de
 * auditoria. A mensagem não se edita nem se apaga — corrigir é mandar outra.
 */
export async function enviarMensagem(
  conversaId: string,
  texto: string
): Promise<SendMessageResult> {
  const client = requireSupabase();

  const {
    data: { session },
  } = await client.auth.getSession();

  if (!session) {
    throw new Error('Sua sessão expirou. Entre novamente para enviar a mensagem.');
  }

  const { data, error } = await client
    .from('messages')
    .insert({
      conversation_id: conversaId,
      author_kind: 'patient',
      author_account_id: session.user.id,
      body: texto,
    })
    .select('id, body, author_kind, author_account_id, created_at')
    .single();

  if (error || !data) {
    throw new Error(describeChatError(error ?? {}, 'Não foi possível enviar a mensagem.'));
  }

  // A mensagem acabou de ser criada, então a equipe ainda não a leu:
  // `teamLastReadAt` entra como `null` e o status sai 'enviada'.
  return {
    success: true,
    mensagem: enrichMensagem(data as unknown as ConversationMessageRow, null),
  };
}

/**
 * Abre uma conversa e grava a primeira mensagem, atomicamente.
 *
 * Os dois passos são uma RPC só porque conversa sem mensagem não existe do
 * ponto de vista do produto. A especialidade sai do assunto — hoje sempre
 * `NULL`, porque o mapa de roteamento nasce vazio de propósito e a conversa
 * fica na fila geral até um profissional assumi-la.
 */
export async function iniciarConversa({
  subjectId,
  texto,
}: StartConversationInput): Promise<StartConversationResult> {
  const client = requireSupabase();

  const { data, error } = await client.rpc('start_conversation', {
    p_subject_id: subjectId,
    p_body: texto,
  });

  if (error || !data) {
    throw new Error(describeChatError(error ?? {}, 'Não foi possível iniciar a conversa.'));
  }

  return { success: true, id: data as string };
}

/**
 * Escuta as mudanças do chat em tempo real e devolve a função de cancelamento.
 *
 * `messages` e `conversations` estão na publication de Realtime justamente
 * para o app do paciente — sem isto, a resposta da equipe só apareceria no
 * próximo refetch, e um chat que não atualiza sozinho não é um chat.
 *
 * A RLS vale igualmente no Realtime: o canal só entrega as linhas que este
 * paciente já poderia ler. O filtro por conversa é recorte de escopo, não de
 * segurança.
 *
 * Recebe um callback em vez de devolver as linhas: quem sabe reagir é o cache
 * do TanStack Query, e reconsultar mantém uma única forma de montar a
 * conversa (prévia e não lidas são derivadas, não vêm na linha).
 */
export function subscribeToChat(
  conversationId: string | undefined,
  onChange: () => void
): () => void {
  // Sem cliente configurado não há o que assinar — devolve um cancelamento
  // inócuo em vez de derrubar a tela que chamou.
  if (!supabase) return () => {};

  const client = supabase;
  const channel = client.channel(conversationId ? `chat:${conversationId}` : 'chat:list');

  channel.on(
    'postgres_changes',
    {
      event: 'INSERT',
      schema: 'public',
      table: 'messages',
      ...(conversationId ? { filter: `conversation_id=eq.${conversationId}` } : {}),
    },
    onChange
  );

  // A conversa também muda sem mensagem nova: `team_last_read_at` é o que
  // vira "Lida" na bolha do paciente, e `status` é o que fecha o campo de
  // digitação quando a equipe encerra o atendimento.
  channel.on(
    'postgres_changes',
    { event: 'UPDATE', schema: 'public', table: 'conversations' },
    onChange
  );

  channel.subscribe();

  return () => {
    void client.removeChannel(channel);
  };
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
