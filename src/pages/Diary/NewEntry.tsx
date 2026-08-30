import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ChevronRight, Check } from 'lucide-react';
import Header from '../../components/ui/header';
import Button from '../../components/ui/button';
import Loading from '../../components/ui/loading';
import ErrorState from '../../components/ui/error-state';
import SymptomSlider from '../../components/ui/symptom-slider';
import { useSaveDiaryEntry, useSymptoms } from '../../hooks/useDiary';
import { describeMutationError } from '../../hooks/useAuth';
import {
  MAX_FREE_TEXT_LENGTH,
  newEntrySchema,
  type NewEntryFormValues,
} from '../../schemas/diary';
import { useToast } from '../../contexts/ToastContext';
import type { SymptomIntensity } from '../../types';

// Duas camadas: texto livre e sintomas. Antes havia uma terceira, com uma
// autoavaliação de humor de 0–5 — ela saiu porque `diary_entries` não tem
// onde guardá-la, e o escopo contratado do Diário pede texto livre, os 12
// sintomas e a intensidade 0–5. O gráfico passou a plotar um sintoma
// escolhido, que é a "seleção de métrica" do plano MÉDIO.
const TOTAL_PASSOS = 2;

const FORM_ID = 'new-entry-form';

export default function NewEntry() {
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [passo, setPasso] = useState(1);

  const {
    data: sintomas = [],
    isLoading: carregando,
    isError: erroSintomas,
    refetch: recarregarSintomas,
  } = useSymptoms();

  const salvarMutation = useSaveDiaryEntry();

  const { watch, setValue, getValues, register, handleSubmit } = useForm<NewEntryFormValues>({
    resolver: zodResolver(newEntrySchema),
    defaultValues: { freeText: '', symptoms: [] },
  });

  const handleVoltar = () => {
    if (passo > 1) {
      setPasso(passo - 1);
    } else {
      navigate(-1);
    }
  };

  const handleSliderChange = (symptomId: string, grade: SymptomIntensity) => {
    const atual = getValues('symptoms');
    const existe = atual.some((item) => item.symptomId === symptomId);
    const atualizado = existe
      ? atual.map((item) => (item.symptomId === symptomId ? { ...item, grade } : item))
      : [...atual, { symptomId, grade }];

    setValue('symptoms', atualizado, { shouldDirty: true });
  };

  const onSubmit = async (data: NewEntryFormValues) => {
    try {
      const resultado = await salvarMutation.mutateAsync({
        freeText: data.freeText,
        // Grau zero não é sintoma registrado — o serviço também filtra, mas
        // não faz sentido mandar 12 linhas para o banco descartar 11.
        symptoms: data.symptoms.filter((item) => item.grade > 0),
      });

      showToast(
        resultado.hasAlert
          ? 'Registro salvo. Vale comentar esses sintomas com sua equipe.'
          : 'Registro salvo com sucesso!',
        { variant: resultado.hasAlert ? 'info' : 'success' }
      );

      navigate(`/diario/${resultado.id}`, { replace: true });
    } catch (error) {
      showToast(describeMutationError(error, 'Não foi possível salvar o registro.'), {
        variant: 'error',
      });
    }
  };

  if (carregando) return <Loading />;

  if (erroSintomas) {
    return (
      <div className="flex min-h-[100dvh] flex-col bg-background">
        <Header variant="step" sticky bordered blurred meta="Novo registro" onBack={handleVoltar} />
        <ErrorState
          title="Não foi possível carregar os sintomas"
          description="Sem a lista de sintomas não dá para montar o registro. Tente novamente."
          onRetry={() => void recarregarSintomas()}
        />
      </div>
    );
  }

  const texto = watch('freeText');
  const sintomasForm = watch('symptoms');

  const quantidadeSintomas = sintomasForm.filter((item) => item.grade > 0).length;
  const temTexto = texto.trim().length > 0;
  const podeSalvar = temTexto || quantidadeSintomas > 0;

  return (
    <div className="flex min-h-[100dvh] flex-col bg-background">
      <Header
        variant="step"
        sticky
        bordered
        blurred
        meta={`Passo ${passo} de ${TOTAL_PASSOS}`}
        onBack={handleVoltar}
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
              CAMADA 1 DE 2 · TEXTO LIVRE
            </p>
            <h2 className="mt-1 text-[22px] font-semibold text-foreground">Como me senti hoje?</h2>
            <p className="mt-1.5 text-[13px] text-muted-foreground">
              Escreva à vontade. Pode ser uma frase, um parágrafo ou só uma palavra. Pular também é
              uma opção.
            </p>

            <textarea
              className="mt-5 min-h-[176px] w-full resize-none rounded-xl border-2 border-dashed border-border bg-[color-mix(in_srgb,var(--color-muted)_30%,transparent)] px-3 py-4 text-[15px] leading-[1.6] text-foreground outline-none transition-[border-color,background-color] duration-200 ease-[ease] placeholder:text-muted-foreground focus:border-[var(--color-supera-empatia)] focus:bg-card"
              maxLength={MAX_FREE_TEXT_LENGTH}
              placeholder="Hoje eu acordei me sentindo..."
              {...register('freeText')}
            />

            <div className="mt-2 flex justify-between text-[11px] text-muted-foreground">
              <span>Tudo o que você escrever aqui é confidencial.</span>
              <span>
                {texto.length}/{MAX_FREE_TEXT_LENGTH}
              </span>
            </div>
          </section>
        )}

        {passo === 2 && (
          <section>
            <p className="mt-5 text-[11px] font-medium tracking-[0.05em] text-muted-foreground uppercase">
              CAMADA 2 DE 2 · SINTOMAS
            </p>
            <h2 className="mt-1 text-[22px] font-semibold text-foreground">
              Sentiu algum desses sintomas hoje?
            </h2>
            <p className="mt-1.5 text-[13px] text-muted-foreground">
              Ajuste apenas os sintomas que você sentiu. Os que ficarem em zero não serão
              registrados.
            </p>

            <div className="mt-5 flex flex-col gap-3">
              {sintomas.map((item) => (
                <SymptomSlider
                  key={item.id}
                  nome={item.label}
                  descricao={item.description}
                  value={sintomasForm.find((entry) => entry.symptomId === item.id)?.grade ?? 0}
                  onChange={(novoValor: number) =>
                    // O range nativo (min=0 max=5 step=1) já garante o valor
                    // dentro do domínio 0–5 de `SymptomIntensity`.
                    handleSliderChange(item.id, novoValor as SymptomIntensity)
                  }
                />
              ))}
            </div>

            {podeSalvar ? (
              <div className="mt-5 flex flex-col gap-1 rounded-lg border border-border bg-muted p-3 text-[12px] text-muted-foreground">
                {quantidadeSintomas > 0 && (
                  <p>
                    {quantidadeSintomas}{' '}
                    {quantidadeSintomas === 1 ? 'sintoma registrado' : 'sintomas registrados'}
                  </p>
                )}
                {temTexto && <p>Com anotação em texto</p>}
              </div>
            ) : (
              <p className="mt-5 rounded-lg border border-border bg-muted p-3 text-[12px] text-muted-foreground">
                Escreva como você se sentiu ou marque ao menos um sintoma para salvar.
              </p>
            )}
          </section>
        )}
      </form>

      <footer className="sticky bottom-0 border-t border-border bg-[color-mix(in_srgb,var(--color-card)_95%,transparent)] px-6 py-4 backdrop-blur-[8px]">
        {passo === 1 ? (
          <Button fullWidth iconRight={ChevronRight} type="button" onClick={() => setPasso(2)}>
            Continuar
          </Button>
        ) : (
          <Button
            fullWidth
            iconRight={Check}
            loading={salvarMutation.isPending}
            disabled={!podeSalvar}
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
