import { useState, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigate } from 'react-router';
import { ChevronLeft, CircleCheck, ClipboardList } from 'lucide-react';
import StickyFooter from '../../components/ui/sticky-footer';
import Button from '../../components/ui/button';
import EmptyState from '../../components/ui/empty-state';
import ErrorState from '../../components/ui/error-state';
import Loading from '../../components/ui/loading';
import { describeMutationError } from '../../hooks/useAuth';
import { usePendingNpsSurvey, useSubmitNpsResponse } from '../../hooks/useNps';
import { NPS_COMMENT_MAX_LENGTH, npsResponseSchema, type NpsResponseFormValues } from '../../schemas/nps';
import { useGoBackOr } from '../../hooks/useGoBackOr';
import { AppError } from '../../lib/appError';
import { cn } from '../../lib/utils';
import { NPS_MOMENT_LABELS, getNpsMoment } from '../../utils/nps';
import NpsScoreScale from './NpsScoreScale';
import type { NpsScore, NpsSurvey as PendingNpsSurvey } from '../../types';

const FORM_ID = 'nps-survey-form';
const QUESTION_ID = 'nps-question';

function NpsLayout({ children }: { children: ReactNode }) {
  // Volta para de onde a pessoa veio (a Home tem o atalho, o Perfil também), e
  // só cai no Perfil quando a tela foi aberta direto pelo endereço.
  const goBack = useGoBackOr('/perfil');

  return (
    <div className="flex min-h-[100dvh] flex-col bg-background">
      <header className="sticky top-0 z-20 bleed-x flex items-center gap-2 border-b border-border bg-[color-mix(in_srgb,var(--color-card)_95%,transparent)] px-safe-6 pt-[calc(1.5rem_+_var(--safe-top))] pb-4 backdrop-blur-[8px]">
        <button
          type="button"
          className="-ml-2 inline-flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full border-none bg-transparent text-foreground transition-[background-color] duration-150 ease-[ease] hover:bg-muted"
          onClick={goBack}
          aria-label="Voltar"
        >
          <ChevronLeft size={20} strokeWidth={2} aria-hidden="true" />
        </button>
        <div className="flex min-w-0 flex-col">
          <p className="text-[12px] font-medium uppercase tracking-wider text-muted-foreground">
            PESQUISA DE SATISFAÇÃO
          </p>
          <h1 className="text-[18px] font-semibold tracking-tight text-foreground">Sua experiência</h1>
        </div>
      </header>

      {/* Sem `BottomTab`: esta é tela de TAREFA, não de navegação. A barra de
          abas e a `StickyFooter` são as duas `sticky bottom-0`, e só a barra
          tem `z-index` — empilhadas, ela cobria 49px do botão "Enviar
          resposta" num aparelho de 375x812, e o toque no centro do botão caía
          na aba. É também a convenção do app: as 8 telas com barra de abas não
          têm barra de ação, e as 7 com barra de ação não têm abas. */}
      {children}
    </div>
  );
}

/**
 * De que momento é esta pesquisa, e que ela se repete. Antes, só um "Referente
 * a: Primeiro acesso ao app" em letra miúda: era lido como "avalie o app", e o
 * atalho sumir depois da resposta parecia defeito (pedido de 30/09). A
 * pergunta é a mesma nos três momentos — é a satisfação com o Centro medida no
 * começo, na metade e no fim do tratamento.
 */
function NpsMomentCard({ survey }: { survey: PendingNpsSurvey }) {
  const { step, total } = getNpsMoment(survey.milestoneCode);

  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm">
      <p className="text-[12px] font-semibold tracking-[0.04em] text-[var(--color-supera-seguranca)] uppercase">
        {step ? `Pesquisa ${step} de ${total} · ${survey.milestoneLabel}` : survey.milestoneLabel}
      </p>

      {step && (
        <>
          {/* A linha do tempo repete o "1 de 3" do texto acima: fica fora do
              leitor de tela. */}
          <ol aria-hidden="true" className="grid grid-cols-3 gap-1.5">
            {NPS_MOMENT_LABELS.map((label, index) => {
              const position = index + 1;

              return (
                <li key={label} className="flex flex-col gap-1.5">
                  <span
                    className={cn(
                      'h-1.5 rounded-full',
                      position === step && 'bg-primary',
                      position < step && 'bg-[color-mix(in_srgb,var(--color-primary)_45%,transparent)]',
                      position > step && 'bg-muted'
                    )}
                  />
                  <span
                    className={cn(
                      'text-center text-[11px]',
                      position === step ? 'font-semibold text-foreground' : 'text-muted-foreground'
                    )}
                  >
                    {label}
                  </span>
                </li>
              );
            })}
          </ol>

          <p className="text-[13px]/[1.5] text-muted-foreground">
            Fazemos esta mesma pergunta em três momentos do tratamento — no começo, na metade e no
            fim —, para acompanhar como está a sua experiência com o Centro. Responda pensando em
            tudo até agora.
          </p>
        </>
      )}
    </section>
  );
}

