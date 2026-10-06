import { useState } from 'react';
import { Ban, Calendar, Mail, Pencil, Phone, Send, ShieldCheck } from 'lucide-react';
import Avatar from '../../components/ui/avatar';
import StatusChip from '../../components/ui/status-chip';
import Button from '../../components/ui/button';
import DetailRow from './DetailRow';
import { maskEmail, maskPhone } from '../../utils/contact';
import { getCaregiverStatus } from '../../utils/caregiverStatus';
import { formatDateBr } from '../../utils/date';
import { formatPhone } from '../../utils/masks';
import { fromInternationalPhone } from '../../utils/phone';
import type { MyCaregiver } from '../../types';

interface CaregiverCardProps {
  caregiver: MyCaregiver;
  onEdit: () => void;
  onResetPassword: () => void;
  onRevoke: () => void;
}

/**
 * O acompanhante ativo: quem é, em que ponto está (aguardando o primeiro
 * acesso ou já ativo) e as três ações do titular — corrigir nome e telefone,
 * gerar outra senha provisória (só enquanto ela existe) e revogar.
 *
 * Celular e e-mail vêm mascarados; o titular revela um a um, por ação
 * explícita (regra do projeto para dado pessoal).
 */
export default function CaregiverCard({ caregiver, onEdit, onResetPassword, onRevoke }: CaregiverCardProps) {
  const [showPhone, setShowPhone] = useState(false);
  const [showEmail, setShowEmail] = useState(false);

  const status = getCaregiverStatus(caregiver);
  const nationalPhone = fromInternationalPhone(caregiver.phone);

  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm" aria-label="Acompanhante">
      <div className="flex items-center gap-3">
        <Avatar size="xl" name={caregiver.fullName} className="bg-secondary" />
        <div className="flex min-w-0 flex-col">
          <p className="text-body font-semibold break-words text-foreground">
            {caregiver.fullName || 'Acompanhante'}
          </p>
          <p className="text-caption font-medium text-primary-deep">Acompanhante · login próprio</p>
        </div>
      </div>

      <div className="flex flex-col items-start gap-2">
        <StatusChip tone={status.tone}>{status.label}</StatusChip>
        <p className="text-caption font-medium text-muted-foreground">{status.note}</p>
      </div>

      <div className="flex flex-col">
        <DetailRow
          icon={Phone}
          label="Celular"
          value={showPhone ? formatPhone(nationalPhone) : maskPhone(nationalPhone)}
          reveal={{ revealed: showPhone, onToggle: () => setShowPhone((current) => !current), subject: 'celular' }}
        />
        <DetailRow
          icon={Mail}
          label="E-mail"
          value={showEmail ? caregiver.email : maskEmail(caregiver.email)}
          reveal={{ revealed: showEmail, onToggle: () => setShowEmail((current) => !current), subject: 'e-mail' }}
        />
        {/* Autorizar e passar a ter acesso deixaram de ser o mesmo instante: o
            vínculo nasce pendente e só vira ativo quando o acompanhante troca a
            senha provisória. Num questionamento de LGPD é a segunda data que
            responde "a partir de quando essa pessoa viu meus dados". */}
        <DetailRow icon={Calendar} label="Autorizado em" value={formatDateBr(caregiver.grantedAt)} />
        {/* `activated_at` NÃO é zerado por um reset — o próprio banco avisa
            ("Vinculo `pending` pode ter valor: e o que sobrou de antes de um
            reset"). Ler só a data diria "acesso valendo desde 26/09" de alguém
            que voltou a pendente e não lê nada. Quem manda é o status. */}
        <DetailRow
          icon={ShieldCheck}
          label="Acesso valendo desde"
          value={
            caregiver.status === 'active' && caregiver.activatedAt
              ? formatDateBr(caregiver.activatedAt)
              : caregiver.activatedAt
                ? 'Suspenso até a troca da nova senha'
                : 'Ainda não começou'
          }
        />
      </div>

      <div className="flex flex-col gap-2">
        <Button variant="outline" fullWidth iconLeft={Pencil} onClick={onEdit}>
          Editar nome e telefone
        </Button>
        {/* Vale também com o vínculo ATIVO: a função do servidor existe para
            "a senha que venceu, a que não chegou e o acompanhante que esqueceu
            a própria", e `begin_caregiver_password_reset` aceita `pending` E
            `active`. Escondendo o botão, quem esquecia a senha só tinha a
            revogação pela frente — que desativa a conta da pessoa. */}
        <Button variant="outline" fullWidth iconLeft={Send} onClick={onResetPassword}>
          Reenviar acesso
        </Button>
        <Button variant="destructive-soft" fullWidth iconLeft={Ban} onClick={onRevoke}>
          Revogar acesso
        </Button>
      </div>
    </section>
  );
}
