// Diário de sintomas: catálogo, registros, rascunho automático, envio e a
// evolução para o gráfico.
//
// Nenhuma página fala com o Supabase direto: toda leitura e escrita passa pelos
// serviços, sob a RLS da sessão, e devolve os formatos de `src/types/` — as telas
// não conhecem nome de coluna nem forma de embed.
import { appError } from '../lib/appError';
import { requireSupabase } from './supabaseClient';
import {
  formatDiaryDateLabel,
  daysFromToday,
  parseDateOnly,
  shiftDateOnly,
  todayInClinicTimeZone,
} from '../utils/date';
import {
  ALERT_THRESHOLD,
  getEntrySeverity,
  getSymptomPresentation,
  hasAttentionSignal,
} from '../utils/symptoms';
import type {
  AvailableSymptom,
  DiaryActorKind,
  DiaryEntryStatus,
  EnrichedDiaryEntry,
  SymptomReport,
  SymptomIntensity,
  TodayEntrySummary,
  DiaryDraft,
  SaveDiaryDraftInput,
  SubmitDiaryEntryInput,
  SaveDiaryEntryResult,
  SymptomEvolutionPoint,
  DiaryFilters,
  DiaryCursor,
  DiaryEntriesPage,
  SymptomEvolutionQueryOptions,
} from '../types';

/**
 * Dias consecutivos com registro, terminando hoje. Zero quando não há
 * registro de hoje — a sequência quebra no dia em que ela é olhada, não no
 * dia seguinte.
 */
