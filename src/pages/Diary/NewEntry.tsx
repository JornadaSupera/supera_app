import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Check, FileText } from 'lucide-react';
import StickyFooter from '../../components/ui/sticky-footer';
import StepHeader from '../../components/ui/step-header';
import Button from '../../components/ui/button';
import IconTile from '../../components/ui/icon-tile';
import Textarea from '../../components/ui/textarea';
import Loading from '../../components/ui/loading';
import ErrorState from '../../components/ui/error-state';
import SymptomScale from '../../components/ui/symptom-scale';
import GardenPainting from '../../components/ui/garden-painting';
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
import { cn } from '../../lib/utils';
import type { SymptomIntensity } from '../../types';

// Duas camadas: texto livre e sintomas. Antes havia uma terceira, com uma
// autoavaliação de humor de 0–5 — ela saiu porque `diary_entries` não tem
// onde guardá-la, e o escopo contratado do Diário pede texto livre, os 12
// sintomas e a intensidade 0–5. O gráfico passou a plotar um sintoma
// escolhido, que é a "seleção de métrica" do plano MÉDIO.
const TOTAL_PASSOS = 2;

const FORM_ID = 'new-entry-form';
const FREE_TEXT_ID = 'new-entry-free-text';

/**
 * O rodapé fixo no recuo de 16 px do resto da tela, a margem do guia: a
 * densidade `compact` traz o `px-safe-4`, e estes `pt`/`pb` devolvem o respiro
 * do rodapé de formulário (o `cn()` troca os da variante por eles), como na
 * pesquisa de satisfação. O `gap` separa o que vai empilhado: a margem do `p`
 * o reset global do `index.css` zera.
 */
const FOOTER_CLASS = 'flex flex-col gap-2 pt-4 pb-[calc(1rem_+_var(--safe-bottom))]';

