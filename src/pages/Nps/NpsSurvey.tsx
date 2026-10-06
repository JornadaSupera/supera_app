import { useState, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigate } from 'react-router';
import { ChevronLeft, TriangleAlert } from 'lucide-react';
import StickyFooter from '../../components/ui/sticky-footer';
import Button from '../../components/ui/button';
import EmptyState from '../../components/ui/empty-state';
import { CARE_PHRASES } from '../../components/ui/affective-phrase';
import ErrorState from '../../components/ui/error-state';
import Loading from '../../components/ui/loading';
import Textarea from '../../components/ui/textarea';
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
      {/* A mesma barra da `StepHeader` (fundo, recuo de 16 px, voltar de 48 px
          com a seta de 24 px em `teal-deep` e o `-ml-3` que a põe na margem),
          com o contexto em cima do título em frase normal, como pede o guia. */}
      <header className="sticky top-0 z-20 bleed-x flex items-center gap-3 border-b border-border bg-[color-mix(in_srgb,var(--color-background)_95%,transparent)] px-safe-4 pt-[calc(1.5rem_+_var(--safe-top))] pb-3 backdrop-blur-[8px]">
        <button
          type="button"
          className="-ml-3 inline-flex h-12 w-12 shrink-0 cursor-pointer items-center justify-center rounded-full border-none bg-transparent text-primary-deep transition-[background-color] duration-150 ease-[ease] hover:bg-muted"
          onClick={goBack}
          aria-label="Voltar"
        >
          <ChevronLeft size={24} strokeWidth={2} aria-hidden="true" />
        </button>
        <div className="flex min-w-0 flex-col">
          <p className="text-caption font-medium text-muted-foreground">Pesquisa de satisfação</p>
          <h1 className="text-section font-bold text-foreground">Sua experiência</h1>
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
      <p className="text-label font-semibold text-primary-deep">
        {step ? `Pesquisa ${step} de ${total} · ${survey.milestoneLabel}` : survey.milestoneLabel}
      </p>

      {step && (
        <>
          {/* A linha do tempo repete o "1 de 3" do texto acima: fica fora do
              leitor de tela. O trecho que ainda vem é o fio `line`: no tema
              escuro o `muted` é a própria cor do cartão, e ele sumia. */}
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
                      position > step && 'bg-border'
                    )}
                  />
                  <span
                    className={cn(
                      'text-center text-caption',
                      position === step ? 'font-semibold text-foreground' : 'font-medium text-muted-foreground'
                    )}
                  >
                    {label}
                  </span>
                </li>
              );
            })}
          </ol>

          <p className="text-body-sm text-muted-foreground">
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
      {/* Recuo de 16 px, a margem das telas no guia, e 24 px entre os blocos
          (o `gap` do formulário: margem em `p`/`h2` o reset do app zera). */}
      <main className="flex-1 px-4 py-6">
        <form id={FORM_ID} className="flex flex-col gap-6" onSubmit={handleSubmit(onSubmit)}>
          <NpsMomentCard survey={survey} />

          <h2 id={QUESTION_ID} className="text-section font-bold text-foreground">
            De 0 a 10, o quanto você recomendaria o Centro a quem precisa?
          </h2>

          {/* A caixa de aviso do guia (cantos de 20 px e o ícone), como os
              outros avisos de erro do app. O ícone de 24 px fica centrado na
              primeira linha do texto (`text-body-sm`, 21 px): a margem negativa
              põe o 1,5 px que sobra em cima e embaixo no respiro da caixa. */}
          {mutation.isError && (
            <div role="alert" className="flex items-start gap-3 rounded-2xl bg-destructive-soft p-4">
              <TriangleAlert size={24} strokeWidth={2} className="-my-[1.5px] shrink-0 text-destructive" aria-hidden="true" />
              <p className="text-body-sm text-destructive">
                {describeMutationError(mutation.error, 'Não foi possível enviar sua resposta.')}
              </p>
            </div>
          )}

          {/* Carinhas de 0 a 10 (pedido de 28/09). A nota continua sendo o
              número: é ele que vai para o banco. */}
          <div className="flex flex-col gap-2">
            <NpsScoreScale
              value={currentScore as NpsScore | undefined}
              onChange={(score) => setValue('score', score, { shouldValidate: true })}
              labelledBy={QUESTION_ID}
            />

            {errors.score && (
              <p role="alert" className="text-caption font-medium text-destructive">
                {errors.score.message}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-label font-semibold text-foreground" htmlFor="nps-comment">
              Quer contar o porquê? (opcional)
            </label>
            {/* O campo do app: borda visível, cantos de 8 px e o anel de foco. */}
            <Textarea
              id="nps-comment"
              className="min-h-24"
              maxLength={NPS_COMMENT_MAX_LENGTH}
              aria-describedby="nps-comment-count"
              placeholder="O que poderia ser melhor? O que você mais gostou?"
              {...register('comment')}
            />
            {/* A resposta é única e final: o banco recusa UPDATE e DELETE. Por
                isso o teto aparece antes do envio, e não como erro depois. */}
            <p
              id="nps-comment-count"
              aria-live="polite"
              className="self-end text-caption font-medium text-muted-foreground"
            >
              {comment.length}/{NPS_COMMENT_MAX_LENGTH}
            </p>
            {errors.comment && (
              <p role="alert" className="text-caption font-medium text-destructive">
                {errors.comment.message}
              </p>
            )}
          </div>

          {/* A resposta é atribuível (uma por marco exige saber de quem é) —
              então a tela não promete anonimato, e diz quem de fato lê. */}
          <p className="text-caption font-medium text-muted-foreground">
            Sua nota e seu comentário são lidos apenas pela administração do Centro. Os
            profissionais que acompanham você não têm acesso. A resposta é enviada uma única vez e
            não pode ser alterada depois.
          </p>
        </form>
      </main>

      {/* Recuo de 16 px, o mesmo do conteúdo acima: a densidade `compact` traz
          o `px-safe-4`, e o respiro vertical volta aos 16 px do rodapé de
          formulário (o `cn()` troca o `pt`/`pb` da variante por estes). */}
      <StickyFooter density="compact" className="pt-4 pb-[calc(1rem_+_var(--safe-bottom))]">
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

    // `flex-1`, como os outros estados desta tela: o agradecimento fica no
    // meio do espaço sob a barra, na mesma altura do "nenhuma pesquisa".
    return (
      <NpsLayout>
        <EmptyState
          className="flex-1"
          illustration
          phrase={CARE_PHRASES.feelJoy}
          title="Obrigado! 💙"
          description={nextSurveyNote ? `${thanks} ${nextSurveyNote}` : thanks}
          actionLabel="Voltar ao início"
          onAction={() => navigate('/home')}
        />
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
          // Tela vazia: a touceira de flores e a frase de apoio da caderneta
          // (pedido de 06/10), e não o ícone.
          illustration
          phrase={CARE_PHRASES.notAlone}
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