function calculateStreak(dates: string[], today: string): number {
  const days = new Set(dates);
  let streak = 0;
  let cursor = today;

  while (days.has(cursor)) {
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
    throw appError('Não foi possível carregar seu registro de hoje.', entryResult.error);
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
 * Colunas de um registro com seus sintomas e o catálogo de cada um.
 *
 * `sort_order` vem junto para a lista de sintomas do registro sair na mesma
 * ordem do catálogo — sem ele a ordem seria a de inserção, que varia conforme
 * o paciente mexeu nos controles.
 */
const DIARY_ENTRY_SELECT =
  'id, entry_date, free_text, status, acting_as, submitted_at, ' +
  'diary_symptom_reports(grade, symptom_id, symptoms(id, code, label, sort_order))';

/** Registros por página do histórico. */
const DIARY_PAGE_SIZE = 20;

/**
 * Teto de linhas da série do gráfico. A janela mais larga (90 dias) cabe com
 * folga mesmo com vários registros por dia; ao bater no teto, o que fica de
 * fora é o mais antigo, porque a leitura é do dia mais recente para trás.
 */
const EVOLUTION_MAX_ROWS = 500;

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
    throw appError('Não foi possível carregar a lista de sintomas.', error);
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
 * Alias do embed que serve só de filtro por sintoma.
 *
 * O mesmo `diary_symptom_reports` entra no `select` duas vezes: sem alias, como
 * de costume, trazendo TODOS os sintomas do registro (o card mostra o registro
 * inteiro, não só o sintoma filtrado); e com este alias e `!inner`, que é onde
 * o filtro `filtro.symptom_id` recai e que tira da lista o registro sem o
 * sintoma. Filtrar direto no embed sem alias restringiria também os sintomas
 * devolvidos.
 *
 * A RLS de `diary_symptom_reports` deriva do registro pai, então os dois
 * embeds enxergam apenas o que é do próprio paciente.
 */
const SYMPTOM_FILTER_ALIAS = 'filtro';
const SYMPTOM_FILTER_EMBED = `${SYMPTOM_FILTER_ALIAS}:diary_symptom_reports!inner(symptom_id)`;

/**
 * Uma página do histórico do Diário, do mais recente ao mais antigo.
 *
 * Só registros finalizados: rascunho é trabalho em andamento, não entra na
 * linha do tempo (é o mesmo recorte que a equipe enxerga).
 *
 * A paginação é por chave, não por deslocamento: `cursor` é o último registro
 * já lido, e a página traz os anteriores a ele. Assim um registro novo, ou o
 * filtro trocado no meio, não repete nem pula linha — o que um `offset` faria.
 * A ordem é `entry_date` e `submitted_at`; dois registros no mesmo instante do
 * mesmo paciente não existem na prática (é uma pessoa registrando), então
 * não há desempate por id.
 *
 * `signal` vem do TanStack Query: trocar de filtro rápido cancela a
 * requisição anterior de verdade, não só o estado da query.
 */
export async function getDiaryEntries(
  { periodDays, symptomId }: DiaryFilters = {},
  cursor: DiaryCursor | null = null,
  signal?: AbortSignal
): Promise<DiaryEntriesPage> {
  const client = requireSupabase();

  let query = client
    .from('diary_entries')
    .select(symptomId ? `${DIARY_ENTRY_SELECT}, ${SYMPTOM_FILTER_EMBED}` : DIARY_ENTRY_SELECT)
    .eq('status', 'saved')
    .order('entry_date', { ascending: false })
    .order('submitted_at', { ascending: false })
    // Uma linha além da página: se ela vier, há próxima página. Sem isso, uma
    // lista com exatamente `DIARY_PAGE_SIZE` registros ofereceria "carregar
    // mais" para uma página vazia.
    .limit(DIARY_PAGE_SIZE + 1);

  if (typeof periodDays === 'number') {
    query = query.gte('entry_date', shiftDateOnly(todayInClinicTimeZone(), -periodDays));
  }

  if (symptomId) {
    query = query.eq(`${SYMPTOM_FILTER_ALIAS}.symptom_id`, symptomId);
  }

  if (cursor) {
    // Estritamente anterior ao último lido: data menor, ou a mesma data com
    // envio mais cedo. O horário vai entre aspas por causa do `:` e do `+`.
    query = query.or(
      `entry_date.lt.${cursor.entryDate},` +
        `and(entry_date.eq.${cursor.entryDate},submitted_at.lt."${cursor.submittedAt}")`
    );
  }

  if (signal) query = query.abortSignal(signal);

  const { data, error } = await query;

  if (error) {
    throw appError('Não foi possível carregar seus registros.', error);
  }

  const rows = data as unknown as DiaryEntryRow[];
  const hasMore = rows.length > DIARY_PAGE_SIZE;
  const pageRows = hasMore ? rows.slice(0, DIARY_PAGE_SIZE) : rows;
  const last = pageRows[pageRows.length - 1];

  return {
    entries: pageRows.map(enrichDiaryEntry),
    // `saved` sempre tem `submitted_at` (CHECK do banco); o teste de nulo é só
    // para o tipo, e não cala uma página que existe.
    nextCursor:
      hasMore && last?.submitted_at
        ? { entryDate: last.entry_date, submittedAt: last.submitted_at }
        : null,
  };
}

/**
 * Um registro específico.
 *
 * Devolve `null` quando ele não existe ou não é visível para este paciente, e
 * **lança** quando a leitura falha (rede, sessão): a tela precisa separar os
 * dois casos, porque "não encontrado" não se resolve tentando de novo e
 * "sem conexão" sim.
 */
export async function getDiaryEntry(id: string): Promise<EnrichedDiaryEntry | null> {
  const client = requireSupabase();

  const { data, error } = await client
    .from('diary_entries')
    .select(DIARY_ENTRY_SELECT)
    .eq('id', id)
    // Rascunho não é registro: sem isto, o detalhe abria um texto que a
    // pessoa ainda estava escrevendo como se fosse um registro do histórico.
    .eq('status', 'saved')
    .maybeSingle();

  if (error) {
    throw appError('Não foi possível carregar o registro.', error);
  }

  if (!data) {
    // Registro de outro paciente e registro inexistente são a mesma resposta
    // por desenho: a RLS devolve vazio nos dois casos, e é assim que o
    // isolamento se mantém — o app não confirma nem nega a existência.
    return null;
  }

  return enrichDiaryEntry(data as unknown as DiaryEntryRow);
}

/**
 * O rascunho aberto por esta sessão hoje, se houver.
 *
 * Duas condições além do `status`: `authored_by` é a própria conta, porque a
 * política do diário é por paciente e titular e acompanhante enxergam os
 * rascunhos um do outro — continuar o texto do outro trocaria a autoria do
 * registro. E `entry_date` é hoje: um rascunho esquecido de outro dia seria
 * gravado com a data daquele dia, não a de agora.
 */
export async function getOwnDiaryDraft(): Promise<DiaryDraft | null> {
  const client = requireSupabase();

  const {
    data: { session },
  } = await client.auth.getSession();

  if (!session) return null;

  const { data, error } = await client
    .from('diary_entries')
    .select('id, free_text, updated_at, diary_symptom_reports(symptom_id, grade)')
    .eq('status', 'draft')
    .eq('authored_by', session.user.id)
    .eq('entry_date', todayInClinicTimeZone())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw appError(describeDiaryError(error, 'Não foi possível recuperar seu rascunho.'), error);
  }

  if (!data) return null;

  return {
    id: data.id,
    freeText: data.free_text ?? '',
    symptoms: (data.diary_symptom_reports ?? []).map((report) => ({
      symptomId: report.symptom_id,
      grade: report.grade as SymptomIntensity,
    })),
    updatedAt: data.updated_at,
  };
}

/**
 * Grava o rascunho — é o salvamento automático da tela de registro.
 *
 * Sempre a MESMA linha: sem `draftId` abre uma, com `draftId` atualiza. É o
 * que impede uma linha nova por digitação e o que resolve o rascunho órfão de
 * uma gravação interrompida, já que `DELETE` em `diary_entries` está revogado
 * até para `service_role`.
 *
 * Os sintomas espelham o que está na tela: quem tem grau vira linha (o
 * `UNIQUE(diary_entry_id, symptom_id)` transforma o regravar em UPDATE), e
 * quem voltou a zero sai. Enquanto o pai é rascunho o banco aceita esse
 * DELETE — é a única exclusão liberada no projeto, e existe justamente para
 * desmarcar sintoma.
 *
 * Rascunho não chega à equipe nem dispara alerta: só a transição para
 * `saved` faz isso.
 */
export async function saveDiaryDraft({
  draftId,
  patientId,
  actingAs,
  freeText,
  symptoms,
}: SaveDiaryDraftInput): Promise<string> {
  const client = requireSupabase();

  const {
    data: { session },
  } = await client.auth.getSession();

  if (!session) {
    throw appError('Sua sessão expirou. Entre novamente para salvar o registro.');
  }

  // O CHECK da coluna recusa string vazia — texto em branco é ausência de
  // texto, e vai como NULL.
  const text = freeText?.trim();
  let entryId = draftId;

  if (!entryId) {
    // `acting_as` vem de quem está na sessão: o titular grava 'patient', o
    // acompanhante grava 'caregiver'. Não é rótulo de tela — é o que as duas
    // políticas de INSERT comparam, e o valor errado faz as duas recusarem.
    const { data: entry, error: entryError } = await client
      .from('diary_entries')
      .insert({
        patient_id: patientId,
        authored_by: session.user.id,
        acting_as: actingAs,
        free_text: text ? text : null,
      })
      .select('id')
      .single();

    if (entryError || !entry) {
      throw appError(
        describeDiaryError(entryError ?? {}, 'Não foi possível iniciar o registro.'),
        entryError
      );
    }

    entryId = entry.id;
  } else {
    const { error: textError } = await client
      .from('diary_entries')
      .update({ free_text: text ? text : null })
      .eq('id', entryId);

    if (textError) {
      throw appError(
        describeDiaryError(textError, 'Não foi possível salvar o rascunho.'),
        textError
      );
    }
  }

  const checkedSymptoms = symptoms.filter((symptom) => symptom.grade > 0);

  if (checkedSymptoms.length > 0) {
    const { error: reportsError } = await client.from('diary_symptom_reports').upsert(
      checkedSymptoms.map((symptom) => ({
        diary_entry_id: entryId,
        symptom_id: symptom.symptomId,
        grade: symptom.grade,
      })),
      { onConflict: 'diary_entry_id,symptom_id' }
    );

    if (reportsError) {
      throw appError(
        describeDiaryError(reportsError, 'Não foi possível salvar os sintomas do registro.'),
        reportsError
      );
    }
  }

  // Tira o que não está mais marcado. Sem lista de marcados, sai tudo — é o
  // "começar de novo" reaproveitando a mesma linha.
  let removal = client.from('diary_symptom_reports').delete().eq('diary_entry_id', entryId);

  if (checkedSymptoms.length > 0) {
    const ids = checkedSymptoms.map((symptom) => symptom.symptomId).join(',');
    removal = removal.not('symptom_id', 'in', `(${ids})`);
  }

  const { error: removeError } = await removal;

  if (removeError) {
    throw appError(
      describeDiaryError(removeError, 'Não foi possível atualizar os sintomas do registro.'),
      removeError
    );
  }

  return entryId;
}

/**
 * Finaliza o rascunho: é aqui que o registro passa a existir para a equipe e
 * que o alerta de sintoma crítico pode nascer.
 *
 * Estado e horário andam juntos — mandar um sem o outro viola o CHECK da
 * tabela. Depois disto o registro é imutável; corrigir é registrar de novo.
 */
export async function submitDiaryEntry({
  draftId,
  symptoms,
}: SubmitDiaryEntryInput): Promise<SaveDiaryEntryResult> {
  const client = requireSupabase();

  const { error } = await client
    .from('diary_entries')
    .update({ status: 'saved', submitted_at: new Date().toISOString() })
    .eq('id', draftId);

  if (error) {
    throw appError(describeDiaryError(error, 'Não foi possível finalizar o registro.'), error);
  }

  return {
    success: true,
    id: draftId,
    hasAlert: symptoms.some((symptom) => symptom.grade >= ALERT_THRESHOLD),
  };
}

/**
 * Série temporal da intensidade de um sintoma, do mais antigo ao mais
 * recente — é a "seleção de métrica" do gráfico do Diário.
 *
 * Um ponto por dia com registro, na janela dos últimos `periodDays` dias. Dia
 * em que o paciente registrou mas não marcou o sintoma vale 0: o banco nunca
 * grava grau 0 (o rascunho só guarda o que foi marcado), então é a ausência
 * da nota que diz "não senti". Dia sem registro nenhum não entra — afirmar 0
 * ali seria dizer o que o paciente não disse.
 *
 * O embed vai **sem** `!inner` de propósito: o filtro num embed comum só
 * restringe as notas devolvidas, e o registro que não marcou o sintoma segue
 * vindo, com a lista vazia. Com `!inner` ele sumiria, e a curva ficaria
 * parada no último valor alto quando o sintoma passou.
 */
export async function getSymptomEvolution(
  { symptomId, periodDays }: SymptomEvolutionQueryOptions,
  signal?: AbortSignal
): Promise<SymptomEvolutionPoint[]> {
  const client = requireSupabase();

  let query = client
    .from('diary_entries')
    .select('entry_date, diary_symptom_reports(grade, symptom_id)')
    .eq('status', 'saved')
    .eq('diary_symptom_reports.symptom_id', symptomId)
    .gte('entry_date', shiftDateOnly(todayInClinicTimeZone(), -periodDays))
    .order('entry_date', { ascending: false })
    .limit(EVOLUTION_MAX_ROWS);

  if (signal) query = query.abortSignal(signal);

  const { data, error } = await query;

  if (error) {
    throw appError('Não foi possível carregar a evolução do sintoma.', error);
  }

  const rows = data as unknown as {
    entry_date: string;
    diary_symptom_reports: { grade: number }[];
  }[];

  // Vários registros no mesmo dia valem pelo mais intenso, como no resumo do
  // registro ("pior sintoma"). O `Map` guarda a ordem da consulta, do dia mais
  // recente para o mais antigo.
  const worstByDay = new Map<string, number>();

  rows.forEach((row) => {
    const grade = Math.max(0, ...row.diary_symptom_reports.map((report) => report.grade));
    worstByDay.set(row.entry_date, Math.max(worstByDay.get(row.entry_date) ?? 0, grade));
  });

  // O gráfico lê da esquerda para a direita no tempo.
  return [...worstByDay].reverse().map(([entryDate, grade]) => ({
    dateLabel: parseDateOnly(entryDate).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
    }),
    value: toIntensity(grade),
  }));
}
