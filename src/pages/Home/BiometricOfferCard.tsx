import { FingerprintPattern, ScanFace } from 'lucide-react';
import Card from '../../components/ui/card';
import Button from '../../components/ui/button';
import { useBiometricKind, useBiometricSetting } from '../../hooks/useBiometric';
import { getBiometricOfferText } from '../../utils/biometric';

/**
 * A caixinha da Início que oferece a biometria (pedido de 07/10): o app é
 * usado por pessoas debilitadas, e o atalho guardado em Perfil → Preferências
 * pouca gente acharia. Aparece enquanto a pessoa não respondeu neste aparelho:
 * "Ativar" liga, com a confirmação ali mesmo, e "Agora não" grava a recusa —
 * as duas tiram a caixinha da tela. Mudar de ideia depois é no Perfil, onde o
 * interruptor continua.
 *
 * Fora do app nativo, ou sem biometria cadastrada, não aparece.
 */
export default function BiometricOfferCard() {
  const { data: kind } = useBiometricKind();
  const biometric = useBiometricSetting();

  if (!kind || biometric.enabled || biometric.choiceMade) return null;

  const { title, description } = getBiometricOfferText(kind);
  const Icon = kind === 'face-id' || kind === 'face' ? ScanFace : FingerprintPattern;

  return (
    <Card elevation="raised" padding="md">
      <div className="flex flex-col gap-3">
        {/* O ícone solto, sem pastilha, centrado na linha de 22 px do título
            (`-my-px`), como nos cartões da LGPD. */}
        <div className="flex items-start gap-3">
          <Icon size={24} strokeWidth={2} className="-my-px shrink-0 text-primary-deep" aria-hidden="true" />
          <div className="flex flex-col gap-1">
            <h2 className="text-card-title font-bold text-foreground">{title}</h2>
            <p className="text-body-sm text-muted-foreground">{description}</p>
          </div>
        </div>

        {/* `pl-9`: as ações alinhadas ao texto, à direita do ícone. */}
        <div className="flex flex-wrap gap-2 pl-9">
          <Button size="sm" loading={biometric.isPending} onClick={() => void biometric.enable()}>
            Ativar
          </Button>
          <Button size="sm" variant="ghost" disabled={biometric.isPending} onClick={biometric.disable}>
            Agora não
          </Button>
        </div>
      </div>
    </Card>
  );
}
