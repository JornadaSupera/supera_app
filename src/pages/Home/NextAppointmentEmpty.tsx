import { Calendar } from 'lucide-react';
import Card from '../../components/ui/card';

/**
 * Sem compromisso marcado. Antes o card simplesmente sumia da Home, e quem não
 * tem consulta à vista não sabia se era isso ou se a tela tinha falhado — daí
 * o estado vazio dizer o que aconteceu, no mesmo lugar onde o card apareceria.
 */
export default function NextAppointmentEmpty() {
  return (
    <Card padding="md">
      <div className="flex items-center gap-2 text-[12px] font-medium tracking-[0.05em] text-muted-foreground uppercase">
        <Calendar size={14} strokeWidth={2.5} aria-hidden="true" />
        <span>PRÓXIMO COMPROMISSO</span>
      </div>

      <h2 className="mt-2 text-[16px] font-semibold text-foreground">Nenhum compromisso marcado</h2>
      <p className="mt-1 text-[13px] text-muted-foreground">
        Quando a equipe marcar o próximo, ele aparece aqui.
      </p>
    </Card>
  );
}
