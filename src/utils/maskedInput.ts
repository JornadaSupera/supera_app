import type { ChangeEvent } from 'react';

// Máscara aplicada enquanto a pessoa digita, sem roubar o cursor.
//
// O problema que isto resolve: reescrever o valor do campo — `setValue` do
// React Hook Form faz `input.value = ...` — colapsa a seleção para o fim do
// texto. Quem digita o CPF inteiro não percebe, porque o cursor já estava lá;
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
 * Monta o `onChange` de um campo mascarado.
 *
 * `format` é a máscara do domínio (`formatCPF`, `formatPhone`…) e `commit`
 * grava o valor formatado — normalmente o `setValue` do formulário. O cursor
 * é reposicionado depois da gravação, sobre o mesmo dígito em que estava.
 *
 * Só serve a `<input>` que aceita seleção de texto. Em `type="number"`,
 * `type="email"` e afins o navegador devolve `selectionStart` nulo; aí o
 * cursor cai no fim, que é o comportamento de antes — nunca um erro.
 *
 * @example
 * register('cpf', { onChange: maskedChangeHandler(formatCPF, (v) => setValue('cpf', v)) })
 */
export function maskedChangeHandler(
  format: (value: string) => string,
  commit: (masked: string) => void
) {
  return (event: ChangeEvent<HTMLInputElement>): void => {
    const input = event.target;
    const caret = input.selectionStart;
    const masked = format(input.value);

    if (caret === null) {
      commit(masked);
      return;
    }

    const digitsBeforeCaret = countDigits(input.value.slice(0, caret));

    commit(masked);

    // O campo é não controlado (o `register` entrega `ref`, não `value`), então
    // o React não reescreve o valor depois desta linha e o cursor fica onde
    // for posto aqui.
    const position = positionAfterDigits(masked, digitsBeforeCaret);
    input.setSelectionRange(position, position);
  };
}
