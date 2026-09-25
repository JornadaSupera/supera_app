import { useEffect } from 'react';
import { useNavigate } from 'react-router';
import BrandCover from '../../components/ui/brand-cover';
import Logo from '../../components/ui/logo';
import { waitForResolvedSession } from '../../stores/sessionStore';

export default function Splash() {
  const navigate = useNavigate();

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
      navigate(status === 'anonimo' ? '/onboarding' : '/home', { replace: true });
    }, 1200);

    return () => {
      ativo = false;
      clearTimeout(id);
    };
  }, [navigate]);

  // A abertura é a capa do manual: o verde da Supera com a padronagem do "S" e
  // o logotipo em branco. O logotipo sobe devagar; com movimento reduzido,
  // aparece parado.
  return (
    <BrandCover shape="full" patternScale={0.42} className="flex min-h-[100dvh] items-center justify-center">
      <Logo size="lg" tone="inverse" className="animate-rise motion-reduce:animate-none" />
    </BrandCover>
  );
}