interface NpsSurveyFormProps {
  survey: PendingNpsSurvey;
  mutation: ReturnType<typeof useSubmitNpsResponse>;
  /** Guarda de que momento foi a resposta, para o "Obrigado" dizer quando vem a próxima. */
  onAnswer: (survey: PendingNpsSurvey) => void;
}

function NpsSurveyForm({ survey, mutation, onAnswer }: NpsSurveyFormProps) {
  const {
    setValue,
    register,
    watch,
    handleSubmit,
    formState: { errors },
  } = useForm<NpsResponseFormValues>({
    resolver: zodResolver(npsResponseSchema),
    // `score` fica `undefined` (nenhuma nota escolhida ainda) até o paciente
    // tocar num botão — `defaultValues` aceita isso mesmo com `score: number`
    // no schema porque o tipo de `defaultValues` é `DeepPartial`.
    defaultValues: { score: undefined, comment: '' },
  });

  const currentScore = watch('score');
  const comment = watch('comment') ?? '';

  const onSubmit = (data: NpsResponseFormValues) => {
    onAnswer(survey);
    mutation.mutate({
      surveyId: survey.id,
      // `data.score` já passou pelas checagens `.int().min(0).max(10)` do Zod
      // antes de `onSubmit` rodar — mas o Zod valida faixa numérica, não o
      // union literal 0-10 de `NpsScore`, então o TypeScript não estreita
      // sozinho; o cast só documenta essa garantia em runtime.
      score: data.score as NpsScore,
      comment: data.comment,
    });
  };

  return (
    <>
      <main className="flex-1 p-6">
        <form id={FORM_ID} onSubmit={handleSubmit(onSubmit)}>
          <div className="mb-6">
            <NpsMomentCard survey={survey} />
          </div>

          <h2 id={QUESTION_ID} className="text-[18px]/[1.4] font-semibold text-foreground">
            De 0 a 10, o quanto você recomendaria o Centro a quem precisa?
          </h2>

          {mutation.isError && (
            <div
              role="alert"
              className="mt-4 rounded-lg border border-[color-mix(in_srgb,var(--color-destructive)_30%,transparent)] bg-[color-mix(in_srgb,var(--color-destructive)_10%,transparent)] p-3 text-[13px] text-destructive"
            >
              {describeMutationError(mutation.error, 'Não foi possível enviar sua resposta.')}
            </div>
          )}

          {/* Carinhas de 0 a 10 (pedido de 28/09). A nota continua sendo o
              número: é ele que vai para o banco. */}
          <div className="mt-6">
            <NpsScoreScale
              value={currentScore as NpsScore | undefined}
              onChange={(score) => setValue('score', score, { shouldValidate: true })}
              labelledBy={QUESTION_ID}
            />
          </div>

          {errors.score && (
            <p role="alert" className="mt-2 text-[11px] text-destructive">
              {errors.score.message}
            </p>
          )}

          <div className="mt-6 flex flex-col gap-1">
            <label className="text-[12px] font-medium text-muted-foreground" htmlFor="nps-comment">
              Quer contar o porquê? (opcional)
            </label>
            <textarea
              id="nps-comment"
              maxLength={NPS_COMMENT_MAX_LENGTH}
              aria-describedby="nps-comment-count"
              className="min-h-24 w-full resize-none rounded-xl border border-border bg-background px-3.5 py-3 text-[16px] text-foreground outline-none transition-[border-color] duration-150 ease-[ease] placeholder:text-muted-foreground focus:border-[var(--color-supera-empatia)]"
              placeholder="O que poderia ser melhor? O que você mais gostou?"
              {...register('comment')}
            />
            {/* A resposta é única e final: o banco recusa UPDATE e DELETE. Por
                isso o teto aparece antes do envio, e não como erro depois. */}
            <p
              id="nps-comment-count"
              aria-live="polite"
              className="self-end text-[11px] text-muted-foreground"
            >
              {comment.length}/{NPS_COMMENT_MAX_LENGTH}
            </p>
            {errors.comment && (
              <p role="alert" className="text-[11px] text-destructive">
                {errors.comment.message}
              </p>
            )}
          </div>

          {/* A resposta é atribuível (uma por marco exige saber de quem é) —
              então a tela não promete anonimato, e diz quem de fato lê. */}
          <p className="mt-4 text-[11px]/[1.5] text-muted-foreground">
            Sua nota e seu comentário são lidos apenas pela administração do Centro. Os
            profissionais que acompanham você não têm acesso. A resposta é enviada uma única vez e
            não pode ser alterada depois.
          </p>
        </form>
      </main>

      <StickyFooter>
        <Button
          type="submit"
          form={FORM_ID}
          fullWidth
          disabled={currentScore === undefined || mutation.isPending}
          loading={mutation.isPending}
        >
          Enviar resposta
        </Button>
      </StickyFooter>
    </>
  );
}

