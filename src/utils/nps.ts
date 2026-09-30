import type { NpsScore } from '../types';

// A carinha de cada nota do NPS (pedido de 28/09: "carinhas baseadas no número").
//
// A escala continua de 0 a 10: é o que o mapa contratado pede ("Nota 0–10") e
// o que o banco aceita (`CHECK (score BETWEEN 0 AND 10)`), além de ser a escala
// do próprio NPS — o 0 é uma resposta válida, e tirá-lo mudaria a conta.
//
// As carinhas vão da decepção ao entusiasmo sem raiva nenhuma: num serviço de
// saúde, a nota baixa é de quem se decepcionou, e uma carinha zangada soaria
// como acusação. Todas existem desde o Unicode 7 e aparecem iguais no Android,
// no iPhone e no computador.

export type NpsCategory = 'detractor' | 'passive' | 'promoter';

export interface NpsScoreFace {
  score: NpsScore;
  emoji: string;
  /** O que a nota quer dizer, em palavras — aparece sob a escala ao escolher. */
  label: string;
}

export const NPS_SCORE_FACES: readonly NpsScoreFace[] = [
  { score: 0, emoji: '😩', label: 'Não recomendaria de jeito nenhum' },
  { score: 1, emoji: '😞', label: 'Não recomendaria' },
  { score: 2, emoji: '😟', label: 'Não recomendaria' },
  { score: 3, emoji: '😔', label: 'Dificilmente recomendaria' },
  { score: 4, emoji: '🙁', label: 'Dificilmente recomendaria' },
  { score: 5, emoji: '😕', label: 'Talvez recomendasse' },
  { score: 6, emoji: '😐', label: 'Talvez recomendasse' },
  { score: 7, emoji: '🙂', label: 'Provavelmente recomendaria' },
  { score: 8, emoji: '😊', label: 'Provavelmente recomendaria' },
  { score: 9, emoji: '😄', label: 'Recomendaria com certeza' },
  { score: 10, emoji: '😍', label: 'Recomendaria com certeza' },
];

/**
 * A faixa do NPS: 0–6 detrator, 7–8 neutro, 9–10 promotor. É a mesma conta que
 * o painel faz com as respostas; aqui ela só pinta a carinha escolhida.
 */
export function npsCategory(score: number): NpsCategory {
  if (score <= 6) return 'detractor';
  if (score <= 8) return 'passive';
  return 'promoter';
}
