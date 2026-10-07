import { FingerprintPattern, ScanFace } from 'lucide-react';
import ConfirmDialog from '../../components/ui/confirm-dialog';
import { useBiometricOffer } from '../../hooks/useBiometric';
import { BIOMETRIC_TEXT, isFaceBiometric } from '../../utils/biometric';

/**
 * A pergunta da biometria em diálogo, no lugar da caixinha que ficava entre
 * os cartões da Início e passava despercebida (07/10). "Ativar" pede a
 * confirmação ali mesmo; "Agora não" fecha. Mudar de ideia depois é no Perfil
 * ou no login. Quando abre, ver `useBiometricOffer`.
 */
export default function BiometricOfferDialog() {
  const offer = useBiometricOffer();

  return (
    <ConfirmDialog
      open={offer.open}
      title={BIOMETRIC_TEXT.offerTitle}
      description={BIOMETRIC_TEXT.offerDescription}
      titleIcon={isFaceBiometric(offer.kind) ? ScanFace : FingerprintPattern}
      confirmLabel="Ativar"
      cancelLabel="Agora não"
      loading={offer.isPending}
      onConfirm={() => void offer.accept()}
      onCancel={offer.dismiss}
    />
  );
}
