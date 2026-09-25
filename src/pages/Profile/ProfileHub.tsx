import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Link, useNavigate } from 'react-router';
import {
  Shield,
  ChevronRight,
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
  Eye,
  EyeOff,
  Clock,
  SlidersHorizontal,
} from 'lucide-react';
import Avatar from '../../components/ui/avatar';
import Switch from '../../components/ui/switch';
import Input from '../../components/ui/input';
import Button from '../../components/ui/button';
import ExpansionTile from '../../components/ui/expansion-tile';
import Loading from '../../components/ui/loading';
import ErrorState from '../../components/ui/error-state';
import ConfirmDialog from '../../components/ui/confirm-dialog';
import TabHeader from '../../components/ui/tab-header';
import TabScreen from '../../components/ui/tab-screen';
import {
  useNotificationPreferences,
  useQuietHours,
  useSetNotificationPreference,
  useSetQuietHours,
} from '../../hooks/useNotifications';
import { maskEmail, maskPhone } from '../../utils/contact';
import { usePatient } from '../../hooks/usePatient';
import { useSignOut } from '../../hooks/useAuth';
import { useBiometricAuthentication, useBiometricAvailable } from '../../hooks/useBiometric';
import { usePendingNpsSurvey } from '../../hooks/useNps';
import { useDevicePreferencesStore } from '../../stores/devicePreferencesStore';
import type { QuietHours } from '../../types';
import { useSessionStore } from '../../stores/sessionStore';
import { useToast } from '../../contexts/ToastContext';
import CaregiverProfileSection from './CaregiverProfileSection';
import KnowledgeCenterProfileSection from './KnowledgeCenterProfileSection';
import LegalDocumentLinks from './LegalDocumentLinks';
import { CAREGIVER_MODULE_ENABLED } from '../../lib/features';

function mascararCPF(cpf: string): string {
  const digitos = cpf.replace(/\D/g, '');
  return `•••.•••.${digitos.slice(6, 9)}-${digitos.slice(9)}`;
}

/**
 * CPF/telefone/e-mail ficam mascarados por padrão e só revelam sob ação
 * explícita (Regra nº3) — e essa ação é exclusiva do titular. Um acompanhante
 * lê o perfil do tutelado normalmente, mas não ganha o controle de revelar o
 * dado dele — mesmo espírito de `useCanMarkResources` (RLS decide o acesso,
 * isto é só a UI não oferecer a ação a quem não é dona do dado).
 */
function RevealableValue({
  masked,
  full,
  canReveal,
  ariaLabel,
}: {
  masked: string;
  full: string;
  canReveal: boolean;
  ariaLabel: string;
}) {
  const [revelado, setRevelado] = useState(false);

  if (!canReveal) {
    return <p className="mt-[2px] text-[14px] leading-[1.4] text-foreground">{masked}</p>;
  }

  return (
    <button
      type="button"
      onClick={() => setRevelado((v) => !v)}
      aria-pressed={revelado}
      aria-label={revelado ? `Ocultar ${ariaLabel}` : `Mostrar ${ariaLabel}`}
      className="mt-[2px] flex min-h-[24px] cursor-pointer items-center gap-2 border-none bg-transparent p-0 text-left text-[14px] leading-[1.4] text-foreground"
    >
      {revelado ? full : masked}
      {revelado ? (
        <EyeOff size={14} strokeWidth={2} className="shrink-0 text-muted-foreground" aria-hidden="true" />
      ) : (
        <Eye size={14} strokeWidth={2} className="shrink-0 text-muted-foreground" aria-hidden="true" />
      )}
    </button>
  );
}

const JANELA_SILENCIO_INICIO_PADRAO = '22:00';
const JANELA_SILENCIO_FIM_PADRAO = '07:00';

/** Espera esta pausa depois da última digitação antes de gravar — evita uma escrita por tecla. */
const JANELA_SILENCIO_DEBOUNCE_MS = 600;

/**
 * Atrasa o envio de notificações silenciáveis nesse período — nunca cancela
 * (README §5.8). Fica ligada/desligada como os outros toggles da seção; ligar
 * grava um horário padrão que a pessoa ajusta em seguida, desligar zera os
 * dois campos (`setQuietHours(null, null)`).
 */
