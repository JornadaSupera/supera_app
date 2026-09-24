import { z } from 'zod';

// Schemas de validação dos formulários de autenticação.
//
// Ficam fora das telas porque a mesma regra é usada em mais de um lugar
// (a força mínima de senha vale na recuperação e valerá no cadastro) e
// porque a tela não é o lugar de guardar regra de negócio.

/** Mínimo de caracteres da senha. Regra do produto, não do GoTrue. */
export const MIN_PASSWORD_LENGTH = 8;

export const signInSchema = z.object({
  email: z.email('Informe um e-mail válido.'),
  password: z.string().min(1, 'Informe sua senha.'),
});

export type SignInFormValues = z.infer<typeof signInSchema>;

// Só e-mail: recuperação por SMS não existe enquanto o Auth não tiver envio de
// SMS. O contrato pede "por SMS ou e-mail", e o e-mail sozinho já cumpre o "ou".
export const passwordResetRequestSchema = z.object({
  identifier: z
    .string()
    .trim()
    .min(1, 'Informe seu e-mail.')
    .pipe(z.email('Informe um e-mail válido.')),
});

export type PasswordResetRequestFormValues = z.infer<typeof passwordResetRequestSchema>;

export const newPasswordSchema = z
  .object({
    password: z
      .string()
      .min(MIN_PASSWORD_LENGTH, `A senha precisa ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres.`),
    confirmPassword: z.string().min(1, 'Confirme sua nova senha.'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'As senhas não coincidem.',
    path: ['confirmPassword'],
  });

export type NewPasswordFormValues = z.infer<typeof newPasswordSchema>;

/**
 * Nome exibível da conta: a tela que pede o nome de quem entrou por Google ou
 * Apple e chegou sem ele — a Apple só manda o nome na primeira autorização, e
 * muitas vezes nem aí. O cadastro por e-mail tem a mesma regra de nome em
 * `schemas/signup.ts`.
 */
export const accountNameSchema = z.object({
  fullName: z.string().trim().min(2, 'Informe seu nome completo.'),
});

export type AccountNameFormValues = z.infer<typeof accountNameSchema>;

/**
 * Distingue e-mail de celular no pedido de recuperação de senha.
 *
 * A tela já só aceita e-mail (`passwordResetRequestSchema`); isto é a guarda
 * do service para qualquer outro chamador — a recuperação por SMS não existe
 * no backend (o projeto tem TOTP habilitado, SMS não), e mandar um celular
 * para `resetPasswordForEmail` prometeria um envio que nunca chega.
 * Deliberadamente frouxo: o objetivo é rotear a mensagem, não validar o
 * endereço — quem valida é o servidor de e-mail.
 */
export function looksLikeEmail(identifier: string): boolean {
  return identifier.includes('@');
}
