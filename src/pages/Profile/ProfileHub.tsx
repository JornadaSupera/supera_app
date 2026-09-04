import { useState, type CSSProperties } from 'react';
import { Link, useNavigate } from 'react-router';
import {
  Shield,
  ChevronRight,
  Users,
  CircleQuestionMark,
  LogOut,
  Star,
  FingerprintPattern,
  Bell,
  Moon,
  Heart,
  Pill,
  Calendar,
  CircleAlert,
  Phone,
  Mail,
  Settings,
} from 'lucide-react';
import Avatar from '../../components/ui/avatar';
import Card from '../../components/ui/card';
import Switch from '../../components/ui/switch';
import Button from '../../components/ui/button';
import Loading from '../../components/ui/loading';
import ErrorState from '../../components/ui/error-state';
import ConfirmDialog from '../../components/ui/confirm-dialog';
import BottomTab from '../../components/ui/bottom-tab';
import { useCaregiver } from '../../hooks/useCaregiver';
import { useNotificationPreferences, useSetNotificationPreference } from '../../hooks/useNotifications';
import { maskEmail, maskPhone } from '../../utils/contact';
import { usePatient } from '../../hooks/usePatient';
import { useSignOut } from '../../hooks/useAuth';
import { clearPushUser } from '../../services/pushNotifications';
import { useDevicePreferencesStore } from '../../stores/devicePreferencesStore';

function mascararCPF(cpf: string): string {
  const digitos = cpf.replace(/\D/g, '');
  return `•••.•••.${digitos.slice(6, 9)}-${digitos.slice(9)}`;
}

function calcularIdade(dataNascimento: Date): number {
  const hoje = new Date();
  let idade = hoje.getFullYear() - dataNascimento.getFullYear();
  const aindaNaoFezAniversario =
    hoje.getMonth() < dataNascimento.getMonth() ||
    (hoje.getMonth() === dataNascimento.getMonth() && hoje.getDate() < dataNascimento.getDate());
  if (aindaNaoFezAniversario) idade -= 1;
  return idade;
}

