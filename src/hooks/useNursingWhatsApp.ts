import { useMutation } from '@tanstack/react-query';
import { prepareWhatsApp, type WhatsAppLaunch } from '../services/whatsapp';
import { NURSING_PHONE, NURSING_WHATSAPP_E164 } from '../lib/clinicContacts';
import { buildNursingMessage } from '../utils/nursingMessage';
import { useToast } from '../contexts/ToastContext';
import { useSessionStore } from '../stores/sessionStore';
import { usePatient } from './usePatient';

// O "Falar com a equipe" do app desde 21/10: a clínica atende pelo WhatsApp da
// enfermagem, e o Chat abre a conversa lá com a mensagem pronta. Nada vai ao
// banco — quem envia é a própria pessoa, tocando em "enviar" no WhatsApp.

interface SendVariables {
  launch: WhatsAppLaunch;
  subject: string;
  question: string;
}

/**
 * Abre o WhatsApp da enfermagem com quem é o paciente, o assunto e a dúvida.
 *
 * `ready` espera a ficha: sem ela a mensagem sairia sem o nome do paciente, e a
 * enfermagem teria de perguntar quem é. `send` precisa ser chamado NO TOQUE: no
 * computador, a aba do WhatsApp Web é reservada ali (ver `prepareWhatsApp`).
 */
export function useNursingWhatsApp() {
  const { data: patient } = usePatient();
  const isCaregiver = useSessionStore((state) => state.isCaregiver);
  const accountName = useSessionStore((state) => state.fullName);
  const { showToast } = useToast();

  const mutation = useMutation({
    mutationFn: async ({ launch, subject, question }: SendVariables) => {
      if (!patient) throw new Error('Ainda carregando os seus dados. Tente de novo em instantes.');

      const text = buildNursingMessage({
        patientName: patient.name,
        patientBirthDate: patient.birthDate,
        diagnosis: patient.diagnosis,
        caregiverName: isCaregiver ? accountName : null,
        subject,
        question,
      });

      if (!(await launch.open(NURSING_WHATSAPP_E164, text))) {
        throw new Error(
          `Não foi possível abrir o WhatsApp. Ligue para a enfermagem: ${NURSING_PHONE.display}.`
        );
      }
    },
    onError: (error, { launch }) => {
      launch.cancel();
      showToast(error.message, { variant: 'error' });
    },
  });

  return {
    ready: Boolean(patient),
    isPending: mutation.isPending,
    send: (subject: string, question: string, options?: { onSuccess?: () => void }) => {
      const launch = prepareWhatsApp();
      mutation.mutate({ launch, subject, question }, { onSuccess: options?.onSuccess });
    },
  };
}
