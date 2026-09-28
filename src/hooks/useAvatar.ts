import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getMyAvatarUrl, removeMyAvatar, updateMyAvatar } from '../services/avatar';
import { useSessionStore } from '../stores/sessionStore';

// Foto de perfil de quem está logado (guia do banco §7).
//
// Não existe hook "foto de outra pessoa": o bucket é privado por pasta de
// conta, e só o dono consegue assinar o link. A tela do paciente nunca mostra
// foto de terceiro — nem a do profissional, nem a do acompanhante.

export const avatarKeys = {
  all: ['avatar'] as const,
  mine: (accountId: string | null) => [...avatarKeys.all, 'mine', accountId] as const,
};

/**
 * O link assinado da própria foto, ou `null` quando não há foto.
 *
 * O link vale uma hora; `staleTime` de 50 minutos evita assinar de novo a cada
 * volta ao Perfil sem chegar perto do vencimento.
 */
export function useMyAvatar() {
  const accountId = useSessionStore((state) => state.accountId);

  return useQuery({
    queryKey: avatarKeys.mine(accountId),
    queryFn: getMyAvatarUrl,
    enabled: Boolean(accountId),
    staleTime: 50 * 60 * 1000,
  });
}

function useInvalidateAvatar() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: avatarKeys.all });
  };
}

/**
 * Troca a foto.
 *
 * `networkMode: 'always'` como as demais escritas do app: sem rede a mutation
 * falha na hora ("Sem conexão") em vez de ficar pausada e subir a foto sozinha
 * quando a rede voltar, com o paciente já em outra tela.
 */
export function useUpdateMyAvatar() {
  const invalidate = useInvalidateAvatar();

  return useMutation({
    mutationFn: (file: File) => updateMyAvatar(file),
    networkMode: 'always',
    onSuccess: invalidate,
  });
}

/** Remove a foto e volta às iniciais. */
export function useRemoveMyAvatar() {
  const invalidate = useInvalidateAvatar();

  return useMutation({
    mutationFn: removeMyAvatar,
    networkMode: 'always',
    onSuccess: invalidate,
  });
}
