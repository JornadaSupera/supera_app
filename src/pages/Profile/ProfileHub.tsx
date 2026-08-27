import type { CSSProperties } from 'react';
import { Link, useNavigate } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
import BottomTab from '../../components/ui/bottom-tab';
import { getPatient, getCuidador, atualizarPreferencia } from '../../services/mockApi';
import { useSessionStore } from '../../stores/sessionStore';
import { clearPushUser } from '../../services/pushNotifications';
import type { Patient, PatientPreferenceKey } from '../../types';

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
  const sair = useSessionStore((state) => state.sair);
  const queryClient = useQueryClient();

  // Two independent queries instead of one `Promise.all`: each resource owns
  // its own loading state, so a slow caregiver lookup never blocks the
  // patient summary (and vice versa).
  const { data: paciente, isLoading: carregandoPaciente } = useQuery({
    queryKey: ['patient'],
    queryFn: getPatient,
  });
  const { data: cuidador, isLoading: carregandoCuidador } = useQuery({
    queryKey: ['caregiver'],
    queryFn: getCuidador,
  });

  // Optimistic update: flips the switch immediately (matching the previous
  // local-state behavior) instead of waiting on the mutation's round trip,
  // rolling back on failure and reconciling with the server once it settles.
  const preferenciaMutation = useMutation({
    mutationFn: ({ chave, valor }: { chave: PatientPreferenceKey; valor: boolean }) =>
      atualizarPreferencia(chave, valor),
    onMutate: async ({ chave, valor }) => {
      await queryClient.cancelQueries({ queryKey: ['patient'] });
      const pacienteAnterior = queryClient.getQueryData<Patient>(['patient']);
      if (pacienteAnterior) {
        queryClient.setQueryData<Patient>(['patient'], {
          ...pacienteAnterior,
          preferencias: { ...pacienteAnterior.preferencias, [chave]: valor },
        });
      }
      return { pacienteAnterior };
    },
    onError: (_error, _variables, context) => {
      if (context?.pacienteAnterior) {
        queryClient.setQueryData(['patient'], context.pacienteAnterior);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['patient'] });
    },
  });

  function handleTogglePreferencia(chave: PatientPreferenceKey, novoValor: boolean) {
    preferenciaMutation.mutate({ chave, valor: novoValor });
  }

  function handleToggleTema(novoValor: boolean) {
    if (novoValor) {
      document.documentElement.setAttribute('data-theme', 'dark');
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
    // Non-sensitive UI preference — stays in localStorage, not secure storage.
    localStorage.setItem('supera_tema', novoValor ? 'dark' : 'light');
    handleTogglePreferencia('temaEscuro', novoValor);
  }

  async function handleSair() {
    // `await` is required: without it navigation could race the encrypted
    // session write, and the route guard would bounce back to this screen.
    await sair();
    clearPushUser();
    navigate('/login');
  }

  if (carregandoPaciente || !paciente) {
    return <Loading />;
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
        <h1 className="mt-[2px] text-[24px] font-semibold tracking-[-0.6px] text-foreground">
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
            <div className="flex items-start gap-3 rounded-xl border border-border bg-card p-3">
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
                  {paciente.diagnostico.cid} · {paciente.diagnostico.descricao}
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3 rounded-xl border border-border bg-card p-3">
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
                <p className="mt-[2px] text-[14px] leading-[1.4] text-foreground">{paciente.protocolo}</p>
              </div>
            </div>
            <div className="flex items-start gap-3 rounded-xl border border-border bg-card p-3">
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
                <p className="mt-[2px] text-[14px] leading-[1.4] text-foreground">{paciente.estadiamento}</p>
              </div>
            </div>
            <div className="flex items-start gap-3 rounded-xl border border-border bg-card p-3">
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
                  {paciente.alergias.join(', ')}
                </p>
              </div>
            </div>
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
          </div>
        </section>

        <section>
          <h2 className="mb-3 text-[12px] font-semibold tracking-[0.05em] text-muted-foreground uppercase">
            CONTATO
          </h2>
          <div className="flex flex-col gap-2">
            <div className="flex items-start gap-3 rounded-xl border border-border bg-card p-3">
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
                <p className="mt-[2px] text-[14px] leading-[1.4] text-foreground">{paciente.celular}</p>
              </div>
            </div>
            <div className="flex items-start gap-3 rounded-xl border border-border bg-card p-3">
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
                <p className="mt-[2px] text-[14px] leading-[1.4] text-foreground">{paciente.email}</p>
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
              <Avatar src={undefined} name={cuidador.atual.nome} size="md" />
              <span className="flex-1 text-[14px] font-medium text-foreground">
                {cuidador.atual.nome}
                <span className="mt-[2px] block text-[12px] font-normal text-muted-foreground">
                  {cuidador.atual.parentesco}
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
              <span className="mb-3 flex h-[40px] w-[40px] items-center justify-center rounded-lg bg-[color-mix(in_srgb,var(--color-supera-uniao)_15%,transparent)] text-[var(--color-supera-uniao)]">
                <Users size={18} strokeWidth={2} aria-hidden="true" />
              </span>
              <p className="text-[14px] font-medium text-foreground">Nenhum cuidador vinculado ainda</p>
              <p className="mt-1 max-w-[30ch] text-[12px] leading-[1.4] text-muted-foreground">
                Convide alguém de confiança para acompanhar sua agenda, orientações, chat e diário.
              </p>
              <Link
                to="/cuidador"
                className="mt-4 inline-flex min-h-[44px] items-center justify-center gap-[4px] rounded-lg border border-primary px-4 py-2 text-[13px] font-semibold text-primary transition-colors duration-150 ease-[ease] hover:bg-[color-mix(in_srgb,var(--color-primary)_8%,transparent)]"
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
              checked={paciente.preferencias.biometria}
              onChange={(v: boolean) => handleTogglePreferencia('biometria', v)}
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
              className="min-h-[44px] rounded-xl border border-border bg-card p-4"
            />
            <Switch
              id="lembretes24h"
              checked={paciente.preferencias.lembretes24h}
              onChange={(v: boolean) => handleTogglePreferencia('lembretes24h', v)}
              label={
                <span className="inline-flex items-center gap-2">
                  <Bell size={16} strokeWidth={2} className="shrink-0 text-muted-foreground" aria-hidden="true" />
                  Lembretes 24h antes
                </span>
              }
              className="min-h-[44px] rounded-xl border border-border bg-card p-4"
            />
            <Switch
              id="lembretes2h"
              checked={paciente.preferencias.lembretes2h}
              onChange={(v: boolean) => handleTogglePreferencia('lembretes2h', v)}
              label={
                <span className="inline-flex items-center gap-2">
                  <Bell size={16} strokeWidth={2} className="shrink-0 text-muted-foreground" aria-hidden="true" />
                  Lembretes 2h antes
                </span>
              }
              className="min-h-[44px] rounded-xl border border-border bg-card p-4"
            />
            <Switch
              id="novidadesBiblioteca"
              checked={paciente.preferencias.novidadesBiblioteca}
              onChange={(v: boolean) => handleTogglePreferencia('novidadesBiblioteca', v)}
              label={
                <span className="inline-flex items-center gap-2">
                  <Bell size={16} strokeWidth={2} className="shrink-0 text-muted-foreground" aria-hidden="true" />
                  Novidades da biblioteca
                </span>
              }
              className="min-h-[44px] rounded-xl border border-border bg-card p-4"
            />
            <Switch
              id="temaEscuro"
              checked={paciente.preferencias.temaEscuro}
              onChange={handleToggleTema}
              label={
                <span className="inline-flex items-center gap-2">
                  <Moon size={16} strokeWidth={2} className="shrink-0 text-muted-foreground" aria-hidden="true" />
                  Modo escuro
                </span>
              }
              className="min-h-[44px] rounded-xl border border-border bg-card p-4"
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
            <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-4">
              <Settings size={16} strokeWidth={2} className="shrink-0 text-muted-foreground" aria-hidden="true" />
              <span className="flex-1 text-[14px] font-normal text-foreground">Versão do app: 1.0.0</span>
            </div>
          </div>
        </section>

        <Button variant="outline" fullWidth onClick={handleSair}>
          Sair
        </Button>
      </main>

      <BottomTab />
    </div>
  );
}
