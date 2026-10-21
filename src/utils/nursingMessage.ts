/**
 * A mensagem que o paciente (ou o acompanhante) manda à enfermagem pelo
 * WhatsApp — o canal em que a clínica atende desde 21/10, no lugar do chat do
 * app.
 *
 * Feita para quem recebe achar o paciente e entender o pedido sem perguntar
 * de volta — nem sempre é o mesmo profissional que responde (pedido de 21/10):
 * quem é (nome completo e data de nascimento, os dois identificadores do
 * protocolo de identificação segura do paciente), o diagnóstico principal, o
 * assunto e a dúvida. Sem CPF: a mensagem sai do app e passa pelo WhatsApp, e
 * nome com nascimento bastam para achar a ficha. Tom de serviço de saúde, como
 * a mensagem do acompanhante: sem emoji, sem exclamação.
 */

export interface NursingMessageInput {
  /** O nome da ficha (`patients.full_name`). */
  patientName: string;
  /** `YYYY-MM-DD`. `null` na sessão do acompanhante: o banco não lhe entrega. */
  patientBirthDate: string | null;
  /**
   * O diagnóstico principal da ficha. `null` sem CID lançado — e para o
   * acompanhante sem a ficha clínica compartilhada, a quem a RLS não o mostra.
   */
  diagnosis?: { cid: string; description: string } | null;
  /** Quem escreve, quando é o acompanhante (o nome da conta dele). */
  caregiverName?: string | null;
  /** O rótulo do assunto (`conversation_subjects.label`). */
  subject: string;
  question: string;
}

/** `1970-05-10` → `10/05/1970`, sem passar por fuso (é uma data, não um instante). */
function formatBirthDate(isoDate: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : null;
}

export function buildNursingMessage({
  patientName,
  patientBirthDate,
  diagnosis,
  caregiverName,
  subject,
  question,
}: NursingMessageInput): string {
  const birth = patientBirthDate ? formatBirthDate(patientBirthDate) : null;
  const patient = birth ? `${patientName.trim()} (nascimento: ${birth})` : patientName.trim();
  const who = caregiverName?.trim()
    ? `Sou ${caregiverName.trim()}, acompanhante de ${patient}, paciente da Supera Oncologia.`
    : `Sou ${patient}, paciente da Supera Oncologia.`;

  return [
    'Olá, enfermagem.',
    who,
    ...(diagnosis ? [`Diagnóstico: ${diagnosis.cid} · ${diagnosis.description}`] : []),
    '',
    `Assunto: ${subject.trim()}`,
    `Dúvida: ${question.trim()}`,
    '',
    'Mensagem enviada pelo app Jornada Supera.',
  ].join('\n');
}
