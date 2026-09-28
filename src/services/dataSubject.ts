import { AppError, appError } from '../lib/appError';
import { EXPORT_WINDOW_DAYS } from '../utils/dataSubject';
import { saveAndOpenFile, type SaveFileOutcome } from './deviceFiles';
import { requireSupabase } from './supabaseClient';
import type { DataSubjectExport, DataSubjectRequest } from '../types';

// Direitos do titular — `data_subject_requests` e `export_my_data`
// (guia do banco §5.19, entregue em 25/09/2026).
//
// Antes disso o app abria o pedido e o assunto morria ali: quem pedia nunca via
// o andamento, nunca lia o motivo de uma recusa (que a LGPD, art. 18 §4, obriga
// a dar) e nunca conseguia baixar o pacote de portabilidade — a janela de 15
// dias corria e vencia sozinha.
//
// **Não há link para o pacote.** `export_my_data` monta o JSON na hora, sob a
// RLS de quem chama, e nada fica guardado em servidor nenhum. Por isso o
// download é local, pelo Filesystem/Share do Capacitor, como o PDF das
// Orientações.

/**
 * Os pedidos do titular, do mais novo ao mais antigo.
 *
 * Leitura direta (`data_subject_requests_select_own`). O acompanhante não lê os
 * do tutelado. **O titular com a conta encerrada continua lendo o próprio
 * pedido** — a política é `account_id = get_my_uid()`, que não olha
 * `is_active` —, e é por ele que o app consegue dizer "conta encerrada a seu
 * pedido" em vez de "fale com a recepção para reativá-la".
 */
export async function getMyDataSubjectRequests(): Promise<DataSubjectRequest[]> {
  const { data, error } = await requireSupabase()
    .from('data_subject_requests')
    .select('id, request_type, status, decision_note, created_at, decided_at, executed_at')
    .order('created_at', { ascending: false });

  if (error) throw appError('Não foi possível carregar seus pedidos.', error);

  return (data ?? []).map((row) => ({
    id: row.id,
    type: row.request_type,
    status: row.status,
    decisionNote: row.decision_note,
    createdAt: row.created_at,
    decidedAt: row.decided_at,
    executedAt: row.executed_at,
  }));
}

/**
 * Baixa o pacote de dados do titular e o grava no aparelho.
 *
 * O nome do arquivo não leva nome nem documento de ninguém: ele vai parar na
 * pasta de Documentos do aparelho, que outros apps enxergam.
 *
 * @throws {AppError} `export_window_closed` quando passaram os 15 dias, e
 * `request_not_available` quando o pedido não existe, é de outra conta, é de
 * outro tipo ou ainda não foi deferido — o banco usa a mesma mensagem para os
 * quatro de propósito, e o app não a desmembra.
 */
export async function downloadMyDataExport(requestId: string): Promise<SaveFileOutcome> {
  const { data, error } = await requireSupabase().rpc('export_my_data', { p_request_id: requestId });

  if (error) {
    const code = error.message?.trim() ?? '';
    if (code === 'export_window_closed') {
      throw new AppError(
        `O prazo de ${EXPORT_WINDOW_DAYS} dias para baixar este pacote venceu. Faça um novo pedido.`,
        code,
        error
      );
    }
    if (code === 'request_not_available') {
      throw new AppError(
        'Este pedido ainda não está liberado para download. Assim que o Centro o analisar, o botão aparece aqui.',
        code,
        error
      );
    }
    throw appError('Não foi possível baixar seus dados agora. Tente de novo.', error);
  }

  const pacote = data as unknown as DataSubjectExport | null;
  if (!pacote) throw appError('O servidor não devolveu seus dados. Tente de novo.');

  const blob = new Blob([JSON.stringify(pacote, null, 2)], { type: 'application/json' });

  return saveAndOpenFile({
    blob,
    fileName: 'jornada-supera-meus-dados.json',
    dialogTitle: 'Meus dados',
  });
}

/**
 * Revoga um consentimento já dado.
 *
 * O banco passou a aceitar o reaceite da MESMA versão depois da revogação
 * (`uq_consent_records_active`, 25/09/2026). Antes disso, quem revogasse ficava
 * preso no portão de consentimento sem conseguir voltar — e era por isso que a
 * tela mandava ligar para o Encarregado de Dados.
 *
 * Depois desta chamada o portão de `RequireAuth` volta a pedir o aceite: é o
 * comportamento correto, porque sem consentimento vigente o app não abre dado
 * clínico.
 */
export async function revokeConsent(consentId: string): Promise<void> {
  const { error } = await requireSupabase().rpc('revoke_consent', { p_consent_id: consentId });

  if (error) throw appError('Não foi possível revogar este consentimento.', error);
}
