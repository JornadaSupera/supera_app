import { Check, RefreshCw, Smartphone, UserRoundCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import Button from '../../components/ui/button';
import Logo from '../../components/ui/logo';
import { useSignOut } from '../../hooks/useAuth';
import {
  usePendingRegistrationCheck,
  type PendingCheckFeedback,
} from '../../hooks/usePendingRegistrationCheck';
import { useSessionStore } from '../../stores/sessionStore';

type StepState = 'done' | 'current' | 'upcoming';

interface StepData {
  state: StepState;
  title: string;
  description: string;
  /** Dito só ao leitor de tela: a forma e a cor já dizem isso a quem enxerga. */
  status: string;
  /** Entrada escalonada: uma etapa depois da outra, sem esperar o resto. */
  delay: string;
}

const STEPS: StepData[] = [
  {
    state: 'done',
    title: 'Conta criada',
    description: 'Seu acesso já existe.',
    status: 'Concluído',
    delay: '[animation-delay:260ms]',
  },
  {
    state: 'current',
    title: 'Liberação pela recepção',
    description: 'O Centro conclui o seu cadastro pelo painel.',
    status: 'Aguardando',
    delay: '[animation-delay:340ms]',
  },
  {
    state: 'upcoming',
    title: 'Acesso ao app',
    description: 'Abre sozinho após a liberação.',
    status: 'Depois',
    delay: '[animation-delay:420ms]',
  },
];

/** O que a tela diz depois de uma conferência pedida pela pessoa que não abriu o app. */
const FEEDBACK_TEXT: Record<PendingCheckFeedback, string> = {
  'not-yet': 'Conferimos agora: seu cadastro ainda não foi liberado. O app abre sozinho quando for.',
  offline: 'Sem conexão com a internet. Vamos conferir de novo quando ela voltar.',
};

/** Luz verde ao fundo, à deriva: dá profundidade sem competir com o texto. */
function Aurora() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-0 top-0 h-[72dvh] overflow-hidden [mask-image:linear-gradient(to_bottom,black_45%,transparent)]"
    >
      <span className="absolute -top-16 -left-24 size-80 rounded-full bg-[color-mix(in_srgb,var(--color-supera-uniao)_32%,transparent)] blur-[72px] will-change-transform animate-drift-a motion-reduce:animate-none" />
      <span className="absolute top-16 -right-28 size-72 rounded-full bg-[color-mix(in_srgb,var(--color-supera-empatia)_30%,transparent)] blur-[72px] will-change-transform animate-drift-b motion-reduce:animate-none" />
    </div>
  );
}

/**
 * O selo da conta no centro de três anéis que pulsam para fora, com um ponto
 * em órbita. É o que diz "estamos trabalhando nisso" sem mostrar um relógio
 * girando: a espera é da clínica, não do aparelho.
 */
function Radar() {
  return (
    <div
      aria-hidden="true"
      className="relative grid size-36 shrink-0 place-items-center animate-pop motion-reduce:animate-none"
    >
      <span className="absolute inset-0 rounded-full border border-primary/45 animate-radar-ring [animation-delay:0s] motion-reduce:animate-none motion-reduce:opacity-30" />
      <span className="absolute inset-0 rounded-full border border-primary/45 animate-radar-ring [animation-delay:1.6s] motion-reduce:hidden" />
      <span className="absolute inset-0 rounded-full border border-primary/45 animate-radar-ring [animation-delay:3.2s] motion-reduce:hidden" />

      <span className="absolute inset-3 rounded-full border border-dashed border-primary/30 animate-orbit motion-reduce:animate-none">
        <span className="absolute -top-[5px] left-1/2 -ml-[5px] size-2.5 rounded-full bg-primary shadow-[0_0_14px_2px_color-mix(in_srgb,var(--color-primary)_60%,transparent)]" />
      </span>

      <span className="absolute inset-7 rounded-full bg-card shadow-lg ring-1 ring-primary/25" />
      <span className="relative grid size-16 place-items-center rounded-full bg-primary text-primary-foreground shadow-md animate-breathe motion-reduce:animate-none">
        <UserRoundCheck size={28} strokeWidth={1.75} />
      </span>
    </div>
  );
}

function StepMarker({ state }: { state: StepState }) {
  if (state === 'done') {
    return (
      <span
        aria-hidden="true"
        className="grid size-8 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground shadow-sm animate-pop [animation-delay:320ms] motion-reduce:animate-none"
      >
        <Check size={16} strokeWidth={3} />
      </span>
    );
  }

  if (state === 'current') {
    return (
      <span
        aria-hidden="true"
        className="relative grid size-8 shrink-0 place-items-center rounded-full animate-step-pulse motion-reduce:animate-none"
      >
        <span className="absolute inset-0 rounded-full border-2 border-primary/20 border-t-primary animate-spin [animation-duration:1.8s] motion-reduce:animate-none" />
        <span className="size-2.5 rounded-full bg-primary" />
      </span>
    );
  }

  return (
    <span
      aria-hidden="true"
      className="grid size-8 shrink-0 place-items-center rounded-full border-2 border-dashed border-border text-muted-foreground"
    >
      <Smartphone size={14} strokeWidth={2} />
    </span>
  );
}

/** Traço entre duas etapas: cheio até onde já foi, tracejado descendo até onde falta. */
function Connector({ done }: { done: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'my-1 w-0.5 flex-1 rounded-full',
        done
          ? 'bg-primary/70'
          : '[background-image:repeating-linear-gradient(to_bottom,var(--color-primary)_0_6px,transparent_6px_12px)] [background-size:100%_12px] opacity-60 animate-flow motion-reduce:animate-none'
      )}
    />
  );
}

