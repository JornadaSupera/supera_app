import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Cor de cada nível de força, nas cores funcionais do guia da clínica: alerta,
 * laranja, o verde da marca e o verde escuro. Os limiares vêm do componente
 * anterior — mexer neles muda o que o usuário vê como "senha forte", então
 * qualquer ajuste é decisão de produto, não de implementação.
 */
const SCORE_COLORS: Record<number, string> = {
  1: 'var(--color-destructive)',
  2: 'var(--color-orange)',
  3: 'var(--color-primary)',
  4: 'var(--color-primary-deep)',
};

/**
 * O nome de cada nível, escrito sob as barras (pedido de 28/09): a cor sozinha
 * não diz nada a quem não a distingue, e "laranja" não é uma avaliação. Segue
 * os mesmos limiares das cores.
 */
const SCORE_LABELS: Record<number, string> = {
  1: 'Muito fraca',
  2: 'Fraca',
  3: 'Média',
  4: 'Ótima',
};

const BAR_COUNT = 4;

export function calcularForcaSenha(password: string): number {
  if (password.length === 0) return 0;

  let score = password.length < 8 ? 1 : 2;
  if (/\d/.test(password)) score += 1;
  if (/[^A-Za-z0-9]/.test(password)) score += 1;

  return score;
}

export interface PasswordStrengthMeterProps {
  password?: string;
  className?: string;
}

export default function PasswordStrengthMeter({
  password = '',
  className,
}: PasswordStrengthMeterProps) {
  const score = calcularForcaSenha(password);
  const fillColor = SCORE_COLORS[score];
  const label = SCORE_LABELS[score];

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <div className="flex flex-row gap-1" aria-hidden="true">
        {Array.from({ length: BAR_COUNT }, (_, index) => (
          <span
            key={index}
            className="h-1.5 flex-1 rounded-full bg-muted transition-colors duration-200 ease-[ease]"
            // A cor depende da força calculada em runtime — não há classe
            // estática que a expresse.
            style={index < score ? ({ backgroundColor: fillColor } as React.CSSProperties) : undefined}
          />
        ))}
      </div>
      {/* Sempre no DOM, mesmo vazio: uma região `aria-live` que nasce junto com
          o texto não é anunciada. A altura reservada evita que o formulário
          pule quando a primeira letra é digitada. O texto fica em cor neutra:
          o laranja e o verde da marca das barras não têm contraste para letra
          pequena sobre fundo claro. */}
      <p aria-live="polite" className="min-h-[18px] text-caption font-semibold text-foreground">
        {/* Na tela, só o nível (pedido de 28/09); o leitor de tela ouve o
            contexto junto, senão "Média" solto não diz de quê. */}
        {label && (
          <>
            <span className="sr-only">Força da senha: </span>
            {label}
          </>
        )}
      </p>
    </div>
  );
}
