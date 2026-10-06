import { useEffect } from 'react';
import { useNavigate } from 'react-router';
import { SplashBackdrop, SplashLogo } from './SplashBackdrop';
import { usePrefetchClinicPresentation } from '../../hooks/useClinic';
import { waitForResolvedSession } from '../../stores/sessionStore';

/**
 * Quanto a tela inicial fica antes de seguir. Era 1,2 s; em 05/10/2026 a
 * desenvolvedora achou rápido demais e pediu meio segundo a mais (o pacote de
 * design da clínica fala em "cerca de 1,5 segundo").
 */
const SPLASH_DURATION_MS = 1700;

export default function Splash() {
  const navigate = useNavigate();
  usePrefetchClinicPresentation();

  useEffect(() => {
    let ativo = true;

    const id = setTimeout(async () => {
      // O boot já ligou o app ao Supabase Auth; se a sessão ainda não foi
      // resolvida, aguarda aqui em vez de decidir com o status indefinido.
      const status = await waitForResolvedSession();
      if (!ativo) return;

      // Só quem não tem sessão nenhuma vai ao onboarding. Conta sem vínculo
      // ou desativada segue para dentro do app, onde o guard de rota explica
      // o que houve — mandá-las ao onboarding criaria um laço sem saída.
      //
      // Sem sessão, a abertura é sempre splash → onboarding → login (pedido de
      // 25/09): os slides aparecem em toda abertura, e não só na primeira.
      navigate(status === 'anonymous' ? '/onboarding' : '/home', { replace: true });
    }, SPLASH_DURATION_MS);

    return () => {
      ativo = false;
      clearTimeout(id);
    };
  }, [navigate]);

  // A abertura (pacote de design de 03/10/2026): a padronagem do "S" no tom
  // "profundo", lisa no centro, com o logotipo branco e o "Sempre ao seu
  // lado!". Sem botão. O logotipo sobe devagar; com movimento reduzido,
  // aparece parado. Daqui para a introdução, a "porta de elevador" se abre
  // (`ElevatorDoors`, no onboarding).
  return (
    <SplashBackdrop className="relative flex min-h-[100dvh] bleed-x items-center justify-center">
      <SplashLogo className="animate-rise motion-reduce:animate-none" />
    </SplashBackdrop>
  );
}