/** O que a tarja do rodapé diz sobre o rascunho, em cada situação. */
const RASCUNHO_LABEL = {
  idle: 'O que você escrever fica guardado como rascunho.',
  saving: 'Salvando rascunho…',
  saved: 'Rascunho salvo.',
  error: 'Não foi possível salvar o rascunho agora. Vamos tentar de novo.',
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

        {/* O espaço entre os blocos vem do `gap`: o reset global do
            `index.css` zera a margem de `h1` e `p`. */}
        <main className="flex flex-1 flex-col gap-4 px-4 pt-6">
          <IconTile icon={FileText} />

          <h1 className="text-title font-bold text-foreground">
            Você deixou um registro pela metade
          </h1>
          <p className="text-body text-muted-foreground">
            Guardamos o que você já tinha escrito hoje. Ninguém da equipe vê um rascunho — ele só
            chega até eles quando você salvar o registro.
          </p>

          {rascunhoPendente.freeText.trim().length > 0 && (
            <p className="rounded-lg border border-border bg-card p-4 text-body-sm text-muted-foreground shadow-sm">
              {rascunhoPendente.freeText.length > 180
                ? `${rascunhoPendente.freeText.slice(0, 180)}…`
                : rascunhoPendente.freeText}
            </p>
          )}

          {rascunhoPendente.symptoms.length > 0 && (
            <p className="text-caption font-medium text-muted-foreground">
              {rascunhoPendente.symptoms.length}{' '}
              {rascunhoPendente.symptoms.length === 1
                ? 'sintoma já marcado'
                : 'sintomas já marcados'}
            </p>
          )}
        </main>

        <StickyFooter density="compact" className={FOOTER_CLASS}>
          <Button fullWidth onClick={continuarRascunho}>
            Continuar de onde parei
          </Button>
          <Button
            fullWidth
            variant="outline"
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
    // A tela tem a altura exata do aparelho: cabeçalho, barra de progresso,
    // pintura e rodapé ficam fixos, e só o conteúdo do passo rola, entre a
    // barra e a pintura (pedido de 05/10: a rolagem passava por cima da
    // pintura). Esta tela (e os seus estados de erro e de rascunho) fica no
    // recuo de 16 px, a margem das telas no guia: o da `StepHeader`, o do
    // corpo e o do rodapé (`FOOTER_CLASS`).
    <div className="flex h-[100dvh] flex-col bg-background [--garden-h:min(22dvh,220px)]">
      <StepHeader meta={`Passo ${passo} de ${TOTAL_PASSOS}`} onBack={handleVoltar} />

      {/* A trilha no `line` das divisórias: o `muted` quase não se via sobre o
          fundo da tela no tema claro, e o meio preenchido parecia a barra
          inteira. Fica 12 px abaixo do fio da `StepHeader` (`mt-3`): colada
          nele, na mesma cor, o fio de 1 px virava uma faixa cinza de 5 px. */}
      <div className="mx-4 mt-3 h-1 shrink-0 rounded-full bg-border">
        <div
          // Largura calculada em runtime a partir do passo atual do wizard —
          // não existe classe Tailwind estática para isso.
          className="h-full rounded-full bg-primary transition-[width] duration-200 ease-[ease]"
          style={{ width: `${(passo / TOTAL_PASSOS) * 100}%` }}
        />
      </div>

      {/* A área que rola e a pintura do pé. No passo 1, o gramado florido de
          ponta a ponta fica atrás do conteúdo, que rola por cima dele (pedido
          de 05/10), e o respiro de baixo (a altura da pintura) deixa o fim do
          conteúdo parar acima dela. `isolate`: a pintura (`-z-10`) fica acima
          do fundo e abaixo do conteúdo. No passo 2, as flores do canto vão no
          fim da rolagem, depois das escalas (pedido de 07/10). A troca de
          pintura marca a passagem de um passo para o outro. A altura é
          proporcional à da tela (22%, até 220 px); numa tela baixa (o teclado
          aberto encolhe a tela no Android) ela sai. */}
      <div className="relative isolate flex min-h-0 flex-1 flex-col">
        {passo === 1 && (
          <GardenPainting
            kind="band"
            className="absolute inset-x-0 bottom-0 -z-10 h-[var(--garden-h)] animate-overlay-fade-in motion-reduce:animate-none [@media(max-height:560px)]:hidden"
          />
        )}

        {/* `min-h-0`: sem ele o conteúdo esticaria a coluna e a tela inteira
            voltaria a rolar. Coluna flexível para o passo 1 preencher a área
            (ver o campo). `relative`: os rádios escondidos das escalas
            (`sr-only`, posição absoluta) ficam presos a esta área; sem ela,
            escapavam para a página e a tela inteira rolava no passo 2. */}
        <form
          id={FORM_ID}
          onSubmit={handleSubmit(onSubmit)}
          className={cn(
            'relative flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-y-contain px-4',
            passo === 1 ? 'pb-[calc(var(--garden-h)_+_1rem)] [@media(max-height:560px)]:pb-6' : 'pb-0'
          )}
        >
          {/* O espaço entre título e apoio vem do `gap` da seção (o "Camada x de
              2" saiu: repetia o "Passo x de 2" do cabeçalho):
              o reset global do `index.css` zera a margem de `p` e `h2`. Os
              `mt-5` somam-se a esse `gap` de 4 px: 24 px entre o texto e o
              campo, as escalas e o resumo. Acima, 24 px até a barra de
              progresso, como o corpo das outras telas sob o cabeçalho. */}
          {passo === 1 && (
            <section className="flex flex-1 flex-col gap-1 pt-6">
              {/* O rótulo mora dentro do título: o campo precisa de um `label`
                  ligado a ele, e o título é exatamente o que o campo pergunta. */}
              <h2 className="text-title font-bold text-foreground">
                <label htmlFor={FREE_TEXT_ID}>Como me sinto hoje?</label>
              </h2>
              <p className="text-body-sm text-muted-foreground">
                Escreva à vontade. Pode ser uma frase, um parágrafo ou só uma palavra. Pular também é
                uma opção.
              </p>

              {/* O campo fica com o espaço livre da área: cresce na tela alta e
                  encolhe na baixa até 112 px (umas quatro linhas), e só abaixo
                  disso a área rola. */}
              <Textarea
                id={FREE_TEXT_ID}
                className="mt-5 min-h-[112px] flex-1"
                maxLength={MAX_FREE_TEXT_LENGTH}
                placeholder="Hoje eu acordei me sentindo..."
                {...register('freeText')}
              />

              <div className="mt-2 flex justify-between gap-3 text-caption font-medium text-muted-foreground">
                <span>Tudo o que você escrever aqui é confidencial.</span>
                <span className="shrink-0 tabular-nums">
                  {texto.length}/{MAX_FREE_TEXT_LENGTH}
                </span>
              </div>
            </section>
          )}

          {passo === 2 && (
            // `pb-6`: 24 px entre o fim das escalas e as flores do canto.
            <section className="flex flex-col gap-1 pt-6 pb-6">
              <h2 className="text-title font-bold text-foreground">
                Sentiu algum desses sintomas hoje?
              </h2>
              <p className="text-body-sm text-muted-foreground">
                Ajuste apenas os sintomas que você sentiu. Os que ficarem em zero não serão
                registrados.
              </p>

              {/* 16 px entre as escalas, como na pilha do "EscalaSintomas" do guia. */}
              <div className="mt-5 flex flex-col gap-4">
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

              {/* Bloco discreto (`surface-alt` do guia), sem borda. A margem fica
                  no `div`: num `p` o reset global a zeraria. Sem nada a salvar,
                  quem explica é o rodapé, colado ao botão desligado. */}
              {podeSalvar && (
                <div className="mt-5 flex flex-col gap-1 rounded-lg bg-muted p-4 text-body-sm text-muted-foreground">
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

          {/* As flores do canto no fim da rolagem do passo 2 (07/10). `mt-auto`:
              com pouco conteúdo, elas descem até o rodapé; `-mx-4` leva a
              pintura até a borda, por cima do recuo da área. */}
          {passo === 2 && (
            <GardenPainting
              kind="corner"
              className="-mx-4 mt-auto h-[var(--garden-h)] animate-overlay-fade-in motion-reduce:animate-none [@media(max-height:560px)]:hidden"
            />
          )}
        </form>
      </div>

      <StickyFooter density="compact" className={FOOTER_CLASS}>
        {/* O paciente precisa saber que o texto não se perde — e que rascunho
            não é registro: a equipe só vê depois de salvar. No passo 2 sem
            nada marcado nem escrito, a linha diz por que "Salvar registro" está
            desligado: o aviso no fim da lista de sintomas ficava fora de vista.
            Falha do rascunho continua tendo a vez. */}
        <p aria-live="polite" className="text-center text-caption font-medium text-muted-foreground">
          {passo === 2 && !podeSalvar && estadoRascunho !== 'error'
            ? 'Marque ao menos um sintoma ou volte e escreva como se sentiu para salvar.'
            : RASCUNHO_LABEL[estadoRascunho]}
        </p>

        {/* Chaves diferentes de propósito. Sem elas o React reaproveita o
            mesmo <button> nas duas etapas: no toque em "Continuar" o passo
            muda antes de o navegador terminar o clique, e ele encontra no
            lugar um botão de envio — habilitado, se havia texto. O formulário
            era enviado e o registro finalizado sem a etapa dos sintomas. Com
            chaves, "Salvar registro" é outro elemento, e o clique termina no
            botão que foi tocado. */}
        {passo === 1 ? (
          <Button
            key="continue"
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
            key="save"
            fullWidth
            iconLeft={Check}
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
