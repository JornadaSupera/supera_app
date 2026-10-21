import { useNavigate } from 'react-router';
import { ChevronRight, Sparkles } from 'lucide-react';
import Card from '../../components/ui/card';
import Tag from '../../components/ui/tag';

/**
 * A chamada do assistente com IA na Início (o bônus de IA do contrato): o
 * paciente precisa ver que o app tem IA (pedido de 21/10). Sempre à vista,
 * mesmo com a chave da clínica desligada — a tela do assistente diz "em breve"
 * até a clínica ligar.
 *
 * Card branco de destaque, como os outros da Início (o verde fica na capa). O
 * chamariz é a etiqueta laranja de "Novo" (o destaque do guia para chamadas
 * especiais) e um exemplo de pergunta, no balão da conversa do assistente.
 */
export default function AssistantTeaser() {
  const navigate = useNavigate();

  return (
    <Card
      onClick={() => navigate('/orientacoes/assistente')}
      elevation="raised"
      padding="md"
      className="w-full text-left"
      aria-label="Pergunte à IA: tire dúvidas com as orientações da sua equipe"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <Sparkles size={24} strokeWidth={2} aria-hidden="true" className="shrink-0 text-primary-deep" />
            <p className="text-card-title font-bold text-foreground">Pergunte à IA</p>
            <Tag tone="attention">Novo</Tag>
          </div>
          <p className="text-body-sm text-muted-foreground">
            Escreva sua dúvida e a IA mostra o que as orientações da sua equipe dizem sobre o assunto.
          </p>
        </div>
        <ChevronRight size={24} strokeWidth={2} aria-hidden="true" className="-my-px shrink-0 text-primary-deep" />
      </div>

      {/* O exemplo no mesmo balão da pergunta na tela do assistente. */}
      <p className="mt-3 w-fit max-w-full rounded-lg bg-secondary px-4 py-2 text-body-sm text-foreground">
        “O que posso comer durante a quimioterapia?”
      </p>
    </Card>
  );
}
