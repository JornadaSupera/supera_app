import { useEffect, useRef, useState } from 'react';
import type { PointerEvent, WheelEvent } from 'react';
import { X, ZoomIn, ZoomOut } from 'lucide-react';
import { Spinner } from './loading';
import { pushBackHandler } from '@/lib/androidBackButton';
import { cn } from '@/lib/utils';

const MIN_SCALE = 1;
const MAX_SCALE = 4;
/** Um toque duplo alterna entre o tamanho natural e esta ampliação. */
const DOUBLE_TAP_SCALE = 2.5;
/** Passo dos botões de zoom. */
const ZOOM_STEP = 0.75;
const DOUBLE_TAP_MS = 300;
/** Arrastar para baixo (ou para cima) além disto fecha o visualizador. */
const DISMISS_DISTANCE = 110;

interface Point {
  x: number;
  y: number;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

export interface ImageViewerProps {
  open: boolean;
  /** Endereço da imagem (um `blob:` da memória); `null` enquanto carrega. */
  src: string | null;
  alt: string;
  /** Linha de contexto no topo (ex.: "Enfermagem · hoje, 14:32"). */
  caption?: string;
  onClose: () => void;
}

/**
 * A imagem em tela cheia, sobre o `<dialog>` nativo: `showModal()` bloqueia o
 * que está atrás, fecha no Esc e devolve o foco a quem o abriu.
 *
 * Gestos para quem consegue — pinça e toque duplo ampliam, arrastar move a
 * imagem ampliada e arrastar para baixo fecha — e botões visíveis para quem
 * não consegue (ampliar, reduzir e fechar, com 44 px). Sem baixar nem
 * compartilhar: é imagem de saúde, e o `-webkit-touch-callout` tira o "Salvar
 * em Fotos" do toque longo no iPhone.
 */
export default function ImageViewer({ open, src, alt, caption, onClose }: ImageViewerProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState<Point>({ x: 0, y: 0 });
  const [dragY, setDragY] = useState(0);
  const [isGesturing, setIsGesturing] = useState(false);

  // Estado do gesto em andamento: não precisa redesenhar a tela.
  const pointers = useRef(new Map<number, Point>());
  const pinchStart = useRef<{ distance: number; scale: number } | null>(null);
  const panStart = useRef<{ pointer: Point; offset: Point; moved: boolean } | null>(null);
  const lastTap = useRef<{ time: number; point: Point } | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      setScale(1);
      setOffset({ x: 0, y: 0 });
      setDragY(0);
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  // O voltar do Android fecha a foto, e não o app — só enquanto ela está
  // aberta (`lib/androidBackButton.ts`).
  useEffect(() => {
    if (!open) return;
    return pushBackHandler(onClose);
  }, [open, onClose]);

  function zoomTo(nextScale: number) {
    const clamped = clamp(nextScale, MIN_SCALE, MAX_SCALE);
    setScale(clamped);
    if (clamped === MIN_SCALE) setOffset({ x: 0, y: 0 });
  }

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    setIsGesturing(true);

    const points = [...pointers.current.values()];
    if (points.length === 2) {
      pinchStart.current = { distance: distance(points[0], points[1]), scale };
      panStart.current = null;
    } else if (points.length === 1) {
      panStart.current = { pointer: points[0], offset, moved: false };
    }
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    if (!pointers.current.has(event.pointerId)) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const points = [...pointers.current.values()];

    if (points.length === 2 && pinchStart.current) {
      const ratio = distance(points[0], points[1]) / pinchStart.current.distance;
      zoomTo(pinchStart.current.scale * ratio);
      return;
    }

    const start = panStart.current;
    if (points.length !== 1 || !start) return;
    const dx = points[0].x - start.pointer.x;
    const dy = points[0].y - start.pointer.y;
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) start.moved = true;

