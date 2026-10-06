import { History, KeyRound, MessageCircle, Smartphone } from 'lucide-react';
import StatusChip from '../../components/ui/status-chip';
import ExpansionTile from '../../components/ui/expansion-tile';
import { formatDateBr, formatDateTimeBr } from '../../utils/date';
import type { CaregiverIssuance, CaregiverLink } from '../../types';

interface LinkHistoryProps {
  links: CaregiverLink[];
  /** As senhas provisórias emitidas, se já foram lidas. */
  issuances?: CaregiverIssuance[];
}

/**
 * O que a pastilha mostra em cada estado. `pending` é vínculo CORRENTE, e não
 * passado: o titular já autorizou, e o acesso começa quando o acompanhante
 * trocar a senha provisória.
 */
const STATUS_CHIP: Record<CaregiverLink['status'], { tone: 'active' | 'waiting' | 'revoked'; label: string }> = {
  active: { tone: 'active', label: 'Ativo' },
  pending: { tone: 'waiting', label: 'Aguardando primeiro acesso' },
  revoked: { tone: 'revoked', label: 'Revogado' },
};

/**
 * O período do vínculo, com a distinção que o banco passou a registrar:
 * `granted_at` é quando o titular AUTORIZOU, `activated_at` é quando o acesso
 * de fato começou (a troca da senha provisória). Entre os dois podem passar até
 * 72 h — e um vínculo revogado antes da troca nunca deu acesso a nada.
 */
function describePeriod(link: CaregiverLink): string {
  const autorizado = `Autorizado em ${formatDateBr(link.grantedAt)}`;

  if (link.status === 'pending') return `${autorizado} · acesso ainda não começou`;

  if (link.status === 'revoked') {
    const fim = link.revokedAt ? formatDateBr(link.revokedAt) : null;
    if (!link.activatedAt) {
      return fim ? `${autorizado} · revogado em ${fim}, sem nunca ter dado acesso` : `${autorizado} · revogado`;
    }
    return fim
      ? `${autorizado} · acesso de ${formatDateBr(link.activatedAt)} a ${fim}`
      : `${autorizado} · acesso desde ${formatDateBr(link.activatedAt)}`;
  }

  return link.activatedAt
    ? `${autorizado} · acesso valendo desde ${formatDateBr(link.activatedAt)}`
    : autorizado;
}

const ISSUANCE_REASON: Record<CaregiverIssuance['reason'], string> = {
  created: 'Senha provisória do cadastro',
  reset: 'Nova senha provisória',
};

/**
 * Cada senha provisória que saiu: por que, por onde e até quando valia. A senha
 * nunca aparece — o banco guarda a emissão, não o segredo.
 */
function IssuanceList({ issuances }: { issuances: CaregiverIssuance[] }) {
  // Sem respiro acima da primeira emissão nem abaixo da última: quem dá a
  // distância é o painel aberto da sanfona (14 px abaixo do fio, 16 acima do
  // fundo).
  return (
    <ul role="list" className="flex flex-col">
      {issuances.map((issuance) => {
        const Icon = issuance.channel === 'whatsapp' ? MessageCircle : Smartphone;
        return (
          <li
            key={issuance.id}
            className="flex items-start gap-3 border-b border-border py-3 first:pt-0 last:border-b-0 last:pb-0"
          >
            {/* 24 px, o mínimo do guia; o `-mt-0.5` o centra na primeira linha
                (`text-label`, 20 px). A 12 px do texto, como a chave do
                cabeçalho que abre esta lista: os textos ficam alinhados. */}
            <Icon size={24} strokeWidth={2} className="-mt-0.5 shrink-0 text-muted-foreground" aria-hidden="true" />
            <div className="min-w-0">
              <p className="text-label font-semibold text-foreground">{ISSUANCE_REASON[issuance.reason]}</p>
              <p className="text-caption font-medium text-muted-foreground">
                {formatDateTimeBr(issuance.issuedAt)} · por{' '}
                {issuance.channel === 'whatsapp' ? 'WhatsApp' : 'SMS'} · valia até{' '}
                {formatDateTimeBr(issuance.expiresAt)}
              </p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Registro das autorizações: quando cada vínculo foi autorizado, quando o
 * acesso começou de fato e, se foi o caso, quando foi revogado — mais as senhas
 * provisórias emitidas.
 *
 * É o que o contrato pede ("timestamp de cada vínculo e revogação") e o que
 * responde, sem depender da clínica, "quem teve acesso aos meus dados e
 * quando". Sem nome de acompanhante: o banco não deixa o titular ler a conta
 * dele, e as datas bastam.
 *
 * As emissões ficam recolhidas: são detalhe de investigação, não a informação
 * principal da tela (mesmo padrão dos interruptores do Perfil).
 */
export default function LinkHistory({ links, issuances = [] }: LinkHistoryProps) {
  if (links.length === 0) return null;

  return (
    <section className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-4 shadow-sm">
      {/* Ícone de 24 px a 12 px do título, como os ícones das linhas dos
          outros cartões da tela: os textos começam na mesma coluna. */}
      <div className="flex items-center gap-3">
        <History size={24} strokeWidth={2} className="shrink-0 text-primary-deep" aria-hidden="true" />
        <h2 className="text-card-title font-bold text-foreground">Registro de autorizações</h2>
      </div>

      <ul role="list" className="flex flex-col">
        {links.map((link) => {
          const chip = STATUS_CHIP[link.status];
          const corrente = link.status !== 'revoked';

          return (
            <li
              key={link.id}
              className="flex flex-col gap-1 border-b border-border py-3 last:border-b-0 last:pb-0"
            >
              {/* A pastilha fica na linha do título e desce para a de baixo,
                  inteira, quando não cabe: "Aguardando primeiro acesso" (208 px)
                  ao lado da data era espremida até quebrar em três linhas. A data
                  fica com a largura toda. Sem `whitespace-nowrap`: numa tela de
                  280 px a linha tem 198 px, e ali a pastilha quebra por dentro em
                  vez de invadir o recuo do cartão. */}
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                <p className="text-label font-semibold text-foreground">
                  {corrente ? 'Vínculo atual' : 'Vínculo anterior'}
                </p>
                <StatusChip tone={chip.tone}>{chip.label}</StatusChip>
              </div>
              <p className="text-caption font-medium text-muted-foreground">{describePeriod(link)}</p>
            </li>
          );
        })}
      </ul>

      {issuances.length > 0 && (
        <ExpansionTile
          className="mt-2"
          variant="contained"
          headingLevel={3}
          icon={KeyRound}
          title="Senhas provisórias emitidas"
          subtitle={`${issuances.length} ${issuances.length === 1 ? 'emissão registrada' : 'emissões registradas'}`}
        >
          <IssuanceList issuances={issuances} />
        </ExpansionTile>
      )}
    </section>
  );
}
