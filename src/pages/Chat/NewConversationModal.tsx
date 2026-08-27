import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Send, Clock } from 'lucide-react';
import Modal from '../../components/ui/modal';
import Button from '../../components/ui/button';
import { getAssuntoInfo } from '../../utils/chat';
import { iniciarConversa } from '../../services/mockApi';
import type { ChatSubject, ChatSubjectInfo } from '../../types';

interface NewConversationModalProps {
  open: boolean;
  assunto: ChatSubject | null;
  onClose: () => void;
  onCriada: (novoId: string) => void;
}

export default function NewConversationModal({
  open,
  assunto,
  onClose,
  onCriada,
}: NewConversationModalProps) {
  // `getAssuntoInfo` vem de `utils/chat.js` (sem tipos, fora do escopo desta
  // task) — seu parâmetro sem anotação faz o TypeScript inferir o retorno
  // como `any`. Mesmo padrão de asserção já usado em `services/mockApi.ts`
  // para a mesma função.
  const assuntoInfo = assunto ? (getAssuntoInfo(assunto) as ChatSubjectInfo | null) : null;
  const queryClient = useQueryClient();

  const [texto, setTexto] = useState('');

  useEffect(() => {
    if (open) setTexto('');
  }, [open, assunto]);

  const iniciarConversaMutation = useMutation({
    mutationFn: iniciarConversa,
    onSuccess: (resultado) => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      onCriada(resultado.id);
    },
  });

  function handleEnviar() {
    const textoParaEnviar = texto.trim();
    if (!textoParaEnviar || iniciarConversaMutation.isPending) return;

    iniciarConversaMutation.mutate({ assunto: assunto ?? undefined, texto: textoParaEnviar });
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={assuntoInfo ? `Nova conversa · ${assuntoInfo.label}` : 'Nova conversa'}
      titleIcon={assuntoInfo?.icon}
      titleIconTone={assuntoInfo?.colorVar}
      footer={
        <Button
          variant="primary"
          fullWidth
          iconLeft={Send}
          loading={iniciarConversaMutation.isPending}
          disabled={!texto.trim() || iniciarConversaMutation.isPending}
          onClick={handleEnviar}
        >
          Enviar mensagem
        </Button>
      }
    >
      <p className="text-[14px] text-muted-foreground">
        {assuntoInfo ? assuntoInfo.descricao : 'Escreva para a equipe multidisciplinar.'}
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
    </Modal>
  );
}
