import { Mail, Phone } from 'lucide-react';
import { maskEmail, maskPhone } from '../../utils/contact';
import { formatPhone } from '../../utils/masks';
import RevealableValue from './RevealableValue';
import { ProfileInfoRow, ProfileInfoValue, ProfileSection } from './ProfileRows';

interface ProfileContactSectionProps {
  phone: string | null;
  email: string | null;
  /** Revelar o dado é ação do titular; o acompanhante só vê mascarado. */
  canReveal: boolean;
}

/** Telefone e e-mail da ficha, mascarados até o titular pedir para ver. */
export default function ProfileContactSection({ phone, email, canReveal }: ProfileContactSectionProps) {
  return (
    <ProfileSection title="CONTATO">
      <div className="flex flex-col gap-2">
        <ProfileInfoRow icon={Phone} label="TELEFONE">
          {phone ? (
            <RevealableValue
              masked={maskPhone(phone)}
              full={formatPhone(phone)}
              canReveal={canReveal}
              ariaLabel="telefone"
            />
          ) : (
            <ProfileInfoValue>Não informado</ProfileInfoValue>
          )}
        </ProfileInfoRow>
        <ProfileInfoRow icon={Mail} label="E-MAIL">
          {email ? (
            <RevealableValue masked={maskEmail(email)} full={email} canReveal={canReveal} ariaLabel="e-mail" />
          ) : (
            <ProfileInfoValue>Não informado</ProfileInfoValue>
          )}
        </ProfileInfoRow>
      </div>
    </ProfileSection>
  );
}
