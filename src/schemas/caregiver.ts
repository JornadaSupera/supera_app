import { z } from 'zod';
import { isValidPhone } from '../utils/validators';

// Schemas do acompanhante: os formulários do titular e a forma das respostas
// do banco. Validar a resposta é proposital — as funções do item 30 ainda não
// existem, e uma resposta fora do combinado tem de virar erro claro, não tela
// com dado faltando.

/** Nome do acompanhante, do jeito que a mensagem de acesso o chama. */
export const caregiverNameSchema = z
  .string()
  .trim()
  .min(2, 'Informe o nome completo.')
  .max(120, 'O nome pode ter no máximo 120 caracteres.');

/** Celular com DDD. Só o formato: quem o aceita de verdade é o servidor. */
export const caregiverPhoneSchema = z
  .string()
  .trim()
  .min(1, 'Informe o celular.')
  .refine(isValidPhone, 'Informe o celular com DDD, ex.: (49) 99999-9999.');

/** Criar o acompanhante: nome, celular, e-mail (é o login) e como enviar o acesso. */
export const caregiverSchema = z.object({
  fullName: caregiverNameSchema,
  phone: caregiverPhoneSchema,
  email: z.string().trim().min(1, 'Informe o e-mail.').pipe(z.email('Informe um e-mail válido.')),
  delivery: z.enum(['whatsapp', 'sms']),
});

export type CaregiverFormValues = z.infer<typeof caregiverSchema>;

/** Editar o acompanhante: só nome e telefone (o e-mail é o login e não muda). */
export const caregiverEditSchema = z.object({
  fullName: caregiverNameSchema,
  phone: caregiverPhoneSchema,
});

export type CaregiverEditFormValues = z.infer<typeof caregiverEditSchema>;

// ------------------------------------------------------------------ respostas do banco

/** Resposta de `create-caregiver` e de `reset-caregiver-password`. */
export const caregiverAccessResponseSchema = z.object({
  caregiver_account_id: z.string().min(1),
  // Vazia vale como ausente: no SMS o servidor manda `null` (ou nada).
  temporary_password: z
    .string()
    .nullish()
    .transform((value) => value || null),
  temporary_password_expires_at: z.string().min(1),
});

/** Uma linha de `get_my_caregiver()`. */
export const myCaregiverRowSchema = z.object({
  caregiver_account_id: z.string().min(1),
  full_name: z.string().nullable(),
  phone: z.string().nullable(),
  email: z.string().min(1),
  linked_at: z.string().min(1),
  // `NULL` (a marca some do token em vez de virar `false`) vale como "já trocou".
  // Só o id e o e-mail são estritos: uma falha aqui derrubaria a tela toda,
  // inclusive o "Revogar acesso".
  password_is_temporary: z
    .boolean()
    .nullish()
    .transform((value) => value ?? false),
  temporary_password_expires_at: z.string().nullable().optional(),
});

/** Corpo de um erro das Edge Functions: `{ error: '<código>' }` (e, no `sms_failed`, a conta criada). */
export const caregiverErrorBodySchema = z.object({
  error: z.string().optional(),
  caregiver_account_id: z.string().optional(),
  temporary_password_expires_at: z.string().optional(),
});