export interface PendingRegistrationViewProps {
  /** Só o primeiro nome: é tudo que a tela precisa para cumprimentar. */
  firstName: string | null;
  isChecking: boolean;
  /** Retorno do último "Verificar agora" que não abriu o app; some sozinho. */
  feedback: PendingCheckFeedback | null;
  isSigningOut: boolean;
  onCheck: () => void;
  onSignOut: () => void;
}

/**
 * A tela de quem criou a conta e espera a recepção concluir o cadastro.
 *
 * É a primeira coisa que todo paciente novo vê depois de se cadastrar, e por
 * isso não pode parecer um erro nem uma página vazia: mostra onde a pessoa
 * está no caminho (conta criada → cadastro em conclusão → acesso), garante que
 * o app abre sozinho e deixa a saída à mão. Só apresentação; a conferência
 * automática está em `usePendingRegistrationCheck`.
 */
export function PendingRegistrationView({
  firstName,
  isChecking,
  feedback,
  isSigningOut,
  onCheck,
  onSignOut,
}: PendingRegistrationViewProps) {
  return (
    <div className="relative flex min-h-[100dvh] flex-col overflow-hidden bg-background">
      <Aurora />

      <main className="relative z-10 mx-auto flex w-full max-w-[440px] flex-1 flex-col px-6 pt-[calc(1.5rem_+_var(--safe-top))] pb-[calc(1.25rem_+_var(--safe-bottom))]">
        <header className="flex justify-center animate-rise motion-reduce:animate-none">
          <Logo size="sm" />
        </header>

        <div className="flex flex-1 flex-col items-center justify-center gap-6 py-5">
          <Radar />

          {/* Espaços entre textos vão em `gap` do contêiner: o reset global de
              `index.css` (fora de `@layer`) zera `margin` de `<p>`/`<h1>` e vence
              qualquer `mt-*` escrito neles. */}
          <div className="flex flex-col items-center gap-3 text-center animate-rise [animation-delay:140ms] motion-reduce:animate-none">
            <h1 className="text-[24px]/[1.2] font-semibold tracking-[-0.4px] text-balance text-foreground">
              Aguardando a liberação do seu cadastro
            </h1>
            <p className="max-w-[330px] text-[14px]/[1.6] text-pretty text-muted-foreground">
              {firstName && (
                <span className="font-medium text-foreground">Olá, {firstName}! </span>
              )}
              Sua conta foi criada. A recepção do Centro conclui o seu cadastro pelo painel, e o
              app abre assim que isso for feito.
            </p>
          </div>

          <div className="w-full rounded-2xl border border-border bg-[color-mix(in_srgb,var(--color-card)_82%,transparent)] p-4 shadow-sm backdrop-blur-md">
            {/* `role="list"`: com `list-style: none` (reset global) o Safari e o
                VoiceOver deixam de tratar a <ol> como lista. */}
            <ol role="list" aria-label="Andamento do cadastro">
              {STEPS.map((step, index) => {
                const isLast = index === STEPS.length - 1;

                return (
                  <li
                    key={step.title}
                    aria-current={step.state === 'current' ? 'step' : undefined}
                    className={cn('flex gap-3 animate-rise motion-reduce:animate-none', step.delay)}
                  >
                    <div className="flex flex-col items-center">
                      <StepMarker state={step.state} />
                      {!isLast && <Connector done={step.state === 'done'} />}
                    </div>

                    <div className={cn('flex min-w-0 flex-col gap-0.5 pt-1', !isLast && 'pb-4')}>
                      <p
                        className={cn(
                          'text-[14px]/[1.3] font-semibold',
                          step.state === 'upcoming' ? 'text-muted-foreground' : 'text-foreground'
                        )}
                      >
                        {step.title}
                        <span className="sr-only"> — {step.status}</span>
                      </p>
                      <p className="text-[13px]/[1.4] text-muted-foreground">{step.description}</p>
                    </div>
                  </li>
                );
              })}
            </ol>
          </div>
        </div>

        <div className="flex flex-col gap-2 animate-rise [animation-delay:500ms] motion-reduce:animate-none">
          <Button
            fullWidth
            iconLeft={RefreshCw}
            loading={isChecking}
            onClick={onCheck}
            // Carregando, o botão mostra só o spinner: o nome tem de continuar.
            aria-label="Verificar agora"
          >
            Verificar agora
          </Button>
          <Button fullWidth variant="ghost" loading={isSigningOut} onClick={onSignOut}>
            Sair
          </Button>

          {/* O retorno da conferência ocupa o lugar do aviso, com a mesma altura,
              para os botões não pularem. */}
          <div className="min-h-[62px] pt-2">
            <p
              className={cn(
                'text-center text-[12px]/[1.5] text-pretty',
                feedback ? 'font-medium text-foreground' : 'text-muted-foreground'
              )}
            >
              {feedback
                ? FEEDBACK_TEXT[feedback]
                : 'O app confere sozinho — você não precisa ficar nesta tela. Já usava o app e seus dados sumiram? Fale com a recepção do Centro.'}
            </p>
          </div>
        </div>

        <p role="status" aria-live="polite" className="sr-only">
          {isChecking ? 'Verificando o seu cadastro…' : feedback ? FEEDBACK_TEXT[feedback] : ''}
        </p>
      </main>
    </div>
  );
}

export default function PendingRegistration() {
  const fullName = useSessionStore((state) => state.fullName);
  const signOutMutation = useSignOut();
  const { check, isChecking, feedback } = usePendingRegistrationCheck();

  const firstName = fullName?.trim().split(/\s+/)[0] || null;

  return (
    <PendingRegistrationView
      firstName={firstName}
      isChecking={isChecking}
      feedback={feedback}
      isSigningOut={signOutMutation.isPending}
      onCheck={check}
      onSignOut={() => signOutMutation.mutate()}
    />
  );
}
