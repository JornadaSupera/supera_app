// Tipos do domínio Orientações — cobre `src/mocks/orientations.js` e os
// formatos enriquecidos que mockApi.js monta em cima dele.

import type { LucideIcon } from 'lucide-react';

/**
 * As 4 chaves de `TIPOS_CONTEUDO` em `src/utils/orientations.js` — enum
 * fechado (o lookup `getTipoConteudoInfo` valida, com fallback pra 'texto').
 */
export type ContentType = 'video' | 'texto' | 'infografico' | 'pdf';

/**
 * Orientação como armazenada em `src/mocks/orientations.js` (17 registros
 * conferidos). Toda chave está presente em todos os 17 registros — nenhum
 * campo opcional encontrado neste mock.
 */
export interface Orientation {
  id: string;
  /**
   * 7 valores distintos nos 17 registros (Geral, Cuidados de Enfermagem,
   * Nutrição, Psicologia, Medicação Oral, Odontologia, Fisioterapia) — mas
   * mantido como `string` livre, e não como union literal: diferente de
   * `AppointmentCategory` (appointments.ts), não existe nenhum lookup de
   * código validando essas chaves. `getCategoriasOrientacoes`
   * (mockApi.js) inclusive monta a lista lendo os dados na hora
   * (`@returns {Promise<string[]>}` no JSDoc — não uma union), o que indica
   * que categoria é conteúdo gerenciável pela equipe clínica, não um enum
   * de código.
   */
  categoria: string;
  /**
   * 15 valores distintos nos 17 registros (quase 1 por artigo — ex.:
   * 'Segurança' se repete em 2 categorias diferentes) — texto livre, não é
   * enum.
   */
  subcategoria: string;
  titulo: string;
  resumo: string;
  tipo: ContentType;
  tempoLeituraMin: number;
  /** Texto livre com prefixo de cargo, ex.: 'Enf. Patrícia Lima Soares'. */
  autor: string;
  acessos: number;
  /** ISO 8601, 'YYYY-MM-DD'. */
  publicadoEm: string;
  /** Um item por parágrafo do conteúdo (sempre 3 nos dados atuais, mas nada garante esse número). */
  conteudo: string[];
  tags: string[];
  favorito: boolean;
  lida: boolean;
  /** Códigos CID-10 aos quais esta orientação se aplica — filtra por `Patient.diagnostico.cid` em `orientacoesDoDiagnostico`. */
  cids: string[];
}

/** Entrada de `TIPOS_CONTEUDO[tipo]`. */
export interface ContentTypeInfo {
  label: string;
  icon: LucideIcon;
  colorVar: string;
}

/** Orientation depois de `enrichOrientation` (mockApi.js) — retorno de `getOrientacoes` e `getOrientacaoPorId`. */
export interface OrientationDetail extends Orientation {
  tipoLabel: string;
  icon: LucideIcon;
  colorVar: string;
  /** `` `${tempoLeituraMin}:00` `` — só quando `tipo === 'video'`; `null` nos demais tipos. */
  duracaoLabel: string | null;
  publicadoLabel: string;
}

/** Filtros de `getOrientacoes`. */
export interface OrientationFilters {
  categoria?: string;
  tipo?: ContentType;
  favoritas?: boolean;
  naoLidas?: boolean;
}

/** Retorno de `alternarFavoritoOrientacao` — `favorito` já reflete o novo estado. */
export interface ToggleFavoriteResult {
  success: true;
  favorito: boolean;
}
