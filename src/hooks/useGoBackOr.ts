import { useCallback } from 'react';
import { useNavigate } from 'react-router';

/**
 * Posição da entrada atual no histórico do app: 0 é a primeira.
 *
 * O React Router guarda essa posição em `history.state.idx` a cada navegação
 * (e a mantém ao recarregar a página). Estado estranho ou ausente conta como
 * primeira entrada: na dúvida, vai para a tela de origem em vez de sair do app.
 */
function historyIndex(): number {
  const state: unknown = window.history.state;
  if (state && typeof state === 'object' && 'idx' in state && typeof state.idx === 'number') {
    return state.idx;
  }
  return 0;
}

/**
 * Sai da tela voltando uma entrada do histórico. Se a tela foi aberta direto
 * (endereço digitado, link colado) e não há para onde voltar dentro do app,
 * vai para `fallback`, no lugar da entrada atual.
 *
 * Empurrar a tela de origem (`navigate('/origem')`) deixaria a mesma tela duas
 * vezes seguidas no histórico, e o "voltar" do sistema cairia de novo naquela
 * de onde a pessoa acabou de sair.
 *
 * A decisão é pela posição no histórico, e não pela `location.key`: a chave só
 * é `'default'` enquanto ninguém trocou a primeira entrada. Depois de um
 * `fallback` (que troca a entrada, com chave nova), a tela de origem ainda é a
 * primeira do histórico — e o voltar dela precisa ir ao `fallback` dela, não
 * sair do app.
 */
export function useGoBackOr(fallback: string) {
  const navigate = useNavigate();

  return useCallback(() => {
    if (historyIndex() > 0) {
      navigate(-1);
      return;
    }
    navigate(fallback, { replace: true });
  }, [navigate, fallback]);
}
