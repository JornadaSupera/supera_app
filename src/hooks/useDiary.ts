import { useCallback, useEffect, useRef, useState } from 'react';
import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
} from '@tanstack/react-query';
import {
  getDiaryEntries,
  getDiaryEntriesCount,
  getDiaryEntry,
  getOwnDiaryDraft,
  getSymptomEvolution,
  getSymptoms,
  getTodayEntry,
  saveDiaryDraft,
  submitDiaryEntry,
} from '../services/mockApi';
import { appError } from '../lib/appError';
import { useSessionStore } from '../stores/sessionStore';
import type {
  DiaryCursor,
  DiaryEntriesPage,
  DiaryFilters,
  SaveDiaryDraftInput,
  SymptomReportInput,
} from '../types';

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
  draft: () => [...diaryKeys.all, 'draft'] as const,
  lists: () => [...diaryKeys.all, 'entries', 'list'] as const,
  list: (filters: DiaryFilters) => [...diaryKeys.lists(), filters] as const,
  counts: () => [...diaryKeys.all, 'entries', 'count'] as const,
  count: (periodDays: number) => [...diaryKeys.counts(), { periodDays }] as const,
  details: () => [...diaryKeys.all, 'entries', 'detail'] as const,
  detail: (id: string | undefined) => [...diaryKeys.details(), id] as const,
  symptomEvolutions: () => [...diaryKeys.all, 'symptom-evolution'] as const,
  symptomEvolution: (symptomId: string | undefined, periodDays: number) =>
    [...diaryKeys.symptomEvolutions(), { symptomId, periodDays }] as const,
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
 * Junta as páginas já carregadas numa lista só. Fica fora do hook para ter
 * identidade estável: o `select` do TanStack Query não roda de novo a cada
 * render.
 */
function flattenDiaryPages(data: InfiniteData<DiaryEntriesPage, DiaryCursor | null>) {
  return data.pages.flatMap((page) => page.entries);
}

/**
 * Histórico do Diário, página a página. `data` é a lista de tudo o que já foi
 * carregado; `fetchNextPage` traz os registros anteriores ao último.
 *
 * `keepPreviousData` mantém a lista anterior na tela enquanto o novo filtro
 * carrega, em vez de piscar um Loading de página inteira a cada toque num
 * filtro.
 */
export function useDiaryEntries(filters: DiaryFilters = {}) {
  return useInfiniteQuery({
    queryKey: diaryKeys.list(filters),
    // `signal`: trocar de filtro rápido cancela a requisição anterior de
    // verdade — sem ele, só o estado da query era descartado.
    queryFn: ({ pageParam, signal }) => getDiaryEntries(filters, pageParam, signal),
    initialPageParam: null as DiaryCursor | null,
    // `null` (última página) encerra a paginação.
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    select: flattenDiaryPages,
    placeholderData: keepPreviousData,
  });
}

/** Registros finalizados nos últimos `periodDays` dias, sem os filtros da lista. */
export function useRecentDiaryEntriesCount(periodDays: number) {
  return useQuery({
    queryKey: diaryKeys.count(periodDays),
    queryFn: ({ signal }) => getDiaryEntriesCount(periodDays, signal),
  });
}

/** Um registro. `data` é `null` quando não existe ou não é visível; falha de leitura é `isError`. */
export function useDiaryEntry(id: string | undefined) {
  return useQuery({
    queryKey: diaryKeys.detail(id),
    queryFn: () => getDiaryEntry(id as string),
    enabled: Boolean(id),
  });
}

