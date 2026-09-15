import type { ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigate } from 'react-router';
import { ChevronLeft, CircleCheck, ClipboardList } from 'lucide-react';
import Button from '../../components/ui/button';
import EmptyState from '../../components/ui/empty-state';
import ErrorState from '../../components/ui/error-state';
import Loading from '../../components/ui/loading';
import BottomTab from '../../components/ui/bottom-tab';
import { describeMutationError } from '../../hooks/useAuth';
import { usePendingNpsSurvey, useSubmitNpsResponse } from '../../hooks/useNps';
import { npsResponseSchema, type NpsResponseFormValues } from '../../schemas/nps';
import { cn } from '../../lib/utils';
import type { NpsScore, NpsSurvey as PendingNpsSurvey } from '../../types';

const SCORES = Array.from({ length: 11 }, (_, index) => index);
const FORM_ID = 'nps-survey-form';

function getScoreCategoryClasses(score: number): string {
  if (score <= 6) return 'bg-destructive border-destructive';
  if (score <= 8) return 'bg-[var(--color-mood-3)] border-[var(--color-mood-3)]';
  return 'bg-[var(--color-supera-empatia)] border-[var(--color-supera-empatia)]';
}

function NpsLayout({ children }: { children: ReactNode }) {
  const navigate = useNavigate();

  return (
    <div className="flex min-h-[100dvh] flex-col bg-background">
      <header className="sticky top-0 z-20 flex items-center gap-2 border-b border-border bg-[color-mix(in_srgb,var(--color-card)_95%,transparent)] px-6 pt-6 pb-4 backdrop-blur-[8px]">
        <button
          type="button"
          className="-ml-2 inline-flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full border-none bg-transparent text-foreground transition-[background-color] duration-150 ease-[ease] hover:bg-muted"
          onClick={() => navigate('/perfil')}
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

      {children}

      <BottomTab />
    </div>
  );
}

interface NpsSurveyFormProps {
  survey: PendingNpsSurvey;
  mutation: ReturnType<typeof useSubmitNpsResponse>;
}

function NpsSurveyForm({ survey, mutation }: NpsSurveyFormProps) {
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

  const onSubmit = (data: NpsResponseFormValues) => {
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
          <h2 className="text-[18px]/[1.4] font-semibold text-foreground">
            De 0 a 10, o quanto você recomendaria o Centro a quem precisa?
          </h2>
          <p className="mt-1 text-[12px] text-muted-foreground">
            Referente a: {survey.milestoneLabel}
          </p>

          {mutation.isError && (
            <div
              role="alert"
              className="mt-4 rounded-lg border border-[color-mix(in_srgb,var(--color-destructive)_30%,transparent)] bg-[color-mix(in_srgb,var(--color-destructive)_10%,transparent)] p-3 text-[13px] text-destructive"
            >
              {describeMutationError(mutation.error, 'Não foi possível enviar sua resposta.')}
            </div>
          )}

          <div className="mt-6 grid grid-cols-6 gap-2">
            {SCORES.map((score) => (
              <button
                key={score}
                type="button"
                aria-pressed={currentScore === score}
                className={cn(
                  'h-11 cursor-pointer rounded-lg border border-border bg-card text-[14px] font-semibold text-foreground transition-[background-color,border-color,color] duration-150 ease-[ease]',
                  currentScore !== score &&
                    'hover:border-[color-mix(in_srgb,var(--color-primary)_40%,transparent)]',
                  currentScore === score && ['text-white', getScoreCategoryClasses(score)]
                )}
                onClick={() => setValue('score', score, { shouldValidate: true })}
              >
                {score}
              </button>
            ))}
          </div>

          {errors.score && (
            <p role="alert" className="mt-2 text-[11px] text-destructive">
              {errors.score.message}
            </p>
          )}

          <div className="mt-[6px] flex justify-between text-[10px] font-normal uppercase tracking-wider text-muted-foreground">
            <span>Não recomendaria</span>
            <span>Recomendaria muito</span>
          </div>

          <div className="mt-6 flex flex-col gap-1">
            <label className="text-[12px] font-medium text-muted-foreground" htmlFor="nps-comment">
              Quer contar o porquê? (opcional)
            </label>
            <textarea
              id="nps-comment"
              className="min-h-24 w-full resize-none rounded-xl border border-border bg-background px-3.5 py-3 text-[14px] text-foreground outline-none transition-[border-color] duration-150 ease-[ease] placeholder:text-muted-foreground focus:border-[var(--color-supera-empatia)]"
              placeholder="O que poderia ser melhor? O que você mais gostou?"
              {...register('comment')}
            />
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

      <div className="sticky bottom-0 border-t border-border bg-[color-mix(in_srgb,var(--color-card)_95%,transparent)] px-6 py-4 backdrop-blur-[8px]">
        <Button
          type="submit"
          form={FORM_ID}
          fullWidth
          disabled={currentScore === undefined || mutation.isPending}
          loading={mutation.isPending}
        >
          Enviar resposta
        </Button>
      </div>
    </>
  );
}

export default function NpsSurvey() {
  const navigate = useNavigate();
  const { data: survey, isLoading, isError, refetch } = usePendingNpsSurvey();

  // Mora aqui, e não no formulário: ao dar certo, a pendência é invalidada e
  // some — se a mutation vivesse no formulário, ele desmontaria e levaria o
  // "Obrigado" junto.
  const submitMutation = useSubmitNpsResponse();

  if (submitMutation.isSuccess) {
    return (
      <NpsLayout>
        <div className="flex flex-1 flex-col">
          <EmptyState
            icon={CircleCheck}
            iconTone="var(--color-supera-empatia)"
            title="Obrigado! 💙"
            description="Sua resposta ajuda a equipe a cuidar cada vez melhor de você e dos próximos pacientes."
            actionLabel="Voltar ao início"
            onAction={() => navigate('/home')}
          />
        </div>
      </NpsLayout>
    );
  }

  if (isLoading) {
    return <Loading />;
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
      <NpsSurveyForm survey={survey} mutation={submitMutation} />
    </NpsLayout>
  );
}
