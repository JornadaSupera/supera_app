import { useNavigate, useParams } from 'react-router';
import { FileText, MessageCircle } from 'lucide-react';
import StepHeader from '../../components/ui/step-header';
import Loading from '../../components/ui/loading';
import EmptyState from '../../components/ui/empty-state';
import ErrorState from '../../components/ui/error-state';
import Button from '../../components/ui/button';
import BottomTab from '../../components/ui/bottom-tab';
import SectionHeading from '../../components/ui/section-heading';
import SymptomFace from '../../components/ui/symptom-face';
import Tag from '../../components/ui/tag';
import AttentionBanner from './AttentionBanner';
import NewConversationModal from '../Chat/NewConversationModal';
import { useDiaryEntry } from '../../hooks/useDiary';
import { useTeamConversation } from '../../hooks/useChat';
import { buildDiaryChatDraft, SYMPTOMS_SUBJECT_CODE } from '../../utils/chat';
import { useGoBackOr } from '../../hooks/useGoBackOr';
import { getIntensityInfo, isAlertGrade } from '../../utils/symptoms';
import { formatRelativeDay } from '../../utils/date';
import { cn } from '../../lib/utils';

const INTENSITY_STEPS = [1, 2, 3, 4, 5];

/**
 * A intensidade em cinco tracinhos, preenchidos até o grau: dá para comparar
 * os sintomas de relance, sem ler o rótulo. Decorativo para o leitor de tela,
 * que ouve o grau por extenso. Verde escuro abaixo do grau de atenção e o
 * vermelho de alarme a partir dele, como na escala do guia. Os tracinhos
 * vazios vão no `line` das divisórias: o `muted` tem, no tema escuro, a cor do
 * cartão, e o grau "3" virava três tracinhos soltos, sem os dois que faltam.
 */
function IntensityMeter({ grade, alert }: { grade: number; alert: boolean }) {
  return (
    <span className="flex gap-0.5">
      <span aria-hidden="true" className="flex gap-0.5">
        {INTENSITY_STEPS.map((step) => (
          <span
            key={step}
            className={cn(
              'h-1.5 w-3 rounded-full',
              step > grade ? 'bg-border' : alert ? 'bg-destructive' : 'bg-primary-deep'
            )}
          />
        ))}
      </span>
      <span className="sr-only">, grau {grade} de 5</span>
    </span>
  );
}

