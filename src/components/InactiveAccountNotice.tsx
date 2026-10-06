import type { ReactNode } from 'react';
import { Lock } from 'lucide-react';
import EmptyState from './ui/empty-state';
import Loading from './ui/loading';
import { useMyDataSubjectRequests } from '../hooks/useDataSubject';
import { formatDateBr } from '../utils/date';
import type { DataSubjectRequest } from '../types';

interface InactiveAccountNoticeProps {
  /** Sair da conta. A única ação possível nos dois casos. */
  onSignOut: () => void;
}

/**
 * A moldura de tela inteira dos avisos, a mesma do `ScopeGate`: o aviso no
 * centro, longe das barras do aparelho (`py-safe-8`).
 */
function NoticeFrame({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-background px-6 py-safe-8">
      {children}
    </div>
  );
}

/** O pedido de exclusão já cumprido, se foi ele que encerrou este acesso. */
function findExecutedDeletion(requests: DataSubjectRequest[] | undefined): DataSubjectRequest | null {
  return requests?.find((r) => r.type === 'deletion' && r.status === 'executed') ?? null;
}

/**
 * Conta desativada: por que, e o que a pessoa pode fazer.
 *
 * São DOIS casos, e o texto de um é errado para o outro:
 *
 * - **a clínica desativou** — cabe procurar a recepção e pedir a reativação;
 * - **o próprio titular pediu a exclusão** e a rotina a executou — aí "fale com
 *   a recepção para reativá-lo" é resposta errada e confusa: o acesso acabou
 *   porque ele pediu.
 *
 * O titular com a conta encerrada CONTINUA lendo o próprio pedido
 * (`data_subject_requests_select_own` usa `auth.uid()`, sem olhar `is_active`),
 * e é por ele que dá para distinguir os dois — o guia do banco §5.19 diz
 * exatamente isso.
 *
 * Enquanto a leitura não responde, ou se ela falhar, vale o texto genérico: não
 * saber por que a conta foi desativada não pode virar uma afirmação sobre o
 * motivo.
 */
export default function InactiveAccountNotice({ onSignOut }: InactiveAccountNoticeProps) {
  const { data, isLoading } = useMyDataSubjectRequests();

  if (isLoading) return <Loading />;

  const deletion = findExecutedDeletion(data);

  if (deletion) {
    const quando = deletion.executedAt ? formatDateBr(deletion.executedAt) : null;

    return (
      <NoticeFrame>
        <EmptyState
          className="min-h-0"
          icon={Lock}
          title="Conta encerrada a seu pedido"
          description={
            // O que a exclusão faz, e o que ela NÃO faz: por decisão da clínica,
            // ela encerra o acesso e o prontuário fica guardado. Dizer "seus
            // dados foram apagados" seria prometer o que não aconteceu.
            `${quando ? `Em ${quando} atendemos ` : 'Atendemos '}seu pedido de exclusão e encerramos seu acesso ao aplicativo. Seu prontuário continua guardado pelo Centro, como manda a legislação de saúde. Para voltar a usar o app, fale com a recepção.`
          }
          actionLabel="Sair"
          onAction={onSignOut}
        />
      </NoticeFrame>
    );
  }

  // O cadeado no tom neutro, como no caso acima: o vermelho do guia é só para
  // sinais de alarme, não para decorar.
  return (
    <NoticeFrame>
      <EmptyState
        className="min-h-0"
        icon={Lock}
        title="Acesso desativado"
        description="Seu acesso à Jornada Supera foi desativado. Fale com a recepção do Centro para reativá-lo."
        actionLabel="Sair"
        onAction={onSignOut}
      />
    </NoticeFrame>
  );
}
