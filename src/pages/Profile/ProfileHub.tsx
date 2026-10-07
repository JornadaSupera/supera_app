import { useState } from 'react';
import { useNavigate } from 'react-router';
import { FingerprintPattern, LogOut, Moon, SlidersHorizontal } from 'lucide-react';
import Switch from '../../components/ui/switch';
import Button from '../../components/ui/button';
import ExpansionTile from '../../components/ui/expansion-tile';
import Loading from '../../components/ui/loading';
import ErrorState from '../../components/ui/error-state';
import ConfirmDialog from '../../components/ui/confirm-dialog';
import TabScreen from '../../components/ui/tab-screen';
import { BrandStatusBand } from '../../components/ui/brand-cover';
import { usePatient } from '../../hooks/usePatient';
import { describeMutationError, useSignOut } from '../../hooks/useAuth';
import { useBiometricAvailable, useBiometricSetting } from '../../hooks/useBiometric';
import { useScopeAllowed } from '../../hooks/useCaregiver';
import { useDevicePreferencesStore } from '../../stores/devicePreferencesStore';
import { useSessionStore } from '../../stores/sessionStore';
import ClinicContacts from '../../components/ClinicContacts';
import WardLinkSection from './WardLinkSection';
import CaregiverProfileSection from './CaregiverProfileSection';
import KnowledgeCenterProfileSection from './KnowledgeCenterProfileSection';
import ProfileIdentitySection from './ProfileIdentitySection';
import ProfileTreatmentSection from './ProfileTreatmentSection';
import ProfileContactSection from './ProfileContactSection';
import ProfilePrivacySection from './ProfilePrivacySection';
import ProfileAboutSection from './ProfileAboutSection';
import NotificationPreferenceSwitches from './NotificationPreferenceSwitches';
import QuietHoursControl from './QuietHoursControl';
import { ProfileSection } from './ProfileRows';

