import { useEffect } from 'react';
import { useNavigate } from 'react-router';
import { LogoMark } from '../../components/ui/logo';
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

      // Só quem não tem sessão nenhuma volta ao onboarding. Conta sem vínculo
      // ou desativada segue para dentro do app, onde o guard de rota explica
      // o que houve — mandá-las ao onboarding criaria um laço sem saída.
      navigate(status === 'anonimo' ? '/onboarding' : '/home', { replace: true });
    }, 1200);

    return () => {
      ativo = false;
      clearTimeout(id);
    };
  }, [navigate]);

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background">
      <LogoMark size={96} />
    </div>
  );
}
