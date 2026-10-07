import { useId } from 'react';
import { cva } from 'class-variance-authority';
import { FingerprintPattern, ScanFace } from 'lucide-react';
import Switch from './ui/switch';
import { useBiometricSetting, useBiometricSupport } from '../hooks/useBiometric';
import { BIOMETRIC_TEXT, isFaceBiometric } from '../utils/biometric';
import { cn } from '../lib/utils';

const containerVariants = cva('flex flex-col gap-3', {
  variants: {
    surface: {
      // O card de lista do guia, como os outros ajustes do Perfil.
      card: 'rounded-xl border border-border bg-card p-4 shadow-sm',
      // Solto, no meio de um formulário (o login).
      plain: '',
    },
  },
  defaultVariants: { surface: 'card' },
});

interface BiometricSwitchProps {
  surface?: 'card' | 'plain';
  /**
   * Some no aparelho sem rosto ou digital cadastrado. No Perfil ela fica,
   * travada e com o caminho para cadastrar (sumir fazia a pessoa achar que a
   * opção não existia, 07/10); no login, só ocuparia espaço.
   */
  hideWhenUnavailable?: boolean;
  /** A nota debaixo do interruptor. No login fica só a opção (pedido de 07/10). */
  showNote?: boolean;
  /** O rótulo; sem ele, o do Perfil. */
  label?: string;
  className?: string;
}

/**
 * O interruptor da biometria deste aparelho — o mesmo no Perfil e no login.
 * Ligar pede a confirmação ali mesmo; desligar é direto. No navegador não
 * aparece: não há biometria.
 */
export default function BiometricSwitch({
  surface,
  hideWhenUnavailable = false,
  showNote = true,
  label = BIOMETRIC_TEXT.switchLabel,
  className,
}: BiometricSwitchProps) {
  const id = useId();
  const { data: support } = useBiometricSupport();
  const biometric = useBiometricSetting();

  if (!support || (hideWhenUnavailable && !support.available)) return null;

  const Icon = isFaceBiometric(support.kind) ? ScanFace : FingerprintPattern;

  return (
    <div className={cn(containerVariants({ surface }), className)}>
      {/* O `py-3` com o `-my-3` põe o texto a 16 px do topo com uma ou duas
          linhas, e o toque segue com 48 px, encostando na nota sem sobrepor. */}
      <Switch
        id={id}
        checked={support.available && biometric.enabled}
        disabled={!support.available || biometric.isPending}
        onChange={(turnOn) => (turnOn ? void biometric.enable() : biometric.disable())}
        className="-my-3 py-3"
        label={
          <span className="flex items-center gap-3">
            <Icon size={24} strokeWidth={2} className="shrink-0 text-primary-deep" aria-hidden="true" />
            {label}
          </span>
        }
      />
      {/* `pl-9` (ícone de 24 px + 12 px) alinha a nota ao texto do interruptor.
          Sair apaga a sessão do cofre, e é ela que a biometria destrava: sem
          a nota, o atalho parece quebrado para quem testa saindo e entrando. */}
      {showNote && (
        <p className="pl-9 text-caption font-medium text-muted-foreground">
          {support.available
            ? 'Vale quando você reabre o app sem ter saído. Se usar “Sair”, o próximo acesso pede e-mail e senha.'
            : BIOMETRIC_TEXT.notEnrolledHint}
        </p>
      )}
    </div>
  );
}
