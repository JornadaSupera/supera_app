import { useQuery } from '@tanstack/react-query';
import { getPatient } from '../services/mockApi';
import { useSessionStore } from '../stores/sessionStore';

/**
 * Cadastro completo do paciente logado (contato, diagnóstico, plano de
 * tratamento, histórico clínico).
 *
 * `RequireAuth` já garante `patientId` preenchido antes de deixar entrar em
 * qualquer tela protegida — o `enabled` aqui é rede de segurança, não o
 * portão principal.
 */
export function usePatient() {
  const patientId = useSessionStore((state) => state.patientId);
  const isCaregiver = useSessionStore((state) => state.isCaregiver);

  return useQuery({
    // `isCaregiver` entra na chave porque muda o QUE a resposta traz: na sessão
    // do acompanhante a ficha vem sem CPF, contato e nascimento (o banco não os
    // entrega). Sem isso, uma conta que troca de papel reaproveitaria o cache
    // da outra.
    queryKey: ['patient', patientId, isCaregiver],
    queryFn: () => getPatient(patientId as string, isCaregiver),
    enabled: Boolean(patientId),
  });
}