/** Série do gráfico. Sem sintoma escolhido não há métrica para plotar. */
export function useSymptomEvolution(symptomId: string | undefined, periodDays: number) {
  return useQuery({
    queryKey: diaryKeys.symptomEvolution(symptomId, periodDays),
    queryFn: ({ signal }) =>
      getSymptomEvolution({ symptomId: symptomId as string, periodDays }, signal),
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
 * O rascunho que esta sessão deixou em aberto hoje, para a tela oferecer
 * continuar. Sempre relê do servidor ao abrir: o rascunho pode ter sido
 * gravado em outro aparelho.
 */
export function useOwnDiaryDraft() {
  const patientId = useSessionStore((state) => state.patientId);

  return useQuery({
    queryKey: diaryKeys.draft(),
    queryFn: getOwnDiaryDraft,
    enabled: Boolean(patientId),
    staleTime: 0,
  });
}

/**
 * Gravação do rascunho.
 *
 * O `patientId` vem da sessão e é injetado aqui — a tela não o conhece e não
 * poderia informá-lo. Sem vínculo de paciente não há onde gravar, e a
 * mensagem diz isso em vez de deixar a RLS recusar com um erro opaco.
 *
 * O acompanhante registra em nome do tutelado, e a política dele exige
 * `acting_as = 'caregiver'` — a do titular exige 'patient'. Deduzir da sessão
 * evita que a tela precise saber a diferença.
 */
export function useSaveDiaryDraft() {
  const patientId = useSessionStore((state) => state.patientId);
  const isCaregiver = useSessionStore((state) => state.isCaregiver);

  return useMutation({
    mutationFn: async (input: Omit<SaveDiaryDraftInput, 'patientId' | 'actingAs'>) => {
      if (!patientId) {
        throw appError(
          'Seu cadastro ainda não está vinculado à sua conta. Fale com a recepção do Centro.'
        );
      }

      return saveDiaryDraft({
        ...input,
        patientId,
        actingAs: isCaregiver ? 'caregiver' : 'patient',
      });
    },
  });
}

/** Finaliza o rascunho: é o que torna o registro visível para a equipe. */
export function useSubmitDiaryEntry() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: submitDiaryEntry,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: diaryKeys.lists() });
      queryClient.invalidateQueries({ queryKey: diaryKeys.counts() });
      queryClient.invalidateQueries({ queryKey: diaryKeys.today() });
      queryClient.invalidateQueries({ queryKey: diaryKeys.symptomEvolutions() });
      // O rascunho deixou de existir ao virar registro.
      queryClient.setQueryData(diaryKeys.draft(), null);
    },
  });
}

/** Intervalo sem digitar que dispara a gravação do rascunho. */
const AUTOSAVE_DEBOUNCE_MS = 3000;

export type DraftSaveState = 'ocioso' | 'salvando' | 'salvo' | 'erro';

interface DiaryDraftContent {
  freeText: string;
  symptoms: SymptomReportInput[];
}

/** Assinatura do conteúdo, para não regravar o que não mudou. */
function assinatura({ freeText, symptoms }: DiaryDraftContent): string {
  const marcados = symptoms
    .filter((symptom) => symptom.grade > 0)
    .map((symptom) => `${symptom.symptomId}:${symptom.grade}`)
    .sort();

  return JSON.stringify({ texto: freeText.trim(), marcados });
}

function temConteudo(conteudo: DiaryDraftContent): boolean {
  return conteudo.freeText.trim().length > 0 || conteudo.symptoms.some((item) => item.grade > 0);
}

/**
 * Salvamento automático do registro em andamento.
 *
 * Grava no banco, nunca no armazenamento do navegador: o texto do diário é
 * dado de saúde, e a regra do projeto é que PHI não fica no dispositivo fora
 * do cofre. Grava depois de uma pausa na digitação, quando a tela sai de
 * vista (o sistema pode encerrar o app em segundo plano) e ao sair da tela.
 *
 * Enquanto não houver nada escrito nem marcado, não abre rascunho nenhum —
 * entrar e sair da tela não deixa linha vazia no banco.
 */
