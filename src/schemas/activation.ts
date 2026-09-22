import { z } from 'zod';
import { isValidBirthDate, isValidCPF } from '../utils/validators';
import { ageInYears } from '../utils/date';
import { invitationTokenSchema } from './invitation';

/**
 * Idade mínima para o paciente usar o app — decisão de produto (22/09/2026),
 * atendendo a "validação em tempo real: … idade mínima" do mapa contratado.
 */
export const MIN_PATIENT_AGE = 18;

/**
 * Ativação do app pelo paciente: código do convite + CPF + data de
 * nascimento.
 *
 * A validação aqui é de formato e de regra do produto — dígito verificador do
 * CPF, data real no passado, idade mínima — e não diz nada sobre a ficha. Quem confere se os três batem com o
 * cadastro é o banco, e ele responde igual para qualquer divergência.
 */
export const patientActivationSchema = z.object({
  token: invitationTokenSchema,
  cpf: z.string().trim().min(1, 'Informe seu CPF.').refine(isValidCPF, 'Informe um CPF válido.'),
  // Nunca pode chegar vazia à RPC: com a data nula o banco deixa de conferir o
  // nascimento e ativa só com código + CPF.
  birthDate: z
    .string()
    .min(1, 'Informe sua data de nascimento.')
    .superRefine((value, ctx) => {
      if (!isValidBirthDate(value)) {
        ctx.addIssue({ code: 'custom', message: 'Informe uma data de nascimento válida.' });
        return;
      }
      // Menor de idade não tem outro caminho no app hoje: só o titular convida
      // acompanhante. Por isso o texto manda para a recepção, e não para "peça
      // a um responsável".
      if (ageInYears(value) < MIN_PATIENT_AGE) {
        ctx.addIssue({
          code: 'custom',
          message: `Para usar o app é preciso ter ${MIN_PATIENT_AGE} anos ou mais. Se o paciente é menor de idade, fale com a recepção do Centro.`,
        });
      }
    }),
});

export type PatientActivationFormValues = z.infer<typeof patientActivationSchema>;
