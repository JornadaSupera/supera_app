import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getDiaryEntries,
  getDiaryEntry,
  getSymptomEvolution,
  getSymptoms,
  getTodayEntry,
  saveDiaryEntry,
} from '../services/mockApi';
import { useSessionStore } from '../stores/sessionStore';
import type { DiaryFilters, SaveDiaryEntryInput } from '../types';

// Hooks do Diário. As telas não chamam `services/` direto: pedem daqui e
// recebem cache, `isLoading` e `isError` prontos.

/**
 * Chaves hierárquicas do domínio: raiz única (`all`), com `lists`/`details`
 * como famílias que se invalidam por prefixo. `today` e o catálogo de
 * sintomas ficam soltos direto sob `all` — são consultas únicas, sem
 * variante de lista/detalhe.
 */
export const diaryKeys = {
  all: ['diary'] as const,
  symptomsCatalog: () => [...diaryKeys.all, 'symptoms'] as const,
  today: () => [...diaryKeys.all, 'today'] as const,
  lists: () => [...diaryKeys.all, 'entries', 'list'] as const,
  list: (filters: DiaryFilters) => [...diaryKeys.lists(), filters] as const,
  details: () => [...diaryKeys.all, 'entries', 'detail'] as const,
  detail: (id: string | undefined) => [...diaryKeys.details(), id] as const,
  symptomEvolutions: () => [...diaryKeys.all, 'symptom-evolution'] as const,
  symptomEvolution: (symptomId: string | undefined, limit: number) =>
    [...diaryKeys.symptomEvolutions(), { symptomId, limit }] as const,
};

/** Catálogo de sintomas. Muda raramente — cache longo evita rebuscar a cada tela. */
export function useSymptoms() {
  return useQuery({
    queryKey: diaryKeys.symptomsCatalog(),
    queryFn: getSymptoms,
    staleTime: 1000 * 60 * 30,
  });
}

/**
 * Histórico do Diário. `keepPreviousData` mantém a lista anterior na tela
 * enquanto o novo filtro carrega, em vez de piscar um Loading de página
 * inteira a cada toque num filtro.
 */
export function useDiaryEntries(filters: DiaryFilters = {}) {
  return useQuery({
    queryKey: diaryKeys.list(filters),
    queryFn: () => getDiaryEntries(filters),
    placeholderData: keepPreviousData,
  });
}

export function useDiaryEntry(id: string | undefined) {
  return useQuery({
    queryKey: diaryKeys.detail(id),
    queryFn: () => getDiaryEntry(id as string),
    enabled: Boolean(id),
  });
}

/** Série do gráfico. Sem sintoma escolhido não há métrica para plotar. */
export function useSymptomEvolution(symptomId: string | undefined, limit = 7) {
  return useQuery({
    queryKey: diaryKeys.symptomEvolution(symptomId, limit),
    queryFn: () => getSymptomEvolution({ symptomId: symptomId as string, limit }),
    enabled: Boolean(symptomId),
    placeholderData: keepPreviousData,
  });
}

export function useTodayEntry() {
  return useQuery({
    queryKey: diaryKeys.today(),
    queryFn: getTodayEntry,
  });
}

/**
 * Gravação de um registro.
 *
 * O `patientId` vem da sessão e é injetado aqui — a tela não o conhece e não
 * poderia informá-lo. Sem vínculo de paciente não há onde gravar, e a
 * mensagem diz isso em vez de deixar a RLS recusar com um erro opaco.
 */
export function useSaveDiaryEntry() {
  const patientId = useSessionStore((state) => state.patientId);
  const isCaregiver = useSessionStore((state) => state.isCaregiver);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: Omit<SaveDiaryEntryInput, 'patientId' | 'actingAs'>) => {
      if (!patientId) {
        throw new Error(
          'Seu cadastro ainda não está vinculado à sua conta. Fale com a recepção do Centro.'
        );
      }

      // O acompanhante registra em nome do tutelado, e a política dele exige
      // `acting_as = 'caregiver'` — a do titular exige 'patient'. Deduzir da
      // sessão evita que a tela precise saber a diferença.
      return saveDiaryEntry({
        ...input,
        patientId,
        actingAs: isCaregiver ? 'caregiver' : 'patient',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: diaryKeys.lists() });
      queryClient.invalidateQueries({ queryKey: diaryKeys.today() });
      queryClient.invalidateQueries({ queryKey: diaryKeys.symptomEvolutions() });
    },
  });
}
