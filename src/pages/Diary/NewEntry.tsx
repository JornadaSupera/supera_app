import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Check, FileText } from 'lucide-react';
import StickyFooter from '../../components/ui/sticky-footer';
import StepHeader from '../../components/ui/step-header';
import Button from '../../components/ui/button';
import Loading from '../../components/ui/loading';
import ErrorState from '../../components/ui/error-state';
import SymptomScale from '../../components/ui/symptom-scale';
import {
  useDiaryDraftAutosave,
  useOwnDiaryDraft,
  useSaveDiaryDraft,
  useSubmitDiaryEntry,
  useSymptoms,
} from '../../hooks/useDiary';
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
const FREE_TEXT_ID = 'new-entry-free-text';

/** O que a tarja do rodapé diz sobre o rascunho, em cada situação. */
const RASCUNHO_LABEL = {
  ocioso: 'O que você escrever fica guardado como rascunho.',
  salvando: 'Salvando rascunho…',
  salvo: 'Rascunho salvo.',
  erro: 'Não foi possível salvar o rascunho agora. Vamos tentar de novo.',
} as const;

export default function NewEntry() {
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [passo, setPasso] = useState(1);
  /** Linha do rascunho que esta tela está editando. */
  const [draftId, setDraftId] = useState<string | null>(null);
  const [decidiuSobreRascunho, setDecidiuSobreRascunho] = useState(false);

  const {
    data: sintomas = [],
    isLoading: carregandoSintomas,
    isError: erroSintomas,
    refetch: recarregarSintomas,
  } = useSymptoms();

  const { data: rascunho, isLoading: carregandoRascunho } = useOwnDiaryDraft();

  const limparRascunho = useSaveDiaryDraft();
  const submeterMutation = useSubmitDiaryEntry();

  const { watch, setValue, getValues, register, handleSubmit, reset } =
    useForm<NewEntryFormValues>({
      resolver: zodResolver(newEntrySchema),
      defaultValues: { freeText: '', symptoms: [] },
    });

  const texto = watch('freeText');
  const sintomasForm = watch('symptoms');

  const conteudo = useMemo(
    () => ({ freeText: texto, symptoms: sintomasForm }),
    [texto, sintomasForm]
  );

  // Só há rascunho a retomar se ele tiver algo dentro: uma linha vazia não
  // merece uma pergunta.
  const rascunhoPendente =
    rascunho && (rascunho.freeText.trim().length > 0 || rascunho.symptoms.length > 0)
      ? rascunho
      : null;

  const precisaDecidir = Boolean(rascunhoPendente) && !decidiuSobreRascunho;

  const { estado: estadoRascunho, gravar, gravarEmFundo } = useDiaryDraftAutosave({
    conteudo,
    ativo: !carregandoRascunho && !precisaDecidir,
    draftId,
    aoAbrirRascunho: setDraftId,
  });

  const handleVoltar = () => {
    if (passo > 1) {
      setPasso(passo - 1);
    } else {
      navigate(-1);
    }
  };

  const handleEscalaChange = (symptomId: string, grade: SymptomIntensity) => {
    const atual = getValues('symptoms');
    const existe = atual.some((item) => item.symptomId === symptomId);
    const atualizado = existe
      ? atual.map((item) => (item.symptomId === symptomId ? { ...item, grade } : item))
      : [...atual, { symptomId, grade }];

    setValue('symptoms', atualizado, { shouldDirty: true });
  };

  function continuarRascunho() {
    if (!rascunhoPendente) return;

    reset({ freeText: rascunhoPendente.freeText, symptoms: rascunhoPendente.symptoms });
    setDraftId(rascunhoPendente.id);
    setDecidiuSobreRascunho(true);
  }

  async function comecarDeNovo() {
    if (!rascunhoPendente) return;

    try {
      // Reaproveita a mesma linha em vez de abrir outra: `DELETE` em
      // `diary_entries` é revogado até para `service_role`, então um rascunho
      // abandonado ficaria lá para sempre.
      await limparRascunho.mutateAsync({
        draftId: rascunhoPendente.id,
        freeText: '',
        symptoms: [],
      });

      reset({ freeText: '', symptoms: [] });
      setDraftId(rascunhoPendente.id);
      setDecidiuSobreRascunho(true);
    } catch (error) {
      showToast(describeMutationError(error, 'Não foi possível começar um registro novo.'), {
        variant: 'error',
      });
    }
  }

  const onSubmit = async (data: NewEntryFormValues) => {
    try {
      // Garante que o que está na tela virou rascunho antes de finalizar: é a
      // mesma linha que vai virar o registro.
      const id = await gravar();

      if (!id) {
        showToast('Escreva como você se sentiu ou marque ao menos um sintoma.', {
          variant: 'info',
        });
        return;
      }

      const resultado = await submeterMutation.mutateAsync({
        draftId: id,
        // Grau zero não é sintoma registrado.
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

  if (carregandoSintomas || carregandoRascunho) return <Loading />;

  if (erroSintomas) {
    return (
      <div className="flex min-h-[100dvh] flex-col bg-background">
        <StepHeader meta="Novo registro" onBack={handleVoltar} />
        <ErrorState
          title="Não foi possível carregar os sintomas"
          description="Sem a lista de sintomas não dá para montar o registro. Tente novamente."
          onRetry={() => void recarregarSintomas()}
        />
      </div>
    );
  }

  if (precisaDecidir && rascunhoPendente) {
    return (
      <div className="flex min-h-[100dvh] flex-col bg-background">
        <StepHeader meta="Novo registro" onBack={() => navigate(-1)} />

        <main className="flex-1 px-6 pt-8">
          <span className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-[color-mix(in_srgb,var(--color-primary)_12%,transparent)] text-primary">
            <FileText size={22} strokeWidth={2} aria-hidden="true" />
          </span>

          <h1 className="mt-4 text-[22px] font-semibold text-foreground">
            Você deixou um registro pela metade
          </h1>
          <p className="mt-2 text-[14px] leading-[1.6] text-muted-foreground">
            Guardamos o que você já tinha escrito hoje. Ninguém da equipe vê um rascunho — ele só
            chega até eles quando você salvar o registro.
          </p>

          {rascunhoPendente.freeText.trim().length > 0 && (
            <p className="mt-4 rounded-xl border border-border bg-card p-3 text-[13px] leading-[1.6] text-muted-foreground">
              {rascunhoPendente.freeText.length > 180
                ? `${rascunhoPendente.freeText.slice(0, 180)}…`
                : rascunhoPendente.freeText}
            </p>
          )}

          {rascunhoPendente.symptoms.length > 0 && (
            <p className="mt-2 text-[12px] text-muted-foreground">
              {rascunhoPendente.symptoms.length}{' '}
              {rascunhoPendente.symptoms.length === 1
                ? 'sintoma já marcado'
                : 'sintomas já marcados'}
            </p>
          )}
        </main>

        <StickyFooter>
          <Button fullWidth onClick={continuarRascunho}>
            Continuar de onde parei
          </Button>
          <Button
            fullWidth
            variant="outline"
            className="mt-2"
            loading={limparRascunho.isPending}
            onClick={() => void comecarDeNovo()}
          >
            Começar de novo
          </Button>
        </StickyFooter>
      </div>
    );
  }

  const quantidadeSintomas = sintomasForm.filter((item) => item.grade > 0).length;
  const temTexto = texto.trim().length > 0;
  const podeSalvar = temTexto || quantidadeSintomas > 0;

  return (
    <div className="flex min-h-[100dvh] flex-col bg-background">
      <StepHeader meta={`Passo ${passo} de ${TOTAL_PASSOS}`} onBack={handleVoltar} />

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
            {/* O rótulo mora dentro do título: o campo precisa de um `label`
                ligado a ele, e o título é exatamente o que o campo pergunta. */}
            <h2 className="mt-1 text-[22px] font-semibold text-foreground">
              <label htmlFor={FREE_TEXT_ID}>Como me sinto hoje?</label>
            </h2>
            <p className="mt-1.5 text-[13px] text-muted-foreground">
              Escreva à vontade. Pode ser uma frase, um parágrafo ou só uma palavra. Pular também é
              uma opção.
            </p>

            <textarea
              id={FREE_TEXT_ID}
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
                <SymptomScale
                  key={item.id}
                  id={item.id}
                  nome={item.label}
                  descricao={item.description}
                  value={sintomasForm.find((entry) => entry.symptomId === item.id)?.grade ?? 0}
                  onChange={(novoValor: number) =>
                    // Os seis botões cobrem exatamente o domínio 0–5 de
                    // `SymptomIntensity`.
                    handleEscalaChange(item.id, novoValor as SymptomIntensity)
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

      <StickyFooter>
        {/* O paciente precisa saber que o texto não se perde — e que rascunho
            não é registro: a equipe só vê depois de salvar. */}
        <p
          aria-live="polite"
          className="mb-2 text-center text-[11px] text-muted-foreground"
        >
          {RASCUNHO_LABEL[estadoRascunho]}
        </p>

        {passo === 1 ? (
          <Button
            fullWidth
            type="button"
            onClick={() => {
              // Troca de etapa também grava: quem escreveu e avançou não
              // espera perder o texto se o app fechar no meio dos sintomas.
              gravarEmFundo();
              setPasso(2);
            }}
          >
            Continuar
          </Button>
        ) : (
          <Button
            fullWidth
            iconRight={Check}
            loading={submeterMutation.isPending}
            disabled={!podeSalvar}
            type="submit"
            form={FORM_ID}
          >
            Salvar registro
          </Button>
        )}
      </StickyFooter>
    </div>
  );
}
