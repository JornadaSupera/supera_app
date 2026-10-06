import { useId } from 'react';
import { useNavigate } from 'react-router';
import { MessageCircle, TriangleAlert } from 'lucide-react';
import Button from '../../components/ui/button';

interface AttentionBannerProps {
  title: string;
  /**
   * Registro a que o aviso se refere, quando a tela não é o próprio registro
   * (a timeline). Ganha o botão "Ver registro".
   */
  entryId?: string;
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
export default function AttentionBanner({ title, entryId }: AttentionBannerProps) {
  const navigate = useNavigate();
  const titleId = useId();

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

      <p className="text-body text-foreground">
        Se você não está bem ou tem dúvidas sobre esses sintomas, fale com a equipe pelo Chat.
        Em caso de urgência, não espere a resposta: procure um serviço de emergência.
      </p>

      {/* `pt-1` somado ao `gap-3` da seção: os 16 px do guia entre o texto e
          as ações. */}
      <div className="flex flex-wrap gap-2 pt-1">
        <Button variant="destructive" iconLeft={MessageCircle} onClick={() => navigate('/chat')}>
          Falar com a equipe
        </Button>
        {entryId && (
          <Button variant="outline" onClick={() => navigate(`/diario/${entryId}`)}>
            Ver registro
          </Button>
        )}
      </div>
    </section>
  );
}
