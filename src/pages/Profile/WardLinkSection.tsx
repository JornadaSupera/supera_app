import { useState } from 'react';
import { Calendar, Eye, EyeOff, HeartHandshake, Mail, Phone, ShieldCheck } from 'lucide-react';
import StatusChip from '../../components/ui/status-chip';
import Skeleton from '../../components/ui/skeleton';
import InlineError from '../../components/ui/inline-error';
import ProfilePhoto from './ProfilePhoto';
import { useMyWardLink } from '../../hooks/useCaregiver';
import { maskEmail, maskPhone } from '../../utils/contact';
import { formatDateBr } from '../../utils/date';
import { formatPhone } from '../../utils/masks';
import { fromInternationalPhone } from '../../utils/phone';
import type { MyWardLink } from '../../types';

interface WardLinkSectionProps {
  /** Nome de quem é acompanhado, vindo de `get_my_ward()` (a única leitura que o banco dá). */
  wardName: string;
}

/** Situação do vínculo, dita para quem é o acompanhante — não para o titular. */
function describeStatus(link: MyWardLink): { tone: 'active' | 'waiting'; label: string; note: string } {
  if (link.status === 'active') {
    return {
      tone: 'active',
      label: 'Acesso ativo',
      note: link.activatedAt
        ? `Seu acesso vale desde ${formatDateBr(link.activatedAt)}.`
        : 'Seu acesso está valendo.',
    };
  }

  return {
    tone: 'waiting',
    label: 'Aguardando a troca da senha',
    note: 'Enquanto você não trocar a senha provisória, o aplicativo não mostra nenhum dado de quem você acompanha.',
  };
}

function DetailRow({
  icon: Icon,
  label,
  value,
  reveal,
}: {
  icon: typeof Phone;
  label: string;
  value: string;
  reveal?: { revealed: boolean; onToggle: () => void; subject: string };
}) {
  return (
    <div className="flex items-center gap-3 border-t border-border py-2.5">
      <Icon size={16} strokeWidth={2} className="shrink-0 text-muted-foreground" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-medium tracking-[0.05em] text-muted-foreground uppercase">{label}</p>
        <p className="text-[14px] font-medium break-words text-foreground">{value}</p>
      </div>
      {reveal && (
        <button
          type="button"
          aria-label={`${reveal.revealed ? 'Ocultar' : 'Mostrar'} ${reveal.subject}`}
          aria-pressed={reveal.revealed}
          onClick={reveal.onToggle}
          className="-my-2 -mr-2 inline-flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full border-none bg-transparent text-muted-foreground transition-colors duration-150 ease-[ease] hover:bg-muted"
        >
          {reveal.revealed ? (
            <EyeOff size={18} strokeWidth={2} aria-hidden="true" />
          ) : (
            <Eye size={18} strokeWidth={2} aria-hidden="true" />
          )}
        </button>
      )}
    </div>
  );
}

/**
 * "Meu vínculo": a seção que a sessão do ACOMPANHANTE vê no Perfil.
 *
 * Fechava um buraco do módulo: até aqui nada no app dizia a essa pessoa quem
 * ela acompanha, desde quando, nem que aquela ficha na tela não é a dela. Ela
 * via o cadastro do tutelado sob o título "MEU PERFIL".
 *
 * O que esta seção diz, e de onde vem cada coisa:
 * - **quem ela acompanha** — `get_my_ward()`, a única leitura do paciente que o
 *   banco lhe dá (sem CPF, contato ou nascimento);
 * - **desde quando** — `patient_caregivers`, pela política dela
 *   (`patient_caregivers_select_caregiver`), separando "autorizado em" de
 *   "acesso valendo desde";
 * - **a conta dela** — a própria linha de `accounts`, com a foto que só ela vê.
 *
 * O contato aparece mascarado por padrão, como em todo dado pessoal do app,
 * ainda que aqui seja o dela mesma.
 */
export default function WardLinkSection({ wardName }: WardLinkSectionProps) {
  const { data: link, isPending, isError, refetch } = useMyWardLink();
  const [showPhone, setShowPhone] = useState(false);
  const [showEmail, setShowEmail] = useState(false);

  if (isPending) {
    return (
      <section aria-busy="true" aria-label="Carregando seu vínculo">
        <Skeleton className="h-56 w-full rounded-2xl" />
      </section>
    );
  }

  if (isError && link === undefined) {
    return (
      <section>
        <InlineError title="Não foi possível carregar seu vínculo" onRetry={() => void refetch()} />
      </section>
    );
  }

  // Sem vínculo corrente a guarda de rota já mostra "sem cadastro ligado a esta
  // conta" antes de chegar aqui; esta é a rede de segurança.
  if (!link) return null;

  const status = describeStatus(link);
  const nationalPhone = link.account.phone ? fromInternationalPhone(link.account.phone) : '';

  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4" aria-label="Meu vínculo">
      {/* A foto é da conta DELE — a única que ele consegue ver e trocar, porque
          o bucket é privado por pasta de conta. */}
      <div className="flex flex-col items-center gap-[2px] text-center">
        <ProfilePhoto name={link.account.fullName || 'Acompanhante'} canEdit />
        <p className="text-[16px] font-semibold break-words text-foreground">
          {link.account.fullName || 'Você'}
        </p>
        <p className="text-[12px] font-medium text-[var(--color-supera-seguranca)]">
          Acompanhante · login próprio
        </p>
      </div>

      <div className="flex items-start gap-2.5 rounded-xl bg-muted p-3">
        <HeartHandshake
          size={16}
          strokeWidth={2}
          className="mt-0.5 shrink-0 text-[var(--color-supera-seguranca)]"
          aria-hidden="true"
        />
        <p className="text-[13px]/[1.5] text-foreground">
          Você acompanha <span className="font-semibold">{wardName}</span>. Os dados desta tela são
          dessa pessoa, não seus.
        </p>
      </div>

      <div className="flex flex-col items-start gap-2">
        <StatusChip tone={status.tone}>{status.label}</StatusChip>
        <p className="text-[12px]/[1.5] text-muted-foreground">{status.note}</p>
      </div>

      <div className="flex flex-col">
        <DetailRow icon={Calendar} label="Autorizado em" value={formatDateBr(link.grantedAt)} />
        <DetailRow
          icon={ShieldCheck}
          label="Acesso valendo desde"
          value={
            link.status === 'active' && link.activatedAt
              ? formatDateBr(link.activatedAt)
              : 'Ainda não começou'
          }
        />
        <DetailRow
          icon={Mail}
          label="Seu e-mail de acesso"
          value={showEmail ? link.account.email : maskEmail(link.account.email)}
          reveal={{ revealed: showEmail, onToggle: () => setShowEmail((v) => !v), subject: 'e-mail' }}
        />
        {link.account.phone && (
          <DetailRow
            icon={Phone}
            label="Seu celular"
            value={showPhone ? formatPhone(nationalPhone) : maskPhone(nationalPhone)}
            reveal={{ revealed: showPhone, onToggle: () => setShowPhone((v) => !v), subject: 'celular' }}
          />
        )}
      </div>

      <p className="text-[12px]/[1.5] text-muted-foreground">
        Quem autoriza e encerra este acesso é {wardName}. Se precisar corrigir seu nome ou seu
        celular, peça a essa pessoa — ela faz isso no aplicativo dela.
      </p>
    </section>
  );
}
