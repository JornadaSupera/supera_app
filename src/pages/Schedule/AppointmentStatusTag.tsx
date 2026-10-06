import Tag, { type TagTone } from '../../components/ui/tag';
import type { AppointmentStatusTone } from '../../utils/appointments';

// O selo de situação do compromisso é a etiqueta solta do guia (`Tag`): pílula,
// `text-caption` (13/18) em seminegrito sobre uma tinta clara. Daqui sai só a
// escolha da tinta, num lugar só para a lista e o detalhe. A cor só reforça: o
// texto do selo é que diz a situação. O desmarcado e a falta usam a laranja
// clara dos avisos da agenda (`attention`); a cinza já traz da `Tag` o fio que
// a desenha sobre o verde-água do destaque e sobre o cartão no tema escuro.
const TAG_TONE: Record<AppointmentStatusTone, TagTone> = {
  confirmed: 'default',
  calledOff: 'attention',
  done: 'neutral',
};

interface AppointmentStatusTagProps {
  tone: AppointmentStatusTone;
  children: string;
  className?: string;
}

/** Selo da situação do compromisso, na lista e no detalhe da Agenda. */
export default function AppointmentStatusTag({ tone, children, className }: AppointmentStatusTagProps) {
  return (
    <Tag tone={TAG_TONE[tone]} className={className}>
      {children}
    </Tag>
  );
}
