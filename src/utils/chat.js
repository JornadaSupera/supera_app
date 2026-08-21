import { Pill, Calendar, Activity, CircleQuestionMark } from 'lucide-react';

export const ASSUNTOS = {
  medicacao: {
    label: 'Medicação',
    descricao: 'Dúvidas sobre comprimidos, horários, efeitos',
    icon: Pill,
    colorVar: 'var(--color-supera-perfeicao)',
  },
  agendamento: {
    label: 'Agendamento',
    descricao: 'Remarcar, confirmar, dúvidas de agenda',
    icon: Calendar,
    colorVar: 'var(--color-primary)',
  },
  sintomas: {
    label: 'Sintomas',
    descricao: 'Relatar como está se sentindo',
    icon: Activity,
    colorVar: 'var(--color-supera-empatia)',
  },
  outros: {
    label: 'Outros',
    descricao: 'Qualquer outra dúvida',
    icon: CircleQuestionMark,
    colorVar: 'var(--color-supera-uniao)',
  },
};

export function getAssuntoInfo(assunto) {
  return ASSUNTOS[assunto] || null;
}
