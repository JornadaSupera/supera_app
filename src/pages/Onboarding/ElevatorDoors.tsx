import { useEffect, useState } from 'react';
import { SplashBackdrop, SplashLogo } from './SplashBackdrop';

/**
 * Se a porta já abriu nesta abertura do app. Fica só em memória: a transição é
 * da chegada (tela inicial → introdução) e não se repete quando a pessoa volta
 * do login para os slides, nem em nenhuma outra troca de tela.
 */
let hasOpened = false;

/**
 * Passado este tempo a animação (0,5 s de espera + 1 s de abertura) já
 * acabou. Sem quadros — WebView voltando do segundo plano, painel oculto — a
 * animação CSS fica parada no começo, com a porta fechada por cima da
 * introdução; o temporizador, que corre mesmo assim, tira a porta da tela.
 */
const DOORS_SETTLE_MS = 1800;

/**
 * A "porta de elevador" do pacote de design (03/10/2026): na clínica, o
 * elevador abre direto na recepção, e a abertura do app reproduz essa chegada.
 * Primeiro o logotipo da tela inicial esmaece (as portas nunca o cortam ao
 * meio); depois o fundo se divide e as duas metades saem para os lados,
 * revelando a introdução, já parada no lugar por baixo.
 *
 * É só a camada de cima: não segura toques nem leitura de tela, e não muda o
 * tempo de nada — a introdução já está montada e funcionando por baixo.
 * Com movimento reduzido, a tela inicial só esmaece.
 */
export default function ElevatorDoors() {
  // Lido na montagem, sem efeito colateral (o modo estrito chama duas vezes);
  // quem marca que abriu é o efeito.
  const [isVisible, setIsVisible] = useState(() => !hasOpened);

  useEffect(() => {
    hasOpened = true;
    const timer = window.setTimeout(() => setIsVisible(false), DOORS_SETTLE_MS);
    return () => window.clearTimeout(timer);
  }, []);

  if (!isVisible) return null;

  return (
    <div
      aria-hidden="true"
      // Não recebe toque, e por isso a conferência das barras do sistema não o
      // enxerga: declara que o fundo atrás do relógio é o verde da abertura.
      data-system-bar-tone="dark"
      className="pointer-events-none fixed inset-0 z-50 motion-reduce:animate-fade-out"
      onAnimationEnd={(event) => {
        // Só o fim da animação de quem sai por último: a porta da direita, ou
        // o esmaecer inteiro com movimento reduzido.
        if (event.animationName === 'door-right' || event.target === event.currentTarget) {
          setIsVisible(false);
        }
      }}
    >
      {/* Cada metade guarda a tela inteira por dentro, presa na borda de fora:
          a padronagem e o degradê continuam os da tela inicial. A sombra da
          borda de dentro vem por cima dela, numa camada própria. */}
      <div className="absolute inset-y-0 left-0 w-1/2 overflow-hidden motion-safe:animate-door-left">
        <SplashBackdrop className="absolute inset-y-0 left-0 w-[200%]" />
        <div className="absolute inset-0 shadow-[var(--shadow-door-left)] motion-safe:animate-door-edge motion-reduce:hidden" />
      </div>
      <div className="absolute inset-y-0 right-0 w-1/2 overflow-hidden motion-safe:animate-door-right">
        <SplashBackdrop className="absolute inset-y-0 right-0 w-[200%]" />
        <div className="absolute inset-0 shadow-[var(--shadow-door-right)] motion-safe:animate-door-edge motion-reduce:hidden" />
      </div>

      <div className="absolute inset-0 flex items-center justify-center motion-safe:animate-door-logo-out">
        <SplashLogo />
      </div>
    </div>
  );
}
