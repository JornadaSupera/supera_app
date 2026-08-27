import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Cor de cada nível de força. Os valores e os limiares vêm do componente
 * anterior — mexer neles muda o que o usuário vê como "senha forte", então
 * qualquer ajuste é decisão de produto, não de implementação.
 */
const SCORE_COLORS: Record<number, string> = {
  1: 'var(--color-destructive)',
  2: 'var(--color-mood-3)',
  3: 'var(--color-mood-1)',
  4: 'var(--color-supera-empatia)',
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

  return (
    <div className={cn('flex flex-row gap-1', className)} aria-hidden="true">
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
  );
}
