import { Info, Settings, Star } from 'lucide-react';
import { usePendingNpsSurvey } from '../../hooks/useNps';
import { APP_VERSION } from '../../lib/appInfo';
import { ProfileLinkRow, ProfileSection, profileRowClass } from './ProfileRows';

/**
 * "Sobre a Supera" (missão, visão e valores da clínica), a pesquisa de
 * satisfação (quando há uma aberta) e a versão do app.
 */
export default function ProfileAboutSection() {
  // O link "Avaliar o atendimento" só existe com pesquisa aberta e sem
  // resposta — sem ela, levaria a uma tela sem nada para responder.
  const { data: pendingSurvey } = usePendingNpsSurvey();

  return (
    <ProfileSection title="Sobre">
      <div className="flex flex-col gap-2">
        <ProfileLinkRow to="/perfil/sobre" icon={Info} label="Sobre a Supera" />
        {pendingSurvey && <ProfileLinkRow to="/nps" icon={Star} label="Avaliar o atendimento" />}
        {/* Só informação, sem toque: o cartão das linhas, sem o realce do ponteiro. */}
        <div className={profileRowClass}>
          <Settings size={24} strokeWidth={2} className="shrink-0 text-primary-deep" aria-hidden="true" />
          <span className="flex-1 text-body text-foreground">Versão do app: {APP_VERSION}</span>
        </div>
      </div>
    </ProfileSection>
  );
}
