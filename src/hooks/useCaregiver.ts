import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  completeFirstPassword,
  createCaregiver,
  getCaregiverIssuances,
  getCaregiverLinks,
  getCaregiverScopes,
  getMyCaregiver,
  getMyWardLink,
  getMyWardScopes,
  resetCaregiverPassword,
  revokeCaregiverLink,
  setCaregiverScope,
  updateCaregiver,
} from '../services/caregiver';
import { useSessionStore } from '../stores/sessionStore';

// Reexportado para as telas não importarem de `services/` (Regra nº 9).
export { prepareWhatsApp, type WhatsAppLaunch } from '../services/whatsapp';
import type {
  CaregiverScope,
  CaregiverScopeSettings,
  CreateCaregiverInput,
  ResetCaregiverPasswordInput,
  UpdateCaregiverInput,
} from '../types';

// Hooks do acompanhante criado pelo paciente. Leitura é a RPC `get_my_caregiver`
// e `.from('patient_caregivers')` sob a RLS; toda escrita é Edge Function ou
// RPC (ver `services/caregiver.ts`).

export const caregiverKeys = {
  all: ['caregiver'] as const,
  mine: () => [...caregiverKeys.all, 'mine'] as const,
  links: () => [...caregiverKeys.all, 'links'] as const,
  issuances: () => [...caregiverKeys.all, 'issuances'] as const,
  wardLink: () => [...caregiverKeys.all, 'ward-link'] as const,
  scopes: () => [...caregiverKeys.all, 'scopes'] as const,
  wardScopes: () => [...caregiverKeys.all, 'ward-scopes'] as const,
};

/** O acompanhante corrente (pendente ou ativo), ou `null`. */
export function useMyCaregiver() {
  return useQuery({
    queryKey: caregiverKeys.mine(),
    queryFn: getMyCaregiver,
  });
}

/** Os vínculos (pendentes, ativos e revogados), sem nome de ninguém. */
export function useCaregiverLinks() {
  return useQuery({
    queryKey: caregiverKeys.links(),
    queryFn: getCaregiverLinks,
  });
}

/**
 * O vínculo do próprio acompanhante: quem ele acompanha e desde quando.
 *
 * `enabled` pelo papel, e não por gosto: a mesma tabela responde ao titular com
 * os vínculos DELE (outra política), e a consulta só tem este sentido na sessão
 * do acompanhante.
 */
export function useMyWardLink() {
  const isCaregiver = useSessionStore((state) => state.isCaregiver);

  return useQuery({
    queryKey: caregiverKeys.wardLink(),
    queryFn: getMyWardLink,
    enabled: isCaregiver,
  });
}

/**
 * As senhas provisórias emitidas — o registro da autorização que o titular
 * confere: quando saiu cada credencial, por qual canal e por quê. Nunca a senha.
 */
export function useCaregiverIssuances() {
  return useQuery({
    queryKey: caregiverKeys.issuances(),
    queryFn: getCaregiverIssuances,
  });
}

/**
 * Toda escrita relê o acompanhante e os vínculos, para a tela nunca mostrar o
 * que já mudou. Mutation não repete sozinha (ver `lib/queryClient.ts`): criar
 * duas vezes geraria duas contas.
 *
 * Toda escrita usa `networkMode: 'always'`: no modo padrão, sem rede a mutation
 * ficaria pausada e rodaria sozinha quando a rede voltasse — com o titular já
 * longe da tela, criando a conta, mandando o SMS ou invalidando a senha que ele
 * acabou de enviar. Assim ela falha na hora ("Sem conexão") e o titular repete.
 *
 * Não devolve a promessa da releitura de propósito: o TanStack Query esperaria
 * a releitura terminar antes de dar a resposta a quem chamou, e a tela que
 * criou o acompanhante já teria virado outra (a releitura acha o acompanhante e
 * a guarda do formulário manda para "Meu acompanhante") antes de conseguir ir
 * para o envio da senha.
 */
