import { Video, BookOpen, FileText } from 'lucide-react';
import type { ContentType, ContentTypeInfo } from '../types';

// Apresentação por tipo de mídia. As chaves espelham `ContentType`, que por
// sua vez espelha o enum `content_media_kind` do banco — o `Record` tipado
// faz o compilador acusar se um valor novo do enum entrar sem apresentação.
export const TIPOS_CONTEUDO: Record<ContentType, ContentTypeInfo> = {
  video: { label: 'Vídeo', icon: Video, colorVar: 'var(--color-primary)' },
  texto: { label: 'Texto', icon: BookOpen, colorVar: 'var(--color-supera-empatia)' },
  pdf: { label: 'PDF', icon: FileText, colorVar: 'var(--color-supera-perfeicao)' },
};

/**
 * Apresentação de um tipo de conteúdo, com fallback para texto.
 *
 * O fallback existe porque `tipo` chega de uma coluna do banco: se o enum
 * ganhar um valor novo antes de a UI conhecê-lo, o card renderiza como texto
 * em vez de quebrar.
 */
export function getTipoConteudoInfo(tipo: ContentType): ContentTypeInfo {
  return TIPOS_CONTEUDO[tipo] ?? TIPOS_CONTEUDO.texto;
}

/**
 * Converte a URL pública de um vídeo na URL de embed correspondente.
 *
 * `content_versions.video_url` guarda o link como a equipe o copiou (página
 * do vídeo), mas um `<iframe>` precisa do endereço de player. O CHECK da
 * coluna já limita a YouTube e Vimeo em https — esta função cobre os formatos
 * que essas duas plataformas produzem.
 *
 * Devolve `null` quando não reconhece o formato, e aí a tela mostra o cartaz
 * do vídeo em vez de um iframe quebrado.
 */
export function getVideoEmbedUrl(videoUrl: string | null): string | null {
  if (!videoUrl) return null;

  let url: URL;
  try {
    url = new URL(videoUrl);
  } catch {
    return null;
  }

  const host = url.hostname.replace(/^www\./, '');

  if (host === 'youtu.be') {
    const id = url.pathname.split('/').filter(Boolean)[0];
    return id ? `https://www.youtube.com/embed/${id}` : null;
  }

  // O CHECK aceita subdomínio (`m.youtube.com`, `music.youtube.com`), então
  // não basta comparar com o domínio nu.
  if (host === 'youtube.com' || host.endsWith('.youtube.com')) {
    if (url.pathname.startsWith('/embed/')) return url.toString();

    const id = url.searchParams.get('v');
    return id ? `https://www.youtube.com/embed/${id}` : null;
  }

  if (host === 'player.vimeo.com') return url.toString();

  if (host === 'vimeo.com') {
    const id = url.pathname.split('/').filter(Boolean)[0];
    // Vimeo identifica o vídeo por número; um caminho de canal ou pasta
    // (`/channels/algo`) não vira player.
    return id && /^\d+$/.test(id) ? `https://player.vimeo.com/video/${id}` : null;
  }

  return null;
}
