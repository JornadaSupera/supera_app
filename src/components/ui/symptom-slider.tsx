import * as React from 'react';
import { getIntensityInfo } from '../../utils/symptoms';
import { cn } from '@/lib/utils';

/** Estilos do "polegar" do range, repetidos para WebKit e Gecko. */
const THUMB_CLASSES = [
  '[&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-[3px] [&::-webkit-slider-thumb]:border-card [&::-webkit-slider-thumb]:bg-[var(--slider-color)] [&::-webkit-slider-thumb]:shadow-sm',
  '[&::-moz-range-thumb]:h-5 [&::-moz-range-thumb]:w-5 [&::-moz-range-thumb]:cursor-pointer [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-[3px] [&::-moz-range-thumb]:border-card [&::-moz-range-thumb]:bg-[var(--slider-color)] [&::-moz-range-thumb]:shadow-sm',
].join(' ');

export interface SymptomSliderProps {
  nome: string;
  descricao?: string;
  /** Intensidade de 0 a 5. */
  value?: number;
  onChange: (value: number) => void;
  className?: string;
}

export default function SymptomSlider({
  nome,
  descricao,
  value = 0,
  onChange,
  className,
}: SymptomSliderProps) {
  const ativo = value > 0;
  // Rótulo e cor da escala 0–5 vêm de `utils/symptoms`, fonte única — esta
  // lista antes vivia duplicada aqui e em EntryDetail.
  const intensidade = getIntensityInfo(value);
  const label = intensidade.label;
  const percent = (value / 5) * 100;

  return (
    <div
      className={cn(
        'flex flex-col gap-2 rounded-xl border border-border bg-card p-3 transition-[border-color] duration-150 ease-[ease]',
        ativo && 'border-[color-mix(in_srgb,var(--slider-color)_35%,var(--color-border))]',
        className
      )}
      // Cor e preenchimento mudam a cada valor — não há classe estática que os
      // expresse. O gradiente do trilho lê as duas custom properties.
      style={
        {
          '--slider-color': intensidade.colorVar,
          '--slider-percent': `${percent}%`,
        } as React.CSSProperties
      }
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[14px] font-medium text-foreground">{nome}</p>
          {descricao && <p className="mt-[2px] text-[11px] text-muted-foreground">{descricao}</p>}
        </div>
        <span
          className={cn(
            'shrink-0 text-[12px] font-semibold whitespace-nowrap',
            ativo ? 'text-[var(--slider-color)]' : 'text-muted-foreground'
          )}
        >
          {label}
        </span>
      </div>

      <input
        type="range"
        min={0}
        max={5}
        step={1}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        aria-label={`Intensidade de ${nome}: ${label}`}
        className={cn(
          'h-1.5 w-full cursor-pointer appearance-none rounded-full outline-none',
          'bg-[linear-gradient(to_right,var(--slider-color)_var(--slider-percent),var(--color-muted)_var(--slider-percent))]',
          THUMB_CLASSES
        )}
      />

      <div className="flex justify-between px-[2px] text-[10px] text-muted-foreground" aria-hidden="true">
        {[0, 1, 2, 3, 4, 5].map((tick) => (
          <span key={tick}>{tick}</span>
        ))}
      </div>
    </div>
  );
}
