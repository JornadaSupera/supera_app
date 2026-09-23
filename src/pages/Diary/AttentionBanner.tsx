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
 */
export default function AttentionBanner({ title, entryId }: AttentionBannerProps) {
  const navigate = useNavigate();
  const titleId = useId();

  return (
    <section
      aria-labelledby={titleId}
      className="rounded-2xl border border-[color-mix(in_srgb,var(--color-mood-4)_35%,transparent)] bg-[color-mix(in_srgb,var(--color-mood-4)_10%,transparent)] p-4"
    >
      <div className="flex items-start gap-3">
        <TriangleAlert
          size={20}
          strokeWidth={2}
          className="mt-0.5 shrink-0 text-[var(--color-mood-4)]"
          aria-hidden="true"
        />

        <div className="min-w-0 flex-1">
          <h2 id={titleId} className="text-[14px] font-semibold text-foreground">
            {title}
          </h2>
          <p className="mt-1 text-[13px]/[1.5] text-foreground">
            Se você não está bem ou tem dúvidas sobre esses sintomas, fale com a equipe pelo Chat.
            Em caso de urgência, não espere a resposta: procure um serviço de emergência.
          </p>

          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="md" iconLeft={MessageCircle} onClick={() => navigate('/chat')}>
              Falar com a equipe
            </Button>
            {entryId && (
              <Button size="md" variant="outline" onClick={() => navigate(`/diario/${entryId}`)}>
                Ver registro
              </Button>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
