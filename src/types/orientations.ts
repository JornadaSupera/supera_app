// Tipos do domínio Orientações — modelados sobre o que o banco realmente
// entrega ao paciente (`content_items` + `content_versions` +
// `content_categories` + `patient_content_states`).
//
// Campos que existiam no mock e NÃO têm coluna no banco foram removidos, em
// vez de inventados no front (o esquema é fonte da verdade e não se altera
// por conta do app):
//
// | Campo removido | Motivo                                                  |
// |----------------|---------------------------------------------------------|
// | `subcategoria` | não existe em `content_versions`                        |
// | `acessos`      | não existe contador de visualização                     |
// | `tags`         | não existe                                              |
// | `autor`        | o nome vive em `accounts.full_name`, e o paciente só lê  |
// |                | a PRÓPRIA linha de `accounts` (`accounts_select_own`) —  |
// |                | ler o nome do profissional autor devolveria `null`       |
// | `cids`         | a elegibilidade por CID roda no banco                    |
// |                | (`private.is_content_visible_to_me`). Expor a marcação   |
// |                | aqui só serviria para alguém refiltrar no cliente, que é |
// |                | exatamente o que não se pode fazer.                      |
//
// `resumo` não tem coluna, mas é derivado do primeiro parágrafo de `body` —
// é apresentação do mesmo dado, não campo inventado.

import type { LucideIcon } from 'lucide-react';

/**
 * Tipo de mídia da orientação, na forma que a UI usa.
 *
 * Espelha o enum `public.content_media_kind` do banco, que tem exatamente
 * três valores: `text` | `video` | `pdf`. O antigo `'infografico'` do mock
 * não tem correspondente e foi removido — um infográfico é publicado como
 * `pdf` ou como imagem anexa.
 */
export type ContentType = 'video' | 'texto' | 'pdf';

/**
 * Categoria da biblioteca (`content_categories`).
 *
 * Vem em `code` + `label` porque a convenção do banco é "renderize o
 * `label`, filtre pelo `code`" — o rótulo é conteúdo editável pela clínica e
 * não serve de chave.
 */
export interface OrientationCategory {
  code: string;
  label: string;
}

/**
 * Uma orientação como o paciente a enxerga: a identidade estável
 * (`content_items`) já casada com a sua ÚNICA versão publicada
 * (`content_versions`) — a RLS não deixa o paciente ver rascunho, versão em
 * revisão nem arquivada.
 */
export interface Orientation {
  /** `content_items.id` — estável entre versões. */
  id: string;
  /** `content_categories.label` — o que aparece na tela. */
  categoria: string;
  /** `content_categories.code` — o que vai no filtro. */
  categoriaCode: string;
  titulo: string;
  /** Primeiro parágrafo de `body`, para a prévia do card. */
  resumo: string;
  tipo: ContentType;
  /**
   * `content_versions.estimated_reading_minutes`. `null` quando a equipe não
   * estimou — a coluna é opcional no banco, então a UI precisa aguentar a
   * ausência em vez de exibir "null min".
   */
  tempoLeituraMin: number | null;
  /**
   * Embed de YouTube/Vimeo (`content_versions.video_url`). Sempre presente
   * quando `tipo === 'video'` (o banco tem CHECK), `null` nos demais tipos.
   */
  videoUrl: string | null;
  /**
   * Momento da publicação, em ISO 8601.
   *
   * É o `updated_at` da versão publicada: a política de UPDATE só permite
   * escrita em `draft`/`returned`, então uma linha `published` não muda mais
   * — o `updated_at` dela é exatamente o instante em que foi publicada.
   */
  publicadoEm: string;
  /** `content_versions.body` quebrado em parágrafos. */
  conteudo: string[];
  /** `patient_content_states.is_favorite` — `false` quando não há linha. */
  favorito: boolean;
  /** `patient_content_states.read_at IS NOT NULL`. */
  lida: boolean;
}

/** Entrada de `TIPOS_CONTEUDO[tipo]` (`src/utils/orientations.ts`). */
export interface ContentTypeInfo {
  label: string;
  icon: LucideIcon;
  colorVar: string;
}

/** `Orientation` com os campos de apresentação já montados. */
export interface OrientationDetail extends Orientation {
  tipoLabel: string;
  icon: LucideIcon;
  colorVar: string;
  /** `` `${tempoLeituraMin}:00` `` — só em vídeo com duração estimada. */
  duracaoLabel: string | null;
  publicadoLabel: string;
}

/**
 * Filtros de `getOrientacoes`.
 *
 * Não há filtro por CID: o recorte por diagnóstico é imposto pela RLS, não
 * pedido pelo cliente.
 */
export interface OrientationFilters {
  /** `content_categories.code`, não o rótulo. */
  categoria?: string;
  tipo?: ContentType;
  favoritas?: boolean;
  naoLidas?: boolean;
}

/** Retorno de `alternarFavoritoOrientacao` — `favorito` já é o novo estado. */
export interface ToggleFavoriteResult {
  success: true;
  favorito: boolean;
}

/**
 * Alvo de uma escrita em `patient_content_states`.
 *
 * `patientId` é explícito (e não lido de uma store dentro do service) pelo
 * mesmo motivo de `SaveDiaryEntryInput`: a política exige
 * `patient_id = my_own_patient_id()`, então mandar o id errado é erro de RLS,
 * não de UI. Quem injeta o valor é o hook, a partir da sessão.
 */
export interface OrientationStateInput {
  patientId: string;
  orientationId: string;
}
