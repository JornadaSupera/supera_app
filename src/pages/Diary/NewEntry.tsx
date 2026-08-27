import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { ChevronRight, Check } from 'lucide-react';
import Header from '../../components/ui/header';
import Button from '../../components/ui/button';
import Loading from '../../components/ui/loading';
import SymptomSlider from '../../components/ui/symptom-slider';
import { MOOD_LEVELS } from '../../utils/mood';
import { getSintomasDisponiveis, salvarRegistro } from '../../services/mockApi';
import { useToast } from '../../contexts/ToastContext';
import { cn } from '../../lib/utils';
import type { MoodGrade, SymptomIntensity, SymptomName } from '../../types';

const TOTAL_PASSOS = 3;

// Domínio 0–5 compartilhado por `SymptomIntensity` e `MoodGrade`
// (types/diary.ts) — os dois tipos são literalmente o mesmo union, então o
// valor inferido daqui é atribuível a ambos sem cast.
const zeroACincoSchema = z.union([
  z.literal(0),
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5),
]);

// As 12 chaves de `SymptomName` (types/diary.ts), repetidas aqui porque o
// tipo é apagado em tempo de execução — este enum é a validação de
// runtime; se `SymptomName` mudar em types/diary.ts, atualize esta lista
// junto (os dois precisam continuar com os mesmos 12 valores).
const symptomNameSchema = z.enum([
  'Náusea',
  'Vômito',
  'Dor',
  'Fadiga',
  'Diarreia',
  'Constipação',
  'Febre',
  'Falta de apetite',
  'Alterações na boca',
  'Alterações na pele',
  'Ansiedade',
  'Tristeza',
]);

const symptomEntrySchema = z.object({
  nome: symptomNameSchema,
  intensidade: zeroACincoSchema,
});

const newEntrySchema = z
  .object({
    texto: z.string().max(600, 'Máximo de 600 caracteres.'),
    sintomas: z.array(symptomEntrySchema),
    grau: zeroACincoSchema.optional(),
  })
  .refine((data) => data.grau !== undefined, {
    message: 'Escolha como você está no geral para salvar.',
    path: ['grau'],
  });

type NewEntryFormValues = z.infer<typeof newEntrySchema>;

