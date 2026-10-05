import { Clock } from 'lucide-react';
import BrandCover from '../../components/ui/brand-cover';

interface ChatCoverProps {
  /**
   * Horário da equipe (`seg–sex, 08h–18h`). Dado de apoio, do banco: enquanto
   * carrega, se falhar ou se a clínica não configurou, a faixa só não aparece.
   */
  businessHours?: string | null;
}

/**
 * O alto da aba do Chat: a capa verde da Supera com a padronagem do "S", como
 * na Início e na Central de Conhecimento. O horário da equipe vai numa faixa
 * de vidro sobre a capa — a padronagem aparece borrada atrás dela. Os cartões
 * da tela começam sobre a borda de baixo (ver `ChatList`).
 */
export default function ChatCover({ businessHours }: ChatCoverProps) {
  return (
    // A faixa da barra de status vem logo acima (`ChatList`): a padronagem
    // continua a dela.
    <BrandCover
      shape="header"
      className="flex flex-col gap-4 px-6 pt-6 pb-16 [--brand-pattern-shift:var(--safe-top)]"
    >
      <div className="flex flex-col gap-1">
        <p className="text-[12px] font-semibold tracking-[0.08em] uppercase">Chat com a equipe</p>
        <h1 className="text-[28px]/[1.15] font-bold tracking-[-0.8px]">Como podemos ajudar?</h1>
      </div>

      {businessHours && (
        <div className="glass-brand flex w-fit max-w-full items-center gap-2 rounded-full px-3.5 py-2 text-[13px]">
          <Clock size={15} strokeWidth={2} className="shrink-0" aria-hidden="true" />
          <span className="min-w-0">
            Equipe online: <strong className="font-semibold">{businessHours}</strong>
          </span>
        </div>
      )}
    </BrandCover>
  );
}
