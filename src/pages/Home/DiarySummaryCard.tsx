import { useNavigate } from 'react-router';
import { ChevronRight, FileText, Heart, NotebookPen } from 'lucide-react';
import Card from '../../components/ui/card';
import Badge from '../../components/ui/badge';
import Button from '../../components/ui/button';
import SymptomFace from '../../components/ui/symptom-face';
import { getIntensityInfo, isAlertGrade } from '../../utils/symptoms';
import type { EnrichedDiaryEntry } from '../../types';

interface DiarySummaryCardProps {
  registro: EnrichedDiaryEntry | null;
  sequenciaDias?: number;
}

export default function DiarySummaryCard({ registro, sequenciaDias = 0 }: DiarySummaryCardProps) {
  const navigate = useNavigate();

  if (!registro) {
    return (
      // O texto é o da tela vazia do guia ("Nenhum registro hoje"). A pergunta
      // "Como você está hoje?" já é o título da capa logo acima.
      <Card elevation="raised" padding="md">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <p className="flex items-center gap-2 text-label font-semibold text-primary-deep">
              <NotebookPen size={24} strokeWidth={2} aria-hidden="true" className="shrink-0" />
              Diário de sintomas
            </p>
            <h3 className="text-card-title font-bold text-foreground">Nenhum registro hoje</h3>
            <p className="text-body-sm text-muted-foreground">
              Conte como você está se sentindo. Leva menos de um minuto.
            </p>
          </div>
          <Button fullWidth onClick={() => navigate('/diario/novo')}>
            Registrar agora
          </Button>
        </div>
      </Card>
    );
  }

  // Resumo pelo sintoma mais intenso do registro. Registro só com texto não
  // tem grau — mostra a anotação, sem inventar uma intensidade.
  const severidade = registro.severity;
  const resumoTexto = severidade === null ? 'uma anotação' : getIntensityInfo(severidade).label;
  // As cores funcionais do guia, e não a escala colorida de humor: verde
  // escuro abaixo do grau de alerta, vermelho a partir dele — o mesmo corte da
  // carinha ao lado. O rótulo diz o grau, então a cor nunca fala sozinha.
  const summaryToneClass =
    severidade === null
      ? 'text-muted-foreground'
      : isAlertGrade(severidade)
        ? 'text-destructive-deep'
        : 'text-primary-deep';

  const primeiroSintoma = registro.symptoms[0];

  return (
    <Card elevation="raised" padding="md" onClick={() => navigate(`/diario/${registro.id}`)}>
      <div className="flex items-start gap-4">
        {/* A carinha de traço da intensidade, sem pastilha. Registro só com
            texto não tem grau, e fica com o ícone da anotação, também solto e
            do tamanho da carinha (52 px). O traço de 1,5 nas 24 unidades do
            ícone é o mesmo 2 nas 32 da carinha: os dois desenhos têm a mesma
            espessura. Cinza, como o "uma anotação" do título. */}
        {severidade !== null ? (
          <SymptomFace grade={severidade} size="md" />
        ) : (
          <FileText size={52} strokeWidth={1.5} aria-hidden="true" className="shrink-0 text-muted-foreground" />
        )}

        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <p className="text-label font-semibold text-primary-deep">Seu registro de hoje</p>
          <h3 className="text-card-title font-bold text-foreground">
            Você registrou hoje: <span className={summaryToneClass}>{resumoTexto}</span>
          </h3>

          {registro.freeText && (
            <p className="line-clamp-2 text-body-sm text-muted-foreground">{registro.freeText}</p>
          )}

          {/* O sintoma à esquerda e o "Ver detalhes" na borda direita do
              cartão (pedido de 30/09). Sem sintoma, o "Ver detalhes" continua
              à direita. */}
          <div className="flex items-center justify-between gap-3">
            {primeiroSintoma && (
              <Badge tone="secondary" size="sm" className="min-w-0 truncate">
                {primeiroSintoma.label} · {primeiroSintoma.grade}
              </Badge>
            )}

            <span className="ml-auto inline-flex min-h-11 shrink-0 items-center gap-1 text-label font-semibold text-primary-deep">
              Ver detalhes
              <ChevronRight size={24} strokeWidth={2} aria-hidden="true" />
            </span>
          </div>
        </div>
      </div>

      {sequenciaDias > 1 && (
        // O ícone na primeira linha da frase, como no bloco de preparo do
        // compromisso: o `-my-[1.5px]` centra os 24 px na linha de 21 px do
        // `text-body-sm`.
        <div className="mt-4 flex items-start gap-3 rounded-lg bg-secondary px-4 py-3">
          <Heart size={24} strokeWidth={2} aria-hidden="true" className="-my-[1.5px] shrink-0 text-primary-deep" />
          <p className="text-body-sm text-foreground">
            <strong className="font-semibold">{sequenciaDias} dias seguidos</strong> registrando.
            Sua equipe agradece por compartilhar.
          </p>
        </div>
      )}
    </Card>
  );
}
