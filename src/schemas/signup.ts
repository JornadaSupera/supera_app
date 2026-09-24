import { z } from 'zod';
import { isValidBirthDate, isValidCPF, isValidPhone } from '../utils/validators';
import { ageInYears } from '../utils/date';
import { MIN_PASSWORD_LENGTH } from './auth';

// Schemas do cadastro do paciente: uma tela só, com os dados da pessoa, o
// acesso ao app e o aceite dos termos — mais o código do SMS, que vem depois
// (quando a verificação do celular estiver ligada).

/**
 * Idade mínima para o paciente usar o app — decisão de produto (22/09/2026),
 * atendendo a "validação em tempo real: … idade mínima" do mapa contratado.
 */
export const MIN_PATIENT_AGE = 18;

/**
 * CPF do paciente: só formato e dígito verificador. Quem confere se ele bate
 * com a ficha é o banco.
 */
export const cpfSchema = z
  .string()
  .trim()
  .min(1, 'Informe seu CPF.')
  .refine(isValidCPF, 'Informe um CPF válido.');

/**
 * Data de nascimento do paciente.
 *
 * Nunca pode chegar vazia ao banco: com a data nula a conferência do
 * nascimento deixa de valer e a ficha seria ligada só pelo CPF.
 */
export const birthDateSchema = z
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
  });

/**
 * Cadastro completo, numa tela: dados, acesso e aceite.
 *
 * O nome é obrigatório embora `accounts.full_name` seja nulável: é desse campo
 * que a saudação da Home lê o nome do paciente.
 */
export const signupSchema = z
  .object({
    fullName: z.string().trim().min(2, 'Informe seu nome completo.'),
    cpf: cpfSchema,
    birthDate: birthDateSchema,
    phone: z
      .string()
      .trim()
      .min(1, 'Informe seu celular.')
      .refine(isValidPhone, 'Informe o celular com DDD, ex.: (49) 99999-9999.'),
    email: z.email('Informe um e-mail válido.'),
    password: z
      .string()
      .min(MIN_PASSWORD_LENGTH, `A senha precisa ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres.`),
    confirmPassword: z.string().min(1, 'Confirme sua senha.'),
    // Só `true` passa: é o aceite do texto que a pessoa pode abrir e ler.
    acceptedTerms: z.boolean().refine((accepted) => accepted, {
      message: 'Aceite os Termos de Uso e a Política de Privacidade para criar a conta.',
    }),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'As senhas não coincidem.',
    path: ['confirmPassword'],
  });

export type SignupFormValues = z.infer<typeof signupSchema>;

/** Código de 6 números que chega por SMS. */
export const PHONE_CODE_LENGTH = 6;

export const phoneCodeSchema = z.object({
  code: z
    .string()
    .trim()
    .regex(new RegExp(`^[0-9]{${PHONE_CODE_LENGTH}}$`), `Digite os ${PHONE_CODE_LENGTH} números do código.`),
});

export type PhoneCodeFormValues = z.infer<typeof phoneCodeSchema>;
