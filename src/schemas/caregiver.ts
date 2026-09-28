import { z } from 'zod';
import { isBrazilianMobile } from '../utils/phone';
import { isCaregiverScope } from '../utils/caregiverScopes';
import type { CaregiverScope } from '../types';

// Schemas do acompanhante: os formulários do titular e a forma das respostas
// do banco.
//
// Validar a resposta é proposital: uma resposta fora do combinado tem de virar
// erro claro, não tela com dado faltando. Os campos abaixo espelham, um a um,
// o que as Edge Functions respondem (`supabase/functions/`) e o que
// `get_my_caregiver()` devolve — guia do banco §5.2.

/** Nome do acompanhante, do jeito que a mensagem de acesso o chama. */
export const caregiverNameSchema = z
  .string()
  .trim()
  .min(2, 'Informe o nome completo.')
  .max(120, 'O nome pode ter no máximo 120 caracteres.');

/**
 * Celular com DDD, pela mesma regra do banco (`private.normalize_br_phone`):
 * só celular, DDD sem zero e nono dígito. Recusar aqui evita gastar uma
 * chamada e mostrar `invalid_phone` num aviso solto depois.
 */
export const caregiverPhoneSchema = z
  .string()
  .trim()
  .min(1, 'Informe o celular.')
  .refine(isBrazilianMobile, 'Informe um celular com DDD, ex.: (49) 99999-9999. Fixo não recebe SMS nem WhatsApp.');

/**
 * Criar o acompanhante: nome, celular, e-mail (é o login), como enviar o acesso
 * e a autorização explícita do titular.
 *
 * `authorized` não vai para o servidor — o ato que o banco registra é a própria
 * criação do vínculo, feita com o JWT do titular. Ele existe para que conceder
 * acesso aos próprios dados de saúde seja uma decisão deliberada, e não o
 * efeito de preencher três campos e tocar num botão.
 */
export const caregiverSchema = z.object({
  fullName: caregiverNameSchema,
  phone: caregiverPhoneSchema,
  email: z.string().trim().min(1, 'Informe o e-mail.').pipe(z.email('Informe um e-mail válido.')),
  delivery: z.enum(['whatsapp', 'sms']),
  /**
   * As áreas liberadas, uma chave por área. Só vai ao servidor quando o banco
   * tem o controle por área; sem ele, a tela nem mostra os interruptores.
   */
  scopes: z.record(z.string(), z.boolean()),
  // Só `true` passa.
  authorized: z.boolean().refine((value) => value, {
    message: 'Confirme a autorização para criar o acesso.',
  }),
});

export type CaregiverFormValues = z.infer<typeof caregiverSchema>;

/** Editar o acompanhante: só nome e telefone (o e-mail é o login e não muda). */
export const caregiverEditSchema = z.object({
  fullName: caregiverNameSchema,
  phone: caregiverPhoneSchema,
});

export type CaregiverEditFormValues = z.infer<typeof caregiverEditSchema>;

/**
 * Mínimo da senha do primeiro acesso do acompanhante.
 *
 * NÃO é o mínimo do app (8, `MIN_PASSWORD_LENGTH`): quem recusa aqui é a Edge
 * Function `complete-first-password`, que exige 10 caracteres com letra e
 * dígito (`weak(p)` no `index.ts`). Pedir menos faria o formulário aceitar uma
 * senha que o servidor devolve como `weak_password`.
 */
export const FIRST_PASSWORD_MIN_LENGTH = 10;

const firstPasswordSchema = z
  .string()
  .min(FIRST_PASSWORD_MIN_LENGTH, `A senha precisa ter pelo menos ${FIRST_PASSWORD_MIN_LENGTH} caracteres.`)
  .regex(/[A-Za-z]/, 'A senha precisa ter pelo menos uma letra.')
  .regex(/[0-9]/, 'A senha precisa ter pelo menos um número.');