function useInvalidateCaregiver() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: caregiverKeys.all });
  };
}

export function useCreateCaregiver() {
  const invalidate = useInvalidateCaregiver();

  return useMutation({
    mutationFn: (input: CreateCaregiverInput) => createCaregiver(input),
    networkMode: 'always',
    // A resposta traz a senha provisória. Quem chama a usa no mesmo toque —
    // monta a mensagem e abre o WhatsApp — e o cache não a guarda: com
    // `gcTime: 0`, a mutation some assim que a tela sai.
    gcTime: 0,
    // No `sms_failed` a conta existe mesmo com o erro: por isso invalida também na falha.
    onSettled: invalidate,
  });
}

export function useResetCaregiverPassword() {
  const invalidate = useInvalidateCaregiver();

  return useMutation({
    mutationFn: (input: ResetCaregiverPasswordInput) => resetCaregiverPassword(input),
    networkMode: 'always',
    // Mesmo motivo do `useCreateCaregiver`: a resposta traz a senha provisória.
    gcTime: 0,
    onSettled: invalidate,
  });
}

export function useUpdateCaregiver() {
  const invalidate = useInvalidateCaregiver();

  return useMutation({
    mutationFn: (input: UpdateCaregiverInput) => updateCaregiver(input),
    networkMode: 'always',
    onSuccess: invalidate,
  });
}

export function useRevokeCaregiver() {
  const invalidate = useInvalidateCaregiver();

  return useMutation({
    mutationFn: (linkId: string) => revokeCaregiverLink(linkId),
    networkMode: 'always',
    onSuccess: invalidate,
  });
}

/**
 * Primeiro acesso do acompanhante: escolhe a senha. Depois da troca (e da
 * renovação da sessão, feita no serviço) a identidade é relida — é ela que
 * derruba a marca `mustChangePassword` e abre o resto do app.
 *
 * Também marca o acompanhante como velho no cache: no aparelho do titular (a
 * demonstração, em que os dois papéis dividem a mesma tela) a situação passa a
 * "Ativo" na próxima leitura. Na sessão do acompanhante não há esse cache, e a
 * marcação não custa nada.
 */
export function useCompleteFirstPassword() {
  const refreshIdentity = useSessionStore((state) => state.refreshIdentity);
  const invalidate = useInvalidateCaregiver();

  return useMutation({
    mutationFn: (password: string) => completeFirstPassword(password),
    networkMode: 'always',
    onSuccess: () => {
      invalidate();
      return refreshIdentity();
    },
  });
}

// ------------------------------------------------------------------ áreas do acompanhante ([BANCO 32])

/**
 * As áreas do acompanhante, vistas pelo titular — e se o banco já tem o
 * controle por área (`supported`).
 *
 * Só para o titular: é ele quem libera e retira. Na sessão do acompanhante a
 * consulta nem sai (a pergunta dele é outra — `useWardScopes`).
 */
export function useCaregiverScopes() {
  const isCaregiver = useSessionStore((state) => state.isCaregiver);

  return useQuery({
    queryKey: caregiverKeys.scopes(),
    queryFn: getCaregiverScopes,
    enabled: !isCaregiver,
  });
}

/** Troca, no cache, só a linha de uma área — as outras ficam como estão. */
function patchScope(
  queryClient: ReturnType<typeof useQueryClient>,
  scope: CaregiverScope,
  patch: { enabled: boolean; updatedAt: string | null }
) {
  queryClient.setQueryData<CaregiverScopeSettings>(caregiverKeys.scopes(), (current) =>
    current
      ? {
          ...current,
          scopes: current.scopes.map((item) => (item.scope === scope ? { ...item, ...patch } : item)),
        }
      : current
  );
}

