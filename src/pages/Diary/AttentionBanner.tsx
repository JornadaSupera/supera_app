import { useId } from 'react';
import { useNavigate } from 'react-router';
import { MessageCircle, TriangleAlert } from 'lucide-react';
import Button from '../../components/ui/button';
import NewConversationModal from '../Chat/NewConversationModal';
import { useTeamConversation } from '../../hooks/useChat';
import { SYMPTOMS_SUBJECT_CODE } from '../../utils/chat';

interface AttentionBannerProps {
  title: string;
  /**
   * Registro a que o aviso se refere, quando a tela não é o próprio registro
   * (a timeline). Ganha o botão "Ver registro".
   */
  entryId?: string;
  /** Começo da mensagem à equipe, citando o registro (`buildDiaryChatDraft`). */
  chatDraft: string;
}

/**
 * Aviso de sintomas fortes num registro do Diário.
 *
 * O texto só orienta o paciente a procurar a equipe — não diz que a equipe foi
 * avisada. O limiar do app (`ALERT_THRESHOLD`) é fixo e pode divergir da regra
 * clínica real, que o paciente não lê; e se a regra existe ou não é decisão da
 * clínica, fora do alcance do app. Prometer o aviso e não haver regra deixaria
 * o paciente esperando uma resposta que não vem. A frase da urgência existe
 * pelo mesmo motivo: o Chat não é atendimento imediato.
 *
 * Desenhado como o bloco de alarme do guia ("AlertaUrgencia"), que o próprio
 * guia indica para o sintoma em grau alto no Diário: fundo `alert-soft`, sem
 * borda, triângulo e título no vermelho, o texto 12 px abaixo deles e as ações
 * 16 px abaixo do texto, como no guia. `<section>` com título, e não
 * `role="alert"`: o aviso é conteúdo fixo da tela.
 */
export default function AttentionBanner({ title, entryId, chatDraft }: AttentionBannerProps) {
  const navigate = useNavigate();
  const titleId = useId();
  // Sintoma é assunto "Sintomas": com uma conversa dele ainda aberta, é ela
  // que abre — e não a lista do Chat, de onde saía uma conversa nova a cada vez.
  const { available: teamChatAvailable, talkToTeam, modalProps } = useTeamConversation(
    SYMPTOMS_SUBJECT_CODE,
    chatDraft
  );

  return (
    <section
      aria-labelledby={titleId}
      className="flex flex-col gap-3 rounded-2xl bg-destructive-soft p-6"
    >
      <div className="flex items-start gap-3">
        <TriangleAlert
          size={28}
          strokeWidth={2}
          className="shrink-0 text-destructive-deep"
          aria-hidden="true"
        />
        <h2 id={titleId} className="text-card-title font-bold text-destructive-deep">
          {title}
        </h2>
      </div>

      {/* Ao acompanhante sem a área do Chat, o caminho é o telefone da clínica
          (Perfil → Fale com a Supera), e o botão do Chat não aparece. */}
      <p className="text-body text-foreground">
        {teamChatAvailable
          ? 'Se você não está bem ou tem dúvidas sobre esses sintomas, fale com a equipe pelo Chat. Em caso de urgência, não espere a resposta: procure um serviço de emergência.'
          : 'Se a pessoa não está bem ou há dúvidas sobre esses sintomas, ligue para a equipe (Perfil → Fale com a Supera). Em caso de urgência, procure um serviço de emergência.'}
      </p>

      {/* `pt-1` somado ao `gap-3` da seção: os 16 px do guia entre o texto e
          as ações. */}
      {(teamChatAvailable || entryId) && (
        <div className="flex flex-wrap gap-2 pt-1">
          {teamChatAvailable && (
            <Button variant="destructive" iconLeft={MessageCircle} onClick={talkToTeam}>
              Falar com a equipe
            </Button>
          )}
          {entryId && (
            <Button variant="outline" onClick={() => navigate(`/diario/${entryId}`)}>
              Ver registro
            </Button>
          )}
        </div>
      )}

      <NewConversationModal {...modalProps} />
    </section>
  );
}
