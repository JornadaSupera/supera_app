import { Calendar } from 'lucide-react';
import Card from '../../components/ui/card';
import IconTile from '../../components/ui/icon-tile';

/**
 * Sem compromisso marcado. Antes o card simplesmente sumia da Home, e quem não
 * tem consulta à vista não sabia se era isso ou se a tela tinha falhado — daí
 * o estado vazio dizer o que aconteceu, no mesmo lugar onde o card apareceria.
 */
export default function NextAppointmentEmpty() {
  return (
    <Card elevation="raised" padding="md">
      <div className="flex items-start gap-3">
        <IconTile icon={Calendar} size="md" />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <p className="text-[12.5px] font-semibold text-[var(--color-supera-seguranca)]">Próximo compromisso</p>
          <h2 className="text-[17px]/[1.3] font-semibold text-foreground">Nenhum compromisso marcado</h2>
          <p className="text-[13.5px]/[1.5] text-muted-foreground">
            Quando a equipe marcar o próximo, ele aparece aqui.
          </p>
        </div>
      </div>
    </Card>
  );
}
