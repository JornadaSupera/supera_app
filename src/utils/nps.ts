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

// ---------------------------------------------------------------------------
// Os momentos da pesquisa.
//
// O banco é a fonte de QUAIS marcos existem, da ordem e do nome de cada um
// (`treatment_phases` com `axis = 'nps'`). O que mora aqui é só a camada de
// tela: o nome curto da linha do tempo e o que dizer, depois da resposta,
// sobre a próxima pesquisa. Marco cujo código não esteja no mapa aparece com o
// nome do banco, sem linha do tempo e sem esse aviso.
// ---------------------------------------------------------------------------

interface NpsMomentPresentation {
  code: string;
  /** Nome curto na linha do tempo da tela. */
  shortLabel: string;
  /** O que vem depois de responder a pesquisa deste momento. */
  afterAnswer: string;
}

const NPS_MOMENTS: readonly NpsMomentPresentation[] = [
  {
    code: 'primeiro_acesso',
    shortLabel: 'Começo',
    afterAnswer: 'A próxima pesquisa aparece na metade do seu tratamento.',
  },
  {
    code: 'metade_tratamento',
    shortLabel: 'Metade',
    afterAnswer: 'A última aparece depois do seu último ciclo.',
  },
  {
    code: 'ultimo_ciclo',
    shortLabel: 'Fim',
    afterAnswer: 'Esta foi a última pesquisa do seu tratamento.',
  },
];

/** Os nomes curtos dos momentos, na ordem do tratamento. */
export const NPS_MOMENT_LABELS = NPS_MOMENTS.map((moment) => moment.shortLabel);

export interface NpsMoment {
  /** Posição do momento (1, 2, 3), ou `null` quando o marco não é conhecido. */
  step: number | null;
  /** Quantos momentos a pesquisa tem. */
  total: number;
  /** O aviso sobre a próxima pesquisa, ou `null` quando o marco não é conhecido. */
  afterAnswer: string | null;
}

/** Onde este marco fica entre os momentos da pesquisa. */
export function getNpsMoment(milestoneCode: string): NpsMoment {
  const index = NPS_MOMENTS.findIndex((moment) => moment.code === milestoneCode);

  return {
    step: index >= 0 ? index + 1 : null,
    total: NPS_MOMENTS.length,
    afterAnswer: index >= 0 ? NPS_MOMENTS[index].afterAnswer : null,
  };
}
