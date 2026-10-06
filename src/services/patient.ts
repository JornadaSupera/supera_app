// Ficha do paciente: dados pessoais e clínicos que a RLS deixa a sessão ler.
//
// Nenhuma página fala com o Supabase direto: toda leitura e escrita passa pelos
// serviços, sob a RLS da sessão, e devolve os formatos de `src/types/` — as telas
// não conhecem nome de coluna nem forma de embed.
import { appError } from '../lib/appError';
import { fromInternationalPhone, toInternationalPhone } from '../utils/phone';
import { requireSupabase } from './supabaseClient';
import type { Patient } from '../types';

interface PatientDiagnosisRow {
  staging: string | null;
  cid10: { code: string; label: string } | null;
}

/**
 * Uma linha de `get_my_ward()` — o tutelado como o acompanhante o enxerga.
 * Nenhum identificador, nenhum contato: o banco projeta só estes quatro campos.
 */
interface WardRow {
  patient_id: string;
  full_name: string;
  treatment_phase_id: string | null;
  is_active: boolean;
}

interface TreatmentPlanRow {
  protocol_name: string;
  cycles_planned: number | null;
  current_cycle_number: number | null;
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
/**
 * O celular em 11 dígitos nacionais, venha de onde vier: a ficha guarda só os
 * dígitos, a conta guarda `+55…`. A máscara da tela (`maskPhone`) lê o DDD dos
 * dois primeiros dígitos — com o `+55` na frente, mostrava "(55)".
 */
function nationalPhone(raw: string | null | undefined): string | null {
  return raw ? fromInternationalPhone(toInternationalPhone(raw)) : null;
}

export async function getPatient(patientId: string, actingAsCaregiver = false): Promise<Patient> {
  const client = requireSupabase();

  // A FICHA CADASTRAL TEM DOIS CAMINHOS, e isso é do banco, não da tela.
  //
  // O titular lê a própria linha de `patients` inteira. O acompanhante NÃO lê
  // mais essa linha: `patients_select_caregiver` saiu em 25/09/2026
  // (`20260925165357_restrict_caregiver_patient_read.sql`), e o que ele recebe
  // vem de `get_my_ward()` — id, nome, fase e situação, sem CPF, contato,
  // nascimento, convênio nem documentos.
  //
  // Antes disso o acompanhante lia CPF, telefone e e-mail completos e a tela só
  // os escondia: o valor integral chegava ao cliente e ao cache. Agora ele nem
  // sai do banco. Manter o `.single()` para os dois lados faria a ficha do
  // acompanhante falhar com "nenhuma linha" — erro, e não ausência de dado.
  const patientResult = actingAsCaregiver
    ? await client.rpc('get_my_ward')
    : await client
        .from('patients')
        .select('full_name, cpf, birth_date, phone, accounts(email, phone)')
        .eq('id', patientId)
        .single();

  const [diagnosisResult, planResult, historyResult] = await Promise.all([
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
      .select('protocol_name, cycles_planned, current_cycle_number')
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
    throw appError('Não foi possível carregar seu cadastro.', patientResult.error);
  }

  if (diagnosisResult.error || planResult.error || historyResult.error) {
    throw appError('Não foi possível carregar seu quadro clínico.', diagnosisResult.error);
  }

  // `get_my_ward()` devolve uma lista (zero ou uma linha); a leitura do titular
  // devolve a linha. Vazia é "o vínculo saiu ou ainda está pendente".
  const record = (
    actingAsCaregiver ? (patientResult.data as unknown as WardRow[])[0] : patientResult.data
  ) as unknown as
    | {
        full_name: string;
        cpf?: string;
        birth_date?: string;
        phone?: string | null;
        accounts?: { email: string; phone: string | null } | null;
      }
    | undefined;

  if (!record) {
    throw appError('Não foi possível carregar o cadastro de quem você acompanha.');
  }

  const diagnosisRow = diagnosisResult.data as unknown as PatientDiagnosisRow | null;
  const planRow = planResult.data as unknown as TreatmentPlanRow | null;
  const historyRows = (historyResult.data ?? []) as unknown as ClinicalHistoryRow[];

  return {
    id: patientId,
    name: record.full_name,
    // `null` na sessão do acompanhante: o banco não entrega estes quatro, e o
    // app não inventa o que não recebeu.
    cpf: record.cpf ?? null,
    birthDate: record.birth_date ?? null,
    // O celular da FICHA (a recepção cadastra, e é por ele que a conta se liga)
    // vem primeiro; o que a pessoa digitou no cadastro, só na falta dele.
    phone: nationalPhone(record.phone) ?? nationalPhone(record.accounts?.phone),
    email: record.accounts?.email ?? null,
    diagnosis: diagnosisRow?.cid10
      ? { cid: diagnosisRow.cid10.code, description: diagnosisRow.cid10.label }
      : null,
    protocol: planRow?.protocol_name ?? null,
    cyclesPlanned: planRow?.cycles_planned ?? null,
    currentCycle: planRow?.current_cycle_number ?? null,
    stage: diagnosisRow?.staging ?? null,
    allergies: historyRows.filter((row) => row.kind === 'allergy').map((row) => row.description),
    previousReactions: historyRows
      .filter((row) => row.kind === 'prior_reaction')
      .map((row) => row.description),
  };
}
