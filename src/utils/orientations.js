import { Video, BookOpen, Image, FileText } from 'lucide-react';

export const TIPOS_CONTEUDO = {
  video: { label: 'Vídeo', icon: Video, colorVar: 'var(--color-primary)' },
  texto: { label: 'Texto', icon: BookOpen, colorVar: 'var(--color-supera-empatia)' },
  infografico: { label: 'Infográfico', icon: Image, colorVar: 'var(--color-supera-uniao)' },
  pdf: { label: 'PDF', icon: FileText, colorVar: 'var(--color-supera-perfeicao)' },
};

export function getTipoConteudoInfo(tipo) {
  return TIPOS_CONTEUDO[tipo] || TIPOS_CONTEUDO.texto;
}
