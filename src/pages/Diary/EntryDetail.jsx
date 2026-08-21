import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { MessageCircle } from 'lucide-react';
import Header from '../../components/Header';
import Loading from '../../components/Loading';
import EmptyState from '../../components/EmptyState';
import Badge from '../../components/Badge';
import Button from '../../components/Button';
import BottomTab from '../../components/BottomTab';
import { getRegistroPorId, getSintomasDisponiveis } from '../../services/mockApi';
import { getMoodInfo } from '../../utils/mood';
import styles from './EntryDetail.module.css';

// Escala de intensidade específica por sintoma (diferente da escala de humor
// geral do dia, que usa Ótimo/Bem/Leve/Moderado/Intenso/Muito intenso) —
// confirmado no protótipo real (tela de detalhe do registro): cada sintoma
// individual usa os rótulos abaixo, não os rótulos de MOOD_LEVELS.
const INTENSIDADE_SINTOMA_LABELS = ['Não senti', 'Mal noto', 'Leve', 'Moderado', 'Forte', 'Insuportável'];

export default function EntryDetail() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(false);
  const [registro, setRegistro] = useState(null);
  const [sintomasDisponiveis, setSintomasDisponiveis] = useState([]);

  useEffect(() => {
    let ativo = true;
    setCarregando(true);
    setErro(false);

    Promise.all([getRegistroPorId(id), getSintomasDisponiveis()])
      .then(([registroData, sintomasData]) => {
        if (!ativo) return;
        setRegistro(registroData);
        setSintomasDisponiveis(sintomasData);
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

  if (erro || !registro) {
    return (
      <div className={styles.page}>
        <Header
          variant="step"
          sticky
          bordered
          blurred
          onBack={() => navigate('/diario')}
          meta="Registro do diário"
        />
        <EmptyState
          title="Registro não encontrado"
          description="Esse registro pode ter sido removido."
          actionLabel="Voltar ao diário"
          onAction={() => navigate('/diario')}
        />
        <BottomTab />
      </div>
    );
  }

  const humor = getMoodInfo(registro.grau);
  const HumorIcon = humor.icon;
  // Protótipo real mostra a data completa (dia + mês por extenso + hora) e,
  // em seguida, o mesmo rótulo curto/relativo usado nos cards da linha do
  // tempo (ex.: "14 de maio · 21:00 · Ontem · 21:00").
  const dataCompletaLabel = `${registro.data.toLocaleDateString('pt-BR', {
    day: 'numeric',
    month: 'long',
  })} · ${registro.hora}`;

  return (
    <div className={styles.page}>
      <Header
        variant="step"
        sticky
        bordered
        blurred
        onBack={() => navigate('/diario')}
        meta="Registro do diário"
      />

      <main className={styles.content}>
        <section className={styles.hero}>
          <div
            className={styles.heroCircle}
            style={{
              backgroundColor: `color-mix(in srgb, ${humor.colorVar} 15%, transparent)`,
              borderColor: `color-mix(in srgb, ${humor.colorVar} 40%, transparent)`,
            }}
          >
            <HumorIcon size={40} strokeWidth={1.5} style={{ color: humor.colorVar }} aria-hidden="true" />
          </div>
          <p className={styles.heroLabel}>{humor.label}</p>
          <p className={styles.heroDate}>
            {dataCompletaLabel} · {registro.dataLabel}
          </p>
        </section>

        {registro.texto && (
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>TEXTO LIVRE</h3>
            <div className={styles.textCard}>{registro.texto}</div>
          </section>
        )}

        {registro.sintomas.length > 0 && (
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>SINTOMAS REGISTRADOS</h3>
            <ul className={styles.symptomsList}>
              {registro.sintomas.map((sintoma) => {
                const descricao = sintomasDisponiveis.find(
                  (item) => item.nome === sintoma.nome
                )?.descricao;
                const intensidade = getMoodInfo(sintoma.intensidade);
                const IntensidadeIcon = intensidade.icon;

                return (
                  <li key={sintoma.nome} className={styles.symptomItem}>
                    <div className={styles.symptomInfo}>
                      <p className={styles.symptomName}>{sintoma.nome}</p>
                      {descricao && <p className={styles.symptomDescription}>{descricao}</p>}
                    </div>

                    <div className={styles.symptomIntensity}>
                      <div
                        className={styles.symptomCircle}
                        style={{
                          backgroundColor: `color-mix(in srgb, ${intensidade.colorVar} 15%, transparent)`,
                          borderColor: `color-mix(in srgb, ${intensidade.colorVar} 40%, transparent)`,
                        }}
                      >
                        <IntensidadeIcon
                          size={20}
                          strokeWidth={1.5}
                          style={{ color: intensidade.colorVar }}
                          aria-hidden="true"
                        />
                      </div>
                      <Badge tone="secondary" size="sm">
                        {INTENSIDADE_SINTOMA_LABELS[sintoma.intensidade]}
                      </Badge>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        <div className={styles.cta}>
          <Button fullWidth variant="outline" iconLeft={MessageCircle} onClick={() => navigate('/chat')}>
            Falar com a equipe sobre esse registro
          </Button>
        </div>
      </main>

      <BottomTab />
    </div>
  );
}
