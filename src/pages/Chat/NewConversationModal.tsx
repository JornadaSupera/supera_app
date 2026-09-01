import { useEffect, useState } from 'react';
import { Send, Clock } from 'lucide-react';
import Modal from '../../components/ui/modal';
import Button from '../../components/ui/button';
import { useStartConversation } from '../../hooks/useChat';
import { describeMutationError } from '../../hooks/useAuth';
import type { ChatSubjectOption } from '../../types';

interface NewConversationModalProps {
  open: boolean;
  assunto: ChatSubjectOption | null;
  onClose: () => void;
  onCriada: (novoId: string) => void;
}

export default function NewConversationModal({
  open,
  assunto,
  onClose,
  onCriada,
}: NewConversationModalProps) {
  const [texto, setTexto] = useState('');

  const iniciarConversaMutation = useStartConversation();
  const { reset: resetMutation } = iniciarConversaMutation;

  useEffect(() => {
    if (open) {
      setTexto('');
      // Limpa o erro da tentativa anterior: reabrir o modal e já encontrar a
      // mensagem de falha de antes seria enganoso.
      resetMutation();
    }
  }, [open, assunto, resetMutation]);

  function handleEnviar() {
    const textoParaEnviar = texto.trim();
    if (!textoParaEnviar || !assunto || iniciarConversaMutation.isPending) return;

    iniciarConversaMutation.mutate(
      { subjectId: assunto.id, texto: textoParaEnviar },
      { onSuccess: (resultado) => onCriada(resultado.id) }
    );
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={assunto ? `Nova conversa · ${assunto.label}` : 'Nova conversa'}
      titleIcon={assunto?.info?.icon}
      titleIconTone={assunto?.info?.colorVar}
      footer={
        <Button
          variant="primary"
          fullWidth
          iconLeft={Send}
          loading={iniciarConversaMutation.isPending}
          disabled={!texto.trim() || !assunto || iniciarConversaMutation.isPending}
          onClick={handleEnviar}
        >
          Enviar mensagem
        </Button>
      }
    >
      <p className="text-[14px] text-muted-foreground">
        {assunto?.info ? assunto.info.descricao : 'Escreva para a equipe multidisciplinar.'}
      </p>

      <div className="my-3 flex items-center gap-2 rounded-lg bg-[color-mix(in_srgb,var(--color-mood-1)_10%,transparent)] px-3 py-2 text-[12px] text-foreground">
        <Clock size={14} strokeWidth={2} className="shrink-0 text-[var(--color-mood-1)]" aria-hidden="true" />
        <span>
          Equipe online: <strong>seg–sex, 08h–18h</strong>
        </span>
      </div>

      <textarea
        className="min-h-[110px] w-full resize-none rounded-lg border border-border bg-background p-3.5 text-[14px] text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none"
        value={texto}
        onChange={(event) => setTexto(event.target.value)}
        placeholder="Escreva sua primeira mensagem para a equipe..."
        aria-label="Mensagem"
      />

      {iniciarConversaMutation.isError && (
        <p role="alert" className="mt-3 text-[12px] text-destructive">
          {describeMutationError(
            iniciarConversaMutation.error,
            'Não foi possível iniciar a conversa.'
          )}
        </p>
      )}
    </Modal>
  );
}
