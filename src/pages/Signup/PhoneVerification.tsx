import { useNavigate } from 'react-router';
import PhoneCodeScreen from './PhoneCodeScreen';
import { describeMutationError, useSignOut } from '../../hooks/useAuth';
import { usePhoneVerification } from '../../hooks/usePhoneVerification';
import { useToast } from '../../contexts/ToastContext';
import { maskPhone } from '../../utils/contact';
import { toInternationalPhone } from '../../utils/phone';

interface PhoneVerificationProps {
  /** Celular como digitado no cadastro (com máscara). */
  phone: string;
  cpf: string;
  birthDate: string;
}

/**
 * Verificação do celular por SMS depois de criar a conta: liga a tela do
 * código (`PhoneCodeScreen`) ao envio, à conferência e ao vínculo com a ficha.
 * Só é montada quando o recurso está ligado (`PHONE_VERIFICATION_ENABLED`).
 */
export default function PhoneVerification({ phone, cpf, birthDate }: PhoneVerificationProps) {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const signOutMutation = useSignOut();

  const verification = usePhoneVerification({
    phone: toInternationalPhone(phone),
    cpf,
    birthDate,
    onLinked: () => {
      showToast('Cadastro confirmado. Bem-vindo(a) à Jornada Supera!', { variant: 'success' });
      navigate('/home', { replace: true });
    },
  });

  return (
    <PhoneCodeScreen
      // Telefone é dado pessoal: mascarado por padrão, mesmo sendo o que a
      // pessoa acabou de digitar (captura de tela, alguém olhando por cima).
      phoneLabel={maskPhone(phone)}
      secondsToResend={verification.secondsToResend}
      isSending={verification.isSending}
      isConfirming={verification.isConfirming}
      phoneConfirmed={verification.phoneConfirmed}
      error={
        verification.error
          ? describeMutationError(verification.error, 'Não foi possível concluir. Tente de novo.')
          : null
      }
      onConfirm={(code) => void verification.confirm(code)}
      onResend={verification.resend}
      onSignOut={() =>
        signOutMutation.mutate(undefined, {
          onSuccess: () => navigate('/login', { replace: true }),
        })
      }
      isSigningOut={signOutMutation.isPending}
    />
  );
}