/** Primeiro acesso do acompanhante: escolher a senha definitiva. */
export const caregiverFirstPasswordSchema = z
  .object({
    password: firstPasswordSchema,
    confirmPassword: z.string().min(1, 'Confirme sua nova senha.'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'As senhas não coincidem.',
    path: ['confirmPassword'],
  });

export type CaregiverFirstPasswordFormValues = z.infer<typeof caregiverFirstPasswordSchema>;

// ------------------------------------------------------------------ respostas do banco

const deliverySchema = z.enum(['whatsapp', 'sms']);

/**
 * Resposta de `create-caregiver` (201) e de `reset-caregiver-password` (200).
 *
 * Quatro formas, um schema só, porque as diferenças são campos ausentes:
 * - criar + WhatsApp → `{ link_id, login, temporary_password, expires_at, delivery }`
 * - criar + SMS      → `{ link_id, expires_at, delivery, phone_masked }`
 * - nova senha + WhatsApp → sem `link_id` (o vínculo já existia)
 * - nova senha + SMS      → sem `link_id` e sem `login`
 *
 * Só `expires_at` é exigido: é o que toda tela precisa e o que as quatro trazem.
 */
export const caregiverAccessResponseSchema = z.object({
  link_id: z.string().min(1).nullish(),
  login: z.string().min(1).nullish(),
  // Vazia vale como ausente: no SMS o servidor não manda senha nenhuma.
  temporary_password: z
    .string()
    .nullish()
    .transform((value) => value || null),
  expires_at: z.string().min(1),
  delivery: deliverySchema.nullish(),
  phone_masked: z.string().nullish(),
});

/** Uma linha de `get_my_caregiver()` — as nove colunas do `RETURNS TABLE`. */
export const myCaregiverRowSchema = z.object({
  link_id: z.string().min(1),
  caregiver_account_id: z.string().min(1),
  full_name: z.string().nullable(),
  email: z.string().min(1),
  phone: z.string().nullable(),
  // A função só devolve vínculo em `pending` ou `active`; `revoked` fica no
  // histórico. Aceitar os três evita que um valor novo derrube a tela toda.
  status: z.enum(['pending', 'active', 'revoked']),
  granted_at: z.string().min(1),
  activated_at: z.string().nullable(),
  // Só vem preenchida enquanto o vínculo espera a troca da senha.
  temporary_password_expires_at: z.string().nullable(),
});

/**
 * Corpo de um erro das Edge Functions.
 *
 * No `sms_failed` da criação vem `link_id` (a conta e o vínculo pendente
 * existem) e `expires_at`; quando o provedor de SMS não está configurado vem
 * `detail: 'sms_provider_not_configured'` e nada mais — nada foi criado.
 */
export const caregiverErrorBodySchema = z.object({
  error: z.string().optional(),
  detail: z.string().optional(),
  link_id: z.string().optional(),
  expires_at: z.string().optional(),
});

// ------------------------------------------------------------------ áreas do acompanhante ([BANCO 32])

/**
 * Uma área, tolerante a valor novo: um código que o app ainda não conhece é
 * descartado em vez de derrubar a tela inteira — o banco pode ganhar uma área
 * antes de o app saber desenhá-la.
 */
const knownScope = z.string().transform((value, ctx): CaregiverScope => {
  if (isCaregiverScope(value)) return value;
  ctx.addIssue({ code: 'custom', message: `área desconhecida: ${value}` });
  return z.NEVER;
});

/** As linhas de `get_caregiver_scopes()`: `{ scope, enabled, updated_at }`. Linhas de área desconhecida saem. */
export const caregiverScopeRowsSchema = z
  .array(
    z.object({
      scope: z.string(),
      enabled: z.boolean(),
      updated_at: z.string().nullish(),
    })
  )
  .transform((rows) =>
    rows.flatMap((row) =>
      isCaregiverScope(row.scope) ? [{ scope: row.scope, enabled: row.enabled, updated_at: row.updated_at ?? null }] : []
    )
  );

/**
 * As linhas de `get_my_ward_scopes()`. Aceita as duas formas que o PostgREST
 * pode devolver para uma função de uma coluna — `["diary", …]` ou
 * `[{ "scope": "diary" }, …]` —, porque um contrato de uma coluna só costuma
 * mudar de forma sem ninguém perceber.
 */
export const wardScopeRowsSchema = z
  .array(z.union([z.string(), z.object({ scope: z.string() })]))
  .transform((rows) =>
    rows.flatMap((row) => {
      const value = typeof row === 'string' ? row : row.scope;
      return knownScope.safeParse(value).success ? [value as CaregiverScope] : [];
    })
  );
