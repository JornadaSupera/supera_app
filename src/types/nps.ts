// Tipos do domínio NPS — cobre `src/mocks/nps.js` (array vazio hoje) e o
// formato que `enviarRespostaNps` (mockApi.js) grava nele.

/**
 * 0–10, conforme o comentário do JSDoc de `enviarRespostaNps`
 * ("`nota` de 0 a 10") e o módulo 12 do CLAUDE.md ("Nota 0–10"). `nps.js`
 * está vazio no momento (`const respostasNps = [];`) — não há nenhuma
 * amostra real de `nota`; esta union vem só da documentação, não de dados
 * observados.
 */
export type NpsScore = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

/**
 * Resposta de NPS persistida — forma de cada item que `enviarRespostaNps`
 * empilha em `respostasNps` (`respostasNps.push({ id, nota, comentario,
 * respondidoEm })`). `comentario` é sempre `string` aqui: o corpo da função
 * faz `comentario: comentario || ''`, garantindo o valor mesmo quando a
 * entrada não informa nada — por isso não é opcional, diferente de
 * `NpsAnswerInput.comentario`.
 */
export interface NpsAnswer {
  id: string;
  nota: NpsScore;
  comentario: string;
  /** ISO 8601 completo (data + hora), ex.: '2026-08-25T14:30:00.000Z' — vem de `new Date().toISOString()`. */
  respondidoEm: string;
}

/** Entrada de `enviarRespostaNps`. */
export interface NpsAnswerInput {
  nota: NpsScore;
  comentario?: string;
}