    if (scale > MIN_SCALE) {
      setOffset({ x: start.offset.x + dx, y: start.offset.y + dy });
    } else {
      // No tamanho natural, arrastar na vertical é o gesto de fechar.
      setDragY(dy);
    }
  }

  function handlePointerUp(event: PointerEvent<HTMLDivElement>) {
    pointers.current.delete(event.pointerId);
    const start = panStart.current;

    if (pointers.current.size === 0) {
      setIsGesturing(false);
      pinchStart.current = null;
      panStart.current = null;

      if (scale === MIN_SCALE && Math.abs(dragY) > DISMISS_DISTANCE) {
        onClose();
        return;
      }
      setDragY(0);

      // Toque duplo: dois toques rápidos, sem arrastar, alternam o zoom.
      if (start && !start.moved) {
        const now = Date.now();
        const point = { x: event.clientX, y: event.clientY };
        const previous = lastTap.current;
        if (previous && now - previous.time < DOUBLE_TAP_MS && distance(previous.point, point) < 30) {
          zoomTo(scale > MIN_SCALE ? MIN_SCALE : DOUBLE_TAP_SCALE);
          lastTap.current = null;
        } else {
          lastTap.current = { time: now, point };
        }
      }
    } else if (pointers.current.size === 1) {
      // Saiu um dedo da pinça: o outro continua, agora arrastando.
      pinchStart.current = null;
      const [remaining] = [...pointers.current.values()];
      panStart.current = { pointer: remaining, offset, moved: true };
    }
  }

  function handleWheel(event: WheelEvent<HTMLDivElement>) {
    zoomTo(scale * (1 - event.deltaY * 0.0015));
  }

  // O fundo clareia enquanto a imagem é arrastada para fechar.
  const backdropOpacity = 1 - Math.min(Math.abs(dragY) / 400, 0.6);

  return (
    <dialog
      ref={dialogRef}
      aria-label={alt}
      onCancel={(event) => {
        // Esc: quem decide é o estado de quem abriu, e o efeito acima fecha.
        event.preventDefault();
        onClose();
      }}
      onClose={() => {
        if (open) onClose();
      }}
      className="fixed inset-0 m-0 h-[100dvh] max-h-none w-full max-w-none overflow-hidden border-none bg-transparent p-0 text-white outline-none backdrop:bg-transparent open:flex open:flex-col"
    >
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-black/95"
        style={{ opacity: backdropOpacity }}
      />

      <div className="relative z-10 flex items-center gap-2 bg-gradient-to-b from-black/70 to-transparent px-safe-4 pt-[calc(0.75rem_+_var(--safe-top))] pb-6">
        <p className="min-w-0 flex-1 truncate text-[14px] font-medium">{caption ?? alt}</p>
        <button
          type="button"
          // Foco inicial no fechar: é a saída, e o leitor de tela começa por ela.
          autoFocus
          onClick={onClose}
          aria-label="Fechar imagem"
          className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full bg-white/15 text-white transition-colors duration-150 ease-[ease] hover:bg-white/25"
        >
          <X size={22} strokeWidth={2} aria-hidden="true" />
        </button>
      </div>

      <div
        className="relative z-0 flex min-h-0 flex-1 touch-none items-center justify-center overflow-hidden select-none"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onWheel={handleWheel}
      >
        {src ? (
          <img
            src={src}
            alt={alt}
            draggable={false}
            className={cn(
              'max-h-full max-w-full object-contain [-webkit-touch-callout:none] motion-safe:animate-viewer-in',
              !isGesturing && 'transition-transform duration-200 ease-out motion-reduce:transition-none'
            )}
            style={{
              transform: `translate(${offset.x}px, ${offset.y + (scale === MIN_SCALE ? dragY : 0)}px) scale(${scale})`,
            }}
          />
        ) : (
          <Spinner size="md" className="text-white" />
        )}
      </div>

      <div className="relative z-10 flex items-center justify-center gap-3 bg-gradient-to-t from-black/70 to-transparent px-safe-4 pt-6 pb-[calc(1rem_+_var(--safe-bottom))]">
        <button
          type="button"
          onClick={() => zoomTo(scale - ZOOM_STEP)}
          disabled={scale <= MIN_SCALE}
          aria-label="Reduzir imagem"
          className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-full bg-white/15 text-white transition-colors duration-150 ease-[ease] hover:bg-white/25 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ZoomOut size={20} strokeWidth={2} aria-hidden="true" />
        </button>
        <span aria-live="polite" className="min-w-[3.5rem] text-center text-[13px] tabular-nums">
          {Math.round(scale * 100)}%
        </span>
        <button
          type="button"
          onClick={() => zoomTo(scale + ZOOM_STEP)}
          disabled={scale >= MAX_SCALE}
          aria-label="Ampliar imagem"
          className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-full bg-white/15 text-white transition-colors duration-150 ease-[ease] hover:bg-white/25 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ZoomIn size={20} strokeWidth={2} aria-hidden="true" />
        </button>
      </div>
    </dialog>
  );
}