function QuietHoursControl() {
  const { data: quietHours, isLoading } = useQuietHours();
  const setQuietHoursMutation = useSetQuietHours();

  // Rascunho local do que o paciente está ajustando — sem ele, cada tecla no
  // horário disparava a mutation na hora, e respostas fora de ordem podiam
  // deixar a tela mostrando um horário diferente do que foi salvo por último.
  const [rascunho, setRascunho] = useState<QuietHours | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  if (isLoading) {
    return <Loading inline />;
  }

  function salvar(novo: QuietHours) {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    setRascunho(novo);
    setQuietHoursMutation.mutate(novo, {
      // Só larga o rascunho quando a gravação assenta (sucesso OU erro): em
      // erro, `quietHours` da query continua com o valor antigo, e soltar o
      // rascunho antes faria o campo "voltar" visivelmente no mesmo instante
      // do toast de erro — melhor deixar o valor digitado até aí.
      onSettled: () => setRascunho(null),
    });
  }

  function agendarSalvar(novo: QuietHours) {
    setRascunho(novo);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null;
      salvar(novo);
    }, JANELA_SILENCIO_DEBOUNCE_MS);
  }

  // `rascunho` é o valor em edição (mesmo com campos `null`, é diferente de
  // "sem rascunho") — por isso o `?:` inteiro, não um `??` campo a campo, que
  // faria "desligar" cair de volta no horário salvo antes de a mutation
  // terminar.
  const inicioEfetivo = rascunho ? rascunho.start : (quietHours?.start ?? null);
  const fimEfetivo = rascunho ? rascunho.end : (quietHours?.end ?? null);
  const ativa = Boolean(inicioEfetivo && fimEfetivo);
  const inicio = inicioEfetivo ?? JANELA_SILENCIO_INICIO_PADRAO;
  const fim = fimEfetivo ?? JANELA_SILENCIO_FIM_PADRAO;
  const salvando = setQuietHoursMutation.isPending;

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-3.5">
      <Switch
        id="janela-silencio"
        checked={ativa}
        disabled={salvando}
        onChange={(ligar) =>
          salvar(
            ligar
              ? { start: JANELA_SILENCIO_INICIO_PADRAO, end: JANELA_SILENCIO_FIM_PADRAO }
              : { start: null, end: null }
          )
        }
        label={
          <span className="inline-flex items-center gap-2">
            <Clock size={16} strokeWidth={2} className="shrink-0 text-muted-foreground" aria-hidden="true" />
            Janela de silêncio
          </span>
        }
      />
      {ativa && (
        <div className="flex items-center gap-2 pl-[26px]">
          <Input
            type="time"
            aria-label="Início da janela de silêncio"
            value={inicio}
            disabled={salvando}
            onChange={(evento) => agendarSalvar({ start: evento.target.value, end: fim })}
            className="w-auto"
          />
          <span className="text-[13px] text-muted-foreground">até</span>
          <Input
            type="time"
            aria-label="Fim da janela de silêncio"
            value={fim}
            disabled={salvando}
            onChange={(evento) => agendarSalvar({ start: inicio, end: evento.target.value })}
            className="w-auto"
          />
        </div>
      )}
      <p className="pl-[26px] text-[11px] leading-[1.4] text-muted-foreground">
        Notificações silenciáveis atrasam o envio nesse período — nunca são canceladas.
      </p>
    </div>
  );
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
  const [cpfRevelado, setCpfRevelado] = useState(false);

  // Two independent queries instead of one `Promise.all`: each resource owns
  // its own loading state, so a slow caregiver lookup never blocks the
  // patient summary (and vice versa).
  const {
    data: paciente,
    isLoading: carregandoPaciente,
    isError: erroPaciente,
    refetch: recarregarPaciente,
  } = usePatient();

  // Sessão de acompanhante: revelar CPF/telefone/e-mail e a seção de LGPD são
  // ações exclusivas do titular (ver README seção 4 e `RevealableValue` acima)
  // — a RLS já barra a escrita, isto só evita oferecer um botão que não leva
  // a lugar nenhum.
  const isCaregiver = useSessionStore((state) => state.isCaregiver);

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

  // O link "Avaliar o atendimento" só existe com pesquisa aberta e sem
  // resposta — sem ela, levaria a uma tela sem nada para responder.
  const { data: pesquisaNpsPendente } = usePendingNpsSurvey();

  // `biometria` e `temaEscuro` não são dado de paciente: são preferência
  // DESTE APARELHO, sem tabela no banco (ver a nota em `types/patient.ts`).
  // Vêm da store de preferências de aparelho — a mesma que `main.tsx` lê no
  // boot para pintar `data-theme` antes do primeiro render.
  const { showToast } = useToast();
  const temaEscuro = useDevicePreferencesStore((state) => state.temaEscuro);
  const setTemaEscuro = useDevicePreferencesStore((state) => state.setTemaEscuro);
  const biometriaAtiva = useDevicePreferencesStore((state) => state.biometriaAtiva);
  const setBiometriaAtiva = useDevicePreferencesStore((state) => state.setBiometriaAtiva);

  // O toggle não é uma anotação: ligar exige confirmar a biometria ali mesmo.
  //
  // Antes ele só gravava um booleano. Isso deixava ligar o atalho num aparelho
  // sem digital cadastrada, ou sem que o iOS jamais tivesse pedido a permissão
  // de Face ID — e a promessa só falhava depois, na tela de login, quando já
  // não dava para explicar nada. Pedir a confirmação aqui faz o próprio ato de
  // ligar provar que funciona, e é o momento natural para o iOS mostrar o
  // pedido de permissão (`NSFaceIDUsageDescription`).
  const { data: biometriaSuportada } = useBiometricAvailable();
  const biometricAuthMutation = useBiometricAuthentication();

  const handleBiometriaChange = async (ligar: boolean) => {
    if (!ligar) {
      setBiometriaAtiva(false);
      return;
    }

    if (biometricAuthMutation.isPending) return;

    const confirmou = await biometricAuthMutation.mutateAsync();

    if (!confirmou) {
      showToast('Não foi possível confirmar sua biometria. O atalho segue desligado.', {
        variant: 'error',
      });
      return;
    }

    setBiometriaAtiva(true);
    showToast('Biometria ligada. Ela vale quando você reabrir o app sem ter saído.', {
      variant: 'success',
    });
  };

  async function handleSair() {
    // `await` é obrigatório: sem ele a navegação disputa com a limpeza da
    // sessão e do cache, e o guard de rota devolveria o usuário para cá. A
    // desassociação do push já acontece dentro de `signOut`, na store (ver
    // `syncPushIdentity` em `stores/sessionStore.ts`) — vale para esta tela
    // e para qualquer outra que chame `useSignOut`.
    await signOutMutation.mutateAsync();
    navigate('/login');
  }

  if (carregandoPaciente) {
    return <Loading />;
  }

  if (erroPaciente || !paciente) {
    return (
      <TabScreen>
        <ErrorState
          title="Não foi possível carregar seu perfil"
          description="Verifique sua conexão e tente novamente."
          onRetry={() => void recarregarPaciente()}
        />
      </TabScreen>
    );
  }

  const [ano, mes, dia] = paciente.dataNascimento.split('-').map(Number);
  const dataNascimento = new Date(ano, mes - 1, dia);
  const idade = calcularIdade(dataNascimento);
  const dataNascimentoLabel = dataNascimento.toLocaleDateString('pt-BR');

  return (
    <TabScreen header={<TabHeader eyebrow="MEU PERFIL" title={paciente.nome.split(' ')[0]} />}>

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
          {isCaregiver ? (
            <p className="text-[12px] text-muted-foreground">CPF {mascararCPF(paciente.cpf)}</p>
          ) : (
            <button
              type="button"
              onClick={() => setCpfRevelado((v) => !v)}
              aria-pressed={cpfRevelado}
              aria-label={cpfRevelado ? 'Ocultar CPF' : 'Mostrar CPF'}
              className="flex min-h-[24px] cursor-pointer items-center gap-1.5 border-none bg-transparent p-0 text-[12px] text-muted-foreground"
            >
              CPF {cpfRevelado ? paciente.cpf : mascararCPF(paciente.cpf)}
              {cpfRevelado ? (
                <EyeOff size={12} strokeWidth={2} aria-hidden="true" />
              ) : (
                <Eye size={12} strokeWidth={2} aria-hidden="true" />
              )}
            </button>
          )}
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

        <KnowledgeCenterProfileSection />

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
                {paciente.celular ? (
                  <RevealableValue
                    masked={maskPhone(paciente.celular)}
                    full={paciente.celular}
                    canReveal={!isCaregiver}
                    ariaLabel="telefone"
                  />
                ) : (
                  <p className="mt-[2px] text-[14px] leading-[1.4] text-foreground">Não informado</p>
                )}
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
                <RevealableValue
                  masked={maskEmail(paciente.email)}
                  full={paciente.email}
                  canReveal={!isCaregiver}
                  ariaLabel="e-mail"
                />
              </div>
            </div>
          </div>
        </section>

        {/* Gerenciar o acompanhante é do titular, como a LGPD. Só com o módulo
            ligado: no build, enquanto as funções do banco (item 30 do
            PENDENCIAS_BANCO.md) não existem, a seção levaria a uma tela que só
            falharia. */}
        {!isCaregiver && CAREGIVER_MODULE_ENABLED && <CaregiverProfileSection />}

        <section>
          {/* Recolhido por padrão: são ajustes que se mexe de vez em quando, e
              não precisam ocupar a tela do Perfil. */}
          <ExpansionTile
            icon={SlidersHorizontal}
            title="Preferências"
            subtitle={biometriaSuportada ? 'Biometria, notificações e aparência' : 'Notificações e aparência'}
          >
            <div className="flex flex-col gap-2">
              {/* Só aparece onde existe: no navegador e em aparelho sem digital
                  cadastrada o atalho não tem como funcionar, e um interruptor
                  morto é pior que ausência — promete o que não entrega. */}
              {biometriaSuportada && (
                <div className="rounded-xl border border-border bg-card p-3.5">
                  <Switch
                    id="biometria"
                    checked={biometriaAtiva}
                    disabled={biometricAuthMutation.isPending}
                    onChange={handleBiometriaChange}
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
                  />
                  {/* Sair apaga a sessão do cofre, e é ela que a biometria
                      destrava — sem esta linha o atalho parece quebrado para
                      quem testa saindo e entrando. */}
                  <p className="mt-2 text-[12px]/[1.5] text-muted-foreground">
                    Vale quando você reabre o app sem ter saído. Se usar “Sair”, o próximo acesso
                    pede e-mail e senha.
                  </p>
                </div>
              )}

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
                preferenciasNotificacao?.map((preferencia) => {
                  // Uma mutation só, compartilhada pela lista inteira (ver
                  // `useSetNotificationPreference`): `variables` reflete a
                  // ÚLTIMA chamada em andamento, então isto desabilita o
                  // toggle certo no caso comum (toque repetido no mesmo item).
                  // Alternar dois itens em sequência rápida é uma exceção mais
                  // rara que não corrompe dado nenhum — só o indicador visual
                  // de "salvando" de um dos dois pode piscar cedo demais.
                  const salvandoEsteItem =
                    setPreferenciaMutation.isPending &&
                    setPreferenciaMutation.variables?.typeId === preferencia.typeId;

                  return (
                    <Switch
                      key={preferencia.typeId}
                      id={`notificacao-${preferencia.code}`}
                      checked={preferencia.enabled}
                      disabled={salvandoEsteItem}
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
                  );
                })
              )}

              <QuietHoursControl />

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
          </ExpansionTile>
        </section>

        {/* LGPD (termos, exportação, exclusão de conta) é ação exclusiva do
            titular (mapa_requisito.md MÉDIO → Cuidador → Não pode: "LGPD",
            "Exportar conta", "Excluir conta"). */}
        {!isCaregiver && (
          <section>
            <h2 className="mb-3 text-[12px] font-semibold tracking-[0.05em] text-muted-foreground uppercase">
              PRIVACIDADE E DADOS (LGPD)
            </h2>
            <div className="flex flex-col gap-2">
              <LegalDocumentLinks />
              <Link
                to="/perfil/lgpd"
                className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 transition-[border-color,box-shadow] duration-200 ease-[ease] hover:border-[color-mix(in_srgb,var(--color-primary)_30%,var(--color-border))] hover:shadow-sm"
              >
                <Shield size={16} strokeWidth={2} className="shrink-0 text-muted-foreground" aria-hidden="true" />
                <span className="flex-1 text-[14px] font-normal text-foreground">
                  Meus consentimentos e direitos
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
        )}

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
            {pesquisaNpsPendente && (
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
            )}
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
    </TabScreen>
  );
}