/**
 * A resposta já existia (UNIQUE em `nps_responses.survey_id`): outro aparelho,
 * ou um toque duplo com a rede lenta. A resposta de quem está na tela VALEU —
 * mostrar "não foi possível enviar" seria mentira, e cair no estado vazio
 * ("Nenhuma pesquisa aberta agora") deixaria a pessoa sem saber se contou.
 */
function isAlreadyAnswered(error: unknown): boolean {
  return error instanceof AppError && error.code === '23505';
}

export default function NpsSurvey() {
  const navigate = useNavigate();
  const { data: survey, isLoading, isError, refetch } = usePendingNpsSurvey();

  // Mora aqui, e não no formulário: ao dar certo, a pendência é invalidada e
  // some — se a mutation vivesse no formulário, ele desmontaria e levaria o
  // "Obrigado" junto.
  const submitMutation = useSubmitNpsResponse();
  const alreadyAnswered = isAlreadyAnswered(submitMutation.error);
  // De que momento foi a resposta: depois dela a pesquisa some da consulta de
  // pendentes, e o "Obrigado" ainda precisa dizer quando vem a próxima.
  const [answeredSurvey, setAnsweredSurvey] = useState<PendingNpsSurvey | null>(null);

  if (submitMutation.isSuccess || alreadyAnswered) {
    const nextSurveyNote = answeredSurvey
      ? getNpsMoment(answeredSurvey.milestoneCode).afterAnswer
      : null;
    const thanks = alreadyAnswered
      ? 'Sua resposta já estava registrada. Ela ajuda a equipe a cuidar cada vez melhor de você e dos próximos pacientes.'
      : 'Sua resposta ajuda a equipe a cuidar cada vez melhor de você e dos próximos pacientes.';

    return (
      <NpsLayout>
        <div className="flex flex-1 flex-col">
          <EmptyState
            icon={CircleCheck}
            iconTone="var(--color-supera-empatia)"
            title="Obrigado! 💙"
            description={nextSurveyNote ? `${thanks} ${nextSurveyNote}` : thanks}
            actionLabel="Voltar ao início"
            onAction={() => navigate('/home')}
          />
        </div>
      </NpsLayout>
    );
  }

  // Dentro do `NpsLayout`: solto, o carregamento fica sem cabeçalho e sem barra
  // de abas (esta é tela de tarefa), e numa rede ruim a pessoa fica sem
  // nenhuma saída a não ser o gesto do sistema.
  if (isLoading) {
    return (
      <NpsLayout>
        <Loading className="flex-1" />
      </NpsLayout>
    );
  }

  if (isError) {
    return (
      <NpsLayout>
        <ErrorState
          className="flex-1"
          title="Não foi possível carregar a pesquisa"
          onRetry={() => void refetch()}
        />
      </NpsLayout>
    );
  }

  // Sem pesquisa aberta: a rotina ainda não abriu nenhuma, ela já foi
  // respondida, ou a sessão é de acompanhante (que não responde pelo titular).
  if (!survey) {
    return (
      <NpsLayout>
        <EmptyState
          className="flex-1"
          icon={ClipboardList}
          title="Nenhuma pesquisa aberta agora"
          description="A pesquisa de satisfação aparece em momentos do tratamento. Quando houver uma para você, ela fica disponível aqui e na tela inicial."
          actionLabel="Voltar ao início"
          onAction={() => navigate('/home')}
        />
      </NpsLayout>
    );
  }

  return (
    <NpsLayout>
      <NpsSurveyForm survey={survey} mutation={submitMutation} onAnswer={setAnsweredSurvey} />
    </NpsLayout>
  );
}
