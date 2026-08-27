import { useNavigate, useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { MessageCircle } from 'lucide-react';
import Header from '../../components/ui/header';
import Loading from '../../components/ui/loading';
import EmptyState from '../../components/ui/empty-state';
import Badge from '../../components/ui/badge';
import Button from '../../components/ui/button';
import BottomTab from '../../components/ui/bottom-tab';
import { getRegistroPorId, getSintomasDisponiveis } from '../../services/mockApi';
import { getMoodInfo } from '../../utils/mood';

// Escala de intensidade específica por sintoma (diferente da escala de humor
// geral do dia, que usa Ótimo/Bem/Leve/Moderado/Intenso/Muito intenso) —
// confirmado no protótipo real (tela de detalhe do registro): cada sintoma
// individual usa os rótulos abaixo, não os rótulos de MOOD_LEVELS.
const INTENSIDADE_SINTOMA_LABELS = ['Não senti', 'Mal noto', 'Leve', 'Moderado', 'Forte', 'Insuportável'];

export default function EntryDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const {
    data: registro,
    isLoading: carregandoRegistro,
    isError: erro,
  } = useQuery({
    queryKey: ['diary-entry', id],
    queryFn: () => getRegistroPorId(id as string),
    enabled: Boolean(id),
  });

  const { data: sintomasDisponiveis = [], isLoading: carregandoSintomas } = useQuery({
    queryKey: ['available-symptoms'],
    queryFn: getSintomasDisponiveis,
  });

  const carregando = carregandoRegistro || carregandoSintomas;

  if (carregando) {
    return <Loading />;
  }

  if (erro || !registro) {
    return (
      <div className="flex min-h-[100dvh] flex-col bg-background">
        <Header
          variant="step"
          sticky
          bordered
          blurred
          onBack={() => navigate('/diario')}
          meta="Registro do diário"
          // Ver comentário equivalente em DiaryTimeline.tsx — Header.jsx exige
          // `title`/`subtitle`/`actions` (any obrigatório) para quem consome
          // de um .tsx, mesmo não usados pela variante "step".
          title={undefined}
          subtitle={undefined}
          actions={undefined}
        />
        <EmptyState
          title="Registro não encontrado"
          description="Esse registro pode ter sido removido."
          actionLabel="Voltar ao diário"
          onAction={() => navigate('/diario')}
          iconTone={undefined}
        />
        <BottomTab />
      </div>
    );
  }

  const humor = getMoodInfo(registro.grau);
  const HumorIcon = humor.icon;
  // Protótipo real mostra a data completa (dia + mês por extenso + hora) e,
  // em seguida, o mesmo rótulo curto/relativo usado nos cards da linha do
  // tempo (ex.: "14 de maio · 21:00 · Ontem · 21:00").
  const dataCompletaLabel = `${registro.data.toLocaleDateString('pt-BR', {
    day: 'numeric',
    month: 'long',
  })} · ${registro.hora}`;

  return (
    <div className="flex min-h-[100dvh] flex-col bg-background">
      <Header
        variant="step"
        sticky
        bordered
        blurred
        onBack={() => navigate('/diario')}
        meta="Registro do diário"
        title={undefined}
        subtitle={undefined}
        actions={undefined}
      />

      <main className="flex-1">
        <section className="flex flex-col items-center p-6">
          <div
            // `--mood-color` carrega a cor dinâmica do humor (uma de 6 vindas de
            // MOOD_LEVELS em utils/mood.js) para dentro de fórmulas color-mix
            // expressas como classes — mesmo mecanismo de Badge/Tag (ui/).
            style={{ '--mood-color': humor.colorVar } as React.CSSProperties}
            className="flex h-20 w-20 items-center justify-center rounded-full border-2 border-[color-mix(in_srgb,var(--mood-color)_40%,transparent)] bg-[color-mix(in_srgb,var(--mood-color)_15%,transparent)]"
          >
            <HumorIcon size={40} strokeWidth={1.5} color={humor.colorVar} aria-hidden="true" />
          </div>
          <p className="mt-3 text-center text-[18px] font-semibold tracking-[-0.3px] text-foreground">
            {humor.label}
          </p>
          <p className="mt-1 text-center text-[12px] text-muted-foreground">
            {dataCompletaLabel} · {registro.dataLabel}
          </p>
        </section>

        {registro.texto && (
          <section className="mt-6 px-6">
            <h3 className="text-[11px] font-medium tracking-[0.05em] text-muted-foreground uppercase">
              TEXTO LIVRE
            </h3>
            <div className="mt-2 rounded-xl border border-border bg-card p-4 text-[14px] leading-[1.6] whitespace-pre-wrap text-foreground">
              {registro.texto}
            </div>
          </section>
        )}

        {registro.sintomas.length > 0 && (
          <section className="mt-6 px-6">
            <h3 className="text-[11px] font-medium tracking-[0.05em] text-muted-foreground uppercase">
              SINTOMAS REGISTRADOS
            </h3>
            <ul className="mt-2 flex flex-col gap-2">
              {registro.sintomas.map((sintoma) => {
                const descricao = sintomasDisponiveis.find((item) => item.nome === sintoma.nome)?.descricao;
                const intensidade = getMoodInfo(sintoma.intensidade);
                const IntensidadeIcon = intensidade.icon;

                return (
                  <li
                    key={sintoma.nome}
                    className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card p-3"
                  >
                    <div className="min-w-0">
                      <p className="text-[14px] font-medium text-foreground">{sintoma.nome}</p>
                      {descricao && (
                        <p className="mt-0.5 text-[11px] text-muted-foreground">{descricao}</p>
                      )}
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
                      <div
                        style={{ '--mood-color': intensidade.colorVar } as React.CSSProperties}
                        className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-[color-mix(in_srgb,var(--mood-color)_40%,transparent)] bg-[color-mix(in_srgb,var(--mood-color)_15%,transparent)]"
                      >
                        <IntensidadeIcon
                          size={20}
                          strokeWidth={1.5}
                          color={intensidade.colorVar}
                          aria-hidden="true"
                        />
                      </div>
                      <Badge tone="secondary" size="sm">
                        {INTENSIDADE_SINTOMA_LABELS[sintoma.intensidade]}
                      </Badge>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        <div className="mt-8 px-6 pb-6">
          <Button fullWidth variant="outline" iconLeft={MessageCircle} onClick={() => navigate('/chat')}>
            Falar com a equipe sobre esse registro
          </Button>
        </div>
      </main>

      <BottomTab />
    </div>
  );
}
