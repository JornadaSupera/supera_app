import { Bell } from 'lucide-react';
import Switch from '../../components/ui/switch';
import Button from '../../components/ui/button';
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
    return (
      <div className="flex items-center justify-between gap-3 rounded-xl border border-[color-mix(in_srgb,var(--color-destructive)_30%,transparent)] bg-[color-mix(in_srgb,var(--color-destructive)_6%,transparent)] p-4">
        <p className="text-[12px] text-foreground">
          Não foi possível carregar as preferências de notificação.
        </p>
        <Button variant="outline" size="sm" onClick={() => void refetch()}>
          Tentar novamente
        </Button>
      </div>
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
            label={
              <span className="inline-flex items-center gap-2">
                <Bell size={16} strokeWidth={2} className="shrink-0 text-muted-foreground" aria-hidden="true" />
                {preference.label}
              </span>
            }
            className="rounded-xl border border-border bg-card p-3.5"
          />
        );
      })}
    </>
  );
}
