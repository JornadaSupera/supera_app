import type { FieldValues, Path, UseFormRegister, UseFormRegisterReturn } from 'react-hook-form';

// Máscara aplicada enquanto a pessoa digita, sem roubar o cursor.
//
// O problema que isto resolve: reescrever o valor do campo (`input.value = ...`)
// colapsa a seleção para o fim do texto. Quem digita o CPF inteiro não percebe, porque o cursor já estava lá;
// quem volta para corrigir um dígito no meio vê o cursor pular, e o próximo
// dígito cai no fim. A correção seguinte também, e o campo vira um
// embaralhado que só se resolve apagando tudo.
//
// A âncora não pode ser a posição em caracteres: a máscara insere e remove
// separadores, então a mesma posição aponta para outro lugar depois de
// formatar. O que sobrevive à formatação é a contagem de DÍGITOS antes do
// cursor — ela não muda quando um ponto entra ou sai.

function countDigits(value: string): number {
  return value.replace(/\D/g, '').length;
}

/**
 * Posição, no texto já mascarado, logo depois do n-ésimo dígito.
 *
 * Com `total` igual a zero devolve 0 — o começo do campo, que é onde o cursor
 * tem de ficar quando a pessoa apaga tudo.
 */
function positionAfterDigits(masked: string, total: number): number {
  if (total <= 0) return 0;

  let seen = 0;

  for (let index = 0; index < masked.length; index += 1) {
    if (/\d/.test(masked[index])) {
      seen += 1;
      if (seen === total) return index + 1;
    }
  }

  return masked.length;
}

/**
 * Aplica a máscara no próprio campo e devolve o cursor ao mesmo dígito.
 *
 * Só serve a `<input>` que aceita seleção de texto. Em `type="number"`,
 * `type="email"` e afins o navegador devolve `selectionStart` nulo; aí o
 * cursor cai no fim, que é o comportamento de antes — nunca um erro.
 */
export function applyMask(input: HTMLInputElement, format: (value: string) => string): void {
  const masked = format(input.value);
  if (masked === input.value) return;

  const caret = input.selectionStart;
  const digitsBeforeCaret = caret === null ? null : countDigits(input.value.slice(0, caret));

  input.value = masked;

  if (digitsBeforeCaret !== null) {
    const position = positionAfterDigits(masked, digitsBeforeCaret);
    input.setSelectionRange(position, position);
  }
}

/**
 * `register` de um campo mascarado (`formatCPF`, `formatPhone`…).
 *
 * A máscara é aplicada no elemento ANTES de o formulário ler o valor. É essa
 * ordem que importa: se o formulário lê o texto cru e só depois a máscara o
 * troca por `setValue`, ele conclui que o valor mudou durante a validação e
 * descarta o resultado — o erro do campo só atualizava ao sair dele, e ficava
 * na tela com o dado já corrigido.
 *
 * @example
 * <Input {...maskedRegister(register, 'cpf', formatCPF)} />
 */
export function maskedRegister<TFieldValues extends FieldValues>(
  register: UseFormRegister<TFieldValues>,
  name: Path<TFieldValues>,
  format: (value: string) => string
): UseFormRegisterReturn<Path<TFieldValues>> {
  const field = register(name);

  return {
    ...field,
    onChange: (event) => {
      applyMask(event.target as HTMLInputElement, format);
      return field.onChange(event);
    },
  };
}
