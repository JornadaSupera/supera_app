import { useNavigate } from 'react-router';
import flowerClump from '@/assets/design/flower-clump.webp';
import Button from '../../components/ui/button';
import TalkToTeamButton from '../../components/TalkToTeamButton';
import { useScopeAllowed } from '../../hooks/useCaregiver';

interface KnowledgeSearchEmptyProps {
  /** O texto do link que limpa a busca ("Ver todas as perguntas", "Ver todos os temas"). */
  showAllLabel: string;
  onShowAll: () => void;
}

/**
 * Busca sem resultado na Central de Conhecimento, como na sugestão de design
 * do guia ("Busca sem resultado"): a touceira de flores acolhe quem não achou
 * o que procurava, e o caminho principal passa a ser falar com a equipe. O
 * link de baixo limpa a busca.
 */
export default function KnowledgeSearchEmpty({ showAllLabel, onShowAll }: KnowledgeSearchEmptyProps) {
  const navigate = useNavigate();
  // Sem a área do Chat (acompanhante), nem o convite nem o botão para ele.
  const { allowed: chatAllowed } = useScopeAllowed('chat');

  return (
    <div className="flex flex-col items-center gap-2 py-6 text-center">
      {/* Decorativa (`alt` vazio); o guia pede de 140 a 200 px. */}
      <img src={flowerClump} alt="" width={650} height={700} className="mb-2 h-auto w-[150px] select-none" />
      <h2 className="text-title font-bold text-primary-deep">Não encontramos essa pergunta</h2>
      <p className="max-w-[300px] text-body-sm text-muted-foreground">
        {chatAllowed
          ? 'Tente outras palavras ou fale direto com a equipe. Estamos aqui para ajudar.'
          : 'Tente outras palavras. Estamos aqui para ajudar.'}
      </p>
      {/* O "Falar com a equipe" discreto, o mesmo do app inteiro (07/10); aqui,
          centrado como o resto do estado vazio. */}
      <div className="mt-4 flex w-full max-w-[320px] flex-col items-center gap-2">
        {chatAllowed && <TalkToTeamButton onClick={() => navigate('/chat')} />}
        <Button variant="ghost" onClick={onShowAll}>
          {showAllLabel}
        </Button>
      </div>
    </div>
  );
}
