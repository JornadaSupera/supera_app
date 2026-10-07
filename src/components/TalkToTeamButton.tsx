import { MessageCircle } from 'lucide-react';
import Button from './ui/button';

interface TalkToTeamButtonProps {
  onClick: () => void;
  className?: string;
}

/**
 * O "Falar com a equipe" do app inteiro — aviso de sintoma, registro do Diário,
 * compromisso da Agenda e busca vazia da Central. Discreto (pedido de 07/10: o
 * botão grande e cheio pesava dentro dos cartões): a cápsula `soft` pequena,
 * com o balão do Chat. Nos cartões, quem usa o põe à direita.
 */
export default function TalkToTeamButton({ onClick, className }: TalkToTeamButtonProps) {
  return (
    <Button variant="soft" size="compact" pill iconLeft={MessageCircle} onClick={onClick} className={className}>
      Falar com a equipe
    </Button>
  );
}
