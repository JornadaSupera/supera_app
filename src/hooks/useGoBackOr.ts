import { useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router';

/**
 * Sai da tela voltando uma entrada do histórico. Se a tela foi aberta direto
 * (recarregar a página, endereço digitado) e não há para onde voltar dentro do
 * app, vai para `fallback`, no lugar da entrada atual.
 *
 * Empurrar a tela de origem (`navigate('/origem')`) deixaria a mesma tela duas
 * vezes seguidas no histórico, e o "voltar" do sistema cairia de novo naquela
 * de onde a pessoa acabou de sair. O `location.key` só é `'default'` na primeira
 * entrada do histórico.
 */
export function useGoBackOr(fallback: string) {
  const navigate = useNavigate();
  const { key } = useLocation();

  return useCallback(() => {
    if (key !== 'default') {
      navigate(-1);
      return;
    }
    navigate(fallback, { replace: true });
  }, [navigate, key, fallback]);
}
