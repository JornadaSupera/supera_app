import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { z } from 'zod';
import { ChevronLeft, CircleCheck } from 'lucide-react';
import Button from '../../components/ui/button';
import EmptyState from '../../components/ui/empty-state';
import BottomTab from '../../components/ui/bottom-tab';
import { enviarRespostaNps } from '../../services/mockApi';
import { cn } from '../../lib/utils';
import type { NpsScore } from '../../types';

const NOTAS = Array.from({ length: 11 }, (_, indice) => indice);
const FORM_ID = 'nps-survey-form';
const REQUIRED_NOTA_MESSAGE = 'Selecione uma nota de 0 a 10.';

const npsSchema = z.object({
  nota: z
    .number(REQUIRED_NOTA_MESSAGE)
    .int(REQUIRED_NOTA_MESSAGE)
    .min(0, REQUIRED_NOTA_MESSAGE)
    .max(10, REQUIRED_NOTA_MESSAGE),
  comentario: z.string().optional(),
});

type NpsFormValues = z.infer<typeof npsSchema>;

function getNotaCategoriaClasses(nota: number): string {
  if (nota <= 6) return 'bg-destructive border-destructive';
  if (nota <= 8) return 'bg-[var(--color-mood-3)] border-[var(--color-mood-3)]';
  return 'bg-[var(--color-supera-empatia)] border-[var(--color-supera-empatia)]';
}

interface NpsHeaderProps {
  onBack: () => void;
}

function NpsHeader({ onBack }: NpsHeaderProps) {
  return (
    <header className="sticky top-0 z-20 flex items-center gap-2 border-b border-border bg-[color-mix(in_srgb,var(--color-card)_95%,transparent)] pt-5 px-4 pb-3 backdrop-blur-[8px]">
      <button
        type="button"
        className="-ml-3 inline-flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full border-none bg-transparent text-foreground transition-[background-color] duration-150 ease-[ease] hover:bg-muted"
        onClick={onBack}
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
  );
}

export default function NpsSurvey() {
  const navigate = useNavigate();

  const npsMutation = useMutation({
    mutationFn: enviarRespostaNps,
  });

  const {
    setValue,
    register,
    watch,
    handleSubmit,
    formState: { errors },
  } = useForm<NpsFormValues>({
    resolver: zodResolver(npsSchema),
    // `nota` fica `undefined` (nenhuma nota escolhida ainda) até o paciente
    // tocar num botão — `defaultValues` aceita isso mesmo com `nota: number`
    // no schema porque o tipo de `defaultValues` é `DeepPartial`.
    defaultValues: { nota: undefined, comentario: '' },
  });

  const notaAtual = watch('nota');

  const onSubmit = (data: NpsFormValues) => {
    npsMutation.mutate({
      // `data.nota` já passou pelas checagens `.int().min(0).max(10)` do Zod
      // antes de `onSubmit` rodar — mas o Zod valida faixa numérica, não o
      // union literal 0-10 de `NpsScore`, então o TypeScript não estreita
      // sozinho; o cast só documenta essa garantia em runtime.
      nota: data.nota as NpsScore,
      comentario: data.comentario?.trim(),
    });
  };

  if (npsMutation.isSuccess) {
    return (
      <div className="flex min-h-[100dvh] flex-col bg-background">
        <NpsHeader onBack={() => navigate('/perfil')} />

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

        <BottomTab />
      </div>
    );
  }

  return (
    <div className="flex min-h-[100dvh] flex-col bg-background">
      <NpsHeader onBack={() => navigate('/perfil')} />

      <main className="flex-1 p-6">
        <form id={FORM_ID} onSubmit={handleSubmit(onSubmit)}>
          <h2 className="text-[18px]/[1.4] font-semibold text-foreground">
            De 0 a 10, o quanto você recomendaria o Centro a quem precisa?
          </h2>
          <p className="mt-1 text-[12px] text-muted-foreground">
            Disparada automaticamente em marcos do tratamento.
          </p>

          <div className="mt-6 grid grid-cols-6 gap-2">
            {NOTAS.map((nota) => (
              <button
                key={nota}
                type="button"
                aria-pressed={notaAtual === nota}
                className={cn(
                  'h-10 cursor-pointer rounded-lg border border-border bg-card text-[14px] font-semibold text-foreground transition-[background-color,border-color,color] duration-150 ease-[ease]',
                  notaAtual !== nota &&
                    'hover:border-[color-mix(in_srgb,var(--color-primary)_40%,transparent)]',
                  notaAtual === nota && ['text-white', getNotaCategoriaClasses(nota)]
                )}
                onClick={() => setValue('nota', nota, { shouldValidate: true })}
              >
                {nota}
              </button>
            ))}
          </div>

          {errors.nota && (
            <p role="alert" className="mt-2 text-[11px] text-destructive">
              {errors.nota.message}
            </p>
          )}

          <div className="mt-[6px] flex justify-between text-[10px] font-normal uppercase tracking-wider text-muted-foreground">
            <span>Não recomendaria</span>
            <span>Recomendaria muito</span>
          </div>

          <div className="mt-6 flex flex-col gap-2">
            <label className="text-[12px] font-medium text-muted-foreground" htmlFor="nps-comentario">
              Quer contar o porquê? (opcional)
            </label>
            <textarea
              id="nps-comentario"
              className="min-h-24 w-full resize-none rounded-xl border border-border bg-background px-3.5 py-3 text-[14px] text-foreground outline-none transition-[border-color] duration-150 ease-[ease] placeholder:text-muted-foreground focus:border-[var(--color-supera-empatia)]"
              placeholder="O que poderia ser melhor? O que você mais gostou?"
              {...register('comentario')}
            />
          </div>
        </form>
      </main>

      <div className="sticky bottom-0 border-t border-border bg-[color-mix(in_srgb,var(--color-card)_95%,transparent)] px-6 py-4 backdrop-blur-[8px]">
        <Button
          type="submit"
          form={FORM_ID}
          fullWidth
          disabled={notaAtual === undefined || npsMutation.isPending}
          loading={npsMutation.isPending}
        >
          Enviar resposta
        </Button>
      </div>

      <BottomTab />
    </div>
  );
}
