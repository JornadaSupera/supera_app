import { Laugh, Smile, Meh, Annoyed, Frown, Angry } from 'lucide-react';

export const MOOD_LEVELS = [
  { grau: 0, label: 'Ótimo', icon: Laugh, colorVar: 'var(--color-mood-0)' },
  { grau: 1, label: 'Bem', icon: Smile, colorVar: 'var(--color-mood-1)' },
  { grau: 2, label: 'Leve', icon: Meh, colorVar: 'var(--color-mood-2)' },
  { grau: 3, label: 'Moderado', icon: Annoyed, colorVar: 'var(--color-mood-3)' },
  { grau: 4, label: 'Intenso', icon: Frown, colorVar: 'var(--color-mood-4)' },
  { grau: 5, label: 'Muito intenso', icon: Angry, colorVar: 'var(--color-mood-5)' },
];

export function getMoodInfo(grau) {
  const index = Math.min(Math.max(Math.round(grau), 0), 5);
  return MOOD_LEVELS[index];
}

export const ALERTA_LIMIAR = 4;

export function temSinalDeAtencao(sintomas = []) {
  return sintomas.some((sintoma) => sintoma.intensidade >= ALERTA_LIMIAR);
}
