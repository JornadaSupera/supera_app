import type { ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router';
import TreatmentClosureScreen from './TreatmentClosureScreen';
import { useTreatmentClosureCelebration } from '../../hooks/useTreatmentClosure';

/**
 * Telas de entrada: abertura, introdução, login, cadastro, senha e o aceite
 * dos termos. A surpresa espera a pessoa entrar de fato no app — por cima do
 * aceite ou da troca de senha ela atrapalharia um passo obrigatório.
 */
const ENTRY_PATH_PREFIXES = [
  '/onboarding',
  '/login',
  '/cadastro',
  '/confirmar-cadastro',
  '/recuperar-senha',
  '/trocar-senha',
] as const;

function isEntryPath(pathname: string): boolean {
  if (pathname === '/') return true;
  return ENTRY_PATH_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

/**
 * Abre a tela surpresa do sino por cima do app quando a equipe marcou o
 * encerramento do tratamento e ela ainda não foi vista neste aparelho. Sem
 * encerramento marcado, é transparente.
 *
 * Fica abaixo da biometria e do pedido de nome (nada aparece antes da tranca)
 * e acima das rotas: cobre qualquer tela em que a pessoa estiver.
 */
export default function TreatmentClosureGate({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { appointment, dismiss } = useTreatmentClosureCelebration(!isEntryPath(pathname));

  return (
    <>
      {children}
      {appointment && (
        <TreatmentClosureScreen
          key={appointment.id}
          appointment={appointment}
          onClose={() => dismiss(appointment.id)}
          onOpenSchedule={() => {
            dismiss(appointment.id);
            navigate(`/agenda/${appointment.id}`);
          }}
        />
      )}
    </>
  );
}
