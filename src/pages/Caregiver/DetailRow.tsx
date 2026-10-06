import { Eye, EyeOff, type LucideIcon } from 'lucide-react';

export interface DetailRowProps {
  icon: LucideIcon;
  label: string;
  value: string;
  /** Quando informado, o valor vem mascarado e este botão o revela (ação explícita do titular). */
  reveal?: { revealed: boolean; onToggle: () => void; subject: string };
}

/**
 * Uma linha de dado do vínculo (celular, e-mail, datas): o ícone, o nome do
 * dado e o valor. É a mesma no cartão do acompanhante, que o titular vê, e no
 * "Meu vínculo", que o acompanhante vê — por isso mora num arquivo só.
 *
 * Como pede o guia da clínica: o ícone solto de 24 px em `teal-deep`, o nome em
 * frase normal (`text-caption`, 13/18, sem caixa-alta) e o valor no corpo
 * (`text-body`, 16/24). O botão de revelar tem 48 px de toque, e o `-mr-3` põe o
 * olho na margem do conteúdo do cartão, onde terminam os textos e os botões.
 */
export default function DetailRow({ icon: Icon, label, value, reveal }: DetailRowProps) {
  return (
    <div className="flex items-center gap-3 border-t border-border py-3">
      <Icon size={24} strokeWidth={2} className="shrink-0 text-primary-deep" aria-hidden="true" />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className="text-caption font-medium text-muted-foreground">{label}</p>
        <p className="text-body break-words text-foreground">{value}</p>
      </div>
      {reveal && (
        <button
          type="button"
          aria-label={`${reveal.revealed ? 'Ocultar' : 'Mostrar'} ${reveal.subject}`}
          aria-pressed={reveal.revealed}
          onClick={reveal.onToggle}
          className="-my-2 -mr-3 inline-flex h-12 w-12 shrink-0 cursor-pointer items-center justify-center rounded-full border-none bg-transparent text-muted-foreground transition-colors duration-150 ease-[ease] hover:bg-muted"
        >
          {reveal.revealed ? (
            <EyeOff size={24} strokeWidth={2} aria-hidden="true" />
          ) : (
            <Eye size={24} strokeWidth={2} aria-hidden="true" />
          )}
        </button>
      )}
    </div>
  );
}
