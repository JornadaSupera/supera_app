import { z } from 'zod';
import { birthDateSchema, cpfSchema } from './signup';

/**
 * Tamanho do código de ativação que a recepção gera no painel: 32 bytes em
 * hexadecimal.
 *
 * Validar o formato aqui poupa uma ida ao servidor com um código obviamente
 * truncado — mas quem decide se o convite vale é o banco, comparando o
 * SHA-256. Um código com o formato certo e conteúdo errado tem de chegar lá.
 */
export const ACTIVATION_CODE_LENGTH = 64;

/** O que a pessoa colou, sem espaços e em minúsculas: o formato que o banco compara. */
export function normalizeActivationCode(value: string): string {
  // Espaço no meio é o acidente típico de copiar um código que quebrou em duas
  // linhas (o painel o mostra em duas) — limpar antes de medir evita recusar um
  // código válido. Minúsculas porque o banco emite o hex em minúsculas e compara
  // o hash byte a byte: o mesmo código em maiúsculas passaria no formato e seria
  // recusado lá.
  return value.replace(/\s+/g, '').toLowerCase();
}

/** Código de ativação colado pela pessoa. */
export const activationCodeSchema = z
  .string()
  .transform(normalizeActivationCode)
  .pipe(
    z
      .string()
      .min(1, 'Informe o código de ativação.')
      .regex(
        new RegExp(`^[0-9a-f]{${ACTIVATION_CODE_LENGTH}}$`),
        'Código inválido. Confira se ele foi copiado por inteiro.'
      )
  );

/**
 * Confirmação do cadastro: código de ativação + CPF + data de nascimento.
 *
 * A validação aqui é de formato e de regra do produto — dígito verificador do
 * CPF, data real, idade mínima — e não diz nada sobre a ficha. Quem confere se
 * os três batem com o cadastro é o banco.
 */
export const activationSchema = z.object({
  token: activationCodeSchema,
  cpf: cpfSchema,
  birthDate: birthDateSchema,
});

/** O que o formulário guarda (antes da limpeza do código). */
export type ActivationFormValues = z.input<typeof activationSchema>;
/** O que sai do schema e vai ao serviço. */
export type ActivationValues = z.output<typeof activationSchema>;