export default function ProfileHub() {
  const navigate = useNavigate();
  const signOutMutation = useSignOut();

  const [confirmandoSaida, setConfirmandoSaida] = useState(false);

  // Two independent queries instead of one `Promise.all`: each resource owns
  // its own loading state, so a slow caregiver lookup never blocks the
  // patient summary (and vice versa).
  const {
    data: paciente,
    isLoading: carregandoPaciente,
    isError: erroPaciente,
    refetch: recarregarPaciente,
  } = usePatient();
  const { data: cuidador, isLoading: carregandoCuidador } = useCaregiver();

  // Notificações que a conta pode silenciar (canal push). Vem do banco —
  // `notification_types` onde `is_silenceable = true` — em vez de 3 switches
  // fixos: se a clínica cadastrar um tipo silenciável novo, o toggle aparece
  // sozinho, sem precisar tocar nesta tela.
  const {
    data: preferenciasNotificacao,
    isLoading: carregandoPreferencias,
    isError: erroPreferencias,
    refetch: recarregarPreferencias,
  } = useNotificationPreferences();
  const setPreferenciaMutation = useSetNotificationPreference();

  // `biometria` e `temaEscuro` não são dado de paciente: são preferência
  // DESTE APARELHO, sem tabela no banco (ver a nota em `types/patient.ts`).
  // Vêm da store de preferências de aparelho — a mesma que `main.tsx` lê no
  // boot para pintar `data-theme` antes do primeiro render.
  const temaEscuro = useDevicePreferencesStore((state) => state.temaEscuro);
  const setTemaEscuro = useDevicePreferencesStore((state) => state.setTemaEscuro);
  const biometriaAtiva = useDevicePreferencesStore((state) => state.biometriaAtiva);
  const setBiometriaAtiva = useDevicePreferencesStore((state) => state.setBiometriaAtiva);

  async function handleSair() {
    // `await` é obrigatório: sem ele a navegação disputa com a limpeza da
    // sessão e do cache, e o guard de rota devolveria o usuário para cá.
    await signOutMutation.mutateAsync();
    clearPushUser();
    navigate('/login');
  }

  if (carregandoPaciente) {
    return <Loading />;
  }

  if (erroPaciente || !paciente) {
    return (
      <div className="flex min-h-[100dvh] flex-col bg-background">
        <ErrorState
          title="Não foi possível carregar seu perfil"
          description="Verifique sua conexão e tente novamente."
          onRetry={() => void recarregarPaciente()}
        />
        <BottomTab />
      </div>
    );
  }

  const [ano, mes, dia] = paciente.dataNascimento.split('-').map(Number);
  const dataNascimento = new Date(ano, mes - 1, dia);
  const idade = calcularIdade(dataNascimento);
  const dataNascimentoLabel = dataNascimento.toLocaleDateString('pt-BR');

  return (
    <div className="flex min-h-[100dvh] flex-col bg-background">
      <header className="sticky top-0 z-10 border-b border-border bg-[color-mix(in_srgb,var(--color-background)_95%,transparent)] px-6 pt-6 pb-4 backdrop-blur-[8px]">
        <p className="text-[12px] font-medium tracking-[0.05em] text-muted-foreground uppercase">
          MEU PERFIL
        </p>
        <h1 className="mt-0.5 text-[24px] font-semibold tracking-[-0.6px] text-foreground">
          {paciente.nome.split(' ')[0]}
        </h1>
      </header>

      <main className="flex flex-1 flex-col gap-6 px-6 pt-5 pb-8">
        <section className="flex flex-col items-center gap-[4px] text-center">
          <Avatar
            // Avatar.jsx declares `src` with no default, so its JS-inferred
            // type marks it required even though the component itself falls
            // back to initials when it's absent — same documented pattern as
            // `fotoUrl={undefined}` in Home.jsx (see src/types/patient.ts).
            src={undefined}
            name={paciente.nome}
            size="xl"
            ring
            className="mb-2"
            // Ring color mixes the brand primary at a fixed opacity — a custom
            // property with no static Tailwind class, so `style` stays as a
            // deliberate exception to the no-inline-style rule.
            style={
              {
                '--avatar-ring-color': 'color-mix(in srgb, var(--color-primary) 20%, transparent)',
              } as CSSProperties
            }
          />
          <p className="text-[18px] font-semibold text-foreground">{paciente.nome}</p>
          <p className="text-[12px] text-muted-foreground">CPF {mascararCPF(paciente.cpf)}</p>
          <p className="text-[12px] text-muted-foreground">
            {idade} anos · nasc. {dataNascimentoLabel}
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-[12px] font-semibold tracking-[0.05em] text-muted-foreground uppercase">
            TRATAMENTO
          </h2>
          <div className="flex flex-col gap-2">
            <div className="flex items-start gap-3 rounded-xl border border-border bg-card p-3.5">
              <Heart
                size={16}
                strokeWidth={2}
                className="mt-[2px] shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-medium tracking-[0.05em] text-muted-foreground uppercase">
                  DIAGNÓSTICO
                </p>
                <p className="mt-[2px] text-[14px] leading-[1.4] text-foreground">
                  {paciente.diagnostico
                    ? `${paciente.diagnostico.cid} · ${paciente.diagnostico.descricao}`
                    : 'Ainda não lançado'}
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3 rounded-xl border border-border bg-card p-3.5">
              <Pill
                size={16}
                strokeWidth={2}
                className="mt-[2px] shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-medium tracking-[0.05em] text-muted-foreground uppercase">
                  PROTOCOLO
                </p>
                <p className="mt-[2px] text-[14px] leading-[1.4] text-foreground">
                  {paciente.protocolo ?? 'Nenhum plano em andamento'}
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3 rounded-xl border border-border bg-card p-3.5">
              <Calendar
                size={16}
                strokeWidth={2}
                className="mt-[2px] shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-medium tracking-[0.05em] text-muted-foreground uppercase">
                  ESTADIAMENTO
                </p>
                <p className="mt-[2px] text-[14px] leading-[1.4] text-foreground">
                  {paciente.estadiamento ?? 'Não informado'}
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3 rounded-xl border border-border bg-card p-3.5">
              <CircleAlert
                size={16}
                strokeWidth={2}
                className="mt-[2px] shrink-0 text-destructive"
                aria-hidden="true"
              />
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-medium tracking-[0.05em] text-muted-foreground uppercase">
                  ALERGIAS
                </p>
                <p className="mt-[2px] text-[14px] leading-[1.4] text-foreground">
                  {paciente.alergias.length > 0 ? paciente.alergias.join(', ') : 'Nenhuma registrada'}
                </p>
              </div>
            </div>
            {paciente.reacoesPrevias.length > 0 && (
              <div className="mt-1 rounded-xl border border-border bg-[color-mix(in_srgb,var(--color-muted)_30%,transparent)] p-3">
                <p className="text-[10px] font-medium tracking-[0.05em] text-muted-foreground uppercase">
                  REAÇÕES PRÉVIAS
                </p>
                <ul className="mt-1 flex flex-col gap-[4px]">
                  {paciente.reacoesPrevias.map((reacao) => (
                    <li
                      key={reacao}
                      className="text-[12px] leading-[1.4] text-foreground before:content-['·_']"
                    >
                      {reacao}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </section>

        <section>
          <h2 className="mb-3 text-[12px] font-semibold tracking-[0.05em] text-muted-foreground uppercase">
            CONTATO
          </h2>
          <div className="flex flex-col gap-2">
            <div className="flex items-start gap-3 rounded-xl border border-border bg-card p-3.5">
              <Phone
                size={16}
                strokeWidth={2}
                className="mt-[2px] shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-medium tracking-[0.05em] text-muted-foreground uppercase">
                  TELEFONE
                </p>
                <p className="mt-[2px] text-[14px] leading-[1.4] text-foreground">
                  {paciente.celular ? maskPhone(paciente.celular) : 'Não informado'}
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3 rounded-xl border border-border bg-card p-3.5">
              <Mail
                size={16}
                strokeWidth={2}
                className="mt-[2px] shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-medium tracking-[0.05em] text-muted-foreground uppercase">
                  E-MAIL
                </p>
                <p className="mt-[2px] text-[14px] leading-[1.4] text-foreground">{maskEmail(paciente.email)}</p>
              </div>
            </div>
          </div>
        </section>

        <section>
          <h2 className="mb-3 text-[12px] font-semibold tracking-[0.05em] text-muted-foreground uppercase">
            CUIDADOR
          </h2>
          {carregandoCuidador ? (
            <Loading inline />
          ) : cuidador?.atual ? (
            <Link
              to="/cuidador"
              className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 transition-[border-color,box-shadow] duration-200 ease-[ease] hover:border-[color-mix(in_srgb,var(--color-primary)_30%,var(--color-border))] hover:shadow-sm"
            >
              {/* O nome do acompanhante nao e legivel pelo titular — o
                  vinculo aparece pelo contato para onde ele mesmo enviou o
                  convite (ver `types/caregiver.ts`). */}
              <Avatar
                src={undefined}
                name={cuidador.atual.contato ?? 'Acompanhante'}
                size="md"
              />
              <span className="min-w-0 flex-1 text-[14px] font-medium text-foreground">
                <span className="block truncate">
                  {cuidador.atual.contato ?? 'Acompanhante vinculado'}
                </span>
                <span className="mt-[2px] block text-[12px] font-normal text-muted-foreground">
                  Acompanhante vinculado
                </span>
              </span>
              <ChevronRight
                size={18}
                strokeWidth={2}
                className="shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
            </Link>
          ) : (
            <Card variant="default" padding="md" flat className="flex flex-col items-center text-center">
              <span className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-[color-mix(in_srgb,var(--color-supera-uniao)_15%,transparent)] text-[var(--color-supera-uniao)]">
                <Users size={18} strokeWidth={2} aria-hidden="true" />
              </span>
              <p className="text-[14px] font-medium text-foreground">Nenhum cuidador vinculado ainda</p>
              <p className="mt-1 max-w-[30ch] text-[12px] leading-[1.4] text-muted-foreground">
                Convide alguém de confiança para acompanhar sua agenda, orientações, chat e diário.
              </p>
              <Link
                to="/cuidador"
                className="mt-4 inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-primary px-4 text-sm font-semibold text-primary transition-colors duration-150 ease-[ease] hover:bg-[color-mix(in_srgb,var(--color-primary)_8%,transparent)]"
              >
                Convidar cuidador
                <ChevronRight size={14} strokeWidth={2} aria-hidden="true" />
              </Link>
            </Card>
          )}
        </section>

        <section>
          <h2 className="mb-3 text-[12px] font-semibold tracking-[0.05em] text-muted-foreground uppercase">
            PREFERÊNCIAS
          </h2>
          <div className="flex flex-col gap-2">
            <Switch
              id="biometria"
              checked={biometriaAtiva}
              onChange={setBiometriaAtiva}
              label={
                <span className="inline-flex items-center gap-2">
                  <FingerprintPattern
                    size={16}
                    strokeWidth={2}
                    className="shrink-0 text-muted-foreground"
                    aria-hidden="true"
                  />
                  Desbloquear com biometria (Face / Touch ID)
                </span>
              }
              className="rounded-xl border border-border bg-card p-3.5"
            />

            {/* Um toggle por tipo silenciável, na ordem do catálogo — sem
                lista fixa no front (ver comentário acima da query). */}
            {carregandoPreferencias ? (
              <Loading inline />
            ) : erroPreferencias ? (
              <div className="flex items-center justify-between gap-3 rounded-xl border border-[color-mix(in_srgb,var(--color-destructive)_30%,transparent)] bg-[color-mix(in_srgb,var(--color-destructive)_6%,transparent)] p-4">
                <p className="text-[12px] text-foreground">
                  Não foi possível carregar as preferências de notificação.
                </p>
                <Button variant="outline" size="sm" onClick={() => void recarregarPreferencias()}>
                  Tentar novamente
                </Button>
              </div>
            ) : (
              preferenciasNotificacao?.map((preferencia) => (
                <Switch
                  key={preferencia.typeId}
                  id={`notificacao-${preferencia.code}`}
                  checked={preferencia.enabled}
                  onChange={(v: boolean) =>
                    setPreferenciaMutation.mutate({ typeId: preferencia.typeId, enabled: v })
                  }
                  label={
                    <span className="inline-flex items-center gap-2">
                      <Bell
                        size={16}
                        strokeWidth={2}
                        className="shrink-0 text-muted-foreground"
                        aria-hidden="true"
                      />
                      {preferencia.label}
                    </span>
                  }
                  className="rounded-xl border border-border bg-card p-3.5"
                />
              ))
            )}

            <Switch
              id="temaEscuro"
              checked={temaEscuro}
              onChange={setTemaEscuro}
              label={
                <span className="inline-flex items-center gap-2">
                  <Moon size={16} strokeWidth={2} className="shrink-0 text-muted-foreground" aria-hidden="true" />
                  Modo escuro
                </span>
              }
              className="rounded-xl border border-border bg-card p-3.5"
            />
          </div>
        </section>

        <section>
          <h2 className="mb-3 text-[12px] font-semibold tracking-[0.05em] text-muted-foreground uppercase">
            PRIVACIDADE E DADOS (LGPD)
          </h2>
          <div className="flex flex-col gap-2">
            <Link
              to="/perfil/lgpd"
              className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 transition-[border-color,box-shadow] duration-200 ease-[ease] hover:border-[color-mix(in_srgb,var(--color-primary)_30%,var(--color-border))] hover:shadow-sm"
            >
              <Shield size={16} strokeWidth={2} className="shrink-0 text-muted-foreground" aria-hidden="true" />
              <span className="flex-1 text-[14px] font-normal text-foreground">
                Termos de uso e política de privacidade
              </span>
              <ChevronRight
                size={16}
                strokeWidth={2}
                className="shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
            </Link>
            <Link
              to="/perfil/lgpd"
              className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 transition-[border-color,box-shadow] duration-200 ease-[ease] hover:border-[color-mix(in_srgb,var(--color-primary)_30%,var(--color-border))] hover:shadow-sm"
            >
              <CircleQuestionMark
                size={16}
                strokeWidth={2}
                className="shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
              <span className="flex-1 text-[14px] font-normal text-foreground">
                Solicitar exportação dos meus dados
              </span>
              <ChevronRight
                size={16}
                strokeWidth={2}
                className="shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
            </Link>
            <Link
              to="/perfil/lgpd"
              className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 transition-[border-color,box-shadow] duration-200 ease-[ease] hover:border-[color-mix(in_srgb,var(--color-primary)_30%,var(--color-border))] hover:shadow-sm"
            >
              <LogOut size={16} strokeWidth={2} className="shrink-0 text-destructive" aria-hidden="true" />
              <span className="flex-1 text-[14px] font-normal text-destructive">
                Solicitar exclusão de conta
              </span>
              <ChevronRight
                size={16}
                strokeWidth={2}
                className="shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
            </Link>
          </div>
        </section>

        <section>
          <h2 className="mb-3 text-[12px] font-semibold tracking-[0.05em] text-muted-foreground uppercase">
            SOBRE
          </h2>
          <div className="flex flex-col gap-2">
            <Link
              to="/chat"
              className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 transition-[border-color,box-shadow] duration-200 ease-[ease] hover:border-[color-mix(in_srgb,var(--color-primary)_30%,var(--color-border))] hover:shadow-sm"
            >
              <CircleQuestionMark
                size={16}
                strokeWidth={2}
                className="shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
              <span className="flex-1 text-[14px] font-normal text-foreground">Ajuda e suporte</span>
              <ChevronRight
                size={16}
                strokeWidth={2}
                className="shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
            </Link>
            <Link
              to="/nps"
              className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 transition-[border-color,box-shadow] duration-200 ease-[ease] hover:border-[color-mix(in_srgb,var(--color-primary)_30%,var(--color-border))] hover:shadow-sm"
            >
              <Star size={16} strokeWidth={2} className="shrink-0 text-muted-foreground" aria-hidden="true" />
              <span className="flex-1 text-[14px] font-normal text-foreground">Avaliar o atendimento</span>
              <ChevronRight
                size={16}
                strokeWidth={2}
                className="shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
            </Link>
            <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-3.5">
              <Settings size={16} strokeWidth={2} className="shrink-0 text-muted-foreground" aria-hidden="true" />
              <span className="flex-1 text-[14px] font-normal text-foreground">Versão do app: 1.0.0</span>
            </div>
          </div>
        </section>

        <Button variant="outline" fullWidth onClick={() => setConfirmandoSaida(true)}>
          Sair
        </Button>
      </main>

      <ConfirmDialog
        open={confirmandoSaida}
        title="Sair da conta"
        description="Você vai precisar entrar de novo com seu e-mail e senha para continuar acompanhando seu tratamento."
        confirmLabel="Sair"
        titleIcon={LogOut}
        loading={signOutMutation.isPending}
        onConfirm={() => void handleSair()}
        onCancel={() => setConfirmandoSaida(false)}
      />

      <BottomTab />
    </div>
  );
}
