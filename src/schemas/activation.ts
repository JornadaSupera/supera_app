import { z } from 'zod';
import { isValidBirthDate, isValidCPF } from '../utils/validators';
import { invitationTokenSchema } from './invitation';

/**
 * Ativação do app pelo paciente: código do convite + CPF + data de
 * nascimento.
 *
 * A validação aqui é só de formato — dígito verificador do CPF, data real no
 * passado — e não diz nada sobre a ficha. Quem confere se os três batem com o
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
    .refine(isValidBirthDate, 'Informe uma data de nascimento válida.'),
});

export type PatientActivationFormValues = z.infer<typeof patientActivationSchema>;
