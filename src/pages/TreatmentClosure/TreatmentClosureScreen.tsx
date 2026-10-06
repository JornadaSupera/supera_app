import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Button from '../../components/ui/button';
import { useBellSound } from '../../hooks/useBellSound';
import { pushBackHandler } from '../../lib/androidBackButton';
import { cn } from '../../lib/utils';
import { formatClosureDateLabel } from '../../utils/treatmentClosure';
import type { EnrichedAppointment } from '../../types';
import bellTree from '../../assets/design/bell-tree.webp';
import bellTreeWithBell from '../../assets/design/bell-tree-with-bell.webp';
import bellImage from '../../assets/design/bell.png';
import leaf1 from '../../assets/design/leaf-1.png';
import leaf2 from '../../assets/design/leaf-2.png';
import leaf3 from '../../assets/design/leaf-3.png';
import logoSupera from '../../assets/design/logo-supera.png';

/** As frases da parede do sino, na ordem e com o destaque escolhidos pela clínica. */
const PHRASES = [
  { text: 'Você chegou até aqui!' },
  { text: 'Superou mais uma etapa!' },
  { text: 'O sino espera por você.' },
  { text: 'Toque forte, toque alto!', highlight: true },
  { text: 'Estamos juntos com você!' },
] as const;

/** A primeira frase entra depois de o sino começar a balançar; as outras, uma a uma. */
const FIRST_PHRASE_DELAY_MS = 600;
const PHRASE_STEP_MS = 350;
/** Depois das frases, surgem juntos o cartão, os botões e o logotipo. */
const DETAILS_DELAY_MS = 2500;

/**
 * As folhas soltas: onde começam (na árvore, junto ao tronco, à direita do
 * texto), o tamanho e o compasso de cada uma — desencontrados, para a queda
 * não parecer repetida.
 */
const LEAVES = [
  { src: leaf1, className: 'left-[80%] top-[36%] w-[6%]', delay: '0.8s', duration: '9s' },
  { src: leaf2, className: 'left-[89%] top-[30%] w-[5%]', delay: '3.6s', duration: '10.5s' },
  { src: leaf3, className: 'left-[84%] top-[44%] w-[5.5%]', delay: '6.2s', duration: '8.5s' },
] as const;

interface TreatmentClosureScreenProps {
  appointment: EnrichedAppointment;
  /** "Ver na agenda": fecha a tela e abre o compromisso. */
  onOpenSchedule: () => void;
  onClose: () => void;
}

/**
 * A tela surpresa do encerramento do tratamento (pacote de design de
 * 03/10/2026): a parede do sino da clínica — a árvore, as folhas caindo e o
 * sino dourado —, as frases de incentivo, o compromisso e o caminho para a
 * agenda. Aparece por cima de qualquer tela, de surpresa, uma vez.
 *
 * É obrigatória: só sai pelos dois botões, nem pelo voltar do Android nem
 * pelo Esc. O sino toca ao abrir, baixinho; se o aparelho só liberar o som
 * depois de um toque, ele toca no primeiro toque na tela. Tocar no sino o faz
 * balançar e soar de novo.
 *
 * A árvore, o sino e as folhas se posicionam numa "cena" com a proporção do
 * modelo (360 × 780), ajustada para cobrir a tela e presa no alto à direita,
 * como a imagem de fundo — assim o sino continua pendurado no mesmo galho em
 * qualquer tamanho de tela. Com movimento reduzido, a cena é a imagem parada
 * da árvore com o sino, e tudo aparece de uma vez.
 */
