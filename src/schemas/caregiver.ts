import { z } from 'zod';
import { unmask } from '../utils/masks';

// Schema do convite de cuidador.
//
// Fica fora da tela pela mesma razão dos schemas de auth: a regra de o que é
// um destino válido depende do canal escolhido, e isso é regra de negócio —
// mandar um telefone incompleto para `invite_caregiver` queima o convite (o
// token não se reemite) e ainda grava o contato errado de um terceiro.

/** Dígitos de um celular brasileiro: DDD + 9 dígitos. */
const PHONE_DIGITS = 11;

export const inviteCaregiverSchema = z
  .object({
    canal: z.enum(['sms', 'email'], 'Selecione como enviar o convite.'),
    destino: z.string().trim().min(1, 'Informe o contato do cuidador.'),
  })
  // `superRefine` e não união discriminada: o formulário troca de canal com o
  // campo já preenchido, e a união faria o erro apontar para o objeto inteiro
  // em vez de para o campo que o usuário está vendo.
  .superRefine((valores, ctx) => {
    if (valores.canal === 'sms') {
      if (unmask(valores.destino).length !== PHONE_DIGITS) {
        ctx.addIssue({
          code: 'custom',
          path: ['destino'],
          message: 'Informe um celular válido com DDD.',
        });
      }
      return;
    }

    if (!z.email().safeParse(valores.destino).success) {
      ctx.addIssue({
        code: 'custom',
        path: ['destino'],
        message: 'Informe um e-mail válido.',
      });
    }
  });

export type InviteCaregiverFormValues = z.infer<typeof inviteCaregiverSchema>;

/**
 * Tamanho do token emitido por `invite_caregiver`: 32 bytes em hexadecimal.
 *
 * Validar o formato aqui poupa uma ida ao servidor com um código obviamente
 * truncado — mas quem decide se o convite vale é o banco, comparando o
 * SHA-256. Um código com o formato certo e conteúdo errado tem de chegar lá.
 */
const TOKEN_LENGTH = 64;

export const acceptInvitationSchema = z.object({
  token: z
    .string()
    .trim()
    // Espaço no meio é o acidente típico de colar de um SMS quebrado em duas
    // linhas — limpar antes de medir evita rejeitar um código válido.
    .transform((valor) => valor.replace(/\s+/g, ''))
    .pipe(
      z
        .string()
        .min(1, 'Informe o código do convite.')
        .regex(
          new RegExp(`^[0-9a-fA-F]{${TOKEN_LENGTH}}$`),
          'Código inválido. Confira se ele foi copiado por inteiro.'
        )
    ),
});

export type AcceptInvitationFormValues = z.infer<typeof acceptInvitationSchema>;