export default function EntryDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  // Volta para onde a pessoa estava (o Diário, a Home); só cai no Diário
  // quando o registro foi aberto direto, sem tela anterior.
  const goBack = useGoBackOr('/diario');

  const { data: entry, isLoading, isError, refetch } = useDiaryEntry(id);

  // O "Falar com a equipe" sem o aviso de atenção: mesma regra do aviso — a
  // conversa de Sintomas ainda aberta, se houver, com o registro citado.
  const chatDraft = entry ? buildDiaryChatDraft(entry.date) : '';
  const { talkToTeam, modalProps } = useTeamConversation(SYMPTOMS_SUBJECT_CODE, chatDraft);

  if (isLoading) {
    return <Loading />;
  }

  // Falha de leitura (rede, sessão) não é "não encontrado": só a segunda tem
  // esse texto; a primeira se resolve tentando de novo.
  if (isError && !entry) {
    return (
      <div className="flex min-h-[100dvh] flex-col bg-background">
        <StepHeader onBack={goBack} meta="Registro do diário" />
        <ErrorState
          title="Não foi possível carregar o registro"
          description="Verifique sua conexão e tente novamente."
          onRetry={() => void refetch()}
        />
        <BottomTab />
      </div>
    );
  }

  if (!entry) {
    return (
      <div className="flex min-h-[100dvh] flex-col bg-background">
        <StepHeader onBack={goBack} meta="Registro do diário" />
        <EmptyState
          title="Registro não encontrado"
          description="Esse registro não existe ou não está disponível para você."
          actionLabel="Voltar ao diário"
          onAction={() => navigate('/diario')}
        />
        <BottomTab />
      </div>
    );
  }

  // O resumo do registro é o sintoma mais intenso — não uma autoavaliação do
  // paciente, que não existe no banco. Registro só com texto não tem grau.
  const severity = entry.severity;

  // "23 de setembro · 12:00 · Hoje": a data, a hora e, na última semana, há
  // quanto tempo. Antes o rótulo da lista vinha junto e repetia a hora.
  const fullDateLabel = [
    entry.date.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long' }),
    entry.time,
    formatRelativeDay(entry.date),
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className="flex min-h-[100dvh] flex-col bg-background">
      <StepHeader onBack={goBack} meta="Registro do diário" />

      {/* Recuo de 16 px, a margem das telas no guia, o mesmo do cabeçalho, e
          32 px entre os blocos (a separação entre seções do guia), como na
          tela de privacidade. Os espaços são `gap`: o reset global do
          `index.css` zera a margem de `h2`, `p` e `ul`. */}
      <main className="flex flex-1 flex-col gap-8 px-4 pt-6 pb-6">
        {/* Só a tinta e as cores funcionais do guia, sem a paleta de humor: a
            carinha de traço num círculo verde-água claro e, a partir do grau
            de atenção, no fundo de alarme. A própria `SymptomFace` troca o
            traço para o vermelho nesse grau. */}
        <section className="flex flex-col items-center gap-1">
          {severity !== null ? (
            <span
              aria-hidden="true"
              className={cn(
                'mb-2 grid size-20 place-items-center rounded-full',
                isAlertGrade(severity) ? 'bg-destructive-soft' : 'bg-secondary'
              )}
            >
              <SymptomFace grade={severity} size="md" />
            </span>
          ) : (
            <div className="mb-2 flex size-20 items-center justify-center rounded-full bg-muted">
              <FileText size={32} strokeWidth={2} aria-hidden="true" className="text-muted-foreground" />
            </div>
          )}
          {/* O grau por extenso ("Forte"): nunca fica só na cor. */}
          <p className="text-center text-title font-bold text-foreground">
            {severity !== null ? (
              <>
                Pior sintoma:{' '}
                <span className={isAlertGrade(severity) ? 'text-destructive-deep' : 'text-primary-deep'}>
                  {getIntensityInfo(severity).label}
                </span>
              </>
            ) : (
              'Apenas anotação'
            )}
          </p>
          <p className="text-center text-caption font-medium text-muted-foreground">
            {fullDateLabel}
          </p>
        </section>

        {entry.hasAlert && <AttentionBanner title="Este registro tem sintomas fortes" chatDraft={chatDraft} />}

        {/* Títulos de seção na faixa do guia (`SectionHeading`, que já desfaz
            os 16 px da margem da tela), a 12 px do conteúdo. */}
        {entry.freeText && (
          <section className="flex flex-col gap-3">
            <SectionHeading>Texto livre</SectionHeading>
            <div className="rounded-lg border border-border bg-card p-4 text-body whitespace-pre-wrap text-foreground shadow-sm">
              {entry.freeText}
            </div>
          </section>
        )}

        {entry.symptoms.length > 0 && (
          <section className="flex flex-col gap-3">
            <SectionHeading>Sintomas registrados</SectionHeading>
            <ul className="flex flex-col gap-2">
              {entry.symptoms.map((symptom) => {
                const alert = isAlertGrade(symptom.grade);

                return (
                  <li
                    key={symptom.symptomId}
                    className="flex items-start gap-3 rounded-lg border border-border bg-card p-4 shadow-sm"
                  >
                    <SymptomFace grade={symptom.grade} size="sm" />

                    {/* O grau vai embaixo do nome, e não à direita: a etiqueta
                        e os tracinhos ao lado da carinha deixavam o nome
                        espremido numa tela de 360 px. */}
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <p className="text-body font-semibold text-foreground">{symptom.label}</p>
                      {symptom.description && (
                        <p className="text-caption font-medium text-muted-foreground">
                          {symptom.description}
                        </p>
                      )}
                      <div className="flex items-center gap-2 pt-1">
                        <Tag tone={alert ? 'alert' : 'default'}>{getIntensityInfo(symptom.grade).label}</Tag>
                        <IntensityMeter grade={symptom.grade} alert={alert} />
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {/* Com o aviso de atenção no alto, o "Falar com a equipe" já está nele,
            em destaque: repetido aqui, seriam dois botões iguais na tela. */}
        {!entry.hasAlert && (
          <Button
            fullWidth
            variant="outline"
            iconLeft={MessageCircle}
            onClick={talkToTeam}
          >
            Falar com a equipe
          </Button>
        )}
      </main>

      <NewConversationModal {...modalProps} />

      <BottomTab />
    </div>
  );
}
