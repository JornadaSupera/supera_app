import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import Button from '../../components/ui/button';
import FlowScreen from '../../components/ui/flow-screen';
import InlineError from '../../components/ui/inline-error';
import EntryHero from '../Onboarding/EntryHero';
import { useOpenStorePage } from '../../hooks/useAppUpdate';
import { pushBackHandler } from '../../lib/androidBackButton';
import type { AppStoreName } from '../../types';

const TITLE = 'Nova versão disponível';

interface AppUpdateScreenProps {
  store: AppStoreName;
  /** "Atualizar depois": fecha a tela, que só volta depois do prazo ou numa versão mais nova. */
  onLater: () => void;
}

/**
 * A tela da versão nova, na mesma família das telas de entrada (capa verde e
 * medalhão). Cobre o app em vez de trocar de rota: o que estava aberto por
 * trás — um registro do diário pela metade — continua lá quando a pessoa
 * escolhe atualizar depois.
 *
 * "Atualizar agora" só abre a página do app na loja: quem atualiza é a loja,
 * e o app reabre já na versão nova. O voltar do Android e o Esc valem como
 * "Atualizar depois".
 */
export default function AppUpdateScreen({ store, onLater }: AppUpdateScreenProps) {
  const openStorePage = useOpenStorePage();
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Trava a rolagem na raiz, e não no `body` — o motivo está no `Modal`.
    const root = document.documentElement;
    const previousOverflow = root.style.overflow;
    root.style.overflow = 'hidden';

    // O leitor de tela começa pela tela nova, e não pelo que ficou atrás dela.
    dialogRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onLater();
    }
    document.addEventListener('keydown', handleKeyDown);
    const removeBackHandler = pushBackHandler(onLater);

    return () => {
      root.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKeyDown);
      removeBackHandler();
    };
  }, [onLater]);

  return createPortal(
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label={TITLE}
      tabIndex={-1}
      // Acima das folhas (`Modal`, z-200): a versão nova vale mais que o que estava aberto.
      className="fixed inset-0 z-[250] overflow-y-auto overscroll-contain bg-background px-safe-0 outline-none"
    >
      <FlowScreen
        tone="brand"
        meta="Atualização do app"
        title={TITLE}
        subtitle={`Há uma versão nova do Jornada Supera na ${store}, com melhorias e correções.`}
        hero={<EntryHero variant="update" />}
        footer={
          <>
            {/* O botão principal das outras telas de entrada: 56 px, no verde da marca. */}
            <Button
              fullWidth
              variant="brand"
              size="xl"
              loading={openStorePage.isPending}
              onClick={() => openStorePage.mutate()}
            >
              Atualizar agora
            </Button>
            <Button fullWidth variant="ghost" onClick={onLater}>
              Atualizar depois
            </Button>
          </>
        }
      >
        {openStorePage.isError ? (
          <InlineError
            title={`Não foi possível abrir a ${store}.`}
            description="Abra a loja e procure por Jornada Supera."
          />
        ) : (
          <p className="text-body-sm text-muted-foreground">
            Leva só um instante, e seus registros continuam guardados.
          </p>
        )}
      </FlowScreen>
    </div>,
    document.body
  );
}
