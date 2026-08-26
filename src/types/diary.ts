// Tipos do domínio Diário — cobre `src/mocks/symptoms.js` (catálogo de
// sintomas + registros) e os formatos agregados que mockApi.js monta em
// cima dele (registro enriquecido, resumo do dia, série do gráfico).

/**
 * As 12 chaves de `SINTOMAS_DISPONIVEIS` (symptoms.js) — mesmo conjunto
 * citado no CLAUDE.md ("12 sintomas"). Fechado: é o catálogo oficial que a
 * tela Novo Registro oferece; todo `SymptomEntry.nome` nos 16 registros do
 * mock usa só valores daqui.
 */
export type SymptomName =
  | 'Náusea'
  | 'Vômito'
  | 'Dor'
  | 'Fadiga'
  | 'Diarreia'
  | 'Constipação'
  | 'Febre'
  | 'Falta de apetite'
  | 'Alterações na boca'
  | 'Alterações na pele'
  | 'Ansiedade'
  | 'Tristeza';

/** Item do catálogo `SINTOMAS_DISPONIVEIS` — retorno de `getSintomasDisponiveis`. */
export interface AvailableSymptom {
  nome: SymptomName;
  descricao: string;
}

/**
 * Humor geral do dia (0–5), mesma escala de `MOOD_LEVELS` em
 * `src/utils/mood.js` (Ótimo…Muito intenso — 6 níveis). `getMoodInfo` faz
 * `Math.min(Math.max(Math.round(grau), 0), 5)`, confirmando o range 0–5. O
 * mock só usa valores 0–3 nos 16 registros, mas o range válido do campo é
 * 0–5.
 */
export type MoodGrade = 0 | 1 | 2 | 3 | 4 | 5;

/**
 * Intensidade de um sintoma específico (0–5) — confirmado por
 * `INTENSIDADE_SINTOMA_LABELS` em `EntryDetail.jsx` (6 rótulos, 'Não
 * senti'…'Insuportável') e pelo comentário "Escala de intensidade de
 * sintoma 0–5 (Diário)" em `src/index.css`. O mock só tem valores 1–5
 * porque `NewEntry.jsx` filtra sintomas com intensidade 0 antes de salvar
 * (`.filter(([, intensidade]) => intensidade > 0)`) — 0 é válido no tipo,
 * só não aparece persistido em nenhum registro hoje.
 */
export type SymptomIntensity = 0 | 1 | 2 | 3 | 4 | 5;

export interface SymptomEntry {
  nome: SymptomName;
  intensidade: SymptomIntensity;
}

/**
 * Registro do Diário, como armazenado em `src/mocks/symptoms.js` (16
 * registros conferidos). Toda chave é sempre presente — inclusive
 * `sintomas`, que pode ser um array vazio quando o paciente registra só o
 * humor, sem sintomas (ver `salvarRegistro` em mockApi.js:
 * `sintomas: sintomas || []`).
 */
export interface DiaryEntry {
  id: string;
  /** Mesmo mecanismo de `Appointment.diasAPartirDeHoje` (ver appointments.ts). */
  diasAPartirDeHoje: number;
  /** Formato 'HH:MM' (24h). */
  hora: string;
  grau: MoodGrade;
  texto: string;
  sintomas: SymptomEntry[];
}

/**
 * DiaryEntry depois de `enrichDiaryEntry` (mockApi.js) — retorno de
 * `getRegistrosDiario` e `getRegistroPorId`.
 */
export interface EnrichedDiaryEntry extends DiaryEntry {
  data: Date;
  dataLabel: string;
  /** Sinaliza sintoma(s) com intensidade ≥ `ALERTA_LIMIAR` (4, em `src/utils/mood.js`). */
  temAlerta: boolean;
}

/**
 * Retorno de `getRegistroDeHoje`. `registro` é o `DiaryEntry` cru — a
 * função não chama `enrichDiaryEntry` nele —, então não é
 * `EnrichedDiaryEntry` aqui, diferente de `getRegistrosDiario`/`getRegistroPorId`.
 */
export interface TodayEntrySummary {
  registro: DiaryEntry | null;
  sequenciaDias: number;
}

/** Entrada de `salvarRegistro`. */
export interface SaveDiaryEntryInput {
  texto?: string;
  grau: MoodGrade;
  sintomas: SymptomEntry[];
}

/**
 * Metadados de auditoria exigidos pelo mapa_requisito.md para o registro do
 * Diário — sem `profissional`, porque quem escreve o registro é o próprio
 * paciente (comentário original do JSDoc de `salvarRegistro`).
 */
export interface DiaryEntryAudit {
  paciente: string;
  /** ISO 8601, 'YYYY-MM-DD'. */
  data: string;
  /** Formato 'HH:MM' (24h). */
  horario: string;
}

/** Retorno de `salvarRegistro`. */
export interface SaveDiaryEntryResult {
  success: true;
  id: string;
  temAlerta: boolean;
  auditoria: DiaryEntryAudit;
}

/** Um ponto da série usada no gráfico evolutivo do Diário — item do retorno de `getEvolucaoHumor`. */
export interface MoodEvolutionPoint {
  dataLabel: string;
  valor: MoodGrade;
}

/** Filtros de `getRegistrosDiario`. */
export interface DiaryFilters {
  periodoDias?: number;
  sintoma?: SymptomName;
}

/** Opções de `getEvolucaoHumor`. */
export interface MoodEvolutionQueryOptions {
  /** Quantidade de pontos a retornar; padrão 7 (default do parâmetro em mockApi.js). */
  limit?: number;
}
