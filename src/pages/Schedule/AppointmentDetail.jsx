import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { Calendar, Clock, MapPin, User, Bell } from 'lucide-react';
import Header from '../../components/Header';
import Loading from '../../components/Loading';
import EmptyState from '../../components/EmptyState';
import Button from '../../components/Button';
import { getCompromissoPorId } from '../../services/mockApi';
import { useToast } from '../../contexts/ToastContext';
import styles from './AppointmentDetail.module.css';

function calcularHoraFim(hora, duracaoMin) {
  const [horas, minutos] = hora.split(':').map(Number);
  const totalMinutos = horas * 60 + minutos + duracaoMin;
  const horaFim = Math.floor((totalMinutos % 1440) / 60);
  const minutoFim = totalMinutos % 60;
  return `${String(horaFim).padStart(2, '0')}:${String(minutoFim).padStart(2, '0')}`;
}

export default function AppointmentDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(false);
  const [compromisso, setCompromisso] = useState(null);

  useEffect(() => {
    let ativo = true;
    setCarregando(true);
    setErro(false);

    getCompromissoPorId(id)
      .then((data) => {
        if (!ativo) return;
        setCompromisso(data);
      })
      .catch(() => {
        if (!ativo) return;
        setErro(true);
      })
      .finally(() => {
        if (ativo) setCarregando(false);
      });

    return () => {
      ativo = false;
    };
  }, [id]);

  if (carregando) {
    return <Loading />;
  }

  if (erro || !compromisso) {
    return (
      <div className={styles.page}>
        <Header
          variant="step"
          sticky
          bordered
          blurred
          onBack={() => navigate('/agenda')}
          meta="Compromisso"
        />
        <EmptyState
          title="Compromisso não encontrado"
          description="Esse compromisso pode ter sido removido ou remarcado."
          actionLabel="Voltar à agenda"
          onAction={() => navigate('/agenda')}
        />
      </div>
    );
  }

  const horaFim = calcularHoraFim(compromisso.hora, compromisso.duracaoMin);
  const jaRealizado = compromisso.status === 'realizado';

  return (
    <div className={styles.page}>
      <Header
        variant="step"
        sticky
        bordered
        blurred
        onBack={() => navigate('/agenda')}
        meta="Compromisso"
      />

      <main className={styles.content}>
        <section
          className={styles.hero}
          style={{
            backgroundColor: `color-mix(in srgb, ${compromisso.colorVar} 10%, transparent)`,
            borderColor: `color-mix(in srgb, ${compromisso.colorVar} 25%, transparent)`,
          }}
        >
          <p className={styles.heroCategory} style={{ color: compromisso.colorVar }}>
            {compromisso.descricaoCategoria}
          </p>
          <h2 className={styles.heroTitle}>{compromisso.titulo}</h2>
          <p className={styles.heroDate}>{compromisso.dataLabel}</p>
        </section>

        <div className={styles.infoList}>
          <div className={styles.infoRow}>
            <Calendar size={16} strokeWidth={2} className={styles.infoIcon} aria-hidden="true" />
            <div className={styles.infoTextGroup}>
              <dt className={styles.infoLabel}>Data</dt>
              <dd className={styles.infoValue}>{compromisso.dataCompletaLabel}</dd>
            </div>
          </div>

          <div className={styles.infoRow}>
            <Clock size={16} strokeWidth={2} className={styles.infoIcon} aria-hidden="true" />
            <div className={styles.infoTextGroup}>
              <dt className={styles.infoLabel}>Horário</dt>
              <dd className={styles.infoValue}>
                {compromisso.hora} – {horaFim} ({compromisso.duracaoMin} min)
              </dd>
            </div>
          </div>

          <div className={styles.infoRow}>
            <MapPin size={16} strokeWidth={2} className={styles.infoIcon} aria-hidden="true" />
            <div className={styles.infoTextGroup}>
              <dt className={styles.infoLabel}>Local</dt>
              <dd className={styles.infoValue}>{compromisso.local}</dd>
            </div>
          </div>

          <div className={styles.infoRow}>
            <User size={16} strokeWidth={2} className={styles.infoIcon} aria-hidden="true" />
            <div className={styles.infoTextGroup}>
              <dt className={styles.infoLabel}>Profissional</dt>
              <dd className={styles.infoValue}>
                {compromisso.profissional
                  ? `${compromisso.profissional.cargo} ${compromisso.profissional.nome}`
                  : '—'}
              </dd>
            </div>
          </div>

          {!jaRealizado && (
            <div className={styles.infoRow}>
              <Bell size={16} strokeWidth={2} className={styles.infoIcon} aria-hidden="true" />
              <div className={styles.infoTextGroup}>
                <dt className={styles.infoLabel}>Lembretes</dt>
                <dd className={styles.infoValue}>Push 24h e 2h antes</dd>
              </div>
            </div>
          )}
        </div>

        {compromisso.observacoes && (
          <section className={styles.notes}>
            <p className={styles.notesTitle}>OBSERVAÇÕES</p>
            <p className={styles.notesText}>💡 {compromisso.observacoes}</p>
          </section>
        )}

        {!jaRealizado && (
          <div className={styles.cta}>
            <Button
              fullWidth
              variant="outline"
              onClick={() =>
                showToast('Solicitação enviada. Nossa equipe vai entrar em contato para remarcar.', {
                  variant: 'info',
                })
              }
            >
              Solicitar remarcação
            </Button>
          </div>
        )}
      </main>
    </div>
  );
}
