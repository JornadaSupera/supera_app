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

  return useQuery({
    queryKey: ['patient', patientId],
    queryFn: () => getPatient(patientId as string),
    enabled: Boolean(patientId),
  });
}