export function useDiaryDraftAutosave({
  conteudo,
  ativo,
  draftId,
  aoAbrirRascunho,
}: {
  conteudo: DiaryDraftContent;
  /** Falso enquanto a tela ainda decide se continua um rascunho ou começa outro. */
  ativo: boolean;
  /** Rascunho que a tela está editando, quando já existe um. */
  draftId: string | null;
  /** Avisa a tela do id assim que o rascunho nasce. */
  aoAbrirRascunho: (id: string) => void;
}) {
  const salvarMutation = useSaveDiaryDraft();
  const [estado, setEstado] = useState<DraftSaveState>('ocioso');

  const draftIdRef = useRef<string | null>(draftId);
  const conteudoRef = useRef(conteudo);
  const ativoRef = useRef(ativo);
  const ultimaAssinaturaRef = useRef<string | null>(null);
  const emVooRef = useRef<Promise<string> | null>(null);
  const salvarRef = useRef(salvarMutation.mutateAsync);
  const aoAbrirRef = useRef(aoAbrirRascunho);

  conteudoRef.current = conteudo;
  ativoRef.current = ativo;
  salvarRef.current = salvarMutation.mutateAsync;
  aoAbrirRef.current = aoAbrirRascunho;
  // Nunca volta a nulo por render: entre gravar e a tela guardar o id, um
  // render intermediário zeraria a referência e a gravação seguinte abriria
  // um segundo rascunho.
  if (draftId) draftIdRef.current = draftId;

  // O que veio do banco já está gravado: sem esta marca, adotar um rascunho
  // dispararia uma gravação idêntica à que acabou de ser lida.
  useEffect(() => {
    if (draftId && ultimaAssinaturaRef.current === null) {
      ultimaAssinaturaRef.current = assinatura(conteudoRef.current);
    }
  }, [draftId]);

  /**
   * Grava o que está na tela e devolve o id do rascunho — `null` só quando
   * não há nada a gravar. Lança se o servidor recusar: quem finaliza o
   * registro precisa saber que o rascunho não ficou salvo.
   */
  const gravar = useCallback(async (): Promise<string | null> => {
    // Uma gravação por vez. Duas em paralelo com o rascunho ainda por nascer
    // abririam duas linhas — o que acontece, por exemplo, quando o app vai
    // para segundo plano no mesmo instante em que a pausa na digitação vence.
    if (emVooRef.current) await emVooRef.current.catch(() => {});

    const atual = conteudoRef.current;
    const assinaturaAtual = assinatura(atual);

    if (!ativoRef.current) return draftIdRef.current;
    if (assinaturaAtual === ultimaAssinaturaRef.current) return draftIdRef.current;
    if (!draftIdRef.current && !temConteudo(atual)) return null;

    setEstado('salvando');

    const gravacao = salvarRef.current({
      draftId: draftIdRef.current,
      freeText: atual.freeText,
      symptoms: atual.symptoms,
    });
    emVooRef.current = gravacao;

    try {
      const id = await gravacao;

      const nasceuAgora = draftIdRef.current === null;
      draftIdRef.current = id;
      ultimaAssinaturaRef.current = assinaturaAtual;
      setEstado('salvo');
      if (nasceuAgora) aoAbrirRef.current(id);

      return id;
    } catch (error) {
      setEstado('erro');
      throw error;
    } finally {
      emVooRef.current = null;
    }
  }, []);

  /**
   * Mesma gravação, para os gatilhos automáticos: a pausa na digitação, a
   * tela saindo de vista e a saída da tela. Falha aqui só muda a tarja — a
   * tela continua editável e a próxima pausa tenta de novo.
   */
  const gravarEmFundo = useCallback(() => {
    void gravar().catch(() => {});
  }, [gravar]);

  useEffect(() => {
    if (!ativo) return;
    if (assinatura(conteudo) === ultimaAssinaturaRef.current) return;

    const timer = window.setTimeout(gravarEmFundo, AUTOSAVE_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [conteudo, ativo, gravarEmFundo]);

  useEffect(() => {
    const aoEsconder = () => {
      // O sistema pode encerrar o app em segundo plano sem avisar.
      if (document.visibilityState === 'hidden') gravarEmFundo();
    };

    document.addEventListener('visibilitychange', aoEsconder);

    return () => {
      document.removeEventListener('visibilitychange', aoEsconder);
      // Saiu da tela: o que estava digitado não pode ficar só na memória.
      gravarEmFundo();
    };
  }, [gravarEmFundo]);

  return { estado, gravar, gravarEmFundo };
}
