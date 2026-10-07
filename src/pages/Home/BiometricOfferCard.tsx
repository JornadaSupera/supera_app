import { FingerprintPattern, ScanFace } from 'lucide-react';
import Card from '../../components/ui/card';
import Button from '../../components/ui/button';
import { useBiometricSetting, useBiometricSupport } from '../../hooks/useBiometric';
import { getBiometricText, isFaceBiometric } from '../../utils/biometric';

/**
 * A caixinha da Início que oferece a biometria (pedido de 07/10): o app é
 * usado por pessoas debilitadas, e o atalho guardado no Perfil pouca gente
 * acharia. Aparece enquanto a pessoa não respondeu neste aparelho: "Ativar"
 * liga, com a confirmação ali mesmo, e "Agora não" grava a recusa — as duas
 * tiram a caixinha da tela. Mudar de ideia depois é no Perfil ou no login,
 * onde o interruptor continua.
 *
 * Fora do app nativo, ou sem rosto ou digital cadastrado, não aparece.
 */
export default function BiometricOfferCard() {
  const { data: support } = useBiometricSupport();
  const biometric = useBiometricSetting();

  if (!support?.available || biometric.enabled || biometric.choiceMade) return null;

  const { offerTitle, offerDescription } = getBiometricText(support.kind);
  const Icon = isFaceBiometric(support.kind) ? ScanFace : FingerprintPattern;

  return (
    <Card elevation="raised" padding="md">
      <div className="flex flex-col gap-3">
        {/* O ícone solto, sem pastilha, centrado na linha de 22 px do título
            (`-my-px`), como nos cartões da LGPD. */}
        <div className="flex items-start gap-3">
          <Icon size={24} strokeWidth={2} className="-my-px shrink-0 text-primary-deep" aria-hidden="true" />
          <div className="flex flex-col gap-1">
            <h2 className="text-card-title font-bold text-foreground">{offerTitle}</h2>
            <p className="text-body-sm text-muted-foreground">{offerDescription}</p>
          </div>
        </div>

        {/* As ações discretas do app (cápsula `soft`), à direita, como nos
            outros cartões. */}
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button
            variant="ghost"
            size="compact"
            pill
            disabled={biometric.isPending}
            onClick={biometric.disable}
          >
            Agora não
          </Button>
          <Button
            variant="soft"
            size="compact"
            pill
            loading={biometric.isPending}
            onClick={() => void biometric.enable()}
          >
            Ativar
          </Button>
        </div>
      </div>
    </Card>
  );
}
