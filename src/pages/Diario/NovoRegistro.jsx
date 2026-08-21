import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, Check } from 'lucide-react';
import Header from '../../components/Header';
import Button from '../../components/Button';
import Loading from '../../components/Loading';
import SymptomSlider from '../../components/SymptomSlider';
import { MOOD_LEVELS } from '../../utils/mood';
import { getSintomasDisponiveis, salvarRegistro } from '../../services/mockApi';
import { useToast } from '../../contexts/ToastContext';
import { cx } from '../../utils/classNames';
import styles from './NovoRegistro.module.css';

const TOTAL_PASSOS = 3;

export default function NovoRegistro() {
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [passo, setPasso] = useState(1);
  const [texto, setTexto] = useState('');
  const [sintomas, setSintomas] = useState({});
  const [grauGeral, setGrauGeral] = useState(null);
  const [sintomasDisponiveis, setSintomasDisponiveis] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    let ativo = true;

    getSintomasDisponiveis()
      .then((data) => {
        if (ativo) setSintomasDisponiveis(data);
      })
      .finally(() => {
        if (ativo) setCarregando(false);
      });

    return () => {
      ativo = false;
    };
  }, []);

  const handleVoltar = () => {
    if (passo > 1) {
      setPasso(passo - 1);
    } else {
      navigate(-1);
    }
  };

  const handleSalvar = async () => {
    const sintomasRegistrados = Object.entries(sintomas)
      .filter(([, intensidade]) => intensidade > 0)
      .map(([nome, intensidade]) => ({ nome, intensidade }));

    setSalvando(true);

    try {
      const resultado = await salvarRegistro({
        texto,
        grau: grauGeral,
        sintomas: sintomasRegistrados,
      });

      showToast(
        resultado.temAlerta
          ? 'Registro salvo. Sua equipe foi notificada sobre este registro.'
          : 'Registro salvo com sucesso!',
        { variant: resultado.temAlerta ? 'info' : 'success' }
      );

      navigate(`/diario/${resultado.id}`, { replace: true });
    } catch (error) {
      showToast(error.message || 'Não foi possível salvar o registro.', { variant: 'error' });
    } finally {
      setSalvando(false);
    }
  };

  if (carregando) return <Loading />;

  const quantidadeSintomas = Object.values(sintomas).filter((intensidade) => intensidade > 0).length;
  const temTexto = texto.trim().length > 0;

  return (
    <div className={styles.page}>
      <Header
        variant="step"
        sticky
        bordered
        blurred
        meta={`Passo ${passo} de ${TOTAL_PASSOS}`}
        onBack={handleVoltar}
      />

      <div style={{ height: 4, background: 'var(--color-muted)', margin: '0 24px' }}>
        <div
          style={{
            height: '100%',
            width: `${(passo / TOTAL_PASSOS) * 100}%`,
            background: 'var(--color-primary)',
            borderRadius: 9999,
            transition: 'width 0.2s ease',
          }}
        />
      </div>

      <main className={styles.content}>
        {passo === 1 && (
          <section>
            <p className={styles.eyebrow}>CAMADA 1 DE 3 · TEXTO LIVRE</p>
            <h2 className={styles.title}>Como me senti hoje?</h2>
            <p className={styles.description}>
              Escreva à vontade. Pode ser uma frase, um parágrafo ou só uma palavra. Pular também é uma
              opção.
            </p>

            <textarea
              className={styles.textarea}
              value={texto}
              onChange={(event) => setTexto(event.target.value)}
              maxLength={600}
              placeholder="Hoje eu acordei me sentindo..."
            />

            <div className={styles.textareaFooter}>
              <span>Tudo o que você escrever aqui é confidencial.</span>
              <span>{texto.length}/600</span>
            </div>
          </section>
        )}

        {passo === 2 && (
          <section>
            <p className={styles.eyebrow}>CAMADA 2 DE 3 · SINTOMAS</p>
            <h2 className={styles.title}>Sentiu algum desses sintomas hoje?</h2>
            <p className={styles.description}>
              Ajuste apenas os sintomas que você sentiu. Os que ficarem em zero não serão registrados.
            </p>

            <div className={styles.sliderList}>
              {sintomasDisponiveis.map((item) => (
                <SymptomSlider
                  key={item.nome}
                  nome={item.nome}
                  descricao={item.descricao}
                  value={sintomas[item.nome] || 0}
                  onChange={(novoValor) =>
                    setSintomas((atual) => ({ ...atual, [item.nome]: novoValor }))
                  }
                />
              ))}
            </div>
          </section>
        )}

        {passo === 3 && (
          <section>
            <p className={styles.eyebrow}>CAMADA 3 DE 3 · COMO VOCÊ ESTÁ NO GERAL</p>
            <h2 className={styles.title}>De um jeito geral, como você está?</h2>
            <p className={styles.description}>Escolha o que mais representa seu dia como um todo.</p>

            <div className={styles.moodGrid}>
              {MOOD_LEVELS.map((item) => {
                const selecionado = grauGeral === item.grau;
                const Icon = item.icon;

                return (
                  <button
                    key={item.grau}
                    type="button"
                    className={cx(styles.moodOption, selecionado && styles.moodOptionSelected)}
                    style={{
                      borderColor: selecionado ? item.colorVar : undefined,
                      backgroundColor: selecionado
                        ? `color-mix(in srgb, ${item.colorVar} 12%, transparent)`
                        : undefined,
                    }}
                    onClick={() => setGrauGeral(item.grau)}
                  >
                    <Icon size={24} strokeWidth={1.5} color={item.colorVar} aria-hidden="true" />
                    <span
                      className={styles.moodLabel}
                      style={{ color: selecionado ? item.colorVar : undefined }}
                    >
                      {item.label}
                    </span>
                  </button>
                );
              })}
            </div>

            {(temTexto || quantidadeSintomas > 0) && (
              <div className={styles.resumo}>
                {quantidadeSintomas > 0 && (
                  <p>
                    {quantidadeSintomas}{' '}
                    {quantidadeSintomas === 1 ? 'sintoma registrado' : 'sintomas registrados'}
                  </p>
                )}
                {temTexto && <p>Com anotação em texto</p>}
              </div>
            )}
          </section>
        )}
      </main>

      <footer className={styles.footer}>
        {passo === 1 && (
          <Button fullWidth iconRight={ChevronRight} onClick={() => setPasso(2)}>
            Continuar
          </Button>
        )}
        {passo === 2 && (
          <Button fullWidth iconRight={ChevronRight} onClick={() => setPasso(3)}>
            Continuar
          </Button>
        )}
        {passo === 3 && (
          <Button
            fullWidth
            iconRight={Check}
            loading={salvando}
            disabled={grauGeral === null}
            onClick={handleSalvar}
          >
            Salvar registro
          </Button>
        )}
      </footer>
    </div>
  );
}
