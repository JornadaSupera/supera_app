import { ExternalLink, Globe, Headset, MessageCircle, Phone, PhoneCall } from 'lucide-react';
import NavigationRow from './ui/navigation-row';
import { APP_SUPPORT, CLINIC_PHONE, CLINIC_WEBSITE, NURSING_PHONE } from '../lib/clinicContacts';
import { useScopeAllowed } from '../hooks/useCaregiver';
import { useAppSupportWhatsApp } from '../hooks/useAppSupport';
import { cn } from '@/lib/utils';

export interface ClinicContactsProps {
  /** Inclui o chat com a equipe (fora onde a tela já é o próprio chat). */
  withChat?: boolean;
  /** Inclui o suporte técnico do aplicativo, no fim da lista (só no Perfil). */
  withAppSupport?: boolean;
  /**
   * Desenho das linhas (ver `NavigationRow`): o card de lista do guia, com
   * cantos de 14 px (Perfil), ou o cartão da Central de Conhecimento, com
   * cantos de 20 px.
   */
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
export default function ClinicContacts({
  withChat = true,
  withAppSupport = false,
  surface = 'card',
  className,
}: ClinicContactsProps) {
  // O acompanhante sem a área do Chat não vê o atalho para ele: a linha levava
  // a uma tela de "não compartilhado".
  const { allowed: chatAllowed } = useScopeAllowed('chat');
  const showChat = withChat && chatAllowed;
  const appSupport = useAppSupportWhatsApp();

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
      {showChat && (
        <div role="listitem">
          <NavigationRow
            to="/chat"
            surface={surface}
            density="compact"
            icon={MessageCircle}
            title="Falar com a enfermagem"
            description="Pelo WhatsApp, com a mensagem pronta."
          />
        </div>
      )}
      {withAppSupport && (
        <div role="listitem">
          <NavigationRow
            onClick={appSupport.open}
            surface={surface}
            density="compact"
            icon={Headset}
            title={APP_SUPPORT.label}
            description={`${APP_SUPPORT.display} · pelo WhatsApp`}
            trailingIcon={MessageCircle}
          />
        </div>
      )}
    </div>
  );
}
