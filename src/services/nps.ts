// Pesquisa de satisfação (NPS): a pesquisa aberta e a resposta, única.
//
// Nenhuma página fala com o Supabase direto: toda leitura e escrita passa pelos
// serviços, sob a RLS da sessão, e devolve os formatos de `src/types/` — as telas
// não conhecem nome de coluna nem forma de embed.
import { appError } from '../lib/appError';
import { requireSupabase } from './supabaseClient';
import type { ApiSuccessResult, NpsResponseInput, NpsSurvey } from '../types';

const NPS_SURVEY_SELECT = 'id, triggered_at, treatment_phases(label), nps_responses(id)';

interface NpsSurveyRow {
  id: string;
  treatment_phases: { label: string } | null;
  // `survey_id` é UNIQUE em `nps_responses`, então o PostgREST pode tratar o
  // embed como um-para-um (objeto ou `null`) em vez de lista.
  nps_responses: { id: string } | { id: string }[] | null;
}

function isNpsSurveyAnswered(row: NpsSurveyRow): boolean {
  const responses = row.nps_responses;
  return Array.isArray(responses) ? responses.length > 0 : responses !== null;
}

/**
 * A pesquisa de satisfação aberta e ainda sem resposta, ou `null`.
 *
 * Sem filtro por paciente: a política de `nps_surveys` já limita ao titular —
 * e o acompanhante não enxerga pesquisa nenhuma, por decisão do banco (quem
 * avalia o próprio cuidado é o titular).
 *
 * O app nunca abre pesquisa (`open_nps_survey` é só de `service_role`). Desde
 * 25/09/2026 a do PRIMEIRO ACESSO abre sozinha, por gatilho, no instante em que
 * a ficha ganha conta (`trg_open_first_access_nps`); os marcos de meio e de fim
 * do tratamento seguem inertes, porque dependem do ciclo, que só a
 * sincronização com o Gemed preenche. Não há push de NPS: é lendo esta tabela
 * depois do login que o app descobre a pesquisa pendente (guia §5.10).
 *
 * "Pendente" é decidido aqui, no cliente: são no máximo três pesquisas por
 * paciente (uma por marco), então não vale um anti-join no PostgREST. Com
 * mais de uma pendente, vale a mais recente — é a que conversa com o momento
 * atual do tratamento.
 */
export async function getPendingNpsSurvey(): Promise<NpsSurvey | null> {
  const client = requireSupabase();

  const { data, error } = await client
    .from('nps_surveys')
    .select(NPS_SURVEY_SELECT)
    .order('triggered_at', { ascending: false });

  if (error) {
    throw appError('Não foi possível verificar a pesquisa de satisfação.', error);
  }

  const pending = (data as unknown as NpsSurveyRow[]).find((row) => !isNpsSurveyAnswered(row));

  if (!pending) return null;

  return {
    id: pending.id,
    milestoneLabel: pending.treatment_phases?.label ?? 'Pesquisa de satisfação',
  };
}

/**
 * Registra a resposta da pesquisa.
 *
 * `.insert()` direto: `nps_responses` está na lista fechada de escrita direta
 * (README §6), e a política só aceita a pesquisa do próprio titular. A
 * resposta é única e final — o banco recusa a segunda (UNIQUE em
 * `survey_id`) e qualquer UPDATE/DELETE, por isso não existe edição.
 */
export async function submitNpsResponse({
  surveyId,
  score,
  comment,
}: NpsResponseInput): Promise<ApiSuccessResult> {
  const client = requireSupabase();
  const trimmedComment = comment?.trim();

  const { error } = await client.from('nps_responses').insert({
    survey_id: surveyId,
    score,
    // CHECK do banco: comentário é NULL ou tem conteúdo — string vazia é recusada.
    comment: trimmedComment ? trimmedComment : null,
  });

  if (error) {
    // O ERRO INTEIRO, e não `error.code`: `appError` extrai o código do objeto
    // da causa (`readCode`), e um código passado como string cai no ramo "não é
    // objeto" e vira `app`. Com isso o `23505` se perdia, e a tela que trata
    // "já foi respondida" virava código morto.
    //
    // 23505: já existe resposta para esta pesquisa (outro aparelho, toque duplo).
    if (error.code === '23505') {
      throw appError('Esta pesquisa já foi respondida.', error);
    }
    throw appError('Não foi possível enviar sua resposta. Tente novamente.', error);
  }

  return { success: true };
}
