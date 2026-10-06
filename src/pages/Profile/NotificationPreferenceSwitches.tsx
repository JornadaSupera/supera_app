import { Bell } from 'lucide-react';
import Switch from '../../components/ui/switch';
import InlineError from '../../components/ui/inline-error';
import Loading from '../../components/ui/loading';
import { useNotificationPreferences, useSetNotificationPreference } from '../../hooks/useNotifications';

/**
 * Um interruptor por tipo de notificação que a conta pode silenciar (canal
 * push), na ordem do catálogo. Vem do banco — `notification_types` onde
 * `is_silenceable = true` — em vez de uma lista fixa: se a clínica cadastrar
 * um tipo silenciável novo, o interruptor aparece sozinho.
 */
export default function NotificationPreferenceSwitches() {
  const { data: preferences, isLoading, isError, refetch } = useNotificationPreferences();
  const setPreferenceMutation = useSetNotificationPreference();

  if (isLoading) return <Loading inline />;

  if (isError) {
    // O bloco de erro do guia, o mesmo `InlineError` da janela de silêncio logo
    // abaixo: as duas falhas costumam vir juntas (sem rede) e agora têm o
    // mesmo desenho. A mensagem e o botão são os de antes, sem a frase de apoio.
    return (
      <InlineError
        title="Não foi possível carregar as preferências de notificação."
        description=""
        retryLabel="Tentar novamente"
        onRetry={() => void refetch()}
      />
    );
  }

  return (
    <>
      {preferences?.map((preference) => {
        // Uma mutation só, compartilhada pela lista inteira (ver
        // `useSetNotificationPreference`): `variables` reflete a ÚLTIMA chamada
        // em andamento, então isto desabilita o toggle certo no caso comum
        // (toque repetido no mesmo item). Alternar dois itens em sequência
        // rápida é uma exceção mais rara que não corrompe dado nenhum — só o
        // indicador visual de "salvando" de um dos dois pode piscar cedo demais.
        const isSavingThis =
          setPreferenceMutation.isPending &&
          setPreferenceMutation.variables?.typeId === preference.typeId;

        return (
          <Switch
            key={preference.typeId}
            id={`notificacao-${preference.code}`}
            checked={preference.enabled}
            disabled={isSavingThis}
            onChange={(enabled: boolean) =>
              setPreferenceMutation.mutate({ typeId: preference.typeId, enabled })
            }
            // O ícone a 12 px do texto, como no cabeçalho de "Preferências"
            // logo acima: com o bloco aberto, os rótulos começam na mesma linha.
            label={
              <span className="flex items-center gap-3">
                <Bell size={24} strokeWidth={2} className="shrink-0 text-primary-deep" aria-hidden="true" />
                {preference.label}
              </span>
            }
            className="rounded-xl border border-border bg-card p-4 shadow-sm"
          />
        );
      })}
    </>
  );
}
