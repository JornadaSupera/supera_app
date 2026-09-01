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

export const passwordResetRequestSchema = z.object({
  identifier: z.string().min(1, 'Informe seu e-mail ou celular.'),
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
 * Criação de conta.
 *
 * Só o acompanhante usa este caminho hoje: o cadastro do paciente é ativação
 * de uma linha que a clínica já criou, e não auto-cadastro. Para o
 * acompanhante o inverso é verdade — o perfil dele nasce do aceite do
 * convite, então a conta precisa existir antes.
 *
 * O nome é obrigatório aqui, embora `accounts.full_name` seja nulável: quem
 * acompanha aparece para a equipe na ficha do paciente, e uma linha sem nome
 * não serve a ninguém.
 */
export const signUpSchema = z
  .object({
    fullName: z.string().trim().min(2, 'Informe seu nome completo.'),
    email: z.email('Informe um e-mail válido.'),
    password: z
      .string()
      .min(MIN_PASSWORD_LENGTH, `A senha precisa ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres.`),
    confirmPassword: z.string().min(1, 'Confirme sua senha.'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'As senhas não coincidem.',
    path: ['confirmPassword'],
  });

export type SignUpFormValues = z.infer<typeof signUpSchema>;

/**
 * Distingue e-mail de celular no campo único da recuperação de senha.
 *
 * A recuperação por SMS não existe no backend (o projeto tem TOTP habilitado,
 * SMS não), então a tela precisa saber a diferença para dizer isso à pessoa
 * em vez de prometer um SMS que nunca chega. Deliberadamente frouxo: o
 * objetivo é rotear a mensagem, não validar o endereço — quem valida é o
 * servidor de e-mail.
 */
export function looksLikeEmail(identifier: string): boolean {
  return identifier.includes('@');
}
