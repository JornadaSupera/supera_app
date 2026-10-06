import { Download, Shield, Trash2 } from 'lucide-react';
import LegalDocumentLinks from './LegalDocumentLinks';
import { ProfileLinkRow, ProfileSection } from './ProfileRows';

/**
 * Termos, consentimentos e os pedidos do titular (exportação e exclusão). É
 * ação exclusiva do titular: pelo escopo contratado, o acompanhante não
 * mexe na LGPD, não exporta nem exclui a conta.
 *
 * Os ícones são os dos cartões da tela LGPD, para onde as linhas levam: a seta
 * de baixar na exportação e a lixeira na exclusão. A seta de saída fica só
 * para o "Sair" da conta.
 */
export default function ProfilePrivacySection() {
  return (
    <ProfileSection title="Privacidade e dados (LGPD)">
      <div className="flex flex-col gap-2">
        <LegalDocumentLinks />
        <ProfileLinkRow to="/perfil/lgpd" icon={Shield} label="Meus consentimentos e direitos" />
        <ProfileLinkRow to="/perfil/lgpd" icon={Download} label="Solicitar exportação dos meus dados" />
        <ProfileLinkRow to="/perfil/lgpd" icon={Trash2} label="Solicitar exclusão de conta" tone="danger" />
      </div>
    </ProfileSection>
  );
}
