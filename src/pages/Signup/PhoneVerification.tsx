import { useNavigate } from 'react-router';
import PhoneCodeScreen, { type PhoneCodeScreenProps } from './PhoneCodeScreen';
import PhoneInUseScreen from './PhoneInUseScreen';
import { describeMutationError } from '../../hooks/useAuth';
import { usePhoneVerification } from '../../hooks/usePhoneVerification';
import { useToast } from '../../contexts/ToastContext';
import { maskPhone } from '../../utils/contact';
import { toInternationalPhone } from '../../utils/phone';

interface PhoneVerificationProps {
  /** Celular como digitado (com máscara). */
  phone: string;
  cpf: string;
  birthDate: string;
  secondary: PhoneCodeScreenProps['secondary'];
  onBack?: () => void;
  /**
   * Levar a pessoa ao formulário de dados (CPF, nascimento e celular): CPF ou
   * nascimento não conferiram, ou o celular está em outra conta.
   */
  onCorrectData: () => void;
}

/**
 * Confirmação do celular por SMS, o primeiro acesso do contrato: liga a tela do
 * código (`PhoneCodeScreen`) ao envio, à conferência e ao vínculo com a ficha.
 *
 * O SMS sai ao abrir a tela; o reenvio libera depois de 60 segundos. Com o
 * código certo, a conta se liga à ficha pelo celular, CPF e nascimento.
 */
export default function PhoneVerification({
  phone,
  cpf,
  birthDate,
  secondary,
  onBack,
  onCorrectData,
}: PhoneVerificationProps) {
  const navigate = useNavigate();
  const { showToast } = useToast();

  const verification = usePhoneVerification({
    phone: toInternationalPhone(phone),
    cpf,
    birthDate,
    onLinked: () => {
      showToast('Cadastro confirmado. Bem-vindo(a) à Jornada Supera!', { variant: 'success' });
      navigate('/home', { replace: true });
    },
  });

  if (verification.phoneInUse) {
    return (
      <PhoneInUseScreen phoneLabel={maskPhone(phone)} onUseOtherNumber={onCorrectData} onBack={onBack} />
    );
  }

  return (
    <PhoneCodeScreen
      // Telefone é dado pessoal: mascarado por padrão, mesmo sendo o que a
      // pessoa acabou de digitar (captura de tela, alguém olhando por cima).
      phoneLabel={maskPhone(phone)}
      secondsToResend={verification.secondsToResend}
      isSending={verification.isSending}
      isConfirming={verification.isConfirming}
      phoneConfirmed={verification.phoneConfirmed}
      needsDataCorrection={verification.needsDataCorrection}
      onCorrectData={onCorrectData}
      error={
        verification.error
          ? describeMutationError(verification.error, 'Não foi possível concluir. Tente de novo.')
          : null
      }
      onConfirm={(code) => void verification.confirm(code)}
      onResend={verification.resend}
      secondary={secondary}
      onBack={onBack}
    />
  );
}
