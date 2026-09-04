import * as React from 'react';

export interface DesktopShellProps {
  children: React.ReactNode;
}

/**
 * Moldura de desktop.
 *
 * O app é mobile first: todas as classes são prefixadas com `md:`, então
 * abaixo de 768px este componente não muda nada — o celular e o Capacitor
 * seguem exatamente como antes.
 *
 * A partir de `md` ele centraliza a aplicação numa faixa com largura de
 * celular sobre um fundo neutro, para a tela não esticar em monitor largo.
 *
 * A faixa tem **altura total da janela** de propósito: as telas se
 * dimensionam com `100dvh`, e manter a faixa na altura da viewport faz essa
 * conta continuar exata — nenhuma das 21 telas precisa ser tocada.
 *
 * A calha lateral fica deliberadamente vazia: é moldura de desenvolvimento,
 * não superfície de marca. O logotipo aparece dentro do app, nas telas em que
 * foi desenhado para aparecer.
 */
export default function DesktopShell({ children }: DesktopShellProps) {
  return (
    <div className="md:flex md:min-h-[100dvh] md:items-stretch md:justify-center md:bg-muted">
      <div className="md:w-full md:max-w-[430px] md:border-x md:border-border md:shadow-[0_0_60px_rgba(0,0,0,0.18)]">
        {children}
      </div>
    </div>
  );
}
