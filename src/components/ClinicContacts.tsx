import { ExternalLink, Globe, MessageCircle, Phone, PhoneCall } from 'lucide-react';
import NavigationRow from './ui/navigation-row';
import { CLINIC_PHONE, CLINIC_WEBSITE, NURSING_PHONE } from '../lib/clinicContacts';
import { cn } from '@/lib/utils';

export interface ClinicContactsProps {
  /** Inclui o chat com a equipe (fora onde a tela já é o próprio chat). */
  withChat?: boolean;
  /** Desenho das linhas: cartão (Perfil) ou cartão com sombra sobre o verde (Central de Conhecimento). */
  surface?: 'card' | 'raised';
  className?: string;
}

/**
 * Os contatos da Supera: enfermagem e clínica (tocar liga), o site e o chat
 * com a equipe. A mesma lista no Perfil e no fim de cada tema da Central de
 * Conhecimento.
 *
 * Só dados da clínica, nenhum do paciente.
 */
export default function ClinicContacts({ withChat = true, surface = 'card', className }: ClinicContactsProps) {
  return (
    <div role="list" className={cn('flex flex-col gap-2', className)}>
      {[NURSING_PHONE, CLINIC_PHONE].map((phone) => (
        <div role="listitem" key={phone.href}>
          <NavigationRow
            href={phone.href}
            surface={surface}
            density="compact"
            icon={Phone}
            title={phone.label}
            description={phone.display}
            trailingIcon={PhoneCall}
          />
        </div>
      ))}
      <div role="listitem">
        <NavigationRow
          href={CLINIC_WEBSITE.url}
          external
          surface={surface}
            density="compact"
          icon={Globe}
          title="Site da Supera"
          description={CLINIC_WEBSITE.display}
          trailingIcon={ExternalLink}
        />
      </div>
      {withChat && (
        <div role="listitem">
          <NavigationRow
            to="/chat"
            surface={surface}
            density="compact"
            icon={MessageCircle}
            title="Chat com a equipe"
            description="Mensagens com a sua equipe de cuidado."
          />
        </div>
      )}
    </div>
  );
}
