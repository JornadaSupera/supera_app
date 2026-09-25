import { Link } from 'react-router';
import { FlaskConical } from 'lucide-react';
import { CAREGIVER_DEMO_ENABLED } from '../../lib/features';

/**
 * Aviso do modo demonstração (só em desenvolvimento, ver `lib/features.ts`):
 * quem olha a tela precisa saber que o acompanhante é de exemplo, e a tela do
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
      className="flex items-start gap-3 rounded-xl border border-dashed border-border bg-muted p-3.5"
    >
      <FlaskConical size={16} strokeWidth={2} className="mt-0.5 shrink-0 text-muted-foreground" aria-hidden="true" />
      <div className="flex min-w-0 flex-col">
        <p className="text-[12px] font-semibold text-foreground">Modo demonstração</p>
        <p className="text-[12px]/[1.5] text-muted-foreground">
          Os dados são de exemplo e nada é enviado. Somem ao recarregar a página.
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