export default function ProfileHub() {
  const navigate = useNavigate();
  const signOutMutation = useSignOut();

  const [isConfirmingSignOut, setIsConfirmingSignOut] = useState(false);

  const {
    data: patient,
    isLoading: isPatientLoading,
    isError: isPatientError,
    error: patientError,
    refetch: refetchPatient,
  } = usePatient();

  // Sessão de acompanhante: revelar CPF/telefone/e-mail e a seção de LGPD são
  // ações exclusivas do titular (ver README seção 4 e `RevealableValue`) — a
  // RLS já barra a escrita, isto só evita oferecer um botão que não leva a
  // lugar nenhum.
  const isCaregiver = useSessionStore((state) => state.isCaregiver);
  const { allowed: clinicalRecordAllowed } = useScopeAllowed('clinical_record');

  // `biometria` e `darkTheme` não são dado de paciente: são preferência
  // DESTE APARELHO, sem tabela no banco (ver a nota em `types/patient.ts`).
  // Vêm da store de preferências de aparelho — a mesma que `main.tsx` lê no
  // boot para pintar `data-theme` antes do primeiro render.
  const darkTheme = useDevicePreferencesStore((state) => state.darkTheme);
  const setDarkTheme = useDevicePreferencesStore((state) => state.setDarkTheme);

  // Ligar exige confirmar a biometria ali mesmo (ver `useBiometricSetting`, o
  // mesmo da caixinha da Início). Desligar é só aqui.
  const { data: biometriaSuportada } = useBiometricAvailable();
  const biometric = useBiometricSetting();

  const handleBiometricChange = (turnOn: boolean) => {
    if (turnOn) {
      void biometric.enable();
    } else {
      biometric.disable();
    }
  };

  async function handleSignOut() {
    // `await` é obrigatório: sem ele a navegação disputa com a limpeza da
    // sessão e do cache, e o guard de rota devolveria o usuário para cá. A
    // desassociação do push já acontece dentro de `signOut`, na store (ver
    // `syncPushIdentity` em `stores/sessionStore.ts`) — vale para esta tela
    // e para qualquer outra que chame `useSignOut`.
    await signOutMutation.mutateAsync();
    navigate('/login');
  }

  // Na moldura da aba, como o erro logo abaixo: a barra de navegação fica
  // embaixo desde o primeiro carregamento, em vez de sumir e voltar.
  if (isPatientLoading) {
    return (
      <TabScreen>
        <Loading />
      </TabScreen>
    );
  }

  if (isPatientError || !patient) {
    return (
      <TabScreen>
        <ErrorState
          title="Não foi possível carregar seu perfil"
          // A mensagem do próprio erro, e não "verifique sua conexão": na
          // sessão do acompanhante a causa mais provável não é rede — é o
          // vínculo revogado (`get_my_ward()` passa a devolver vazio na hora).
          // Prometer que outra tentativa resolve seria falso.
          description={describeMutationError(patientError, 'Verifique sua conexão e tente novamente.')}
          onRetry={() => void refetchPatient()}
        />
      </TabScreen>
    );
  }

  return (
    <TabScreen
      header={
        // A capa verde é o cabeçalho do Perfil, como na Início e no Chat:
        // foto, nome, CPF e idade já moram nela.
        <>
          <BrandStatusBand />
          <ProfileIdentitySection patient={patient} isCaregiver={isCaregiver} />
        </>
      }
    >
      {/* Margem lateral de 16px e 32px entre as seções, como no guia. */}
      <main className="flex flex-1 flex-col gap-8 px-4 pt-6 pb-8">
        {/* Só na sessão do acompanhante: diz quem ele acompanha, desde
            quando, e traz a conta e a foto DELE — o que faltava para ele saber
            que a ficha acima não é a dele. */}
        {isCaregiver && <WardLinkSection wardName={patient.name} />}

        {/* A ficha clínica é uma das áreas que o titular pode retirar do
            acompanhante. Retirada, a seção sai inteira — em vez de mostrar
            "Não informado" em tudo, que diria que não há diagnóstico. */}
        {clinicalRecordAllowed && <ProfileTreatmentSection patient={patient} />}

        <KnowledgeCenterProfileSection />

        {/* Contato é dado do titular. Na sessão do acompanhante os dois campos
            chegam nulos (o banco não os entrega), e uma seção com dois "Não
            informado" só confundiria. */}
        {(patient.phone || patient.email) && (
          <ProfileContactSection phone={patient.phone} email={patient.email} canReveal={!isCaregiver} />
        )}

        {/* Gerenciar o acompanhante é do titular, como a LGPD. */}
        {!isCaregiver && <CaregiverProfileSection />}

        {/* Com o título de seção próprio, como as outras: sem ele o bloco
            parecia parte de "Meu acompanhante", logo acima. */}
        <ProfileSection title="Configurações">
          {/* Recolhido por padrão: são ajustes que se mexe de vez em quando, e
              não precisam ocupar a tela do Perfil. */}
          <ExpansionTile
            icon={SlidersHorizontal}
            title="Preferências"
            subtitle={biometriaSuportada ? 'Biometria, notificações e aparência' : 'Notificações e aparência'}
          >
            {/* Cada ajuste é um card de lista do guia, com a mesma sombra do
                cabeçalho do bloco. */}
            <div className="flex flex-col gap-2">
              {/* Só aparece onde existe: no navegador e em aparelho sem digital
                  cadastrada o atalho não tem como funcionar, e um interruptor
                  morto é pior que ausência — promete o que não entrega. */}
              {biometriaSuportada && (
                <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-sm">
                  {/* Por causa da nota, aqui o respiro de 16 px é do cartão, e não
                      do interruptor (como em "Modo escuro"). O `py-3` com o
                      `-my-3` põe o texto a 16 px do topo com uma ou duas linhas
                      — centrado na linha de 48 px, o rótulo de uma linha (no
                      tablet) descia 12 px —, e o toque segue com 48 px,
                      encostando na nota sem sobrepor (`gap-3`). O ícone fica a
                      12 px do texto, como no cabeçalho de "Preferências". */}
                  <Switch
                    id="biometria"
                    checked={biometric.enabled}
                    disabled={biometric.isPending}
                    onChange={handleBiometricChange}
                    className="-my-3 py-3"
                    label={
                      <span className="flex items-center gap-3">
                        <FingerprintPattern
                          size={24}
                          strokeWidth={2}
                          className="shrink-0 text-primary-deep"
                          aria-hidden="true"
                        />
                        Desbloquear com biometria (Face / Touch ID)
                      </span>
                    }
                  />
                  {/* Sair apaga a sessão do cofre, e é ela que a biometria
                      destrava — sem esta linha o atalho parece quebrado para
                      quem testa saindo e entrando. O espaço é o `gap` do
                      cartão: o reset de `index.css` zera a margem de `<p>`. O
                      `pl-9` (ícone de 24 px + 12 px) alinha a nota ao texto do
                      interruptor, como na janela de silêncio. */}
                  <p className="pl-9 text-caption font-medium text-muted-foreground">
                    Vale quando você reabre o app sem ter saído. Se usar “Sair”, o próximo acesso
                    pede e-mail e senha.
                  </p>
                </div>
              )}

              <NotificationPreferenceSwitches />

              <QuietHoursControl />

              <Switch
                id="dark-theme"
                checked={darkTheme}
                onChange={setDarkTheme}
                label={
                  <span className="flex items-center gap-3">
                    <Moon size={24} strokeWidth={2} className="shrink-0 text-primary-deep" aria-hidden="true" />
                    Modo escuro
                  </span>
                }
                className="rounded-xl border border-border bg-card p-4 shadow-sm"
              />
            </div>
          </ExpansionTile>
        </ProfileSection>

        {!isCaregiver && <ProfilePrivacySection />}

        {/* Antes era uma linha "Ajuda e suporte" que só levava ao chat. Agora
            são os contatos da clínica (telefones e site do folheto da Supera)
            e o chat, juntos. */}
        <ProfileSection title="Fale com a Supera">
          <ClinicContacts />
        </ProfileSection>

        <ProfileAboutSection />

        <Button variant="outline" fullWidth onClick={() => setIsConfirmingSignOut(true)}>
          Sair
        </Button>
      </main>

      <ConfirmDialog
        open={isConfirmingSignOut}
        title="Sair da conta"
        description="Você vai precisar entrar de novo com seu e-mail e senha para continuar acompanhando seu tratamento."
        confirmLabel="Sair"
        titleIcon={LogOut}
        loading={signOutMutation.isPending}
        onConfirm={() => void handleSignOut()}
        onCancel={() => setIsConfirmingSignOut(false)}
      />
    </TabScreen>
  );
}
