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
import appointmentsRaw from '../mocks/appointments';
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
import { CATEGORIAS } from '../utils/agenda';
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
  Appointment,
  AppointmentType,
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
const appointments = appointmentsRaw as Appointment[];
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
      celular: patient.celular,
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
export async function getSessionIdentity(): Promise<SessionIdentity | null> {
  const client = requireSupabase();

  const {
    data: { user },
    error: userError,
  } = await client.auth.getUser();

  if (userError || !user) return null;

  // Em paralelo: uma leitura não depende da outra, e a conta desativada
  // precisa ser detectável mesmo quando o paciente não aparece.
  const [accountResult, patientResult] = await Promise.all([
    // O `.eq` não substitui a RLS (a política já limita à própria linha) —
    // serve para o `maybeSingle` continuar válido caso esta mesma função
    // algum dia rode sob um perfil que enxerga várias contas.
    client
      .from('accounts')
      .select('id, full_name, email, phone, is_active')
      .eq('id', user.id)
      .maybeSingle(),
    client.from('patients').select('id').limit(1).maybeSingle(),
  ]);

  if (accountResult.error) {
    throw new Error('Não foi possível carregar sua conta. Tente novamente.');
  }

  if (!accountResult.data) {
    // A conta nasce por trigger junto do usuário no Auth; não existir aqui
    // é inconsistência de dados, não falta de permissão (a política de
    // leitura da própria linha não olha `is_active`).
    throw new Error('Sua conta não foi encontrada. Fale com a recepção do Centro.');
  }

  if (patientResult.error) {
    throw new Error('Não foi possível carregar seu cadastro. Tente novamente.');
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

/**
 * Retorna o paciente autenticado por completo (dados pessoais, diagnóstico,
 * CID, protocolo, estadiamento, alergias, preferências).
 */
export async function getPatient(): Promise<Patient> {
  await wait();
  return patient;
}

/**
 * Retorna o próximo compromisso futuro (o mais próximo no tempo), já
 * enriquecido com rótulos formatados para exibição.
 * `null` se não houver nenhum compromisso futuro.
 */
export async function getProximoCompromisso(): Promise<NextAppointmentSummary | null> {
  await wait();

  const futuros = appointments
    .filter((appointment) => appointment.diasAPartirDeHoje >= 0)
    .sort((a, b) => a.diasAPartirDeHoje - b.diasAPartirDeHoje);

  const proximo = futuros[0];
  if (!proximo) return null;

  const data = addDays(new Date(), proximo.diasAPartirDeHoje);
  return {
    id: proximo.id,
    tipo: (CATEGORIAS[proximo.categoria]?.tipo || 'consulta') as AppointmentType,
    titulo: proximo.titulo,
    data,
    diaLabel: formatDayLabel(data),
    hora: proximo.hora,
    local: proximo.local,
    profissional: proximo.profissional
      ? { nome: proximo.profissional.nome, cargo: proximo.profissional.cargo, foto: null }
      : null,
    dica: proximo.observacoes,
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

function enrichAppointment(appointment: Appointment): EnrichedAppointment {
  const data = addDays(new Date(), appointment.diasAPartirDeHoje);
  const categoriaInfo = CATEGORIAS[appointment.categoria] || CATEGORIAS.consulta;
  const dataLabel =
    appointment.diasAPartirDeHoje >= 0
      ? formatAgendaFutureLabel(appointment.diasAPartirDeHoje, appointment.hora)
      : formatDiaryDateLabel(appointment.diasAPartirDeHoje, appointment.hora);

  return {
    ...appointment,
    data,
    dataLabel,
    dataCompletaLabel: formatFullDateWithWeekday(data),
    icon: categoriaInfo.icon,
    colorVar: categoriaInfo.colorVar,
    tipo: categoriaInfo.tipo as AppointmentType,
  };
}

/**
 * Retorna todos os compromissos futuros, enriquecidos e ordenados do mais
 * próximo ao mais distante.
 */
export async function getProximosCompromissos(): Promise<EnrichedAppointment[]> {
  await wait();

  return appointments
    .filter((appointment) => appointment.diasAPartirDeHoje >= 0)
    .sort((a, b) => a.diasAPartirDeHoje - b.diasAPartirDeHoje)
    .map(enrichAppointment);
}

/**
 * Retorna todos os compromissos passados, enriquecidos e ordenados do mais
 * recente ao mais antigo.
 */
export async function getHistoricoCompromissos(): Promise<EnrichedAppointment[]> {
  await wait();

  return appointments
    .filter((appointment) => appointment.diasAPartirDeHoje < 0)
    .sort((a, b) => b.diasAPartirDeHoje - a.diasAPartirDeHoje)
    .map(enrichAppointment);
}

/**
 * Retorna um compromisso específico da Agenda.
 * @throws {Error} Se o compromisso não existir.
 */
export async function getCompromissoPorId(id: string): Promise<EnrichedAppointment> {
  await wait();

  const appointment = appointments.find((item) => item.id === id);
  if (!appointment) {
    throw new Error('Compromisso não encontrado.');
  }

  return enrichAppointment(appointment);
}

/**
 * Retorna os 7 dias da semana de `dataReferencia`, cada um com seus
 * compromissos (para a visualização Semanal da Agenda). `dataReferencia` é
 * qualquer dia dentro da semana desejada.
 */
export async function getSemanaAgenda(dataReferencia: Date): Promise<AgendaDay[]> {
  await wait();

  const dias = getWeekDays(dataReferencia);

  return dias.map((dia) => ({
    data: dia,
    eventos: appointments
      .filter((appointment) => isSameDay(addDays(new Date(), appointment.diasAPartirDeHoje), dia))
      .sort((a, b) => a.hora.localeCompare(b.hora))
      .map(enrichAppointment),
  }));
}

/**
 * Retorna a grade do mês de `dataReferencia` (células vazias de
 * preenchimento + um dia por célula), cada dia com seus compromissos, para
 * a visualização Mensal da Agenda. `dataReferencia` é qualquer dia dentro do
 * mês desejado. `null` nas células de preenchimento antes do dia 1.
 */
export async function getMesAgenda(dataReferencia: Date): Promise<(AgendaDay | null)[]> {
  await wait();

  const celulas = getMonthGridDays(dataReferencia);

  return celulas.map((dia) => {
    if (!dia) return null;

    return {
      data: dia,
      eventos: appointments
        .filter((appointment) => isSameDay(addDays(new Date(), appointment.diasAPartirDeHoje), dia))
        .map(enrichAppointment),
    };
  });
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
 */
export async function atualizarPreferencia(
  chave: PatientPreferenceKey,
  valor: boolean
): Promise<ApiSuccessResult> {
  await wait(150);

  patient.preferencias[chave] = valor;
  return { success: true };
}

/**
 * Solicita a exportação dos dados do paciente (LGPD).
 */
export async function solicitarExportacaoDados(): Promise<ApiSuccessResult> {
  await wait(600);
  return { success: true };
}

/**
 * Solicita a exclusão da conta do paciente (LGPD).
 */
export async function solicitarExclusaoConta(): Promise<ApiSuccessResult> {
  await wait(600);
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
