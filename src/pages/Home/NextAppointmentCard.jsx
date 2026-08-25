import { useNavigate } from 'react-router';
import {
  Calendar,
  ChevronRight,
  ClipboardList,
  FlaskConical,
  Package,
  Stethoscope,
  Syringe,
} from 'lucide-react';
import Card from '../../components/Card/Card';
import Avatar from '../../components/Avatar/Avatar';
import styles from './NextAppointmentCard.module.css';

const TIPO_ICONS = {
  infusao: Syringe,
  consulta: Stethoscope,
  retirada: Package,
  exame: FlaskConical,
  avaliacao: ClipboardList,
};

export default function NextAppointmentCard({ appointment }) {
  const navigate = useNavigate();

  if (!appointment) return null;

  const { id, tipo, titulo, diaLabel, hora, local, profissional, dica } = appointment;
  const TipoIcon = TIPO_ICONS[tipo] || ClipboardList;

  return (
    <Card
      variant="primary"
      decorated
      padding="md"
      onClick={() => navigate(`/agenda/${id}`)}
    >
      <div className={styles.eyebrow}>
        <TipoIcon size={14} strokeWidth={2.5} aria-hidden="true" />
        <span>PRÓXIMO COMPROMISSO</span>
      </div>

      <h2 className={styles.title}>{titulo}</h2>

      <div className={styles.meta}>
        <div className={styles.metaRow}>
          <Calendar size={14} strokeWidth={2} aria-hidden="true" />
          <span>
            {diaLabel} · {hora}
          </span>
        </div>
        {local && <p className={styles.local}>{local}</p>}
      </div>

      {profissional && (
        <div className={styles.professional}>
          <Avatar
            name={profissional.nome}
            src={profissional.foto}
            size="sm"
            ring
            style={{
              width: 28,
              height: 28,
              boxShadow:
                '0 0 0 1px color-mix(in srgb, var(--color-primary-foreground) 30%, transparent)',
            }}
          />
          <div className={styles.professionalInfo}>
            <p className={styles.professionalName}>
              {profissional.cargo} {profissional.nome}
            </p>
            <p className={styles.professionalRole}>vai te atender</p>
          </div>
        </div>
      )}

      {dica && <p className={styles.tip}>💡 {dica}</p>}

      <div className={styles.footer}>
        <span>Ver detalhes do compromisso</span>
        <ChevronRight size={14} strokeWidth={2} aria-hidden="true" />
      </div>
    </Card>
  );
}
