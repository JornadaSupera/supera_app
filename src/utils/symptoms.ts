import { Laugh, Smile, Meh, Annoyed, Frown, Angry } from 'lucide-react';
import type { SymptomIntensity, SymptomReport } from '../types';

// Apresentação do catálogo de sintomas.
//
// O banco é a fonte de QUAIS sintomas existem, da ordem e do estado ativo —
// nada aqui inventa sintoma. O que mora neste arquivo é só a camada de tela:
// ícone (que o banco nunca teve), a descrição de apoio (`symptoms` não tem
// coluna para ela) e o rótulo acentuado, porque o seed do catálogo foi
// gravado sem acentuação ("Nausea", "Constipacao", "Alteracoes na boca").
//
// A chave é `symptoms.code`, que é estável e é por onde o guia do banco manda
// filtrar. Sintoma cujo código não esteja no mapa cai no `label` do banco, de
// modo que um sintoma novo aparece na tela sem exigir alteração aqui.

interface SymptomPresentation {
  label: string;
  description: string;
}

const SYMPTOM_PRESENTATION: Record<string, SymptomPresentation> = {
  nausea: { label: 'Náusea', description: 'Enjoo, vontade de vomitar' },
  vomiting: { label: 'Vômito', description: 'Expulsão do conteúdo do estômago' },
  pain: { label: 'Dor', description: 'Dor em qualquer região' },
  fatigue: { label: 'Fadiga', description: 'Cansaço persistente' },
  diarrhea: { label: 'Diarreia', description: 'Evacuações líquidas' },
  constipation: { label: 'Constipação', description: 'Intestino preso' },
  fever: { label: 'Febre', description: 'Temperatura acima de 37.8°C' },
  appetite_loss: { label: 'Falta de apetite', description: 'Sem vontade de comer' },
  mouth_changes: { label: 'Alterações na boca', description: 'Aftas, secura, ardor' },
  skin_changes: {
    label: 'Alterações na pele',
    description: 'Ressecamento, vermelhidão ou coceira',
  },
  anxiety: { label: 'Ansiedade', description: 'Preocupação ou inquietação excessiva' },
  sadness: { label: 'Tristeza', description: 'Desânimo, falta de energia emocional' },
};

/**
 * Rótulo e descrição de um sintoma. `fallbackLabel` é o `label` do banco,
 * usado quando o código não está no mapa — o sintoma aparece na tela mesmo
 * assim, só sem descrição de apoio.
 */
export function getSymptomPresentation(code: string, fallbackLabel: string): SymptomPresentation {
  return SYMPTOM_PRESENTATION[code] ?? { label: fallbackLabel, description: '' };
}

/**
 * A escala 0–5 de intensidade de sintoma, com o rótulo que o protótipo usa na
 * tela de detalhe. Definida uma única vez: antes esta lista estava duplicada
 * em `SymptomSlider` e em `EntryDetail`, e as duas cópias precisavam
 * concordar sem nada garantir que concordassem.
 *
 * As cores são as custom properties `--color-mood-*` de `index.css`, que
 * apesar do nome são a escala de intensidade de sintoma do Diário.
 */
export const INTENSITY_LEVELS = [
  { grade: 0, label: 'Não senti', icon: Laugh, colorVar: 'var(--color-mood-0)' },
  { grade: 1, label: 'Mal noto', icon: Smile, colorVar: 'var(--color-mood-1)' },
  { grade: 2, label: 'Leve', icon: Meh, colorVar: 'var(--color-mood-2)' },
  { grade: 3, label: 'Moderado', icon: Annoyed, colorVar: 'var(--color-mood-3)' },
  { grade: 4, label: 'Forte', icon: Frown, colorVar: 'var(--color-mood-4)' },
  { grade: 5, label: 'Insuportável', icon: Angry, colorVar: 'var(--color-mood-5)' },
] as const;

export type IntensityLevel = (typeof INTENSITY_LEVELS)[number];

/** Rótulo, ícone e cor de uma intensidade. Valores fora de 0–5 são aparados. */
export function getIntensityInfo(grade: number): IntensityLevel {
  const index = Math.min(Math.max(Math.round(grade), 0), 5);
  return INTENSITY_LEVELS[index];
}

/**
 * A partir de que grau o registro ganha o selo "sinal de atenção" na tela.
 *
 * ⚠️ É um limiar **de exibição**, e só. O corte clínico de criticidade é
 * configurável pelo administrador e mora no banco por desenho — mas essa
 * parte ainda não existe (não há tabela de alerta, regra nem fila). Enquanto
 * não existir, nada aqui avisa a equipe: o selo é informação para o próprio
 * paciente.
 */
export const ALERT_THRESHOLD = 4;

/** Há algum sintoma no grau de atenção? Usado para o selo do card. */
export function hasAttentionSignal(symptoms: SymptomReport[]): boolean {
  return symptoms.some((symptom) => symptom.grade >= ALERT_THRESHOLD);
}

/**
 * Intensidade do pior sintoma do registro — o que resume o dia num número.
 *
 * Substitui o antigo "humor geral", que era uma autoavaliação de 0–5 pedida
 * na tela e que **não tem coluna** em `diary_entries`. É derivada e rotulada
 * como tal: não é o paciente dizendo como estava, é a leitura do sintoma mais
 * intenso que ele registrou. `null` quando o registro só tem texto.
 */
export function getEntrySeverity(symptoms: SymptomReport[]): SymptomIntensity | null {
  if (symptoms.length === 0) return null;

  return symptoms.reduce<SymptomIntensity>(
    (worst, symptom) => (symptom.grade > worst ? symptom.grade : worst),
    0
  );
}
