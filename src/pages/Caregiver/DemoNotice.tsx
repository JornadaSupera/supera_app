import { Link } from 'react-router';
import { FlaskConical } from 'lucide-react';
import { CAREGIVER_DEMO_ENABLED } from '../../lib/features';

/**
 * Aviso do modo demonstração (no `npm run dev` ou num build de teste, ver
 * `lib/features.ts`): quem testa precisa saber, sem margem para dúvida, que o
 * acompanhante é de exemplo e que nada foi criado de verdade. A tela do
 * primeiro acesso — que é do acompanhante, não do titular — tem aqui a única
 * porta para ser vista.
 */
interface DemoNoticeProps {
  /** O atalho para a tela do primeiro acesso. Fora da tela de envio, que perderia a senha ao sair. */
  withFirstAccessLink?: boolean;
}

export default function DemoNotice({ withFirstAccessLink = true }: DemoNoticeProps) {
  if (!CAREGIVER_DEMO_ENABLED) return null;

  return (
    <aside
      aria-label="Modo demonstração"
      className="flex items-start gap-3 rounded-xl border-2 border-dashed border-[color-mix(in_srgb,var(--color-brand-gold)_60%,var(--color-border))] bg-[color-mix(in_srgb,var(--color-brand-gold)_12%,var(--color-card))] p-3.5"
    >
      <FlaskConical
        size={18}
        strokeWidth={2}
        className="mt-0.5 shrink-0 text-[var(--color-brand-gold)]"
        aria-hidden="true"
      />
      <div className="flex min-w-0 flex-col gap-0.5">
        <p className="text-[13px] font-bold text-foreground">Demonstração: dados de exemplo</p>
        <p className="text-[12.5px]/[1.5] text-foreground">
          O acompanhamento ainda não está ligado ao sistema da clínica. Nenhum acompanhante é criado de
          verdade e nada é enviado. Os dados somem ao fechar o app.
        </p>
        {withFirstAccessLink && (
          <Link to="/trocar-senha" className="inline-flex min-h-[44px] items-center">
            {/* Cor e sublinhado no `span`: o reset global de `a` (fora de camada
                no index.css) vence as classes postas no próprio link. */}
            <span className="text-[12px] font-medium text-[var(--color-supera-seguranca)] underline">
              Ver a tela do primeiro acesso do acompanhante
            </span>
          </Link>
        )}
      </div>
    </aside>
  );
}
