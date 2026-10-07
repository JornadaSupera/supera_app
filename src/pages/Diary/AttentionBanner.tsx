import { useNavigate } from 'react-router';
import { TriangleAlert } from 'lucide-react';
import Button from '../../components/ui/button';
import ExpansionTile from '../../components/ui/expansion-tile';
import TalkToTeamButton from '../../components/TalkToTeamButton';
import NewConversationModal from '../Chat/NewConversationModal';
import { useTeamConversation } from '../../hooks/useChat';
import { SYMPTOMS_SUBJECT_CODE } from '../../utils/chat';

const TOGGLE_LABELS = { closed: 'Ver mais', open: 'Ver menos' };

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
 * Recolhido no título, como o `ExpansionTile` do Flutter, no vermelho suave
 * (pedido de 07/10: o cartão grande em vermelho assustava quem acabou de
 * registrar dor ou tristeza). O "Ver mais" abre a orientação e as ações.
 */
export default function AttentionBanner({ title, entryId, chatDraft }: AttentionBannerProps) {
  const navigate = useNavigate();
  // Sintoma é assunto "Sintomas": com uma conversa dele ainda aberta, é ela
  // que abre — e não a lista do Chat, de onde saía uma conversa nova a cada vez.
  const { available: teamChatAvailable, talkToTeam, modalProps } = useTeamConversation(
    SYMPTOMS_SUBJECT_CODE,
    chatDraft
  );

  return (
    <>
      <ExpansionTile variant="alert" icon={TriangleAlert} title={title} toggleLabels={TOGGLE_LABELS}>
        <div className="flex flex-col gap-4">
          {/* Ao acompanhante sem a área do Chat, o caminho é o telefone da
              clínica (Perfil → Fale com a Supera), e o botão do Chat não
              aparece. */}
          <p className="text-body text-foreground">
            {teamChatAvailable
              ? 'Se você não está bem ou tem dúvidas sobre esses sintomas, fale com a equipe pelo Chat. Em caso de urgência, não espere a resposta: procure um serviço de emergência.'
              : 'Se a pessoa não está bem ou há dúvidas sobre esses sintomas, ligue para a equipe (Perfil → Fale com a Supera). Em caso de urgência, procure um serviço de emergência.'}
          </p>

          {/* As ações pequenas, à direita do cartão (pedido de 07/10): o
              "Falar com a equipe" na cápsula discreta, por último, e o "Ver
              registro" só em texto, antes dele. */}
          {(teamChatAvailable || entryId) && (
            <div className="flex flex-wrap items-center justify-end gap-2">
              {entryId && (
                <Button variant="ghost" size="compact" pill onClick={() => navigate(`/diario/${entryId}`)}>
                  Ver registro
                </Button>
              )}
              {teamChatAvailable && <TalkToTeamButton onClick={talkToTeam} />}
            </div>
          )}
        </div>
      </ExpansionTile>

      <NewConversationModal {...modalProps} />
    </>
  );
}