export default function NewEntry() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const [passo, setPasso] = useState(1);

  const { data: sintomasDisponiveis = [], isLoading: carregando } = useQuery({
    queryKey: ['available-symptoms'],
    queryFn: getSintomasDisponiveis,
  });

  const { watch, setValue, getValues, register, handleSubmit } = useForm<NewEntryFormValues>({
    resolver: zodResolver(newEntrySchema),
    defaultValues: { texto: '', sintomas: [], grau: undefined },
  });

  const { mutate: salvar, isPending: salvando } = useMutation({
    mutationFn: salvarRegistro,
    onSuccess: (resultado) => {
      queryClient.invalidateQueries({ queryKey: ['diary-entries'] });
      queryClient.invalidateQueries({ queryKey: ['today-entry'] });
      queryClient.invalidateQueries({ queryKey: ['mood-evolution'] });

      showToast(
        resultado.temAlerta
          ? 'Registro salvo. Sua equipe foi notificada sobre este registro.'
          : 'Registro salvo com sucesso!',
        { variant: resultado.temAlerta ? 'info' : 'success' }
      );

      navigate(`/diario/${resultado.id}`, { replace: true });
    },
    onError: (error) => {
      showToast(error instanceof Error ? error.message : 'Não foi possível salvar o registro.', {
        variant: 'error',
      });
    },
  });

  const handleVoltar = () => {
    if (passo > 1) {
      setPasso(passo - 1);
    } else {
      navigate(-1);
    }
  };

  const handleSliderChange = (nome: SymptomName, intensidade: SymptomIntensity) => {
    const atual = getValues('sintomas');
    const existe = atual.some((item) => item.nome === nome);
    const atualizado = existe
      ? atual.map((item) => (item.nome === nome ? { ...item, intensidade } : item))
      : [...atual, { nome, intensidade }];
    setValue('sintomas', atualizado, { shouldDirty: true });
  };

  const onSubmit = (data: NewEntryFormValues) => {
    // Guarda-corpo só para o narrowing do TypeScript — o `.refine()` do
    // schema já impede o `handleSubmit` de chegar aqui com `grau`
    // indefinido (e o botão de salvar fica desabilitado até uma escolha).
    if (data.grau === undefined) return;

    salvar({
      texto: data.texto,
      grau: data.grau,
      sintomas: data.sintomas.filter((item) => item.intensidade > 0),
    });
  };

  if (carregando) return <Loading />;

  const texto = watch('texto');
  const sintomasForm = watch('sintomas');
  const grauGeral = watch('grau');

  const quantidadeSintomas = sintomasForm.filter((item) => item.intensidade > 0).length;
  const temTexto = texto.trim().length > 0;

  const FORM_ID = 'new-entry-form';

  return (
    <div className="flex min-h-[100dvh] flex-col bg-background">
      <Header
        variant="step"
        sticky
        bordered
        blurred
        meta={`Passo ${passo} de ${TOTAL_PASSOS}`}
        onBack={handleVoltar}
        // Ver comentário equivalente em DiaryTimeline.tsx.
        title={undefined}
        subtitle={undefined}
        actions={undefined}
      />

      <div className="mx-6 h-1 bg-muted">
        <div
          // Largura calculada em runtime a partir do passo atual do wizard —
          // não existe classe Tailwind estática para isso.
          className="h-full rounded-full bg-primary transition-[width] duration-200 ease-[ease]"
          style={{ width: `${(passo / TOTAL_PASSOS) * 100}%` }}
        />
      </div>

      <form id={FORM_ID} onSubmit={handleSubmit(onSubmit)} className="flex-1 px-6 pb-6">
        {passo === 1 && (
          <section>
            <p className="mt-5 text-[11px] font-medium tracking-[0.05em] text-muted-foreground uppercase">
              CAMADA 1 DE 3 · TEXTO LIVRE
            </p>
            <h2 className="mt-1 text-[22px] font-semibold text-foreground">Como me senti hoje?</h2>
            <p className="mt-1.5 text-[13px] text-muted-foreground">
              Escreva à vontade. Pode ser uma frase, um parágrafo ou só uma palavra. Pular também é uma
              opção.
            </p>

            <textarea
              className="mt-5 min-h-[176px] w-full resize-none rounded-xl border-2 border-dashed border-border bg-[color-mix(in_srgb,var(--color-muted)_30%,transparent)] px-3 py-4 text-[15px] leading-[1.6] text-foreground outline-none transition-[border-color,background-color] duration-200 ease-[ease] placeholder:text-muted-foreground focus:border-[var(--color-supera-empatia)] focus:bg-card"
              maxLength={600}
              placeholder="Hoje eu acordei me sentindo..."
              {...register('texto')}
            />

            <div className="mt-2 flex justify-between text-[11px] text-muted-foreground">
              <span>Tudo o que você escrever aqui é confidencial.</span>
              <span>{texto.length}/600</span>
            </div>
          </section>
        )}

        {passo === 2 && (
          <section>
            <p className="mt-5 text-[11px] font-medium tracking-[0.05em] text-muted-foreground uppercase">
              CAMADA 2 DE 3 · SINTOMAS
            </p>
            <h2 className="mt-1 text-[22px] font-semibold text-foreground">
              Sentiu algum desses sintomas hoje?
            </h2>
            <p className="mt-1.5 text-[13px] text-muted-foreground">
              Ajuste apenas os sintomas que você sentiu. Os que ficarem em zero não serão registrados.
            </p>

            <div className="mt-5 flex flex-col gap-3">
              {sintomasDisponiveis.map((item) => (
                <SymptomSlider
                  key={item.nome}
                  nome={item.nome}
                  descricao={item.descricao}
                  value={sintomasForm.find((entry) => entry.nome === item.nome)?.intensidade ?? 0}
                  onChange={(novoValor: number) =>
                    // O range nativo (min=0 max=5 step=1) já garante o valor
                    // dentro do domínio 0–5 de `SymptomIntensity`.
                    handleSliderChange(item.nome, novoValor as SymptomIntensity)
                  }
                />
              ))}
            </div>
          </section>
        )}

        {passo === 3 && (
          <section>
            <p className="mt-5 text-[11px] font-medium tracking-[0.05em] text-muted-foreground uppercase">
              CAMADA 3 DE 3 · COMO VOCÊ ESTÁ NO GERAL
            </p>
            <h2 className="mt-1 text-[22px] font-semibold text-foreground">
              De um jeito geral, como você está?
            </h2>
            <p className="mt-1.5 text-[13px] text-muted-foreground">
              Escolha o que mais representa seu dia como um todo.
            </p>

            <div className="mt-5 grid grid-cols-3 gap-2">
              {MOOD_LEVELS.map((item) => {
                // `MOOD_LEVELS` vem de utils/mood.js (JS puro, sem `as const`),
                // então `item.grau` chega como `number` largo — reafirma aqui
                // o union literal de `MoodGrade` (mesmo mecanismo usado em
                // mockApi.ts para os mocks de src/mocks/*.js).
                const grau = item.grau as MoodGrade;
                const selecionado = grauGeral === grau;
                const Icon = item.icon;

                return (
                  <button
                    key={grau}
                    type="button"
                    style={{ '--mood-color': item.colorVar } as React.CSSProperties}
                    className={cn(
                      'flex flex-col items-center gap-1 rounded-xl border-2 border-border bg-transparent p-3 transition-[border-color,background-color] duration-150 ease-[ease]',
                      selecionado &&
                        'border-[var(--mood-color)] bg-[color-mix(in_srgb,var(--mood-color)_12%,transparent)]'
                    )}
                    onClick={() => setValue('grau', grau, { shouldValidate: true })}
                  >
                    <Icon size={24} strokeWidth={1.5} color={item.colorVar} aria-hidden="true" />
                    <span
                      className={cn(
                        'text-center text-[11px] font-medium text-foreground',
                        selecionado && 'text-[var(--mood-color)]'
                      )}
                    >
                      {item.label}
                    </span>
                  </button>
                );
              })}
            </div>

            {(temTexto || quantidadeSintomas > 0) && (
              <div className="mt-5 flex flex-col gap-1 rounded-lg border border-border bg-muted p-3 text-[12px] text-muted-foreground">
                {quantidadeSintomas > 0 && (
                  <p>
                    {quantidadeSintomas}{' '}
                    {quantidadeSintomas === 1 ? 'sintoma registrado' : 'sintomas registrados'}
                  </p>
                )}
                {temTexto && <p>Com anotação em texto</p>}
              </div>
            )}
          </section>
        )}
      </form>

      <footer className="sticky bottom-0 border-t border-border bg-[color-mix(in_srgb,var(--color-card)_95%,transparent)] px-6 py-4 backdrop-blur-[8px]">
        {passo === 1 && (
          <Button fullWidth iconRight={ChevronRight} type="button" onClick={() => setPasso(2)}>
            Continuar
          </Button>
        )}
        {passo === 2 && (
          <Button fullWidth iconRight={ChevronRight} type="button" onClick={() => setPasso(3)}>
            Continuar
          </Button>
        )}
        {passo === 3 && (
          <Button
            fullWidth
            iconRight={Check}
            loading={salvando}
            disabled={grauGeral === undefined}
            type="submit"
            form={FORM_ID}
          >
            Salvar registro
          </Button>
        )}
      </footer>
    </div>
  );
}
