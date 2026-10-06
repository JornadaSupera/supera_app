import { Calendar } from 'lucide-react';
import Card from '../../components/ui/card';

/**
 * Sem compromisso marcado. Antes o card simplesmente sumia da Home, e quem não
 * tem consulta à vista não sabia se era isso ou se a tela tinha falhado — daí
 * o estado vazio dizer o que aconteceu, no mesmo lugar onde o card apareceria,
 * com o mesmo cabeçalho do card cheio.
 */
export default function NextAppointmentEmpty() {
  return (
    <Card elevation="raised" padding="md">
      <div className="flex flex-col gap-1">
        <p className="flex items-center gap-2 text-label font-semibold text-primary-deep">
          <Calendar size={24} strokeWidth={2} aria-hidden="true" className="shrink-0" />
          Próximo compromisso
        </p>
        <h2 className="text-card-title font-bold text-foreground">Nenhum compromisso marcado</h2>
        <p className="text-body-sm text-muted-foreground">
          Quando a equipe marcar o próximo, ele aparece aqui.
        </p>
      </div>
    </Card>
  );
}