export default function TreatmentClosureScreen({
  appointment,
  onOpenSchedule,
  onClose,
}: TreatmentClosureScreenProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const detailsId = useId();
  const [swing, setSwing] = useState(0);
  const { ring, ringIfPending } = useBellSound();

  useEffect(() => {
    // Trava a rolagem na raiz, e não no `body` — o motivo está no `Modal`.
    const root = document.documentElement;
    const previousOverflow = root.style.overflow;
    root.style.overflow = 'hidden';

    // O leitor de tela começa pela tela nova, e não pelo que ficou atrás dela.
    dialogRef.current?.focus();

    // Obrigatória: o voltar do Android não a fecha (nem deixa o app sair por
    // baixo dela).
    const removeBackHandler = pushBackHandler(() => undefined);

    void ring();

    return () => {
      root.style.overflow = previousOverflow;
      removeBackHandler();
    };
  }, [ring]);

  function handleBellTap() {
    setSwing((current) => current + 1);
    void ring();
  }

  return createPortal(
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={detailsId}
      tabIndex={-1}
      onPointerDown={ringIfPending}
      // Acima das folhas (`Modal`, z-200) e abaixo só da versão nova do app.
      //
      // A cena tem a altura da tela ou, se a tela for mais estreita que o
      // modelo, a que a largura pede (`--bell-stage-h`). Em tela baixa ela
      // sobe (`--bell-stage-top`, cortando o alto da copa) o quanto for preciso
      // para frases, cartão e botões (27rem, mais a barra de navegação do
      // aparelho) caberem abaixo do sino sem rolar.
      className="fixed inset-0 z-[230] overflow-hidden bg-[var(--color-bell-wall)] text-[var(--color-bell-ink)] outline-none [--bell-stage-h:max(100cqh,216.667cqw)] [--bell-stage-top:min(0px,calc(100cqh_-_27rem_-_var(--safe-bottom)_-_var(--bell-stage-h)*0.465))] [container-type:size]"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute top-[var(--bell-stage-top)] right-0 aspect-[360/780] w-[max(100cqw,46.154cqh)]"
      >
        {/* `!`: o reset global de `img` (`display: block`, fora de camada)
            venceria o `hidden` comum, e as duas árvores apareceriam juntas. */}
        <img src={bellTree} alt="" className="absolute inset-0 size-full motion-reduce:hidden!" />
        <img src={bellTreeWithBell} alt="" className="absolute inset-0 hidden! size-full motion-reduce:block!" />

        {/* O compasso (atraso e duração) muda de folha para folha e das frases
            entre si: vai no `style`, como os outros valores por instância. */}
        {LEAVES.map((leaf) => (
          <img
            key={leaf.src}
            src={leaf.src}
            alt=""
            className={cn('absolute h-auto motion-safe:animate-leaf-fall motion-reduce:hidden!', leaf.className)}
            style={{ animationDelay: leaf.delay, animationDuration: leaf.duration }}
          />
        ))}

        {/* O sino, pendurado no galho mais baixo pelo alto (65 de 360 de
            largura, com o topo em 260 × 248 no modelo). Gira em torno do gancho. */}
        <button
          type="button"
          tabIndex={-1}
          onClick={handleBellTap}
          className="pointer-events-auto absolute top-[31.8%] left-[63.2%] w-[18.06%] cursor-pointer border-none bg-transparent p-0 motion-reduce:hidden"
        >
          <img
            key={swing}
            src={bellImage}
            alt=""
            width={260}
            height={460}
            className="h-auto w-full origin-[50%_1.5%] motion-safe:animate-bell-swing"
          />
        </button>
      </div>

      <div className="relative h-full overflow-y-auto overscroll-contain">
        {/* O texto começa abaixo da copa e do sino (46% da cena) e ocupa só a
            esquerda: as folhas caem pelo lado do tronco, nunca atrás dele. */}
        <div className="flex min-h-full flex-col px-safe-6 pt-[calc(var(--bell-stage-h)*0.46_+_var(--bell-stage-top))] pb-[calc(1.5rem_+_var(--safe-bottom))]">
          <div className="flex max-w-[80%] flex-col gap-0.5 font-script text-[21px]/[1.3] font-semibold min-[360px]:text-[23px]/[1.3]">
            {PHRASES.map((phrase, index) => (
              <p
                key={phrase.text}
                id={index === 0 ? titleId : undefined}
                className={cn(
                  'motion-safe:animate-rise',
                  'highlight' in phrase && phrase.highlight && 'text-[var(--color-bell-accent)]'
                )}
                style={{ animationDelay: `${FIRST_PHRASE_DELAY_MS + index * PHRASE_STEP_MS}ms` }}
              >
                {phrase.text}
              </p>
            ))}
          </div>

          <div
            className="mt-7 flex flex-col gap-3 motion-safe:animate-rise"
            style={{ animationDelay: `${DETAILS_DELAY_MS}ms` }}
          >
            <div
              id={detailsId}
              className="flex flex-col gap-0.5 rounded-[20px] border border-[var(--color-bell-card-border)] bg-[var(--color-bell-card)] px-5 py-3.5 shadow-sm"
            >
              <span className="text-[15px] font-semibold text-[var(--color-bell-accent)]">
                Encerramento do tratamento
              </span>
              <span className="text-[19px]/[1.3] font-bold">{formatClosureDateLabel(appointment.date)}</span>
            </div>

            <div className="flex flex-col items-center">
              <Button variant="brand" size="lg" fullWidth className="rounded-[14px]" onClick={onOpenSchedule}>
                Ver na agenda
              </Button>
              <button
                type="button"
                onClick={onClose}
                className="min-h-11 cursor-pointer border-none bg-transparent px-6 text-[16px] font-semibold text-[var(--color-bell-accent)]"
              >
                Fechar
              </button>
            </div>
          </div>

          <img
            src={logoSupera}
            alt="Supera Oncologia"
            width={926}
            height={220}
            className="mx-auto mt-auto h-auto w-[120px] pt-3 motion-safe:animate-rise"
            style={{ animationDelay: `${DETAILS_DELAY_MS}ms` }}
          />
        </div>
      </div>
    </div>,
    document.body
  );
}
