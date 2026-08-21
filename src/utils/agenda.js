import { Syringe, Apple, FlaskConical, Brain, Pill, Stethoscope, Bone, Calendar } from 'lucide-react';

export const TIPOS = {
  infusao: { label: 'Infusão de quimioterapia', colorVar: 'var(--color-primary)' },
  consulta: { label: 'Consultas', colorVar: 'var(--color-supera-empatia)' },
  exame: { label: 'Exames', colorVar: 'var(--color-supera-uniao)' },
  retirada: { label: 'Retirada de medicação', colorVar: 'var(--color-supera-perfeicao)' },
};

export const CATEGORIAS = {
  quimioterapia: { icon: Syringe, colorVar: 'var(--color-primary)', tipo: 'infusao' },
  nutricao: { icon: Apple, colorVar: 'var(--color-mood-1)', tipo: 'consulta' },
  exame: { icon: FlaskConical, colorVar: 'var(--color-supera-uniao)', tipo: 'exame' },
  psicologia: { icon: Brain, colorVar: 'var(--color-supera-empatia)', tipo: 'consulta' },
  farmacia: { icon: Pill, colorVar: 'var(--color-supera-perfeicao)', tipo: 'retirada' },
  consulta: { icon: Stethoscope, colorVar: 'var(--color-foreground)', tipo: 'consulta' },
  fisioterapia: { icon: Bone, colorVar: 'var(--color-supera-amor)', tipo: 'consulta' },
  odontologia: { icon: Calendar, colorVar: 'var(--color-foreground)', tipo: 'consulta' },
};

export function getCategoriaInfo(categoria) {
  return CATEGORIAS[categoria] || CATEGORIAS.consulta;
}

export function getTipoInfo(categoria) {
  const info = getCategoriaInfo(categoria);
  return TIPOS[info.tipo];
}
