import type { ComponentType } from 'react';
import Modal from './modal';
import Button from './button';

type IconComponent = ComponentType<{ size?: number; strokeWidth?: number }>;

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  /** Tinge o ícone e o botão de confirmar na cor de destrutivo. */
  destructive?: boolean;
  /** Desabilita os dois botões e troca o de confirmar por um spinner. */
  loading?: boolean;
  titleIcon?: IconComponent;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Diálogo de confirmação genérico — sim/não sobre uma ação, com o peso visual
 * (destructive) reservado para o que não tem desfazer fácil.
 *
 * Fecha só pelos botões enquanto `loading`: clicar fora ou apertar Esc no
 * meio de uma chamada ao servidor deixaria a pessoa sem saber se a ação foi
 * mesmo cancelada.
 */
export default function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel = 'Cancelar',
  destructive = false,
  loading = false,
  titleIcon,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <Modal
      open={open}
      onClose={loading ? undefined : onCancel}
      title={title}
      titleIcon={titleIcon}
      titleIconTone={destructive ? 'var(--color-destructive)' : undefined}
      footer={
        <>
          <Button variant="outline" fullWidth onClick={onCancel} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button
            variant={destructive ? 'destructive' : 'primary'}
            fullWidth
            onClick={onConfirm}
            loading={loading}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p className="text-[14px] leading-[1.5] text-muted-foreground">{description}</p>
    </Modal>
  );
}
