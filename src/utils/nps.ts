import wearyFace from '../assets/emoji/weary-face.png';
import disappointedFace from '../assets/emoji/disappointed-face.png';
import worriedFace from '../assets/emoji/worried-face.png';
import pensiveFace from '../assets/emoji/pensive-face.png';
import slightlyFrowningFace from '../assets/emoji/slightly-frowning-face.png';
import confusedFace from '../assets/emoji/confused-face.png';
import neutralFace from '../assets/emoji/neutral-face.png';
import slightlySmilingFace from '../assets/emoji/slightly-smiling-face.png';
import smilingFaceWithSmilingEyes from '../assets/emoji/smiling-face-with-smiling-eyes.png';
import grinningFaceWithSmilingEyes from '../assets/emoji/grinning-face-with-smiling-eyes.png';
import smilingFaceWithHeartEyes from '../assets/emoji/smiling-face-with-heart-eyes.png';
import type { NpsScore } from '../types';

// A carinha de cada nota do NPS (pedido de 28/09: "carinhas baseadas no número").
//
// A escala continua de 0 a 10: é o que o mapa contratado pede ("Nota 0–10") e
// o que o banco aceita (`CHECK (score BETWEEN 0 AND 10)`), além de ser a escala
// do próprio NPS — o 0 é uma resposta válida, e tirá-lo mudaria a conta.
//
// As carinhas vão da decepção ao entusiasmo sem raiva nenhuma: num serviço de
// saúde, a nota baixa é de quem se decepcionou, e uma carinha zangada soaria
// como acusação. Desde 30/09 são os emojis 3D do Fluent Emoji, da Microsoft
// (licença MIT, `assets/emoji/LICENSE.txt`), iguais em todo aparelho — o emoji
// do sistema mudava de desenho entre Android, iPhone e computador. Só a
// pesquisa, que não é tela clínica, usa esses emojis: o diário passou à carinha
// desenhada do guia da clínica (`SymptomFace`).

export interface NpsScoreFace {
  score: NpsScore;
  /** A imagem 3D da carinha. */
  image: string;
  /** O que a nota quer dizer, em palavras — aparece sob a escala ao escolher. */
  label: string;
}

export const NPS_SCORE_FACES: readonly NpsScoreFace[] = [
  { score: 0, image: wearyFace, label: 'Não recomendaria de jeito nenhum' },
  { score: 1, image: disappointedFace, label: 'Não recomendaria' },
  { score: 2, image: worriedFace, label: 'Não recomendaria' },
  { score: 3, image: pensiveFace, label: 'Dificilmente recomendaria' },
  { score: 4, image: slightlyFrowningFace, label: 'Dificilmente recomendaria' },
  { score: 5, image: confusedFace, label: 'Talvez recomendasse' },
  { score: 6, image: neutralFace, label: 'Talvez recomendasse' },
  { score: 7, image: slightlySmilingFace, label: 'Provavelmente recomendaria' },
  { score: 8, image: smilingFaceWithSmilingEyes, label: 'Provavelmente recomendaria' },
  { score: 9, image: grinningFaceWithSmilingEyes, label: 'Recomendaria com certeza' },
  { score: 10, image: smilingFaceWithHeartEyes, label: 'Recomendaria com certeza' },
];

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
