// Tipos do domínio Diário — espelham `symptoms`, `diary_entries` e
// `diary_symptom_reports`.
//
// O registro do banco tem texto livre e uma graduação 0–5 por sintoma. Não
// existe humor geral do dia: o que a tela mostra como resumo é derivado do
// pior sintoma (`getEntrySeverity`, em `utils/symptoms`), e é apresentado
// como tal.

/**
 * Intensidade de um sintoma, 0–5. Domínio fechado no banco por CHECK
 * (`grade BETWEEN 0 AND 5`); os rótulos vivem em `INTENSITY_LEVELS`.
 */
export type SymptomIntensity = 0 | 1 | 2 | 3 | 4 | 5;

/** Estado do registro. Rascunho é invisível para a equipe. */
export type DiaryEntryStatus = 'draft' | 'saved';

/** Quem escreveu o registro — campo de tela do profissional, não log. */
export type DiaryActorKind = 'patient' | 'caregiver';

/**
 * Sintoma do catálogo (`symptoms`), já com a cópia de apresentação
 * resolvida. `label` é o rótulo exibível (acentuado quando o código é
 * conhecido); `rawLabel` preserva o que o banco devolveu.
 */
export interface AvailableSymptom {
  id: string;
  /** `symptoms.code` — identificador estável, é por ele que se filtra. */
  code: string;
  label: string;
  rawLabel: string;
  description: string;
  sortOrder: number;
  /**
   * Marca descritiva do banco. **Não é regra de sigilo**: ansiedade e
   * tristeza são visíveis à equipe inteira como qualquer outro sintoma.
   */
  isPsychological: boolean;
}

/** Um sintoma marcado num registro, com sua graduação. */
export interface SymptomReport {
  symptomId: string;
  code: string;
  /** Rótulo já pronto para exibir. */
  label: string;
  description: string;
  grade: SymptomIntensity;
}

/** Registro do Diário, como o banco o devolve. */
export interface DiaryEntry {
  id: string;
  /** `YYYY-MM-DD`. É a data do registro, não a do insert. */
  entryDate: string;
  freeText: string;
  status: DiaryEntryStatus;
  actingAs: DiaryActorKind;
  /** ISO 8601. Sempre preenchido quando `status` é `'saved'`. */
  submittedAt: string | null;
  symptoms: SymptomReport[];
}

/** Registro com os campos derivados que as telas consomem. */
export interface EnrichedDiaryEntry extends DiaryEntry {
  date: Date;
  /** Rótulo relativo ("Hoje · 21:00", "Ontem · 19:15"). */
  dateLabel: string;
  /** `HH:MM` extraído de `submittedAt`. */
  time: string;
  /** Algum sintoma no grau de atenção — ver `ALERT_THRESHOLD`. */
  hasAlert: boolean;
  /** Intensidade do pior sintoma; `null` quando o registro só tem texto. */
  severity: SymptomIntensity | null;
}

/** Retorno de `getTodayEntry` — alimenta o card do Diário na Home. */
export interface TodayEntrySummary {
  entry: EnrichedDiaryEntry | null;
  /** Dias consecutivos com registro, terminando hoje. */
  streakDays: number;
}

/** Um sintoma marcado, no formato que a gravação recebe. */
export interface SymptomReportInput {
  symptomId: string;
  grade: SymptomIntensity;
}

/**
 * Entrada de `saveDiaryEntry`. `patientId` vem da sessão e é injetado pelo
 * hook — a tela nunca o informa, e a RLS confere no `WITH CHECK`.
 */
export interface SaveDiaryEntryInput {
  patientId: string;
  /**
   * Quem está registrando. Não é preferência de exibição: as duas políticas
   * de INSERT do diário exigem valores diferentes — a do titular só aceita
   * `'patient'`, a do acompanhante só aceita `'caregiver'`. Mandar o valor
   * errado faz as duas recusarem, e o registro não é gravado.
   */
  actingAs: DiaryActorKind;
  freeText?: string;
  symptoms: SymptomReportInput[];
}

export interface SaveDiaryEntryResult {
  success: true;
  id: string;
  hasAlert: boolean;
}

/** Um ponto da série do gráfico evolutivo. */
export interface SymptomEvolutionPoint {
  dateLabel: string;
  value: SymptomIntensity;
}

/** Opções de `getSymptomEvolution`. */
export interface SymptomEvolutionQueryOptions {
  /** Qual sintoma plotar. É a "seleção de métrica" do escopo MÉDIO. */
  symptomId: string;
  /** Quantidade de pontos; padrão 7. */
  limit?: number;
}

/** Filtros de `getDiaryEntries`. */
export interface DiaryFilters {
  /** Limita aos últimos N dias. */
  periodDays?: number;
  /** Filtra por um sintoma marcado no registro. */
  symptomId?: string;
}
