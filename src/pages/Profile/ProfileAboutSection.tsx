import { Settings, Star } from 'lucide-react';
import { usePendingNpsSurvey } from '../../hooks/useNps';
import { APP_VERSION } from '../../lib/appInfo';
import { ProfileLinkRow, ProfileSection } from './ProfileRows';

/** A pesquisa de satisfação (quando há uma aberta) e a versão do app. */
export default function ProfileAboutSection() {
  // O link "Avaliar o atendimento" só existe com pesquisa aberta e sem
  // resposta — sem ela, levaria a uma tela sem nada para responder.
  const { data: pendingSurvey } = usePendingNpsSurvey();

  return (
    <ProfileSection title="SOBRE">
      <div className="flex flex-col gap-2">
        {pendingSurvey && <ProfileLinkRow to="/nps" icon={Star} label="Avaliar o atendimento" />}
        <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-3.5">
          <Settings size={16} strokeWidth={2} className="shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className="flex-1 text-[14px] font-normal text-foreground">
            Versão do app: {APP_VERSION}
          </span>
        </div>
      </div>
    </ProfileSection>
  );
}
