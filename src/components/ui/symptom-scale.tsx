import * as React from 'react';
import { getIntensityInfo } from '../../utils/symptoms';
import { cn } from '@/lib/utils';

const NOTAS = [0, 1, 2, 3, 4, 5];

export interface SymptomScaleProps {
  /** Identifica o grupo de opções — um por sintoma. */
  id: string;
  nome: string;
  descricao?: string;
  /** Intensidade de 0 a 5. */
  value?: number;
  onChange: (value: number) => void;
  className?: string;
}

/**
 * Escala 0–5 de um sintoma.
 *
 * Eram um controle deslizante nativo: polegar de 20 px sobre um trilho de
 * 6 px, abaixo dos 44 px que a regra de acessibilidade do projeto pede, e no
 * iPhone tocar na trilha muitas vezes não movia nada. Agora são seis botões
 * da altura mínima de toque.
 *
 * Por baixo são `input type="radio"` de verdade, escondidos: é o que dá
 * navegação por setas e anúncio correto no leitor de tela sem reimplementar
 * nada disso à mão.
 */
export default function SymptomScale({
  id,
  nome,
  descricao,
  value = 0,
  onChange,
  className,
}: SymptomScaleProps) {
  const ativo = value > 0;
  // Rótulo e cor da escala 0–5 vêm de `utils/symptoms`, fonte única — esta
  // lista antes vivia duplicada aqui e em EntryDetail.
  const intensidade = getIntensityInfo(value);

  return (
    <fieldset
      className={cn(
        'flex flex-col gap-2 rounded-xl border border-border bg-card p-3 transition-[border-color] duration-150 ease-[ease]',
        ativo && 'border-[color-mix(in_srgb,var(--scale-color)_35%,var(--color-border))]',
        className
      )}
      // A cor muda a cada nota — não há classe estática que a expresse.
      style={{ '--scale-color': intensidade.colorVar } as React.CSSProperties}
    >
      <div className="flex items-start justify-between gap-2">
        <legend className="float-left">
          <span className="block text-[14px] font-medium text-foreground">{nome}</span>
          {descricao && (
            <span className="mt-[2px] block text-[11px] text-muted-foreground">{descricao}</span>
          )}
        </legend>
        <span
          className={cn(
            'shrink-0 text-[12px] font-semibold whitespace-nowrap',
            ativo ? 'text-[var(--scale-color)]' : 'text-muted-foreground'
          )}
        >
          {intensidade.label}
        </span>
      </div>

      <div className="flex gap-1">
        {NOTAS.map((nota) => {
          const selecionada = value === nota;

          return (
            <label
              key={nota}
              className={cn(
                'flex h-11 flex-1 cursor-pointer items-center justify-center rounded-lg border text-[14px] font-medium transition-[background-color,border-color,color] duration-150 ease-[ease]',
                selecionada
                  ? 'border-transparent bg-[var(--scale-color)] text-primary-foreground'
                  : 'border-border bg-card text-muted-foreground hover:border-[color-mix(in_srgb,var(--scale-color)_35%,var(--color-border))]',
                'has-[:focus-visible]:border-[var(--scale-color)] has-[:focus-visible]:shadow-[0_0_0_3px_color-mix(in_srgb,var(--scale-color)_25%,transparent)]'
              )}
            >
              <input
                type="radio"
                name={`sintoma-${id}`}
                value={nota}
                checked={selecionada}
                onChange={() => onChange(nota)}
                aria-label={`${nota} — ${getIntensityInfo(nota).label}`}
                className="sr-only"
              />
              {nota}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
