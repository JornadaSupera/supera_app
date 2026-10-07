import { AppError, appError } from '../lib/appError';
import { EXPORT_WINDOW_DAYS } from '../utils/dataSubject';
import { buildDataExportPdf, type ExportReferenceNames } from '../utils/dataExportPdf';
import { getSymptomPresentation } from '../utils/symptoms';
import { saveAndOpenFile, type SaveFileOutcome } from './deviceFiles';
import { requireSupabase } from './supabaseClient';
import type { ApiSuccessResult, DataExportFormat, DataSubjectExport, DataSubjectRequest } from '../types';

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

interface ReferenceRow {
  id: string;
  code: string;
  label: string;
}

/** Um catálogo de referência; falhar (ou a RLS esconder) vale lista vazia. */
async function readReferenceRows(query: PromiseLike<{ data: unknown }>): Promise<ReferenceRow[]> {
  try {
    const { data } = await query;
    return (data as ReferenceRow[] | null) ?? [];
  } catch {
    return [];
  }
}

/** Os `cid10_id` dos diagnósticos do pacote. */
function exportCid10Ids(exportData: DataSubjectExport): string[] {
  const patient = exportData.patient as { diagnoses?: unknown } | null | undefined;
  if (!Array.isArray(patient?.diagnoses)) return [];
  return patient.diagnoses
    .map((row: unknown) => (row as { cid10_id?: unknown } | null)?.cid10_id)
    .filter((id): id is string => typeof id === 'string');
}

/**
 * O nome do que cada identificador do pacote aponta (o CID, o sintoma, o tipo
 * do compromisso…), para o PDF mostrar o nome em vez do código. Os catálogos
 * pequenos vêm inteiros; do CID, só os diagnósticos do pacote. Nada aqui
 * impede o download: sem o nome, o código só fica de fora do PDF.
 */
async function getExportReferenceNames(exportData: DataSubjectExport): Promise<ExportReferenceNames> {
  const client = requireSupabase();
  const cid10Ids = exportCid10Ids(exportData);

  const [symptoms, cid10, ...catalogs] = await Promise.all([
    readReferenceRows(client.from('symptoms').select('id, code, label')),
    cid10Ids.length
      ? readReferenceRows(client.from('cid10').select('id, code, label').in('id', cid10Ids))
      : Promise.resolve([]),
    readReferenceRows(client.from('appointment_types').select('id, code, label')),
    readReferenceRows(client.from('appointment_statuses').select('id, code, label')),
    readReferenceRows(client.from('conversation_subjects').select('id, code, label')),
    readReferenceRows(client.from('specialties').select('id, code, label')),
    readReferenceRows(client.from('notification_types').select('id, code, label')),
  ]);

  const names: ExportReferenceNames = {};
  catalogs.flat().forEach((row) => {
    names[row.id] = row.label;
  });
  // O seed dos sintomas é sem acento: o rótulo vem do mesmo mapa das telas.
  symptoms.forEach((row) => {
    names[row.id] = getSymptomPresentation(row.code, row.label).label;
  });
  cid10.forEach((row) => {
    names[row.id] = `${row.code} · ${row.label}`;
  });
  return names;
}

/**
 * Baixa o pacote de dados do titular e o grava no aparelho: o PDF para ler ou
 * o JSON para levar a outro serviço. Os dois saem do mesmo `export_my_data`,
 * e cada download fica na trilha do banco.
 *
 * O nome do arquivo não leva nome nem documento de ninguém: ele vai parar na
 * pasta de Documentos do aparelho, que outros apps enxergam.
 *
 * @throws {AppError} `export_window_closed` quando passaram os 15 dias, e
 * `request_not_available` quando o pedido não existe, é de outra conta, é de
 * outro tipo ou ainda não foi deferido — o banco usa a mesma mensagem para os
 * quatro de propósito, e o app não a desmembra.
 */
export async function downloadMyDataExport(
  requestId: string,
  format: DataExportFormat
): Promise<SaveFileOutcome> {
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

  const exportData = data as unknown as DataSubjectExport | null;
  if (!exportData) throw appError('O servidor não devolveu seus dados. Tente de novo.');

  const blob =
    format === 'pdf'
      ? await buildDataExportPdf(exportData, await getExportReferenceNames(exportData))
      : new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });

  return saveAndOpenFile({
    blob,
    fileName: `jornada-supera-meus-dados.${format}`,
    dialogTitle: 'Meus dados',
  });
}

/**
 * Pede a correção dos dados (art. 18, III). Não muda nada na ficha: quem
 * corrige é a equipe do Centro, pelo painel.
 *
 * O pedido já diz o que corrigir: os dados marcados e o que a pessoa escreveu
 * (`requester_note`, até 1000 caracteres, item [34] do banco).
 */
export async function requestDataRectification(note: string): Promise<void> {
  const { error } = await requireSupabase().rpc('request_data_subject_action', {
    p_request_type: 'rectification',
    p_requester_note: note,
  });

  if (error) throw appError('Não foi possível registrar o pedido de correção. Tente de novo.', error);
}

/**
 * Solicita a exportação dos dados do paciente (LGPD).
 */
export async function requestDataExport(): Promise<ApiSuccessResult> {
  const client = requireSupabase();

  // 'portability' — cópia dos dados num formato utilizável — é o direito que
  // corresponde ao botão ("receba uma cópia completa"), diferente de
  // 'access' (só consultar o que existe, sem levar cópia).
  const { error } = await client.rpc('request_data_subject_action', {
    p_request_type: 'portability',
  });

  if (error) {
    throw appError('Não foi possível registrar sua solicitação. Tente novamente.', error);
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
export async function requestAccountDeletion(): Promise<ApiSuccessResult> {
  const client = requireSupabase();

  const { error } = await client.rpc('request_data_subject_action', {
    p_request_type: 'deletion',
  });

  if (error) {
    throw appError('Não foi possível registrar sua solicitação. Tente novamente.', error);
  }

  return { success: true };
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
