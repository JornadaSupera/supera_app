import { z } from 'zod';

/**
 * Tamanho do token dos convites (paciente e acompanhante): 32 bytes em
 * hexadecimal.
 *
 * Validar o formato aqui poupa uma ida ao servidor com um código obviamente
 * truncado — mas quem decide se o convite vale é o banco, comparando o
 * SHA-256. Um código com o formato certo e conteúdo errado tem de chegar lá.
 */
const TOKEN_LENGTH = 64;

/** Código de convite colado pela pessoa. */
export const invitationTokenSchema = z
  .string()
  .trim()
  // Espaço no meio é o acidente típico de colar de um SMS quebrado em duas
  // linhas — limpar antes de medir evita rejeitar um código válido. Minúsculas
  // porque o banco emite o hex em minúsculas e compara o hash byte a byte: o
  // mesmo código em maiúsculas passaria no formato e seria recusado lá.
  .transform((value) => value.replace(/\s+/g, '').toLowerCase())
  .pipe(
    z
      .string()
      .min(1, 'Informe o código do convite.')
      .regex(
        new RegExp(`^[0-9a-f]{${TOKEN_LENGTH}}$`),
        'Código inválido. Confira se ele foi copiado por inteiro.'
      )
  );
