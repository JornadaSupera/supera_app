import { CircleQuestionMark, LogOut, Shield } from 'lucide-react';
import LegalDocumentLinks from './LegalDocumentLinks';
import { ProfileLinkRow, ProfileSection } from './ProfileRows';

/**
 * Termos, consentimentos e os pedidos do titular (exportação e exclusão). É
 * ação exclusiva do titular: pelo escopo contratado, o acompanhante não
 * mexe na LGPD, não exporta nem exclui a conta.
 */
export default function ProfilePrivacySection() {
  return (
    <ProfileSection title="PRIVACIDADE E DADOS (LGPD)">
      <div className="flex flex-col gap-2">
        <LegalDocumentLinks />
        <ProfileLinkRow to="/perfil/lgpd" icon={Shield} label="Meus consentimentos e direitos" />
        <ProfileLinkRow
          to="/perfil/lgpd"
          icon={CircleQuestionMark}
          label="Solicitar exportação dos meus dados"
        />
        <ProfileLinkRow to="/perfil/lgpd" icon={LogOut} label="Solicitar exclusão de conta" tone="danger" />
      </div>
    </ProfileSection>
  );
}