/**
 * Liga ou desliga uma área, com a tela respondendo NA HORA.
 *
 * O interruptor muda no toque (atualização otimista) e volta sozinho se o
 * servidor recusar — esperar a resposta para mover o interruptor faria a tela
 * parecer travada a cada toque. A releitura no fim confirma o que o banco
 * gravou, que é a única verdade.
 */
export function useSetCaregiverScope() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ scope, enabled }: { scope: CaregiverScope; enabled: boolean }) => setCaregiverScope(scope, enabled),
    networkMode: 'always',
    onMutate: async ({ scope, enabled }) => {
      await queryClient.cancelQueries({ queryKey: caregiverKeys.scopes() });

      // Guarda só o estado DESTA área. Uma cópia da lista inteira, devolvida
      // no erro, desfaria também a mudança de outra área que o titular tocou
      // logo em seguida — e que o servidor pode ter aceitado.
      const previous = queryClient
        .getQueryData<CaregiverScopeSettings>(caregiverKeys.scopes())
        ?.scopes.find((item) => item.scope === scope);

      patchScope(queryClient, scope, { enabled, updatedAt: new Date().toISOString() });

      return { previous };
    },
    onError: (_error, { scope }, context) => {
      if (context?.previous) {
        patchScope(queryClient, scope, {
          enabled: context.previous.enabled,
          updatedAt: context.previous.updatedAt,
        });
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: caregiverKeys.scopes() });
    },
  });
}

/**
 * As áreas que o acompanhante logado pode ver. Só na sessão dele.
 *
 * Relida a cada volta ao app (o padrão do projeto) e com folga curta: é o que
 * faz a área retirada pelo titular sumir da tela do acompanhante sem que ele
 * precise sair e entrar de novo. O dado, esse, já some na hora — quem o
 * esconde é o banco.
 */
export function useWardScopes() {
  const isCaregiver = useSessionStore((state) => state.isCaregiver);

  return useQuery({
    queryKey: caregiverKeys.wardScopes(),
    queryFn: getMyWardScopes,
    enabled: isCaregiver,
    staleTime: 30_000,
  });
}

/**
 * Esta área está liberada para a sessão atual?
 *
 * O titular vê tudo, sempre. O acompanhante vê o que o banco liberar; enquanto
 * a pergunta não tem resposta (`isChecking`) a tela espera, e se a pergunta
 * falhar a tela abre — a barreira de verdade é a RLS, que já não entrega a
 * área retirada, e travar a tela inteira por uma oscilação de rede só
 * atrapalharia quem tem acesso.
 */
export function useScopeAllowed(scope: CaregiverScope): { allowed: boolean; isChecking: boolean } {
  const isCaregiver = useSessionStore((state) => state.isCaregiver);
  const { data, isPending } = useWardScopes();

  if (!isCaregiver) return { allowed: true, isChecking: false };
  // Resposta conhecida vale, mesmo que uma releitura em segundo plano tenha
  // falhado depois: abrir a tela por causa de uma oscilação, com o banco já
  // tendo dito que a área foi retirada, desenharia uma área vazia — e a barra
  // (`useScopeFilter`) diria o contrário.
  if (data) return { allowed: data.allowed.includes(scope), isChecking: false };
  if (isPending) return { allowed: true, isChecking: true };

  // Sem resposta nenhuma e a pergunta falhou: a tela abre. A barreira é a RLS.
  return { allowed: true, isChecking: false };
}

/**
 * Filtro das áreas para a navegação: devolve se um destino ligado a uma área
 * deve aparecer. Destino sem área (Início, Perfil) aparece sempre.
 *
 * Enquanto a resposta não chega, mostra — a aba some quando o banco disser que
 * a área foi retirada, em vez de todas piscarem escondidas a cada abertura.
 */
export function useScopeFilter(): (scope: CaregiverScope | undefined) => boolean {
  const isCaregiver = useSessionStore((state) => state.isCaregiver);
  const { data } = useWardScopes();

  return (scope) => !scope || !isCaregiver || !data?.supported || data.allowed.includes(scope);
}
